#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VigiaFargateStack } from './fargate-stack';

const app = new cdk.App();

new VigiaFargateStack(app, 'VigiaSearch', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '203800220566',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  createEcr: false,
  ecrRepoArn: 'arn:aws:ecr:us-east-1:203800220566:repository/vigia-search-engine',
  imageTag: process.env.IMAGE_TAG ?? 'latest',
  redisSecretName: process.env.REDIS_SECRET_NAME,
  minCapacity: 1,
  maxCapacity: 4,
});

app.synth();
