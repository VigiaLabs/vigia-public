# Stateful Orchestration Pipeline — Design Spec

> LangGraph.js 5-Node Deterministic Reasoning Engine for VIGIA Search

**Status:** APPROVED — All architectural decisions finalized  
**Last Updated:** 2026-05-20

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VIGIA Agentic Pipeline                        │
│                                                                      │
│  ┌──────────┐    ┌──────────────────┐    ┌───────────┐             │
│  │  Node 1  │    │     Node 2       │    │  Node 3   │             │
│  │  Router  │───▶│  Parallel Ingest │───▶│ Guardrail │──┐          │
│  │ (if/else)│    │                  │    │ (1-retry) │  │          │
│  └──────────┘    │ ┌──────┐ ┌─────┐│    └───────────┘  │          │
│       ▲          │ │Vision│ │Admin││         ▲          │          │
│       │          │ └──────┘ └─────┘│         │ (once)   │          │
│  User Payload    │ ┌─────────────┐ │         └──────────┘          │
│  (text/img/gps)  │ │  Telemetry  │ │                               │
│                  │ └─────────────┘ │    ┌───────────┐  ┌────────┐ │
│                  └──────────────────┘    │  Node 4   │  │ Node 5 │ │
│                                     ───▶│Synthesizer│─▶│ UI Hook│ │
│                                          │  (LLM)    │  │streamUI│ │
│                                          └───────────┘  └────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Hard constraints:**
- Sub-5s latency for clean paths; ~8.5s acceptable for contradiction detection
- Zero LLM tokens in Nodes 1, 3, 5
- Exactly 1 retry maximum in Node 3
- All agent outputs normalized via Zod before entering global state
- Single LLM provider (Gemini 2.5 Flash) across all LLM nodes

---

## 2. Finalized Architectural Decisions

### Decision 1: LLM Provider — Gemini 2.5 Flash (Unified)

**Chosen:** Gemini 2.5 Flash for both Vision Agent and Synthesizer  
**Rejected:** GPT-4o-mini (would require second API key, second failure domain)

**Rationale:**
- Single API key reduces setup/debugging surface during hackathon
- Gemini Flash streaming is fastest-in-class for text generation
- Schema enforcement is already handled by Zod at the state boundary — we don't need the LLM to produce structured output natively
- Vision Agent already requires Gemini multimodal — consolidating avoids cross-provider latency variance

### Decision 2: SQLite — Bundled in Repository

**Chosen:** `data/nhai_mock.db` committed directly to Git  
**Rejected:** External Vercel volume mount, cloud-hosted DB

**Rationale:**
- Demo environment resilience: zero network dependency for data retrieval
- File size is negligible (~2-5MB for curated NHAI contract data + telemetry events)
- Guarantees sub-50ms query latency regardless of venue Wi-Fi conditions
- `better-sqlite3` synchronous API eliminates async connection overhead
- Database opened with `readonly: true` — no write corruption risk

### Decision 3: Pre-indexed SQLite FTS5 (No LlamaIndex.ts)

**Chosen:** Pre-process NHAI PDF at build time → SQLite FTS5 full-text search  
**Rejected:** LlamaIndex.ts runtime vector search

**Rationale:**
- LlamaIndex.ts cold start: 200-400ms on serverless — unacceptable for 5s budget
- Pre-indexing moves ALL PDF parsing cost to build time (zero runtime cost)
- SQLite FTS5 `MATCH` queries resolve in <5ms — 100x faster than vector similarity
- Deterministic results: same query always returns same chunks (critical for reproducible audits)
- Judges see identical UX — the Admin Agent "reads the PDF" from their perspective

**Build-time pipeline:**
```
scripts/index-nhai.ts → reads PDF → chunks by section → inserts into SQLite FTS5 table
```

```sql
-- Runtime query (Admin Agent)
SELECT content, section_title, page_number, relevance_score
FROM nhai_sections
WHERE nhai_sections MATCH ?
ORDER BY rank
LIMIT 5
```

### Decision 4: Retry Latency — Accept 8.5s, Make It a Feature

**Chosen:** Full 4s agent timeout on retry path (8.5s total)  
**Rejected:** Reduced 2.5s timeout on retry (would risk incomplete evidence)

