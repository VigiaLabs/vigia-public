# VIGIA Level 5 RAG Architecture: Design Specification

**Document:** `level5_rag_upgrades.md`  
**Status:** DRAFT — Awaiting approval  
**Date:** 2026-05-23  
**Goal:** Reduce TTFB from ~5s to <1s, increase contextual precision from RRF-level to cross-encoder-level

---

## Current Performance Baseline

| Metric | Current | Target |
|--------|---------|--------|
| Time-to-First-Byte | 4–8s | <1.5s |
| LLM calls per query | 3 (router + synthesizer + streamText) | 1 (streamText only) |
| Retrieval precision | RRF blend (no reranking) | Cross-encoder top-3 |
| Cache hit latency | N/A (no cache) | <100ms |
| Pipeline transparency | Black box until complete | Real-time node-by-node streaming |

---

## Phase 1: Node-Level State Multiplexing (The Perplexity UX)

### Problem

The pipeline runs for 3–8 seconds as a black box. The user sees nothing until the full response streams. Perplexity shows "Searching...", "Reading sources...", "Generating..." in real-time.

### Current Architecture

```
API Route:
  1. await runPipeline(payload)     ← blocks 3-8s, user sees nothing
  2. streamText(...)                ← only now does streaming begin
```

### Proposed Architecture

```
API Route (single multiplexed stream):
  1. writer.write({ type: 'step', step: 'Classifying intent...' })
  2. Run router node
  3. writer.write({ type: 'step', step: 'Searching 3 databases...' })
  4. Run ingest node (parallel agents)
  5. writer.write({ type: 'step', step: 'Verifying evidence...' })
  6. Run guardrail + UI hook
  7. writer.merge(streamText(...))  ← text streaming begins
```

### Implementation Plan

#### 1.1 Modify `app/api/chat/route.ts`

Replace `await runPipeline(payload)` with inline node execution that emits progress:

```typescript
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    // Emit progress as data annotations (Vercel AI SDK Data Stream Protocol)
    const emitStep = (step: string) => {
      writer.write({ type: 'data', data: [{ type: 'pipeline-step', step, timestamp: Date.now() }] });
    };

    emitStep('Classifying intent...');
    const routerResult = await routerNode(initialState);
    const stateAfterRouter = { ...initialState, ...routerResult };

    if (stateAfterRouter.pipelineStatus === 'complete') {
      // Conversational — stream immediately
      writer.merge(streamText({ ... }));
      return;
    }

    emitStep(`Searching ${stateAfterRouter.activeAgents.length} sources...`);
    const ingestResult = await ingestNode(stateAfterRouter);
    const stateAfterIngest = { ...stateAfterRouter, evidence: [...stateAfterRouter.evidence, ...ingestResult.evidence] };

    emitStep('Verifying evidence...');
    const guardrailResult = guardrailNode(stateAfterIngest);
    const finalState = { ...stateAfterIngest, ...guardrailResult };

    // Handle retry loop inline if needed
    if (guardrailResult.pipelineStatus === 'retrying') {
      emitStep('Cross-referencing amendment records...');
      const retryResult = await ingestNode({ ...finalState, ...guardrailResult });
      // ... merge retry evidence, re-run guardrail
    }

    const uiPayload = extractUIPayload(finalState);
    emitStep('Generating response...');

    // Stream the LLM response
    writer.merge(streamText({ system, messages, ... }));

    // Emit metadata after stream completes
    writer.write({ type: 'message-metadata', messageMetadata: evidenceAnnotation });
  },
});
```

#### 1.2 Frontend: Live Pipeline Accordion

**New component: `components/chat/live-pipeline.tsx`**

Listens to `data` stream annotations with `type: 'pipeline-step'` and renders a live-updating status:

```typescript
// In ChatShell, intercept data annotations from useChat
const { data } = useChat({ ... });

// data contains pipeline-step events as they arrive
// Render: "✓ Classified intent · Searching 3 sources... · ⏳ Verifying..."
```

