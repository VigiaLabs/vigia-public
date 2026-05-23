# VIGIA LangGraph Pipeline Architecture

## Overview

VIGIA uses a 4-node LangGraph StateGraph to orchestrate multi-agent evidence gathering before streaming a final LLM response. The pipeline is executed inline (not as a compiled graph invocation) to enable real-time progress streaming to the frontend.

---

## Pipeline Topology

```
User Query → API Route
                │
                ├── [Cache Check] → HIT → instant response (50ms)
                │
                ├── Node 1: Router (Bedrock Nova Lite)
                │     └── Classifies intent, selects agents
                │
                ├── Node 2: Ingest (Parallel Agent Dispatch)
                │     ├── Admin Agent (FTS5 + pgvector + tools)
                │     ├── Vision Agent (Bedrock multimodal)
                │     └── Telemetry Agent (OpenStreetMap)
                │
                ├── Node 3: Guardrail (Zero LLM, deterministic)
                │     └── Contradiction detection, citizen-claim handling
                │     └── Max 1 retry loop if contradiction found
                │
                ├── Node 4: UI Hook (Zero LLM, data transform)
                │     └── Extracts UIPayload for frontend
                │
                └── streamText (Bedrock Nova Lite)
                      └── Final response with evidence context
```

---

## Node Details

### Node 1: Router

| Aspect | Detail |
|--------|--------|
| **LLM** | Amazon Bedrock Nova Lite v1 |
| **Method** | `generateObject()` with Zod schema |
| **Latency** | ~1.2–1.8s |
| **Cost** | ~$0.0003/call (input ~200 tokens, output ~50 tokens) |
| **Output** | `intent` (6 categories) + `activeAgents` array |

**Intent Categories:**
- `conversational` → short-circuits pipeline, streams reply directly
- `tender_search` → searches contract PDFs (also handles maintenance/DLP queries)
- `complaint` → routes to complaint authority lookup
- `rti` → routes to RTI authority lookup
- `condition` → queries indexed data, suggests photo upload
- `personnel` → queries PWD contacts directory

**Agent Selection Rules:**
- `admin` → always for non-conversational
- `vision` → only if image attached
- `telemetry` → only if GPS coordinates attached

### Node 2: Ingest (Parallel Dispatch)

All agents run concurrently via `Promise.allSettled` with individual 4-second AbortController timeouts.

#### Admin Agent
| Aspect | Detail |
|--------|--------|
| **NER** | Bedrock Nova Lite extracts road number + state (~$0.0002) |
| **Search** | Hybrid FTS5 + pgvector with RRF fusion |
| **Reranking** | Cohere Rerank v3 (if configured, ~$0.001) |
| **Tools** | RTI lookup, complaint routing, PWD contacts, PMGSY search |
| **Latency** | 1.5–3s (dominated by NER + search) |

#### Vision Agent
| Aspect | Detail |
|--------|--------|
| **LLM** | Bedrock Nova Lite (multimodal) |
| **Trust** | `citizen-claim` — does NOT override official data |
| **Output** | iRAP severity rating, findings, star rating |
| **Latency** | ~2–3s |
| **Cost** | ~$0.001/call (image + text) |

#### Telemetry Agent
| Aspect | Detail |
|--------|--------|
| **Real** | OpenStreetMap Overpass API for road identification |
| **Mock** | IMU data (hardcoded — awaiting DePIN integration) |
| **Latency** | ~0.5–1.5s (network dependent) |
| **Cost** | Free (OSM is open) |

### Node 3: Guardrail

| Aspect | Detail |
|--------|--------|
| **LLM Calls** | Zero |
| **Logic** | Deterministic TypeScript |
| **Latency** | <1ms |
| **Cost** | $0 |

**Decisions:**
1. Citizen-claim photos → set `pendingAction`, skip contradiction
2. Admin claims "compliant" + Vision shows "severe" → contradiction detected
3. First contradiction → retry with "amendment clauses OR variation orders"
4. Contradiction persists after retry → flag as `contradictionVerified`

### Node 4: UI Hook

| Aspect | Detail |
|--------|--------|
| **LLM Calls** | Zero |
| **Logic** | Pure data transformation |
| **Output** | `UIPayload` (sources, budget, spatial markers, pending actions, debug trace) |

---

## State Schema