**Rationale:**
- Contradiction detection IS the product differentiator — rushing it undermines the demo
- The extra 3.5s is transformed into a UX moment via streaming status updates

**UX implementation (streamed to frontend during retry):**
```
⚠️ Contradiction Detected: Paper claims 'Completed', but Visual Evidence 
shows 'Severe Damage'. Re-evaluating source documents for amendment clauses...
```

- The guardrail streams this status message BEFORE re-dispatching the Admin Agent
- User perceives an intelligent system working, not a slow app loading
- If the retry confirms the contradiction, the final output explicitly flags it — this is the "gotcha" moment for judges

---

## 3. Critical Design Analysis

### 3.1 The "Shadow Normalization" Pattern

**Strengths:**
- Zero-latency normalization (no extra LLM call)
- Schema enforcement at write time catches malformed data immediately
- Zod `.safeParse()` provides structured error reporting without throwing

**Risks & Mitigations:**
- **Risk:** Agents return partial data under timeout.
- **Mitigation:** `NormalizedEvidence` includes `status: 'partial'` + `confidence` score. Guardrail reasons about completeness.
- **Risk:** Zod validation adds ~1-3ms per parse.
- **Mitigation:** Negligible. 3 agents × 3ms = 9ms worst case.

### 3.2 The 1-Retry Loop — State Management Pattern

**Problem:** LangGraph.js uses append-only message history. Naive retry would corrupt the log.

**Solution — Conditional Edge with Scoped Retry Counter:**

```
guardrail → (contradiction && retryCount === 0) → ingest (admin only) → guardrail
guardrail → (contradiction && retryCount === 1) → synthesizer (with contradictionVerified flag)
guardrail → (no contradiction) → synthesizer
```

**Implementation:**
- `retryCount: number` lives in graph state (NOT in messages)
- Guardrail increments counter and sets `retryQuery` string
- Conditional edge reads counter to decide routing
- On retry, `ingest` node checks `retryCount > 0` → only dispatches Admin Agent with appended `retryQuery`
- Pure state mutation — no history corruption, no LLM re-invocation

**Why this is optimal over alternatives:**
- ❌ Message history manipulation: corrupts conversation log, breaks offline persistence
- ❌ Separate retry subgraph: adds complexity, harder to debug
- ❌ LLM-based retry decision: wastes tokens, adds latency
- ✅ Integer counter + conditional edge: deterministic, zero-cost, bounded

### 3.3 Parallel Execution — `Promise.allSettled` in Single Node

**LangGraph.js limitation:** No native parallel node execution (fan-out/fan-in).

**Solution:** Node 2 is a single graph node that internally dispatches agents via `Promise.allSettled`.

**Why `Promise.allSettled` over alternatives:**
- ❌ `Promise.all`: one agent timeout kills the entire pipeline
- ❌ LangGraph fan-out: immature in JS SDK, complex state merging
- ❌ Sequential execution: 3 × 4s = 12s — far exceeds budget
- ✅ `Promise.allSettled`: graceful partial failure, parallel execution, simple error mapping

**Timeout isolation:** Each agent gets its own `AbortController(4000ms)`. A slow Gemini response cannot block SQLite queries.

### 3.4 Next.js Server-Side Optimizations

| Optimization | Decision | Rationale |
|---|---|---|
| `unstable_cache` | ❌ Rejected | LLM outputs are non-deterministic; caching serves stale findings |
| Edge Runtime | ❌ Rejected | Gemini SDK + `better-sqlite3` require Node.js. Splitting runtimes adds complexity for zero gain. |
| `export const runtime = 'nodejs'` | ✅ Required | Prevents accidental edge deployment |
| `export const maxDuration = 10` | ✅ Required | 2x safety margin over 5s target; covers retry path |
| Streaming via `ReadableStream` | ✅ Required | Synthesizer streams tokens; contradiction status streams during retry |
| `better-sqlite3` sync API | ✅ Required | No connection pool needed — sync calls are <5ms, no async overhead |

### 3.5 Guardrail Contradiction Logic (Hardened)

The naive check (`admin says compliant AND vision says severe`) is insufficient. Hardened logic:

```typescript
function detectContradiction(evidence: NormalizedEvidence[]): boolean {
  const admin = evidence.find(e => e.agentId === 'admin');
  const vision = evidence.find(e => e.agentId === 'vision');

  if (!admin || !vision) return false;
  if (admin.status !== 'completed' || vision.status !== 'completed') return false;
  if (vision.confidence < 0.7) return false; // low-confidence vision doesn't trigger

  const adminClaimsCompliant = admin.findings.some(f =>
    /compliant|completed|satisfactor/i.test(f)
  );
  const visionShowsDamage =
    vision.severity === 'severe' || vision.severity === 'critical';

  return adminClaimsCompliant && visionShowsDamage;
}
```

**Guards against false positives:**
- Admin `status: 'error'` → not "compliant", just unknown → no contradiction
- Vision `confidence < 0.7` → uncertain assessment → no retry triggered
- Both agents must be `'completed'` for contradiction logic to fire

---

## 4. Global State Schema (`VigiaState`)

```typescript
import { z } from 'zod';

// ─── Payload (User Input) ───────────────────────────────────────────

export const PayloadSchema = z.object({
  text: z.string().optional(),
  imageUrl: z.string().url().optional(),
  gps: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
});

// ─── Normalized Evidence (Shadow Normalization) ─────────────────────

export const NormalizedEvidenceSchema = z.object({
  agentId: z.enum(['vision', 'admin', 'telemetry']),
  status: z.enum(['completed', 'partial', 'error', 'skipped']),
  confidence: z.number().min(0).max(1),
  severity: z.enum(['critical', 'severe', 'moderate', 'minor', 'none']).optional(),
  findings: z.array(z.string()),
  citations: z.array(z.object({
    sourceId: z.string(),
    label: z.string(),
    url: z.string().optional(),
    trustLevel: z.enum(['verified-spatial', 'legally-binding', 'official-portal']),
  })),
  metadata: z.record(z.unknown()).optional(),
  errorReason: z.string().optional(),
  latencyMs: z.number(),
});

// ─── Graph State ────────────────────────────────────────────────────

export const VigiaStateSchema = z.object({
  // Identity
  traceId: z.string().uuid(),
  startedAt: z.number(),

  // Input
  payload: PayloadSchema,

  // Router output
  activeAgents: z.array(z.enum(['vision', 'admin', 'telemetry'])),

  // Agent outputs (populated by Node 2)
  evidence: z.array(NormalizedEvidenceSchema),

  // Guardrail state (Node 3)
  retryCount: z.number().default(0),
  retryQuery: z.string().optional(),
  contradictionDetected: z.boolean().default(false),
  contradictionVerified: z.boolean().default(false),

  // Synthesizer output (Node 4)
  auditFinding: z.string().optional(),
  synthesizedCitations: z.array(z.object({
    number: z.number(),
    label: z.string(),
    sourceId: z.string(),
  })).optional(),

  // Pipeline metadata
  pipelineStatus: z.enum(['routing', 'ingesting', 'guardrail', 'retrying', 'synthesizing', 'complete', 'failed']),
  errorMessage: z.string().optional(),
  totalLatencyMs: z.number().optional(),

  // Debug trace (for demo reasoning visualization)
  debugTrace: z.array(z.object({
    node: z.string(),
    timestamp: z.number(),
    decision: z.string(),
  })).default([]),
});
```

---

## 5. Node Specifications

### Node 1: Router (`lib/agents/router.ts`)

**Input:** Raw user payload  
**Output:** `activeAgents[]` + `pipelineStatus: 'ingesting'`  
**Logic:** Pure TypeScript — zero LLM tokens

```
if (payload.imageUrl) → push 'vision'
if (payload.text contains infrastructure/budget/contract keywords) → push 'admin'
if (payload.gps) → push 'telemetry'
if (activeAgents.length === 0) → push 'admin' (default fallback)
```

### Node 2: Parallel Ingestion (`lib/agents/ingest.ts`)

**Input:** `activeAgents[]` + `payload` + `retryQuery` (if retry)  
**Output:** `evidence: NormalizedEvidence[]`  
**Execution:** `Promise.allSettled` with 4s per-agent `AbortController`  
**Retry behavior:** If `retryCount > 0`, only dispatches `['admin']` with appended `retryQuery`  
**Normalization:** Each agent's raw output is `.safeParse()`d through `NormalizedEvidenceSchema`

### Node 3: Guardrail (`lib/agents/guardrail.ts`)