The existing `PipelineTrace` component (post-response accordion) remains for the expanded view. The new `LivePipeline` component shows real-time progress DURING generation.

#### 1.3 Graph Topology Change

The compiled LangGraph (`vigiaGraph`) is no longer invoked as a single `await runPipeline()`. Instead, individual node functions are called sequentially in the API route. This gives us control over when to emit progress events between nodes.

**Files to modify:**
- `app/api/chat/route.ts` — inline node execution with progress emission
- `lib/agents/graph.ts` — export individual node functions (already exported)
- New: `components/chat/live-pipeline.tsx` — real-time progress UI

---

## Phase 2: Redundancy Pruning (Axing the Synthesizer)

### Problem

The Synthesizer Node (`lib/agents/synthesizer.ts`) makes a full Bedrock LLM call (~2s) to generate an `auditFinding` that is **never shown to the user**. The API route's `streamText` call does the same job again.

### Current Graph

```
Router → Ingest → Guardrail → Synthesizer → UI Hook → END
                                    ↑ (2s wasted LLM call)
```

### Proposed Graph

```
Router → Ingest → Guardrail → UI Hook → END
```

### Implementation Plan

#### 2.1 Remove Synthesizer from Graph

**File: `lib/agents/graph.ts`**

```typescript
// BEFORE:
graph.addEdge('guardrail_pass', 'synthesizer');
graph.addEdge('synthesizer', 'ui_hook');

// AFTER:
graph.addEdge('guardrail_pass', 'ui_hook');
// Delete: graph.addNode('synthesizer', synthesizerNode);
```

#### 2.2 Update UI Hook

The UI Hook currently reads `state.auditFinding` (from synthesizer). After removal, it should set a default:

```typescript
return {
  auditFinding: '', // No longer generated by pipeline
  sources,
  // ... rest unchanged
};
```

#### 2.3 Update State Schema

Make `auditFinding` and `synthesizedCitations` truly optional (they already are, but remove the synthesizer-related pipeline status transitions):

- Remove `'synthesizing'` from `PipelineStatusSchema` (or keep for backward compat)
- The guardrail now transitions directly to `'complete'` via UI Hook

#### 2.4 Impact

- **Latency saved:** ~1.5–2.5s per query
- **Tokens saved:** ~500–1000 output tokens per query
- **Bedrock cost saved:** ~$0.001–0.003 per query
- **Risk:** None. The output was already unused.

---

## Phase 3: Cross-Encoder Reranking (The Precision Layer)

### Problem

Current retrieval uses Reciprocal Rank Fusion (RRF, k=60) to merge FTS5 keyword results with pgvector semantic results. RRF is a rank-based heuristic — it doesn't understand whether a chunk actually answers the user's question. It just blends two sorted lists.

### Current Retrieval Flow

```
Query → FTS5 (top 10) ─┐
                        ├── RRF merge → top 10 → LLM
Query → pgvector (top 5) ┘
```

### Proposed Two-Stage Retrieval

```
Query → FTS5 (top 20) ─┐
                        ├── RRF merge → top 20 → Cross-Encoder Rerank → top 3 → LLM
Query → pgvector (top 20) ┘
```

### Reranker Options

| Option | Latency | Cost | Quality |
|--------|---------|------|---------|
| **Cohere Rerank v3** | ~200ms | $0.001/query | Best-in-class |
| **Amazon Bedrock Rerank** (if available) | ~150ms | Included in Bedrock | Good |
| **BGE-Reranker-v2-m3** (self-hosted on Lambda) | ~300ms | Compute only | Very good |
| **Titan Embed v2 cross-score** (hack: embed query+chunk together) | ~100ms | Existing Bedrock | Moderate |

**Recommended:** Cohere Rerank v3 via API. Fastest integration, best quality, minimal cost at our volume.