```typescript
VigiaState {
  traceId: UUID
  startedAt: number
  payload: { text, imageUrl, gps, threadId, messageId, history }
  activeAgents: ['vision' | 'admin' | 'telemetry']
  intent: 'conversational' | 'complaint' | 'rti' | 'condition' | 'personnel' | 'tender_search'
  evidence: NormalizedEvidence[]  // append-only reducer
  retryCount: number             // 0 or 1
  contradictionDetected: boolean
  contradictionVerified: boolean
  pendingAction?: { type, coordinates, visionFindings, suggestedActions }
  pipelineStatus: 'routing' | 'ingesting' | 'guardrail' | 'complete' | ...
  debugTrace: DebugTraceEntry[]  // append-only reducer
  totalLatencyMs: number
}
```

---

## Cost Analysis (Per Query)

| Component | Tokens (In/Out) | Cost |
|-----------|-----------------|------|
| Router LLM | ~200/50 | $0.0003 |
| Admin NER | ~100/30 | $0.0002 |
| Vision (if image) | ~500/100 | $0.0010 |
| Reranker (if configured) | N/A | $0.0010 |
| Final streamText | ~800/300 | $0.0008 |
| **Total (text only)** | | **$0.0013** |
| **Total (with image)** | | **$0.0033** |

**Monthly estimate at 1000 queries/day:** ~$39–$99/month in Bedrock costs.

---

## Latency Analysis

| Phase | Without Cache | With Cache |
|-------|--------------|------------|
| Cache check | 5ms | 5ms → **HIT: return in 50ms** |
| Router | 1.5s | 1.5s |
| Ingest (parallel) | 2–3s | 2–3s |
| Guardrail | <1ms | <1ms |
| UI Hook | <1ms | <1ms |
| First text token | +1s | +1s |
| **Total TTFB** | **4.5–5.5s** | **50ms (cache hit)** |

---

## Databases Used

### Static (Pre-indexed, Read-only)

| Database | Engine | Location | Content |
|----------|--------|----------|---------|
| `nhai_sections` | SQLite FTS5 | `data/nhai_mock.db` | 20 real NHAI contract chunks |
| `pwd_contacts` | SQLite FTS5 | `data/nhai_mock.db` | 28 real PWD officer records |
| `pmgsy_contracts` | SQLite FTS5 | `data/nhai_mock.db` | 14 real PMGSY rural road records |
| `authority-matrix.json` | JSON file | `data/` | RTI + complaint authorities |

### Dynamic (Cloud, Updated Daily)

| Database | Engine | Location | Content |
|----------|--------|----------|---------|
| `contract_embeddings` | pgvector (HNSW) | AWS RDS PostgreSQL 16.4 | 1024-dim Titan Embed v2 vectors from 10 NHAI/MoRTH PDFs |
| `vigia-document-hashes` | DynamoDB | AWS | SHA-256 dedup for ingested PDFs |
| Semantic Cache | Upstash Redis | Edge | Cached query→response pairs (24h TTL) |

### Client-Side (Browser)

| Database | Engine | Location | Content |
|----------|--------|----------|---------|
| `VigiaDB` | Dexie (IndexedDB) | Browser | Chat threads + messages with metadata |

---

## Design Decisions

1. **Why inline execution instead of `graph.invoke()`?** — To emit progress events between nodes. The compiled graph is a black box; inline execution lets us stream "Classifying intent..." → "Searching 3 sources..." to the frontend.

2. **Why was the Synthesizer removed?** — It generated a full audit finding (~2s, ~1000 tokens) that was never shown to the user. The API route's `streamText` call does the same job while streaming.

3. **Why LLM routing instead of regex?** — Regex misses nuanced intent (e.g., "who built this road" = tender_search, not personnel). The LLM correctly handles ambiguous queries. Cost is $0.0003/call — negligible.

4. **Why citizen-claim trust level?** — User photos cannot override official records. A photo of a pothole doesn't prove the government's compliance report is wrong — it proves a citizen observed damage. These are different epistemic claims.

5. **Why RRF + optional reranking?** — RRF is fast and free. Cross-encoder reranking (Cohere) adds ~200ms and $0.001 but guarantees the top chunks are maximally relevant. It's optional — system works without it.

6. **Why append-only evidence reducer?** — Evidence accumulates across retry loops. If the guardrail triggers a retry, the new evidence is appended (not replaced), giving the synthesizer the full picture.
