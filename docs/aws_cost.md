# VIGIA AWS Cost Analysis

## Architecture Summary

VIGIA runs on a serverless-first AWS architecture with a single RDS instance as the only always-on resource.

---

## Per-Query Costs (Runtime)

| Service | Operation | Cost/Query | Notes |
|---------|-----------|-----------|-------|
| Bedrock Nova Lite (Router) | ~200 input + 50 output tokens | $0.0003 | Intent classification |
| Bedrock Nova Lite (NER) | ~100 input + 30 output tokens | $0.0002 | Road number extraction |
| Bedrock Nova Lite (Response) | ~800 input + 300 output tokens | $0.0008 | Final streamed answer |
| Bedrock Nova Lite (Vision) | ~500 input + 100 output tokens | $0.0010 | Only if image attached |
| Bedrock Titan Embed v2 | 1 embedding (retrieval proxy) | $0.0001 | pgvector query embedding |
| Lambda (retrieval-proxy) | 1 invocation, ~500ms | $0.000008 | pgvector search |
| Cohere Rerank (optional) | 20 documents reranked | $0.0010 | Only if COHERE_API_KEY set |
| Upstash Redis (optional) | 1 GET + 1 SET | $0.000004 | Only if configured |
| **Total (text query)** | | **$0.0014** | |
| **Total (with image)** | | **$0.0024** | |
| **Total (with reranking)** | | **$0.0024** | |

---

## Daily Pipeline Costs (Ingestion)

### Track A: PDF Scraper + Parser (Daily 02:00 UTC)

| Service | Operation | Cost/Run | Notes |
|---------|-----------|---------|-------|
| Lambda (pdf-scraper) | 10 PDF downloads, ~3 min | $0.004 | 2048MB, checks DynamoDB for dedup |
| Lambda (pdf-parser) | Parse + embed ~50 chunks per PDF | $0.05 | Bedrock Titan Embed: $0.0001/embed × ~500 chunks |
| Bedrock Titan Embed v2 | ~500 embeddings/day | $0.05 | 1024-dim, $0.0001 per embedding |
| S3 (storage) | ~50MB PDFs + structured data | $0.001 | Standard tier |
| DynamoDB (dedup) | ~10 reads + ~2 writes | $0.000003 | On-demand pricing |
| RDS (pgvector writes) | ~500 INSERTs | included | Part of RDS instance cost |
| **Track A Daily Total** | | **~$0.10** | |

### Track B: API ETL + FTS5 Loader (Daily 03:00 UTC)

| Service | Operation | Cost/Run | Notes |
|---------|-----------|---------|-------|
| Lambda (api-etl) | Fetch from data.gov.in, PMGSY | $0.002 | 512MB, ~30s |
| Lambda (fts5-loader) | Build SQLite, upload to S3 | $0.003 | 1024MB, ~60s |
| S3 (FTS5 DB upload) | ~5MB SQLite file | $0.0001 | Versioned bucket |
| **Track B Daily Total** | | **~$0.005** | |

### Track B: PWD Scraper (Weekly, Sunday 04:00 UTC)

| Service | Operation | Cost/Run | Notes |
|---------|-----------|---------|-------|
| Lambda (pwd-scraper) | Scrape 2 state directories | $0.01 | 2048MB, Playwright, ~5 min |
| **Weekly Total** | | **~$0.01** | ~$0.0014/day amortized |

---

## Always-On Infrastructure Costs

| Service | Spec | Monthly Cost | Notes |
|---------|------|-------------|-------|
| RDS PostgreSQL 16.4 | db.t4g.micro, 20GB gp3 | **$15.33** | Single-AZ, pgvector |
| NAT Gateway | 1 gateway, minimal traffic | **$32.40** | $0.045/hr + $0.045/GB |
| Secrets Manager | 1 secret (RDS password) | **$0.40** | $0.40/secret/month |
| S3 (3 buckets) | ~200MB total | **$0.01** | Standard tier |
| DynamoDB | On-demand, ~100 items | **$0.01** | Minimal reads/writes |
| EventBridge | 3 CRON rules | **$0.00** | Free tier |
| **Always-On Monthly Total** | | **~$48.15** | |

---

## Monthly Cost Projections

### Low Traffic (100 queries/day)

| Category | Monthly Cost |
|----------|-------------|
| Always-on infrastructure | $48.15 |
| Bedrock (queries) | $4.20 |
| Bedrock (daily ingestion) | $1.50 |
| Lambda invocations | $0.30 |
| **Total** | **~$54/month** |

### Medium Traffic (1,000 queries/day)

| Category | Monthly Cost |
|----------|-------------|
| Always-on infrastructure | $48.15 |
| Bedrock (queries) | $42.00 |
| Bedrock (daily ingestion) | $1.50 |
| Lambda invocations | $3.00 |
| Cohere Rerank (if enabled) | $30.00 |
| Upstash Redis (if enabled) | $0 (free tier: 10k/day) |
| **Total** | **~$125/month** |

### High Traffic (10,000 queries/day)

| Category | Monthly Cost |
|----------|-------------|
| Always-on infrastructure | $48.15 |
| Bedrock (queries) | $420.00 |
| Bedrock (daily ingestion) | $1.50 |
| Lambda invocations | $30.00 |
| Cohere Rerank | $300.00 |
| Upstash Redis (Pro) | $10.00 |
| RDS upgrade (t4g.small) | +$15.00 |
| **Total** | **~$825/month** |

---

## Cost Optimization Strategies

| Strategy | Savings | Status |
|----------|---------|--------|
| Semantic caching (Upstash Redis) | 30-50% of Bedrock costs on repeat queries | ✅ Implemented |
| Remove synthesizer node | ~33% fewer LLM tokens per query | ✅ Implemented |
| Cohere Rerank only for >5 results | Skip reranking for simple queries | ✅ Implemented |
| Reserved RDS instance (1yr) | ~40% savings on RDS | Not yet |
| Remove NAT Gateway (use VPC endpoints) | Save $32/month | Not yet |
| Bedrock batch inference for ingestion | ~50% cheaper embeddings | Not yet |

---

## Cost Per Feature

| Feature | Marginal Cost | Justification |
|---------|--------------|---------------|
| Intent routing (LLM) | $0.0003/query | Accurate classification of ambiguous queries |
| Semantic search (pgvector) | $0.0001/query | Finds relevant chunks even with paraphrased queries |
| Cross-encoder reranking | $0.001/query | Guarantees top-3 precision for legal/factual accuracy |
| Vision analysis | $0.001/image | iRAP-standard road damage assessment |
| Daily PDF ingestion | $0.10/day | Keeps contract data fresh (weekly NHAI updates) |
| Semantic cache | $0/query (free tier) | Eliminates redundant LLM calls |

---

## Comparison: VIGIA vs Alternatives

| Metric | VIGIA (current) | OpenAI GPT-4o equivalent | Perplexity Pro |
|--------|----------------|--------------------------|----------------|
| Cost per query | $0.0014 | $0.01–0.03 | ~$0.02 (estimated) |
| Monthly (1k/day) | ~$125 | ~$600–900 | $20/user (limited) |
| Hosting | ~$48/month fixed | N/A (API only) | N/A |
| Data freshness | Daily (automated) | None (training cutoff) | Real-time web |

**Key advantage:** VIGIA's use of Bedrock Nova Lite ($0.0006/1K input tokens) vs GPT-4o ($0.005/1K) gives us ~8x cost efficiency per token while maintaining sufficient quality for structured government data retrieval.