**Input:** `evidence[]` + `retryCount`  
**Output:** `contradictionDetected` | `contradictionVerified` | `retryQuery`  
**Logic:** Pure TypeScript conditional with confidence thresholds

**On contradiction + first pass:**
- Streams status message: `"⚠️ Contradiction Detected: Re-evaluating source documents..."`
- Sets `retryQuery = "amendment clauses OR variation orders"`
- Sets `pipelineStatus: 'retrying'`
- Increments `retryCount`

**On contradiction + second pass:**
- Sets `contradictionVerified = true`
- Proceeds to synthesizer with flag

### Node 4: Synthesizer (`lib/agents/synthesizer.ts`)

**Input:** Verified `evidence[]` + `contradictionVerified` flag  
**Output:** `auditFinding` (streamed) + `synthesizedCitations[]`  
**LLM:** Gemini 2.5 Flash — single streaming call  
**Prompt:** Includes contradiction flag for transparency; instructs model to cite evidence by sourceId

### Node 5: UI Hook (`lib/agents/ui-hook.ts`)

**Input:** Final state  
**Output:** Vercel AI SDK `streamUI` payload  
**Logic:** Maps state into React Server Component tree:
- `<SourceCarousel>` from citations
- `<FinancialBar>` from budget evidence metadata
- `<EvidenceGallery>` from vision evidence metadata
- `<MapView>` markers from telemetry evidence metadata

---

## 6. Graph Wiring (Conditional Edges)

```
START → router → ingest → guardrail → [conditional]
                                         ├─ (needs retry) → ingest → guardrail
                                         ├─ (contradiction verified) → synthesizer → ui_hook → END
                                         └─ (no contradiction) → synthesizer → ui_hook → END
```

```typescript
function routeAfterGuardrail(state: VigiaState): string {
  if (state.contradictionDetected && state.retryCount < 2 && !state.contradictionVerified) {
    return 'ingest'; // retry — admin only, with retryQuery
  }
  return 'synthesizer';
}
```

---

## 7. Error Handling Strategy

| Failure Mode | Handling |
|---|---|
| Agent timeout (4s) | `Promise.allSettled` catches; evidence entry has `status: 'error'` |
| All agents fail | Guardrail detects empty evidence → `pipelineStatus: 'failed'` → user sees "Unable to process" |
| Gemini 429 (rate limit) | Vision agent returns `status: 'error', errorReason: 'rate_limited'` — pipeline continues with remaining evidence |
| Zod validation failure | Agent output rejected → `status: 'error', errorReason: 'schema_violation'` — logged for debugging |
| SQLite connection failure | Admin agent catches → returns `status: 'error'` — pipeline continues |
| Synthesizer LLM failure | Fallback: return raw evidence findings as bullet points (no LLM summary) |

---

## 8. Performance Budget

| Node | Target Latency | Mechanism |
|---|---|---|
| Router | <5ms | Pure TypeScript if/else |
| Parallel Ingestion | <4000ms | `Promise.allSettled` + per-agent `AbortController` |
| Guardrail | <5ms | Pure TypeScript conditional |
| Synthesizer | <2000ms (streaming) | First token in <500ms via Gemini Flash |
| UI Hook | <10ms | State → React component mapping |
| **Total (clean path)** | **<4500ms** | ✅ Within 5s budget |
| **Total (contradiction path)** | **~8500ms** | ✅ Accepted — UX communicates "working" state |

---

## 9. File Structure

```
lib/agents/
├── state.ts          # Zod schemas + VigiaState type + LangGraph annotation
├── router.ts         # Node 1: Deterministic routing
├── ingest.ts         # Node 2: Parallel agent dispatch + retry scoping
├── guardrail.ts      # Node 3: Contradiction detection + retry logic
├── synthesizer.ts    # Node 4: Gemini 2.5 Flash audit finding generation
├── ui-hook.ts        # Node 5: streamUI mapping
├── graph.ts          # StateGraph compilation + execution export
└── agents/
    ├── vision.ts     # Gemini 2.5 Flash multimodal iRAP assessment
    ├── admin.ts      # SQLite FTS5 query against pre-indexed NHAI data
    └── telemetry.ts  # SQLite query for IMU anomaly events by GPS

data/
├── nhai_mock.db      # Pre-indexed NHAI PDF (FTS5) + contract data + telemetry events
└── README.md         # Documents the pre-indexing script and schema

scripts/
└── index-nhai.ts     # Build-time: PDF → chunks → SQLite FTS5 insertion
```

