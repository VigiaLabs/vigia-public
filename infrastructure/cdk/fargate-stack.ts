import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface VigiaFargateStackProps extends cdk.StackProps {
  /** Set to true to also create the ECR repository (first deploy). Default false. */
  createEcr?: boolean;
  /** Optional existing ECR repo ARN if createEcr is false. */
  ecrRepoArn?: string;
  /** Docker image tag to deploy. Default: 'latest'. */
  imageTag?: string;
  /** Upstash Redis REST URL stored in Secrets Manager under this secret name. */
  redisSecretName?: string;
  /** Minimum number of running Fargate tasks. Default: 1. */
  minCapacity?: number;
  /** Maximum number of running Fargate tasks for auto-scaling. Default: 4. */
  maxCapacity?: number;
}

/**
 * VigiaFargateStack
 *
 * Deploys the VIGIA Search SSE server as an ECS Fargate service behind an
 * Application Load Balancer.  The task role grants Bedrock, Lambda, and
 * Secrets Manager access needed by the pipeline.
 *
 * ALB idle timeout is set to 310 seconds to keep SSE streams alive.
 * HTTP/2 is enabled on the listener for efficient Android connection sharing.
 */
export class VigiaFargateStack extends cdk.Stack {
  /** ALB DNS name — use this (or a Route 53 alias) as VIGIA_API_BASE_URL. */
  public readonly albDnsName: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: VigiaFargateStackProps = {}) {
    super(scope, id, props);

    const imageTag = props.imageTag ?? 'latest';

    // ── VPC ──────────────────────────────────────────────────────────
    // Use 2 AZs to keep costs low while maintaining HA.
    const vpc = new ec2.Vpc(this, 'VigiaVpc', {
      maxAzs: 2,
      natGateways: 1, // Tasks need outbound internet for Bedrock & Lambda
      // NAT *instance* (t3.nano, ~$3.8/mo) instead of the managed NAT Gateway
      // (~$32/mo). Same private-subnet topology — tasks still egress via NAT,
      // stay unreachable inbound. Single instance = fine for a dev/search service.
      natGatewayProvider: ec2.NatProvider.instanceV2({
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
      }),
      subnetConfiguration: [
        { name: 'public',  subnetType: ec2.SubnetType.PUBLIC,           cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    // ── ECR Repository ────────────────────────────────────────────────
    let repository: ecr.IRepository;
    if (props.createEcr) {
      repository = new ecr.Repository(this, 'VigiaSearchRepo', {
        repositoryName: 'vigia-search',
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        lifecycleRules: [
          // Keep the 10 most recent tagged images; purge untagged after 7 days
          { maxImageCount: 10, tagStatus: ecr.TagStatus.ANY },
          { maxImageAge: cdk.Duration.days(7), tagStatus: ecr.TagStatus.UNTAGGED },
        ],
      });
    } else if (props.ecrRepoArn) {
      repository = ecr.Repository.fromRepositoryArn(this, 'VigiaSearchRepo', props.ecrRepoArn);
    } else {
      throw new Error('Either createEcr or ecrRepoArn must be provided');
    }

    // ── ECS Cluster ───────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'VigiaCluster', {
      vpc,
      clusterName: 'vigia-ts',
      containerInsights: true,
    });

    // ── Task IAM Role ─────────────────────────────────────────────────
    const taskRole = new iam.Role(this, 'VigiaTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'VIGIA Search Fargate task role',
    });

    // Bedrock: ai-sdk v4 uses Converse API and may route through cross-region inference profiles
    // (us.amazon.nova-lite-v1:0 etc.) so we scope by action rather than resource ARN
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:Converse',
        'bedrock:ConverseStream',
      ],
      resources: ['*'],
    }));

    // Lambda: invoke retrieval proxy
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [`arn:aws:lambda:${this.region}:${this.account}:function:vigia-retrieval-proxy`],
    }));

    // Secrets Manager: read Upstash Redis credentials (if configured)
    if (props.redisSecretName) {
      taskRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${props.redisSecretName}*`,
        ],
      }));
    }

    // CloudWatch Logs
    const logGroup = new logs.LogGroup(this, 'VigiaTaskLogs', {
      logGroupName: '/ecs/vigia-search',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Task Definition ───────────────────────────────────────────────
    const taskDef = new ecs.FargateTaskDefinition(this, 'VigiaTaskDef', {
      cpu: 1024,    // 1 vCPU
      memoryLimitMiB: 2048,  // 2 GB — headroom for LangGraph reasoning
      taskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
      },
    });

    // Optional Redis env vars from Secrets Manager
    const environment: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: '8080',
      AWS_REGION: this.region,
    };

    const secrets: Record<string, ecs.Secret> = {};
    if (props.redisSecretName) {
      const redisSecret = secretsmanager.Secret.fromSecretNameV2(
        this, 'RedisSecret', props.redisSecretName
      );
      secrets['UPSTASH_REDIS_REST_URL'] = ecs.Secret.fromSecretsManager(redisSecret, 'url');
      secrets['UPSTASH_REDIS_REST_TOKEN'] = ecs.Secret.fromSecretsManager(redisSecret, 'token');
    }

    const container = taskDef.addContainer('vigia-search', {
      image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
      environment,
      secrets,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'vigia-search',
        logGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'wget -qO- http://localhost:8080/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      // Graceful shutdown: allow up to 30s for in-flight SSE streams
      stopTimeout: cdk.Duration.seconds(30),
    });

    container.addPortMappings({ containerPort: 8080 });

    // ── Security Groups ───────────────────────────────────────────────
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', { vpc, description: 'VIGIA ALB' });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from anywhere');
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP redirect');

    const taskSg = new ec2.SecurityGroup(this, 'TaskSg', { vpc, description: 'VIGIA Fargate tasks' });
    taskSg.addIngressRule(albSg, ec2.Port.tcp(8080), 'ALB to task');

    // ── ALB ───────────────────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, 'VigiaAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      loadBalancerName: 'vigia-ts-search',
      // HTTP/2 is enabled by default on ALBs
    });

    // Idle timeout must exceed the longest expected SSE stream
    const cfnAlb = alb.node.defaultChild as elbv2.CfnLoadBalancer;
    cfnAlb.loadBalancerAttributes = [
      { key: 'idle_timeout.timeout_seconds', value: '310' },
      { key: 'routing.http2.enabled', value: 'true' },
    ];

    // HTTP listener on port 80 for initial deployment.
    // To add HTTPS: provision an ACM cert, add a port-443 listener with the cert,
    // then add a port-80 redirect listener (the two can coexist on different ports).
    const listener = alb.addListener('Listener', { port: 80, open: true });

    // ── Fargate Service ───────────────────────────────────────────────
    const service = new ecs.FargateService(this, 'VigiaService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: props.minCapacity ?? 1,
      securityGroups: [taskSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      enableExecuteCommand: true, // for debugging: `aws ecs execute-command`
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      circuitBreaker: { rollback: true },
    });

    // Target group — deregistration delay matches container stop timeout
    const targetGroup = listener.addTargets('VigiaTargets', {
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
      // Sticky sessions are not needed for stateless SSE
    });

    // Stickiness off, protocol version HTTP1 (required for SSE)
    const cfnTg = targetGroup.node.defaultChild as elbv2.CfnTargetGroup;
    cfnTg.addPropertyOverride('ProtocolVersion', 'HTTP1');

    // ── Auto-scaling ──────────────────────────────────────────────────
    const scaling = service.autoScaleTaskCount({
      minCapacity: props.minCapacity ?? 1,
      maxCapacity: props.maxCapacity ?? 4,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    // ── Outputs ───────────────────────────────────────────────────────
    this.albDnsName = new cdk.CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS — set as VIGIA_API_BASE_URL in Android BuildConfig',
      exportName: 'VigiaSearchAlbDns',
    });

    new cdk.CfnOutput(this, 'EcrRepoUri', {
      value: repository.repositoryUri,
      description: 'ECR repository URI for docker push',
      exportName: 'VigiaSearchEcrUri',
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      exportName: 'VigiaClusterName',
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: service.serviceName,
      exportName: 'VigiaServiceName',
    });
  }
}
