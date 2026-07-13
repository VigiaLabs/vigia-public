#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VigiaIngestionStack } from './stacks/ingestion-stack';
import { VigiaFargateStack } from './fargate-stack';

const app = new cdk.App();

new VigiaIngestionStack(app, 'VigiaIngestionPipeline', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'VIGIA Daily Ingestion Pipeline — Dual-Track ETL/RAG',
});

// ── VIGIA Search: Fargate SSE service for the Android app ────────────
new VigiaFargateStack(app, 'VigiaSearch', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  // Use existing ECR repo (vigia-search-engine already exists in us-east-1)
  createEcr: false,
  ecrRepoArn: `arn:aws:ecr:us-east-1:203800220566:repository/vigia-search-engine`,
  imageTag: process.env.IMAGE_TAG ?? 'latest',
  redisSecretName: process.env.REDIS_SECRET_NAME,
  minCapacity: 1,
  maxCapacity: 4,
});
