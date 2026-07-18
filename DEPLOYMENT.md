# VIGIA — AWS Deployment & Decommissioning Document

**Account:** `203800220566` · **Primary region:** `us-east-1` · **Deploy IAM user:** `vigia-developer`

This document records every AWS service used to deploy the VIGIA system (web search engine + mobile copilot backend + data-ingestion pipeline), and provides the decommissioning runbook.

> **If you are closing the AWS account:** you do **not** need to delete resources individually. Closing the account (Billing console → Account → Close Account) terminates and stops billing for **everything below, in all regions**, including resources with `RETAIN` policies that survive stack deletion. See [§7 Decommissioning](#7-decommissioning).

---

## 1. System overview

VIGIA is three deployables sharing one AWS account:

| Deployable | What it is | Fronted by |
|---|---|---|
| **VIGIASearch (web)** | Next.js app — the RoadWatch chatbot | AWS Amplify Hosting (`vigia-public`) |
| **Mobile copilot backend** | APIs for the Android app (device registry, rewards/DePIN, hazards, Sarvam voice proxy, Stripe payout) | API Gateway + Lambda (`VigiaStack`) |
| **Data ingestion pipeline** | Dual-track daily ETL that fills the vector DB | EventBridge + Lambda (`VigiaIngestionPipeline`) |

All three read/write a shared **RDS PostgreSQL + pgvector** database via the `vigia-retrieval-proxy` Lambda.

---

## 2. CloudFormation / CDK stacks

Everything was provisioned as code (AWS CDK). Four stacks exist:

| Stack | Purpose | Notes |
|---|---|---|
| `CDKToolkit` | CDK bootstrap (asset bucket + ECR + roles) | Delete last |
| `VigiaIngestionPipeline` | Daily ETL: scrapers, parsers, embedders, EventBridge CRON, S3, DynamoDB dedup, RDS, VPC/NAT | The stack in `infrastructure/cdk/` |
| `VigiaStack` | Mobile/enterprise backend: ~40 Lambdas across Ingestion / Intelligence / Innovation / Enterprise / Session modules | The largest stack |
| `VigiaSearch` | Search-engine service resources (Fargate image `vigia-search-engine`, supporting infra) | — |

---

## 3. Every AWS service used

### Compute — AWS Lambda (~55 functions)
The core of the system. Key functions:
- `vigia-retrieval-proxy` — **the hub.** Embeds queries (Bedrock Titan v2) and runs pgvector similarity search inside the VPC; exposed via a Lambda **Function URL** (auth: NONE). Called by the web app and pipeline.
- `vigia-pdf-scraper`, `vigia-pdf-parser`, `vigia-db-init` — Track A (PDF → pgvector).
- `vigia-api-etl`, `vigia-fts5-loader` — Track B (structured API → FTS5).
- `vigia-pmgsy-scraper`, `vigia-pwd-scraper` (Python 3.12) — Playwright/BeautifulSoup scrapers.
- `VigiaStack-Ingestion*` — device registration, attestation, Stripe payout, Sarvam proxy, hazard ingestion, validators.
- `VigiaStack-Intelligence*` / `Innovation*` — Bedrock router, orchestrator, agent-trace streamers, economic/maintenance queries, hazard verification.
- `VigiaStack-Enterprise*` / `vigia-enterprise-*` — enterprise auth, rewards distributor, burn/stats.
- `VigiaStack-Session*` — session CRUD, geohash resolver, places search, hash-chain validator.

### Hosting — AWS Amplify (2 apps)
- `vigia-public` → **https://d1y3lme21jz1c7.amplifyapp.com** (the live demo). CI/CD from GitHub `main`.
- `vigia-amazon` → `d37hzf29nvf0f4.amplifyapp.com` (secondary).

### AI/ML — Amazon Bedrock (pay-per-use, nothing to delete)
- **Amazon Nova Lite** (`amazon.nova-lite-v1:0`) — routing, synthesis, faithfulness scoring, vision.
- **Amazon Nova Pro** (`amazon.nova-pro-v1:0`) — personnel queries (lower fabrication risk).
- **Amazon Titan Embed v2** (`amazon.titan-embed-text-v2:0`, 1024-dim) — all embeddings.

### Database — Amazon RDS PostgreSQL + pgvector
- Instance `vigia-pgvector` — **db.t4g.micro**, PostgreSQL 16, single-AZ, 20 GB gp3, in a private-isolated subnet. Holds the unified vector store (`source_type` discriminator). **Billing item.**

### API — Amazon API Gateway (5 REST APIs)
`VIGIA Session API` · `vigia-enterprise-api` · `vigia-enterprise` · `VIGIA Innovation API` · `VIGIA Telemetry API` — the mobile app's `/v1/*` surface.

### Auth — Amazon Cognito (2 user pools)
`us-east-1_6G1ZFa1XG` (enterprise pool) · `us-east-1_kPgzfccax` (`vigia-enterprise-users`). Used by the Android app (Amplify Auth) and enterprise login.

### Messaging — AWS IoT Core
- Endpoint `a3re4nls2cuv10-ats.iot.us-east-1.amazonaws.com`, thing `vigia-001`. MQTT hazard-alert delivery to the mobile app (QoS 1).

### Storage — Amazon S3 (7 buckets)
`vigia-raw-documents` (raw PDFs, 90-day lifecycle) · `vigia-structured-data` · `vigia-fts5-db` (versioned) · `vigia-hazard-frames-203800220566` + `vigiastack-ingestionhazardframesbucket…` (uploaded hazard JPEGs) · `vigia-static-assets-1772997117` · `cdk-hnb659fds-assets-…` (CDK assets). Several are `RETAIN`.

### NoSQL — Amazon DynamoDB (~25 tables, PAY_PER_REQUEST)
`vigia-document-hashes` (SHA-256 ingest dedup) · device registries (`VigiaDeviceRegistry`, `VigiaPiDeviceRegistry`, `VigiaDeviceBindings`) · rewards/DePIN (`…RewardsLedgerTable`, `vigia-burn-history`, `…CooldownTable`) · `VigiaAttestationLog` · agent traces · economic metrics · maintenance queue · `vigia-enterprise-users` · session files/ledgers. **Some hold real data — see §7 warning.**

### Scheduling — Amazon EventBridge (CRON rules)
`vigia-track-a-daily` (02:00 UTC) · `vigia-track-b-etl-daily` (03:00) · `vigia-track-b-fts5-daily` (03:30) · `vigia-unified-embedder-daily` (04:00) · `vigia-pwd-scraper-weekly` / `vigia-pmgsy-scraper-weekly` (Sun 04:00/04:30).

### Networking — Amazon VPC
- 2 non-default VPCs (`vpc-059fd137495565f3b`, `vpc-0da1f94502cbabb8d`), 3-tier subnets (public / private-egress / isolated).
- **NAT Gateway `nat-09380f547433051e3`** — lets in-VPC Lambdas reach the internet. **~$33/mo — the single biggest fixed cost.** ⚠️
- Security groups gate Lambda → RDS on 5432.

### Secrets — AWS Secrets Manager (5 secrets — LIVE CREDENTIALS ⚠️)
`vigia/pgvector` (DB creds) · `vigia/sarvam-api-key` · `vigia/stripe-secret-key` · `vigia/stripe-publishable-key` · `vigia-solana-authority`. **These are real third-party keys — rotate/revoke at the source (Stripe, Sarvam), not just in AWS.**

### Containers — Amazon ECR (2 repos)
`vigia-search-engine` (Fargate/search image) · `cdk-hnb659fds-container-assets-…`. (Check ECS/Fargate + any ALB in §7.)

### Observability — Amazon CloudWatch
Log groups for every Lambda + metrics. Deleted with stacks; orphan log groups may linger.

---

## 4. Data flow (deployed)

```
Daily CRON (EventBridge)
  ├─ Track A: pdf-scraper → S3(raw) → [S3 event] → pdf-parser → Bedrock Titan → RDS pgvector
  ├─ Track B: api-etl → S3(structured) → fts5-loader → S3(fts5)
  └─ unified-embedder → retrieval-proxy → RDS pgvector

Web query (Amplify) ─► Next.js /api/chat ─► retrieval-proxy Lambda ─► pgvector
Mobile query ─► API Gateway ─► VigiaStack Lambdas ─► retrieval-proxy / Bedrock / DynamoDB
Hazard alert ─► IoT Core (MQTT) ─► Android app
```

---

## 5. Deployment procedure (how it was built)

```bash
# 1. Bootstrap CDK (once)
cd infrastructure && npx cdk bootstrap aws://203800220566/us-east-1

# 2. Deploy the pipeline + backend stacks
npx cdk deploy --all

# 3. One-time DB schema
aws lambda invoke --function-name vigia-db-init /dev/stdout

# 4. Seed the vector store (needs AWS creds + Bedrock access)
npx tsx scripts/embed-unified.ts          # PWD + PMGSY + authority
npx tsx scripts/push-nh44-to-pgvector.ts  # NH-44 structured data

# 5. Web app: Amplify auto-deploys from GitHub `main`
```

---

## 6. Monthly cost (≈500 queries/day)

| Service | Est. |
|---|---|
| RDS pgvector (t4g.micro) | ~$12–15 |
| **NAT Gateway** | **~$33** ⚠️ |
| Bedrock (Nova Lite/Pro + Titan) | ~$9 |
| Amplify hosting (×2) | ~$1–5 |
| Secrets Manager (5 × $0.40) | ~$2 |
| Lambda / S3 / DynamoDB / EventBridge | <$2 |
| CloudWatch | ~$1 |
| **Total** | **~$60–90/mo** |

Dominant fixed costs: **NAT Gateway + RDS**. Everything else is near-free at this scale.

---

## 7. Decommissioning

### ⚠️ Before deleting anything
1. **Back up any data you want to keep** — DynamoDB tables like `…RewardsLedgerTable`, `vigia-enterprise-users`, and the device registries may hold real records; RDS holds the vector store; S3 `vigia-raw-documents` holds source PDFs. Once deleted, it's gone.
2. **Revoke live third-party keys at the source, not just in AWS:**
   - **Stripe** → dashboard → Developers → API keys → roll/revoke the secret key.
   - **Sarvam** → rotate the API key in their console.
   - **Solana authority** → if it controls anything on-chain, secure/rotate it.
   Deleting the Secrets Manager entry does **not** invalidate the underlying key.

### Option A (recommended if abandoning AWS): close the account
One action terminates **everything** above, in all regions, including `RETAIN` resources — no per-resource cleanup needed.
- **Billing console → Account → Close Account.**
- Requires **root** credentials (not the `vigia-developer` IAM user).
- The account enters a 90-day post-closure suspension, then is permanently deleted. Billing stops at closure.
- **Do the key-revocation step above first** — after closure you lose console access.

### Option B: delete resources but keep the account
Order matters (dependencies + `RETAIN` resources that outlive stacks):

```bash
R=us-east-1

# 1. Stop the bleed first — the NAT Gateway + RDS are the costly items.
#    (Deleting the stacks below removes these, but delete RDS explicitly if it was RETAIN.)

# 2. Delete the CloudFormation/CDK stacks (removes most resources)
aws cloudformation delete-stack --stack-name VigiaStack --region $R
aws cloudformation delete-stack --stack-name VigiaSearch --region $R
aws cloudformation delete-stack --stack-name VigiaIngestionPipeline --region $R
# wait for each to reach DELETE_COMPLETE:
aws cloudformation wait stack-delete-complete --stack-name VigiaStack --region $R

# 3. Delete the two Amplify apps (not in the pipeline stack)
aws amplify delete-app --app-id d1y3lme21jz1c7 --region $R
aws amplify delete-app --app-id d37hzf29nvf0f4 --region $R

# 4. Empty + delete RETAIN'd S3 buckets that survived stack deletion
for b in vigia-raw-documents vigia-structured-data vigia-fts5-db \
         vigia-hazard-frames-203800220566 vigia-static-assets-1772997117; do
  aws s3 rb s3://$b --force
done

# 5. Delete RETAIN'd DynamoDB tables that survived (list first, then delete each)
aws dynamodb list-tables --region $R
# aws dynamodb delete-table --table-name <name> --region $R   # repeat per table

# 6. Delete the 5 secrets (force, no recovery window)
for s in vigia/pgvector vigia/sarvam-api-key vigia/stripe-secret-key \
         vigia/stripe-publishable-key vigia-solana-authority; do
  aws secretsmanager delete-secret --secret-id "$s" --force-delete-without-recovery --region $R
done

# 7. Cognito pools, IoT thing, ECR repos, API Gateways — delete any left after stacks
aws cognito-idp delete-user-pool --user-pool-id us-east-1_6G1ZFa1XG --region $R
aws cognito-idp delete-user-pool --user-pool-id us-east-1_kPgzfccax --region $R
aws iot delete-thing --thing-name vigia-001 --region $R
aws ecr delete-repository --repository-name vigia-search-engine --force --region $R

# 8. Networking last: NAT Gateway → release EIP → VPCs (only after all ENIs are gone)
aws ec2 delete-nat-gateway --nat-gateway-id nat-09380f547433051e3 --region $R

# 9. Finally, CDKToolkit (delete only if fully done with CDK in this account)
aws cloudformation delete-stack --stack-name CDKToolkit --region $R

# 10. Verify no billable resources remain (also check other regions in the console)
```

> Stacks fail to delete if a resource has a dependency (e.g., a VPC with a lingering ENI, or a non-empty bucket). Resolve the named resource and retry. This is exactly why **Option A is cleaner** when the goal is to abandon the account entirely.

### Post-teardown verification
- **Billing console → Bills** and **Cost Explorer** next day — confirm charges trending to $0.
- **Set a $1 billing alarm** to catch anything you missed (orphaned EIPs, snapshots, cross-region resources).
- Check **other regions** in the console region picker — a stray resource in another region still bills.

---

## 8. Migration to Azure (Imagine Cup, Oct 2026)

**Strategy: rebuild from source, do not lift-and-shift.** The system is infrastructure-as-code (CDK) plus a vector store that **regenerates from the source data in this repo** (`data/*.json`, `nhai_mock.db`), so migration is a re-provision + re-embed, not a data haul. The $1,000 Imagine Cup credit is far more than enough (this ran ~$85–110/mo on AWS; Azure equivalents with scale-to-zero cost less).

### Service mapping

| AWS (this deployment) | Azure equivalent | Migration note |
|---|---|---|
| RDS PostgreSQL + pgvector | **Azure Database for PostgreSQL Flexible Server** | Native `pgvector` — direct swap |
| Bedrock (Nova + Titan) | **Azure OpenAI** (GPT-4o-mini + `text-embedding-3-small`) | Main code change; **re-embed everything** (new model → new vector dimension) |
| Amplify (Next.js) | **Azure Static Web Apps** or **Container Apps** | Next.js SSR + API routes supported |
| ECS Fargate | **Azure Container Apps** (scale-to-zero) | Direct container equivalent |
| Lambda | **Azure Functions** | retrieval-proxy + pipeline |
| DynamoDB | **Cosmos DB** / Table Storage | Export first (see §7) — not reproducible from repo |
| S3 | **Blob Storage** | |
| EventBridge CRON | **Functions Timer triggers** | |
| Cognito | **Entra External ID** | |
| IoT Core | **Azure IoT Hub** | mobile hazard alerts |
| Secrets Manager | **Key Vault** | |
| CloudWatch | **Azure Monitor / App Insights** | |

### The only real porting work
Swapping the model provider (Bedrock → Azure OpenAI) in the LangGraph pipeline. Because the app uses the Vercel AI SDK, this is mostly a provider/model-id change plus a re-embed at the new embedding dimension. Everything else is a like-for-like re-provision.

### Preserve before final AWS teardown
1. **This git repo** — regenerates the entire vector store.
2. **DynamoDB export** — run `scripts/export-dynamodb-tables.sh` (rewards ledgers, enterprise users, device registries — *not* in any repo).
3. RDS final snapshot `vigia-pgvector-final-20260718` — bonus safety net; delete anytime to save ~$0.40/mo.