---

## 10. Integration Points

### With Existing Frontend (`components/chat/chat-shell.tsx`)
The compiled graph is invoked from `/api/chat`. Upgrade path:
1. Parse incoming message into `PayloadSchema`
2. Execute the graph via `runPipeline(payload)`
3. Stream synthesizer output + contradiction status via `ReadableStream`
4. Frontend `ChatShell` already has `AbortController` — wired to stream cancellation

### With Offline Infrastructure (`lib/db/`)
- On success: persist `auditFinding` + `citations` via `addAssistantMessage()`
- On failure: persist error state for offline visibility
- Pending messages replayed through full pipeline on reconnect (existing `syncAndCleanup`)

### With Existing Types (`types/index.ts`)
- `Source.trustBadge` ↔ `NormalizedEvidence.citations[].trustLevel` (same enum)
- `BudgetData` ↔ Admin Agent `metadata` field
- `SpatialData` ↔ Telemetry Agent `metadata` field
- `EvidenceImage` ↔ Vision Agent `metadata` field

---

## 11. Security Considerations

- **Input sanitization:** Router validates payload via Zod before any agent receives it
- **SQLite read-only:** `better-sqlite3` opened with `{ readonly: true }`
- **Image URL validation:** Only HTTPS URLs or local blob references passed to Gemini
- **No prompt injection surface:** User text enters LLM only in Synthesizer, wrapped in structured template with evidence context — not as raw system prompt
- **Rate limiting:** API route enforces per-user limits before graph execution

---

## 12. Testing Strategy

| Test Type | Target | Tool |
|---|---|---|
| Unit | Router logic (all input permutations) | Vitest |
| Unit | Guardrail contradiction detection (with confidence thresholds) | Vitest |
| Unit | Zod schema validation (partial data, edge cases) | Vitest |
| Integration | Full graph execution (mocked agents) | Vitest + LangGraph test utilities |
| Integration | Retry path (mocked contradiction scenario) | Vitest |
| E2E | API route → streamed response | Playwright |
| Load | 50 concurrent pipeline executions | k6 |

---

## 13. Decisions Log

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | LLM Provider | **Gemini 2.5 Flash** (unified) | Single API key, fastest streaming, already needed for Vision |
| 2 | SQLite Location | **Bundled in repo** (`data/nhai_mock.db`) | Zero network dependency, sub-50ms queries, demo resilience |
| 3 | PDF Retrieval | **Pre-indexed SQLite FTS5** | 100x faster than LlamaIndex runtime, deterministic, zero cold start |
| 4 | Retry Latency | **Accept 8.5s** | Contradiction detection is the product differentiator; UX streams "working" status |

### Patterns Chosen Over Alternatives

| Pattern Used | Alternative Rejected | Why |
|---|---|---|
| `Promise.allSettled` in single node | LangGraph fan-out/fan-in | JS SDK fan-out is immature; single node is simpler to debug |
| Integer retry counter in state | Message history manipulation | Counter is deterministic, bounded, doesn't corrupt conversation log |
| SQLite FTS5 full-text search | LlamaIndex.ts vector similarity | 200-400ms cold start eliminated; deterministic results; <5ms queries |
| Gemini Flash (unified provider) | Multi-provider (Gemini + OpenAI) | Single failure domain, single API key, consistent latency profile |
| Zod `.safeParse()` at agent boundary | Centralized normalization node | Zero-latency; errors are localized to the failing agent, not pipeline-wide |
| `better-sqlite3` sync API | Async SQLite drivers | No connection pool needed; sync calls are <5ms; simpler error handling |
| Streaming contradiction status | Silent retry (user sees spinner) | 8.5s wait feels intelligent when explained; silent wait feels broken |
| `AbortController` per agent | Global timeout for all agents | One slow agent can't block fast agents; partial results are still useful |
| `debugTrace` array in state | External tracing (OpenTelemetry) | Zero infrastructure; renders directly in demo UI for judges |
| Bundled SQLite in Git | External volume / cloud DB | Demo resilience; no network dependency; portable across environments |
