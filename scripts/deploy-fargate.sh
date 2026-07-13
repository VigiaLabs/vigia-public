#!/usr/bin/env bash
# deploy-fargate.sh — Build, push, and deploy the VIGIA Search Fargate service.
#
# Usage:
#   ./scripts/deploy-fargate.sh [IMAGE_TAG]
#
# Prerequisites:
#   - AWS CLI configured (aws configure or IAM role)
#   - Docker running
#   - CDK bootstrapped: npx cdk bootstrap aws://ACCOUNT/REGION
#   - ECR repository exists (first run: CDK will create it with createEcr: true)
#
# Environment variables (override defaults):
#   AWS_REGION          default: ap-south-1
#   AWS_ACCOUNT         default: $(aws sts get-caller-identity --query Account --output text)
#   REDIS_SECRET_NAME   optional: Secrets Manager secret for Upstash Redis

set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT="${AWS_ACCOUNT:-$(aws sts get-caller-identity --query Account --output text)}"
IMAGE_TAG="${1:-$(git rev-parse --short HEAD)}"
REPO_NAME="vigia-search"
ECR_URI="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"

echo "==> Deploying VIGIA Search"
echo "    Account : ${ACCOUNT}"
echo "    Region  : ${REGION}"
echo "    Tag     : ${IMAGE_TAG}"
echo ""

# ── 1. CDK synth (validate before touching AWS) ───────────────────────
echo "==> CDK synth..."
IMAGE_TAG="${IMAGE_TAG}" \
  REDIS_SECRET_NAME="${REDIS_SECRET_NAME:-}" \
  CDK_DEFAULT_ACCOUNT="${ACCOUNT}" \
  CDK_DEFAULT_REGION="${REGION}" \
  npx cdk synth VigiaSearch --app "npx ts-node infrastructure/cdk/app.ts" --output cdk.out

# ── 2. ECR login ──────────────────────────────────────────────────────
echo "==> ECR login..."
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

# ── 3. Build Docker image ─────────────────────────────────────────────
echo "==> Building Docker image..."
docker build \
  --platform linux/amd64 \
  --tag "${ECR_URI}:${IMAGE_TAG}" \
  --tag "${ECR_URI}:latest" \
  .

# ── 4. Push to ECR ────────────────────────────────────────────────────
echo "==> Pushing to ECR..."
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"

# ── 5. CDK deploy ────────────────────────────────────────────────────
echo "==> CDK deploy..."
IMAGE_TAG="${IMAGE_TAG}" \
  REDIS_SECRET_NAME="${REDIS_SECRET_NAME:-}" \
  CDK_DEFAULT_ACCOUNT="${ACCOUNT}" \
  CDK_DEFAULT_REGION="${REGION}" \
  npx cdk deploy VigiaSearch \
    --app "npx ts-node infrastructure/cdk/app.ts" \
    --require-approval never \
    --outputs-file cdk-outputs.json

echo ""
echo "==> Done. Outputs:"
cat cdk-outputs.json | python3 -c "
import json, sys
o = json.load(sys.stdin).get('VigiaSearch', {})
dns = o.get('AlbDnsName', 'not found')
ecr = o.get('EcrRepoUri', 'not found')
print(f'  ALB DNS  : http://{dns}')
print(f'  ECR URI  : {ecr}')
print()
print('  → Set VIGIA_API_BASE_URL = http://' + dns + '/v1/search in Android BuildConfig')
"
