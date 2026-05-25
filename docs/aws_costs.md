# VIGIA — Estimated Monthly AWS Costs

**Profile**: Hackathon/MVP stage — ~500 queries/day, ~20 PDF ingestions/week, single developer.

## Cost Breakdown

| Service | Configuration | Monthly Estimate |
|---|---|---|
| **Amazon Bedrock — Nova Lite** | ~500 queries/day × 30 days = 15,000 invocations. Avg ~800 input tokens + ~400 output tokens per call. Also used for routing + faithfulness scoring (~2× multiplier). Total: ~30,000 calls. Input: 24M tokens × $0.00006/1K = $1.44. Output: 12M tokens × $0.00024/1K = $2.88 | **$4.32** |
| **Amazon Bedrock — Nova Pro** | ~10% of queries are personnel (1,500/mo). Avg ~1,000 input + ~500 output tokens. Input: 1.5M tokens × $0.0008/1K = $1.20. Output: 0.75M tokens × $0.0032/1K = $2.40 | **$3.60** |
| **Amazon Bedrock — Titan Embed v2** | Queries: 15,000/mo × 1 embedding = 15,000. Ingestion: ~60 chunks/deploy + ~80 PDFs/mo × ~30 chunks = 2,460. Total: ~17,500 embeddings. 17,500 × ~256 tokens avg × $0.00002/1K = $0.09 | **$0.10** |
| **RDS PostgreSQL (pgvector)** | db.t4g.medium, single-AZ, 20GB gp3 storage. On-demand: $0.065/hr × 730 hrs = $47.45. Storage: 20GB × $0.115 = $2.30 | **$49.75** |
| **Lambda — vigia-retrieval-proxy** | 256MB, ~15,000 invocations/mo, avg 200ms. Compute: 15,000 × 0.2s × 0.25GB = 750 GB-s × $0.0000166667 = $0.01. Requests: $0.003 | **$0.01** |
| **Lambda — pdf-parser** | 2048MB, ~80 invocations/mo, avg 120s. Compute: 80 × 120s × 2GB = 19,200 GB-s × $0.0000166667 = $0.32. Requests: negligible | **$0.32** |
| **Lambda — pdf-scraper** | 512MB, ~80 invocations/mo, avg 30s. Compute: 80 × 30s × 0.5GB = 1,200 GB-s × $0.0000166667 = $0.02 | **$0.02** |
| **Lambda — api-etl** | 256MB, ~30 invocations/mo, avg 10s. Compute: negligible | **$0.01** |
| **S3** | 2 buckets, <5GB total storage, ~2,000 PUT/GET requests/mo | **$0.15** |
| **DynamoDB** | On-demand, document hash dedup table. <100 writes/mo, <500 reads/mo | **$0.01** |
| **EventBridge** | 2-3 daily CRON rules. Free tier covers this | **$0.00** |
| **CloudWatch Logs** | ~2GB ingestion/mo × $0.50/GB. Storage: ~5GB × $0.03/GB | **$1.15** |
| **Data Transfer** | Mostly internal (VPC, same-region). <1GB external | **$0.10** |
| **VPC (NAT Gateway)** | If Lambda in VPC needs internet: $0.045/hr × 730 = $32.85 + $0.045/GB processing | **$33.00** ⚠️ |

## Monthly Total

| Scenario | Estimate |
|---|---|
| **With NAT Gateway** (Lambda in VPC needs internet access) | **~$92.50/mo** |
| **Without NAT Gateway** (VPC endpoints or Lambda outside VPC) | **~$59.50/mo** |

## Cost Optimization Notes

1. **RDS is the dominant cost** (~50-80%). Consider:
   - Use RDS free tier if eligible (db.t3.micro, 12 months)
   - Switch to Aurora Serverless v2 for auto-pause during inactivity
   - Use Neon or Supabase (free tier) for hackathon stage
2. **NAT Gateway is expensive** for low traffic. Alternatives:
   - Use VPC endpoints for S3/DynamoDB (free for gateway endpoints)
   - Place retrieval-proxy Lambda outside VPC if pgvector is accessible via public endpoint with security groups
   - Use Lambda with VPC + S3 gateway endpoint to avoid NAT for S3 access
3. **Bedrock costs are minimal** at this scale — Nova Lite is extremely cheap
4. **Free tier eligible**: Lambda (1M requests/mo), DynamoDB (25 WCU/RCU), S3 (5GB), CloudWatch (5GB ingestion)

## Scaling Projections

| Scale | Queries/day | Est. Monthly |
|---|---|---|
| Hackathon (current) | 500 | $60–$93 |
| Early users | 2,000 | $70–$105 |
| Growth | 10,000 | $95–$140 |
| Production | 50,000 | $180–$280 |

> Bedrock scales linearly but remains cheap. RDS is fixed cost until you need to scale up instance size. The main cost driver at scale becomes RDS instance size and read replicas.
