#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { VigiaIngestionStack } from './stacks/ingestion-stack';

const app = new cdk.App();

new VigiaIngestionStack(app, 'VigiaIngestionPipeline', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'VIGIA Daily Ingestion Pipeline — Dual-Track ETL/RAG',
});
