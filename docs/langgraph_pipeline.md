# VIGIA — LangGraph RAG Pipeline Architecture

## Overview

VIGIA uses a LangGraph-style stateful orchestration pipeline with 5 nodes, implementing CRAG (Corrective RAG) with multi-hop reasoning. The pipeline processes citizen queries about Indian road infrastructure and returns evidence-backed audit findings with citations, spatial data, and actionable next steps.

```
User Query → Router → Ingest → Guardrail → UI Hook → Synthesizer → Response
                         ↓          ↑
                      Agents    (retry loop)
```

---

## Pipeline Nodes

### 1. Router Node
- **File**: `lib/agents/router.ts`
- **Model**: Amazon Nova Lite
- **Function**: Classifies user intent into one of:
  - `condition` — road condition/quality queries
  - `complaint` — how to file a complaint
  - `rti` — RTI filing guidance
  - `personnel` — who is responsible (officer lookup)
  - `tender_search` — contract/tender information
  - `conversational` — general chat (short-circuited directly to LLM)
- **Behavior**: Conversational queries bypass the full pipeline and go straight to LLM response. All other intents proceed to Ingest.

### 2. Ingest Node
- **File**: `lib/agents/ingest.ts`
- **Function**: Dispatches to parallel agents based on classified intent. Implements the ReWOO (Reasoning WithOut Observation) pattern via a Plan-and-Execute sub-graph.
- **Behavior**: Generates a retrieval plan, then executes tool calls in topological order without intermediate LLM reasoning steps (reducing latency and cost).

### 3. Guardrail Node
- **File**: `lib/agents/guardrail.ts`
- **Function**: CRAG implementation — the quality control gate.
- **Capabilities**:
  - Grades retrieval quality (similarity threshold)
  - Detects data voids (all evidence below threshold)
  - Triggers query rewrite + retry on low-quality retrieval
  - Detects contradictions between evidence sources
  - Validates temporal coherence (e.g., maintenance date before construction date = error)
  - Falls back to Authority Matrix when data void persists after retry

### 4. UI Hook Node
- **File**: `lib/agents/ui-hook.ts`
- **Function**: Zero-LLM-token data transformation. Pure computation, no model calls.
- **Extracts**:
  - Spatial markers (lat/lng for map rendering)
  - Budget data (sanctioned vs spent, for charts)
  - Citations (source document + chunk references)
  - Frontend formatting metadata

### 5. Synthesizer
- **File**: `lib/agents/synthesizer.ts`
- **Model**: Amazon Nova Lite (general) / Amazon Nova Pro (personnel queries)
- **Function**: Generates the final audit finding from gathered evidence.
- **Constraints**: Strict anti-hallucination system prompt — must cite sources, cannot invent data points, must use COPY-PASTE for contact details.

---

## Agent Sub-System

### Admin Agent
- **File**: `lib/agents/agents/admin.ts`
- **Pattern**: Plan-and-Execute (ReWOO)
- **Behavior**:
  1. Generates multi-step retrieval plan from query
  2. Executes tools in topological order
  3. Cross-references results from multiple sources
  4. Handles international queries via World Bank / OCDS APIs

### Vision Agent
- **File**: `lib/agents/agents/vision.ts`
- **Function**: Analyzes uploaded road images for damage severity
- **Use**: User uploads photo of pothole/crack → agent classifies severity and estimates repair cost

### Telemetry Agent
- **File**: `lib/agents/agents/telemetry.ts`
- **Function**: Processes GPS + accelerometer data for road roughness estimation
- **Use**: Mobile sensor data → International Roughness Index (IRI) approximation

---

## Retrieval Architecture

| Layer | Technology | Purpose |
|---|---|---|
| **Primary** | pgvector (RDS PostgreSQL) + Amazon Titan Embed v2 (1024 dims) | Cosine similarity search via Lambda proxy |
| **Fallback** | Local SQLite FTS5 | Keyword search when pgvector is unreachable |
| **Hybrid** | Reciprocal Rank Fusion (RRF) | Merges vector + keyword results for better recall |
| **Reranking** | Cohere cross-encoder (optional) | Top-K refinement for precision |