### Implementation Plan

#### 3.1 New Module: `lib/tools/reranker.ts`

```typescript
export interface RerankResult {
  index: number;
  relevanceScore: number;
}

export async function rerankChunks(
  query: string,
  documents: string[],
  topK: number = 3
): Promise<RerankResult[]> {
  const response = await fetch('https://api.cohere.ai/v1/rerank', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.COHERE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'rerank-english-v3.0',
      query,
      documents,
      top_n: topK,
      return_documents: false,
    }),
  });

  const data = await response.json();
  return data.results.map((r: any) => ({
    index: r.index,
    relevanceScore: r.relevance_score,
  }));
}
```

#### 3.2 Update `lib/tools/tender-search.ts`

After RRF fusion, pass the top 20 results through the reranker:

```typescript
export async function searchTenderByRoadNumber(roadNumber: string): Promise<TenderResult[]> {
  // ... existing FTS5 + pgvector logic ...
  const fused = reciprocalRankFusion(fts5Results, vectorResults);

  // Stage 2: Cross-encoder reranking
  if (fused.length > 3 && process.env.COHERE_API_KEY) {
    const documents = fused.slice(0, 20).map(r => r.projectName + ' ' + r.concessionaire + ' ' + r.mode + ' ' + r.state);
    const reranked = await rerankChunks(roadNumber, documents, 5);
    const rerankedResults = reranked.map(r => ({ ...fused[r.index], score: r.relevanceScore }));
    return rerankedResults;
  }

  return fused.slice(0, 10);
}
```

#### 3.3 Fallback Behavior

If `COHERE_API_KEY` is not set, the system falls back to RRF-only (current behavior). Zero breaking changes.

#### 3.4 Environment Variable

```
COHERE_API_KEY=your-key-here
```

Add to `.env.local` and deployment environment.

---

## Phase 4: Semantic Caching (The Edge Shield)

### Problem

Every query — even repeated ones — triggers the full pipeline: LangGraph → database queries → Bedrock LLM. Common questions like "Who is the contractor for NH-44?" are asked repeatedly and always produce the same answer.

### Proposed Architecture

```
User Query
    │
    ▼
[Semantic Cache Check] ──── HIT ──→ Return cached response (50ms)
    │
    MISS
    │
    ▼
[Full Pipeline] → Response → [Cache Store] → Return to user
```

### Cache Strategy

| Aspect | Design |
|--------|--------|
| **Backend** | Upstash Redis (serverless, edge-compatible) |
| **Key generation** | Embed query with Titan Embed v2 (1024-dim), quantize to 256-dim for cache key |
| **Similarity threshold** | Cosine similarity ≥ 0.95 = cache hit |
| **TTL** | 24 hours (contract data changes daily at most) |
| **Cache value** | Full response text + metadata (sources, debugTrace) |
| **Invalidation** | TTL-based + manual flush on pipeline re-index |

### Implementation Plan

#### 4.1 New Module: `lib/cache/semantic-cache.ts`

```typescript
import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
  : null;

interface CachedResponse {
  text: string;
  metadata: Record<string, unknown>;
  cachedAt: number;
}

export async function getCachedResponse(queryEmbedding: number[]): Promise<CachedResponse | null> {
  if (!redis) return null;

  // Quantize embedding to 64-char hex key for fast lookup
  const key = quantizeToKey(queryEmbedding);

  // Check exact key first
  const exact = await redis.get<CachedResponse>(`vigia:cache:${key}`);
  if (exact) return exact;

  // Check semantic neighbors (top-3 nearest keys via Redis ZRANGEBYSCORE)
  // Implementation uses Redis Vector Similarity Search (VSS) module
  return null;
}

export async function setCachedResponse(
  queryEmbedding: number[],
  response: CachedResponse
): Promise<void> {
  if (!redis) return;
  const key = quantizeToKey(queryEmbedding);
  await redis.set(`vigia:cache:${key}`, response, { ex: 86400 }); // 24h TTL
}

function quantizeToKey(embedding: number[]): string {
  // Take first 32 dimensions, quantize to 8-bit, hex encode
  return embedding.slice(0, 32).map(v => Math.round((v + 1) * 127).toString(16).padStart(2, '0')).join('');
}
```

