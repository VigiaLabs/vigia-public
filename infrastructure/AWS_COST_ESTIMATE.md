# VIGIA Module 1: AWS Cost Estimate

> Region: ap-south-1 (Mumbai) | Pricing as of May 2026  
> Assumes daily pipeline execution, ~20 new PDFs/day, ~500 structured records/day

---

## Monthly Cost Breakdown

| Service | Resource | Usage/Month | Unit Price | Monthly Cost |
|---------|----------|-------------|-----------|-------------|
| **Lambda** | pdf-scraper (512MB, 5min max) | 30 invocations × ~60s avg | $0.0000133/GB-s | $0.01 |
| **Lambda** | pdf-parser (2048MB, 10min max) | 600 invocations × ~120s avg | $0.0000133/GB-s | $1.92 |
| **Lambda** | api-etl (256MB, 3min max) | 30 invocations × ~30s avg | $0.0000133/GB-s | $0.003 |
| **Lambda** | fts5-loader (512MB, 5min max) | 30 invocations × ~20s avg | $0.0000133/GB-s | $0.004 |
| **S3** | Raw documents bucket | ~2GB stored, 600 PUTs | $0.025/GB + $0.005/1K PUT | $0.05 |
| **S3** | Structured data bucket | ~100MB stored, 30 PUTs | $0.025/GB + $0.005/1K PUT | $0.01 |
| **S3** | FTS5 DB bucket | ~50MB stored, 30 PUTs | $0.025/GB + $0.005/1K PUT | $0.01 |
| **DynamoDB** | document_hashes (on-demand) | ~600 writes + 600 reads/month | $1.25/M WCU, $0.25/M RCU | $0.01 |
| **EventBridge** | 3 CRON rules | 90 invocations/month | Free tier (14M/month) | $0.00 |
| **Bedrock** | Titan Embed Text v2 | ~600 docs × 8 chunks × 1K tokens | $0.0002/1K input tokens | $0.96 |
| **RDS** | PostgreSQL 16 + pgvector (db.t4g.micro) | 1 instance, 20GB gp3 | $0.018/hr + $0.133/GB-mo | $15.62 |

---

## Monthly Total

| Tier | Configuration | Monthly Cost |
|------|--------------|-------------|
| **Development** | Lambda + S3 + DynamoDB + Bedrock (no RDS, FTS5 only) | **~$3.00** |
| **Production** | Full stack with RDS db.t4g.micro | **~$18.60** |
| **Production (scaled)** | RDS db.t4g.small + higher throughput | **~$35.00** |

---

## Cost Optimization Notes

1. **RDS is the dominant cost.** For hackathon/demo, skip RDS and use FTS5-only mode. The hybrid router gracefully degrades when `PG_HOST` is empty.

2. **Bedrock embeddings** are cheap at Titan v2 pricing ($0.0002/1K tokens). Even 10x the volume stays under $10/month.

3. **Lambda costs are negligible** — the entire pipeline runs for under $2/month in compute.

4. **S3 lifecycle rules** auto-expire raw PDFs after 90 days, keeping storage bounded.

5. **DynamoDB on-demand** is ideal for this bursty, low-volume workload. No idle cost.

---

## Free Tier Coverage (first 12 months)

| Service | Free Tier Allowance | Pipeline Usage | Covered? |
|---------|-------------------|----------------|----------|
| Lambda | 1M requests + 400K GB-s | ~750 requests + ~2K GB-s | ✅ Yes |
| S3 | 5GB + 20K GETs + 2K PUTs | ~2.2GB + 660 PUTs | ✅ Yes |
| DynamoDB | 25 WCU + 25 RCU | On-demand ~600/month | ✅ Yes |
| EventBridge | 14M events/month | 90 events | ✅ Yes |
| RDS | 750 hrs db.t4g.micro + 20GB | 720 hrs + 20GB | ✅ Yes |

**Within AWS Free Tier, the entire pipeline costs $0.96/month (Bedrock only).**

---

## Comparison: Current vs. Production

| Metric | Current (Mocked) | Production Pipeline |
|--------|-----------------|-------------------|
| Data freshness | Static (never updates) | Daily at 02:00 UTC |
| Source coverage | 1 mock PDF, 8 rows | CPPP + NHAI + Data.gov.in + PMGSY |
| Search quality | FTS5 only, 8 sections | Hybrid FTS5 + pgvector, thousands of chunks |
| Idempotency | None | SHA-256 dedup + UNIQUE constraints |
| Cost | $0 | ~$3/month (dev) to ~$19/month (prod) |