### Retrieval Flow
```
Query → Titan Embed v2 → pgvector cosine search (top 20)
                                    ↓
Query → SQLite FTS5 keyword search (top 20)
                                    ↓
                        RRF merge → top 10
                                    ↓
                    Cohere rerank (optional) → top 5
```

---

## CRAG (Corrective RAG) System

The Guardrail Node implements a 6-step corrective retrieval process:

1. **Retrieval Grading** — Confidence threshold: 0.4 minimum cosine similarity. Chunks below this are discarded.
2. **Data Void Detection** — If ALL retrieved evidence falls below threshold, declare data void.
3. **Query Rewrite** — LLM rewrites the original query for a broader or different retrieval angle.
4. **Retry** — Re-runs the Ingest node with the rewritten query.
5. **Authority Fallback** — If retry still produces a data void, output exact portal URLs + helplines from the Authority Matrix. Never hallucinate an answer.
6. **Contradiction Detection** — Cross-checks official documents vs visual/telemetry evidence. Flags discrepancies (e.g., "NHAI says maintained in 2024" but "user photo shows severe damage").

---

## Models Used

| Purpose | Model | Why |
|---|---|---|
| Intent routing | Amazon Nova Lite | Fast, cheap, good at classification |
| Query planning | Amazon Nova Lite | Structured output for retrieval plans |
| Synthesis (general) | Amazon Nova Lite | Cost-effective for most queries |
| Synthesis (personnel) | Amazon Nova Pro | Reduces hallucination of contact details |
| Embeddings | Amazon Titan Embed v2 | 1024 dims, good multilingual support |
| Faithfulness scoring | Amazon Nova Lite | Post-generation LLM-as-judge |

---

## Data Ingestion Pipeline

### Track A — PDF Ingestion
```
EventBridge CRON (daily)
    → pdf-scraper Lambda (512MB)
        - Downloads new PDFs from NHAI/MoRTH websites
        - Deduplicates via DynamoDB hash table
        - Stores raw PDF in S3 (vigia-raw-documents)
    → pdf-parser Lambda (2048MB, 10min timeout)
        - Extracts text + tables from PDF
        - Semantic chunking (preserves table structure)
        - Generates Titan Embed v2 embeddings per chunk
        - Upserts into pgvector
```

### Track B — API Ingestion
```
EventBridge CRON (daily)
    → api-etl Lambda (256MB)
        - Fetches from Data.gov.in, PMGSY OMMAS portal
        - Transforms to structured JSONL
        - Stores in S3 (vigia-structured-data)
        - Embeds and upserts into pgvector
```

---

## Anti-Hallucination Measures

1. **Strict system prompt** — COPY-PASTE instructions for contact details. Model must reproduce exactly from retrieved chunks.
2. **VERIFIED CONTACT DETAILS block** — Personnel queries extract a structured block that the model must populate only from evidence.
3. **Nova Pro upgrade** — Personnel queries automatically route to Nova Pro (larger model, less prone to fabrication).
4. **Faithfulness scoring** — Post-generation async check: LLM-as-judge scores whether the response is faithful to retrieved evidence.
5. **Geographic enforcement** — PWD contact search is constrained to the queried state/district. Cannot return officers from wrong jurisdiction.

---

## Future Plans

### Complaint Routing (with government support)
Direct integration with PGPortal API for automated complaint filing. User reports damage → VIGIA generates complaint with evidence (photo, location, responsible authority) → routes to correct authority → tracks resolution status.

### DePIN Telemetry Network
Crowdsourced road condition monitoring via user phones. Accelerometer data → roughness index → real-time condition map overlay. Incentivized via token rewards.

### NHAI RAMS Integration
With institutional MoU, direct access to Pavement Condition Index and IRI data for proactive maintenance alerts. Would fill the biggest data gap (0% → 100% coverage on road condition metrics).

### Multi-language Voice
Currently supports Hindi, Malayalam, and Tamil via Azure STT + Deepgram. Goal: expand to all 22 scheduled languages of India for true accessibility.