#### 4.2 Integration in API Route

```typescript
// At the top of POST handler, before pipeline:
const queryEmbedding = await embedQuery(queryText); // Reuse Titan Embed
const cached = await getCachedResponse(queryEmbedding);

if (cached) {
  // Return cached response as a stream (instant)
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'text-delta', textDelta: cached.text });
        writer.write({ type: 'message-metadata', messageMetadata: cached.metadata });
        writer.write({ type: 'finish', finishReason: 'stop' });
      },
    }),
  });
}

// ... normal pipeline ...

// After response completes, cache it:
onFinish: async (text) => {
  await setCachedResponse(queryEmbedding, { text, metadata: evidenceAnnotation, cachedAt: Date.now() });
}
```

#### 4.3 Environment Variables

```
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

#### 4.4 Cache Bypass

- Queries with images attached → always bypass cache (unique per photo)
- Queries with GPS coordinates → bypass cache (location-specific)
- Add `?nocache=1` query param for debugging

#### 4.5 Fallback

If Upstash is not configured (`UPSTASH_REDIS_REST_URL` not set), the cache layer is a no-op. Zero breaking changes.

---

## Implementation Order & Dependencies

```
Phase 2 (Axe Synthesizer)           ← Zero risk, immediate 2s latency win
    ↓
Phase 1 (State Multiplexing)        ← Requires Phase 2 (inline node execution)
    ↓
Phase 3 (Cross-Encoder Reranking)   ← Independent, needs COHERE_API_KEY
    ↓
Phase 4 (Semantic Caching)          ← Independent, needs Upstash account
```

**Phase 2 → Phase 1** are tightly coupled: removing the synthesizer simplifies the inline node execution needed for streaming progress.

**Phase 3 and Phase 4** are independent of each other and of Phases 1-2. They can be implemented in parallel.

---

## Expected Performance After All Phases

| Metric | Before | After |
|--------|--------|-------|
| TTFB (first visual feedback) | 4–8s | <200ms (pipeline step indicator) |
| TTFB (first text token) | 4–8s | 1.5–2.5s |
| TTFB (cache hit) | 4–8s | <100ms |
| LLM calls per query | 3 | 1 |
| Retrieval precision (top-3) | RRF heuristic | Cross-encoder scored |
| Bedrock cost per query | ~$0.004 | ~$0.001 |
| Pipeline transparency | None | Real-time node-by-node |

---

## Files Affected (Summary)

| Phase | Files Modified | Files Created |
|-------|---------------|---------------|
| Phase 1 | `app/api/chat/route.ts`, `components/chat/chat-shell.tsx` | `components/chat/live-pipeline.tsx` |
| Phase 2 | `lib/agents/graph.ts`, `lib/agents/ui-hook.ts`, `app/api/chat/route.ts` | — |
| Phase 3 | `lib/tools/tender-search.ts` | `lib/tools/reranker.ts` |
| Phase 4 | `app/api/chat/route.ts` | `lib/cache/semantic-cache.ts` |

---

## Open Questions

1. **Phase 3:** Cohere Rerank vs self-hosted BGE-Reranker on Lambda? Cohere is faster to integrate but adds an external dependency.
2. **Phase 4:** Should we use Upstash Vector (native VSS) instead of manual embedding quantization for semantic similarity?
3. **Phase 1:** Should the live pipeline steps be rendered as a horizontal stepper or a vertical accordion?

---

**Awaiting approval to begin implementation (recommended start: Phase 2 → Phase 1).**
