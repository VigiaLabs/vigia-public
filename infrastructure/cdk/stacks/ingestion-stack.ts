/**
 * VIGIA Daily Ingestion Pipeline — CDK Stack
 *
 * Provisions: EventBridge schedules, Lambda functions, S3 buckets,
 * DynamoDB table, and IAM roles for the dual-track pipeline.
 *
 * Deploy: cd infrastructure && npx cdk deploy
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';

export class VigiaIngestionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── S3 Buckets ─────────────────────────────────────────────────

    const rawBucket = new s3.Bucket(this, 'RawDocuments', {
      bucketName: 'vigia-raw-documents',
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const structuredBucket = new s3.Bucket(this, 'StructuredData', {
      bucketName: 'vigia-structured-data',
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const fts5Bucket = new s3.Bucket(this, 'Fts5Database', {
      bucketName: 'vigia-fts5-db',
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── DynamoDB ───────────────────────────────────────────────────

    const hashTable = new dynamodb.Table(this, 'DocumentHashes', {
      tableName: 'vigia-document-hashes',
      partitionKey: { name: 'sha256', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'source', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── VPC & Aurora Serverless v2 (pgvector) ──────────────────────

    const vpc = new ec2.Vpc(this, 'VigiaVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Allow Lambda access to Aurora pgvector',
    });

    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: 'vigia/pgvector',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'vigia_pipeline' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const pgInstance = new rds.DatabaseInstance(this, 'PgvectorDb', {
      instanceIdentifier: 'vigia-pgvector',
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'vigia',
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      multiAz: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc,
      description: 'Security group for Lambda functions accessing Aurora',
    });

    dbSecurityGroup.addIngressRule(lambdaSecurityGroup, ec2.Port.tcp(5432), 'Lambda to Aurora');

    // ─── Lambda: pdf-scraper ────────────────────────────────────────

    const pipelineDir = path.join(__dirname, '..', '..', 'pipeline');

    const pdfScraper = new NodejsFunction(this, 'PdfScraper', {
      functionName: 'vigia-pdf-scraper',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineDir, 'track-a', 'pdf-scraper.ts'),
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      bundling: { externalModules: [] },
      environment: {
        RAW_BUCKET: rawBucket.bucketName,
        HASH_TABLE: hashTable.tableName,
      },
    });

    rawBucket.grantWrite(pdfScraper);
    hashTable.grantReadWriteData(pdfScraper);

    // ─── Lambda: pdf-parser ─────────────────────────────────────────

    const pdfParser = new NodejsFunction(this, 'PdfParser', {
      functionName: 'vigia-pdf-parser',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineDir, 'track-a', 'pdf-parser.ts'),
      handler: 'handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(10),
      bundling: { externalModules: [] },
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        PG_HOST: pgInstance.instanceEndpoint.hostname,
        PG_PORT: '5432',
        PG_DATABASE: 'vigia',
        PG_USER: 'vigia_pipeline',
        PG_SECRET_ARN: dbSecret.secretArn,
      },
    });

    rawBucket.grantRead(pdfParser);
    dbSecret.grantRead(pdfParser);
    pdfParser.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0'],
    }));

    // S3 event trigger: new PDF → parser
    rawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(pdfParser),
      { suffix: '.pdf' }
    );

    // ─── Lambda: db-init (one-time setup) ───────────────────────────

    const dbInit = new NodejsFunction(this, 'DbInit', {
      functionName: 'vigia-db-init',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineDir, 'track-a', 'db-init.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      bundling: { externalModules: [] },
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        PG_HOST: pgInstance.instanceEndpoint.hostname,
        PG_PORT: '5432',
        PG_DATABASE: 'vigia',
        PG_USER: 'vigia_pipeline',
        PG_SECRET_ARN: dbSecret.secretArn,
      },
    });

    dbSecret.grantRead(dbInit);

    // ─── Lambda: pgvector-retrieval-proxy (Function URL) ────────────

    const retrievalProxy = new NodejsFunction(this, 'RetrievalProxy', {
      functionName: 'vigia-retrieval-proxy',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineDir, 'query', 'retrieval-proxy.ts'),
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      bundling: { externalModules: [] },
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        PG_HOST: pgInstance.instanceEndpoint.hostname,
        PG_PORT: '5432',
        PG_DATABASE: 'vigia',
        PG_USER: 'vigia_pipeline',
        PG_SECRET_ARN: dbSecret.secretArn,
      },
    });

    dbSecret.grantRead(retrievalProxy);
    retrievalProxy.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0'],
    }));

    const proxyUrl = retrievalProxy.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // ─── Lambda: api-etl ────────────────────────────────────────────

    const apiEtl = new NodejsFunction(this, 'ApiEtl', {
      functionName: 'vigia-api-etl',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineDir, 'track-b', 'api-etl.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.minutes(3),
      bundling: { externalModules: ['pdf-parse'] },
      environment: {
        STRUCTURED_BUCKET: structuredBucket.bucketName,
        DATA_GOV_API_KEY: '',
      },
    });

    structuredBucket.grantWrite(apiEtl);

    // ─── Lambda: fts5-loader ────────────────────────────────────────

    const fts5Loader = new NodejsFunction(this, 'Fts5Loader', {
      functionName: 'vigia-fts5-loader',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineDir, 'track-b', 'fts5-loader.ts'),
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      bundling: { externalModules: [] },
      environment: {
        STRUCTURED_BUCKET: structuredBucket.bucketName,
        FTS5_BUCKET: fts5Bucket.bucketName,
      },
    });

    structuredBucket.grantRead(fts5Loader);
    fts5Bucket.grantWrite(fts5Loader);

    // ─── EventBridge Schedules ──────────────────────────────────────

    // Track A: Daily 02:00 UTC
    new events.Rule(this, 'TrackASchedule', {
      ruleName: 'vigia-track-a-daily',
      schedule: events.Schedule.cron({ hour: '2', minute: '0' }),
      targets: [new targets.LambdaFunction(pdfScraper, {
        event: events.RuleTargetInput.fromObject({
          source: 'scheduled',
          tracks: ['A'],
        }),
      })],
    });

    // Track B: Daily 03:00 UTC (after Track A)
    new events.Rule(this, 'TrackBEtlSchedule', {
      ruleName: 'vigia-track-b-etl-daily',
      schedule: events.Schedule.cron({ hour: '3', minute: '0' }),
      targets: [new targets.LambdaFunction(apiEtl)],
    });

    // Track B FTS5 rebuild: Daily 03:30 UTC (after ETL)
    new events.Rule(this, 'TrackBFts5Schedule', {
      ruleName: 'vigia-track-b-fts5-daily',
      schedule: events.Schedule.cron({ hour: '3', minute: '30' }),
      targets: [new targets.LambdaFunction(fts5Loader)],
    });

    // ─── Lambda: unified-embedder (PWD + PMGSY + Authority → pgvector) ─

    const unifiedEmbedder = new NodejsFunction(this, 'UnifiedEmbedder', {
      functionName: 'vigia-unified-embedder',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineDir, '..', '..', 'scripts', 'embed-unified.ts'),
      handler: 'main',
      memorySize: 1024,
      timeout: cdk.Duration.minutes(5),
      bundling: { externalModules: [] },
      environment: {
        AWS_REGION_OVERRIDE: 'us-east-1',
      },
    });

    unifiedEmbedder.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0'],
    }));
    unifiedEmbedder.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [retrievalProxy.functionArn],
    }));

    // Daily 04:00 UTC — re-embeds PWD + PMGSY + authority data
    new events.Rule(this, 'UnifiedEmbedderSchedule', {
      ruleName: 'vigia-unified-embedder-daily',
      schedule: events.Schedule.cron({ hour: '4', minute: '0' }),
      targets: [new targets.LambdaFunction(unifiedEmbedder)],
    });

    // ─── Lambda: PWD Directory Scraper (weekly) ─────────────────────

    const pwdScraper = new lambda.Function(this, 'PwdScraper', {
      functionName: 'vigia-pwd-scraper',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'pwd_scraper.handler',
      code: lambda.Code.fromAsset(path.join(pipelineDir, 'track-b', 'pwd-scraper')),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      environment: {
        STRUCTURED_BUCKET: structuredBucket.bucketName,
        TARGET_STATES: 'Telangana,Maharashtra',
      },
    });

    structuredBucket.grantWrite(pwdScraper);

    // Weekly Sunday 04:00 UTC — scrapes TG/MH PWD directories
    new events.Rule(this, 'PwdScraperSchedule', {
      ruleName: 'vigia-pwd-scraper-weekly',
      schedule: events.Schedule.cron({ hour: '4', minute: '0', weekDay: 'SUN' }),
      targets: [new targets.LambdaFunction(pwdScraper)],
    });

    // ─── Lambda: PMGSY OMMAS Scraper (weekly) ───────────────────────

    const pmgsyScraper = new lambda.Function(this, 'PmgsyScraper', {
      functionName: 'vigia-pmgsy-scraper',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'pmgsy_scraper.handler',
      code: lambda.Code.fromAsset(path.join(pipelineDir, 'track-b')),
      memorySize: 2048,
      timeout: cdk.Duration.minutes(10),
      environment: {
        STRUCTURED_BUCKET: structuredBucket.bucketName,
        TARGET_STATES: 'Telangana,Maharashtra',
        TARGET_DISTRICTS: 'Khammam,Warangal,Pune,Nagpur',
      },
    });

    structuredBucket.grantWrite(pmgsyScraper);

    // Weekly Sunday 04:30 UTC — scrapes OMMAS portal
    new events.Rule(this, 'PmgsyScraperSchedule', {
      ruleName: 'vigia-pmgsy-scraper-weekly',
      schedule: events.Schedule.cron({ hour: '4', minute: '30', weekDay: 'SUN' }),
      targets: [new targets.LambdaFunction(pmgsyScraper)],
    });

    // ─── Outputs ────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'RawBucketName', { value: rawBucket.bucketName });
    new cdk.CfnOutput(this, 'StructuredBucketName', { value: structuredBucket.bucketName });
    new cdk.CfnOutput(this, 'Fts5BucketName', { value: fts5Bucket.bucketName });
    new cdk.CfnOutput(this, 'HashTableName', { value: hashTable.tableName });
    new cdk.CfnOutput(this, 'AuroraEndpoint', { value: pgInstance.instanceEndpoint.hostname });
    new cdk.CfnOutput(this, 'AuroraSecretArn', { value: dbSecret.secretArn });
    new cdk.CfnOutput(this, 'RetrievalProxyUrl', { value: proxyUrl.url });
  }
}
