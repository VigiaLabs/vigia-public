import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

// @ai-sdk/amazon-bedrock's default singleton only reads static env vars.
// In ECS Fargate the task role credentials come from IMDS, which requires
// the full AWS SDK credential chain. We pass a credentialProvider to pick
// those up. The option exists at runtime but is not yet reflected in the
// published type definitions, hence the cast.
export const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(({ credentialProvider: defaultProvider() } as unknown) as object),
} as Parameters<typeof createAmazonBedrock>[0]);
