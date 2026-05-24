# Architecture Patch: Self-Reflective RAG & Spatial Guardrails

> **Status:** Spec Complete — Ready for Implementation  
> **Created:** 2026-05-24  
> **Severity:** Critical — Addresses active hallucination bugs and data integrity failures  
> **Scope:** `guardrail.ts`, `admin.ts`, `search-unified.ts`, new `rewriter.ts`

---

## Executive Summary

The diagnostic audit (2026-05-24) exposed 7 architectural gaps causing hallucinations, illogical answers, and factually incorrect responses. This spec defines the exact patches required to bring VIGIA's RAG pipeline to industry-standard anti-hallucination quality using techniques from Self-RAG, CRAG, Chain-of-Verification, and LLM-as-Judge frameworks.

---

## Industry Techniques Applied

This patch integrates the following peer-reviewed and production-proven anti-hallucination patterns:

| Technique | Source | How We Apply It |
|-----------|--------|-----------------|
| **Self-RAG** | Asai et al., 2023 (arxiv:2310.11511) | Reflection tokens → our Guardrail evaluates retrieval quality before generation |
| **CRAG (Corrective RAG)** | Yan et al., 2024 (arxiv:2401.15884) | Retrieval grading → query rewriting → knowledge refinement pipeline |
| **Chain-of-Verification** | Dhuliawala et al., 2023 (arxiv:2309.11495) | Draft → verify claims against evidence → re-generate if ungrounded |
| **HyDE** | Gao et al., 2022 (arxiv:2212.10496) | Hypothetical document embedding for retry queries (rewriter generates ideal answer shape) |
| **Adaptive RAG** | Jeong et al., 2024 (arxiv:2403.14403) | Route by query complexity — simple lookups skip retry, multi-hop gets decomposition |
| **LLM-as-Judge Faithfulness** | TDS 2025, Microsoft Foundry | Attribution + specificity scoring: high specificity + low attribution = hallucination signal |
| **Retrieval Grading** | CRAG/LangGraph pattern | Binary relevant/irrelevant classification of each chunk before passing to synthesis |
| **Knowledge Refinement** | CRAG paper | Strip irrelevant sentences from retrieved chunks, pass only grounded content |
| **Query Decomposition** | ACL SRW 2025 (arxiv:2507.00355) | Break multi-hop queries into single-hop sub-queries for targeted retrieval |
| **HalluGuard Pattern** | arxiv:2510.00880 | Small reasoning model classifying grounded vs hallucinated claims post-generation |

---

## Part 1: Fix Evidence State & Data Voids

### File: `lib/agents/guardrail.ts`

### 1.1 The Append Bug — Use `.findLast()` for Evidence Evaluation

**Problem:** The `evidence` state channel uses an append reducer (`(a, b) => a.concat(b)`). On retry, new admin evidence is appended after the original. But `detectContradiction()` uses `.find()` which returns the **first** (stale) admin evidence, never evaluating the retry result.

**Fix:**

```typescript
// BEFORE (broken):
const admin = evidence.find((e) => e.agentId === 'admin');

// AFTER (correct):
const admin = evidence.findLast((e) => e.agentId === 'admin');
const vision = evidence.findLast((e) => e.agentId === 'vision');
```

Apply `.findLast()` in both `detectContradiction()` and `isCitizenClaim()` to always evaluate the most recent evidence from each agent.

### 1.2 Data Void Detection — Confidence Threshold Gate

**Problem:** The guardrail has zero awareness of retrieval quality. A `confidence: 0.1` result passes through identically to `confidence: 0.9`.

**Implementation — add before contradiction detection:**

```typescript
const DATA_VOID_CONFIDENCE_THRESHOLD = 0.5;
const DATA_VOID_FINDINGS = ['No relevant data found', 'does not currently contain'];

function isDataVoid(evidence: NormalizedEvidence[]): boolean {
  const admin = evidence.findLast((e) => e.agentId === 'admin');
  if (!admin || admin.status === 'error' || admin.status === 'skipped') return true;
  if (admin.confidence < DATA_VOID_CONFIDENCE_THRESHOLD) return true;
  if (admin.findings.length === 0) return true;
  if (admin.findings.some(f => DATA_VOID_FINDINGS.some(dv => f.includes(dv)))) return true;
  return false;
}
```

**State transition when Data Void detected:**

```
isDataVoid() === true AND retryCount === 0
  → Trigger query rewrite (Part 2) and retry
  → Set pipelineStatus = 'retrying'

isDataVoid() === true AND retryCount >= 1
  → Authority Matrix fallback (1.3)
  → Set pipelineStatus = 'complete'
  → Do NOT pass low-confidence data to UI
```

### 1.3 Authority Matrix Fallback

**Problem:** When retrieval fails completely, the system returns a generic "No relevant data found" message instead of routing the citizen to the correct authority.

**Implementation:**

```typescript
import authorityMatrix from '../../data/authority-matrix.json';

function buildAuthorityFallback(
  state: VigiaState
): Partial<VigiaState> {
  const intent = state.intent ?? 'complaint';
  const roadType = extractRoadTypeFromEvidence(state.evidence) ?? 'NH';

  // Lookup authority from matrix
  const authorities = authorityMatrix.authorities?.IN?.[roadType];
  const authorityData = authorities?.[intent] ?? authorities?.complaint;

  const findings = authorityData
    ? [
        `VIGIA could not find specific data for your query in our indexed databases.`,
        `For ${intent} matters on ${roadType} roads:`,
        `→ Primary Authority: ${authorityData.primary}`,
        `→ Portal: ${authorityData.portal}`,
        authorityData.phone ? `→ Helpline: ${authorityData.phone}` : null,
        `→ Escalation: ${authorityData.escalation}`,
        `→ Legal Basis: ${authorityData.legalBasis}`,
      ].filter(Boolean)
    : [
        `VIGIA could not find specific data for your query.`,
        `Please contact the relevant Public Works Department for your area.`,
        `National Helpline: 1033 (NHAI) | Portal: https://pgportal.gov.in`,
      ];

  return {
    auditFinding: findings.join('\n'),
    contradictionDetected: false,
    pipelineStatus: 'complete',
    debugTrace: [{
      node: 'guardrail',
      timestamp: Date.now(),
      decision: `Data void persists after retry — Authority Matrix fallback for intent="${intent}", roadType="${roadType}"`,
    }],
  };
}
```

### 1.4 Updated Guardrail Flow (Complete)

```typescript
export function guardrailNode(state: VigiaState): Partial<VigiaState> {
  // 1. Citizen claim check (unchanged, uses findLast)
  if (isCitizenClaim(state.evidence)) { /* existing logic */ }

  // 2. DATA VOID CHECK (NEW)
  if (isDataVoid(state.evidence)) {
    if (state.retryCount === 0) {
      // First void → trigger query rewrite + retry
      return {
        contradictionDetected: false,
        retryCount: 1,
        retryQuery: undefined, // Will be set by rewriter node
        pipelineStatus: 'retrying',
        debugTrace: [{ node: 'guardrail', timestamp: Date.now(),
          decision: 'Data void detected (confidence < 0.5) — triggering query rewrite and retry' }],
      };
    }
    // Retry exhausted → Authority Matrix fallback
    return buildAuthorityFallback(state);
  }

  // 3. Contradiction detection (existing, with findLast fix)
  const contradiction = detectContradiction(state.evidence);
  // ... rest unchanged
}
```

---

## Part 2: True Query Rewriting (CRAG + HyDE Pattern)

### New File: `lib/agents/rewriter.ts`

**Problem:** The retry uses a hardcoded string `'amendment clauses OR variation orders OR phase 2'`. This is not query rewriting — it's a static fallback that only works for one specific contradiction scenario.

**Industry pattern applied:** CRAG's query rewriting + HyDE's hypothetical document approach. The rewriter generates what an ideal retrieved document would look like, then extracts search terms from that.

### Implementation:

```typescript
import { generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';

const RewriteSchema = z.object({
  rewrittenQuery: z.string().describe('Broader search query with synonyms and relaxed constraints'),
  reasoning: z.string().describe('Why the original query failed and what the rewrite targets'),
});

/**
 * CRAG-style query rewriter.
 * Called when guardrail detects data void or contradiction on first pass.
 * Uses lightweight LLM to generate a broader, synonym-rich search query.
 *
 * Technique: HyDE-inspired — asks LLM to imagine what the target document contains,
 * then extracts key terms for retrieval.
 */
export async function rewriteQuery(
  originalQuery: string,
  intent: string | undefined,
  failureReason: 'data-void' | 'contradiction'
): Promise<string> {
  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: RewriteSchema,
      prompt: `You are a search query rewriter for an Indian infrastructure database containing NHAI contracts, PMGSY road data, and PWD personnel directories.

ORIGINAL QUERY: "${originalQuery}"
INTENT: ${intent ?? 'unknown'}
FAILURE REASON: ${failureReason === 'data-void' ? 'No relevant documents were retrieved. The query may be too specific or use terminology not in the database.' : 'Retrieved documents contradict visual evidence. The query may need to target amendment/variation documents.'}

TASK: Rewrite the query to be BROADER and more likely to match documents in the database.
Rules:
- Add synonyms (e.g., "engineer" → "engineer OR executive engineer OR EE OR superintending engineer")
- Remove overly specific constraints (exact dates, very specific locations)
- For contradictions: add terms like "amendment", "variation order", "revised", "phase 2", "addendum"
- For data voids: generalize geographic terms (district → state level), add alternate road naming conventions
- Keep the rewritten query under 100 words
- Do NOT hallucinate road numbers or locations not in the original query`,
    });
    return object.rewrittenQuery;
  } catch {
    // Fallback: basic synonym expansion
    return failureReason === 'contradiction'
      ? `${originalQuery} amendment variation order revised addendum`
      : `${originalQuery}`;
  }
}
```

### Integration into Graph Flow:

**Option A (Inline in Guardrail):** Call `rewriteQuery()` inside `guardrailNode` before setting `retryQuery`. This keeps the graph topology unchanged.

```typescript
// In guardrailNode, when triggering retry:
import { rewriteQuery } from './rewriter';

// Data void retry:
const rewritten = await rewriteQuery(state.payload.text ?? '', state.intent, 'data-void');
return { retryCount: 1, retryQuery: rewritten, pipelineStatus: 'retrying', ... };

// Contradiction retry:
const rewritten = await rewriteQuery(state.payload.text ?? '', state.intent, 'contradiction');
return { retryCount: 1, retryQuery: rewritten, pipelineStatus: 'retrying', ... };
```

**Note:** This makes `guardrailNode` async (it already returns `Partial<VigiaState>` so changing to `Promise<Partial<VigiaState>>` is compatible with LangGraph).

### Query Decomposition (Multi-hop Enhancement)

For complex queries detected by the router (e.g., "Who is the engineer for NH-44 in Telangana and what is the DLP status?"), decompose into sub-queries:

```typescript
const DecomposeSchema = z.object({
  subQueries: z.array(z.string()).max(3),
});

export async function decomposeQuery(query: string): Promise<string[]> {
  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: DecomposeSchema,
      prompt: `Break this infrastructure query into 1-3 independent sub-queries that can each be answered by a single database lookup:\n"${query}"\nIf the query is already simple, return it unchanged as a single-element array.`,
    });
    return object.subQueries;
  } catch {
    return [query];
  }
}
```

---

## Part 3: Strict Spatial Geofencing

### File: `lib/agents/agents/admin.ts`

### 3.1 Mandatory GPS Gate for Personnel Intent

**Problem:** When intent is `personnel` and GPS is absent, the query falls through to India-only FTS5 `pwd_contacts` table, returning random Telangana engineers for a user in Dubai.

**Fix — add at the top of `runAdminAgent`, before any search:**

```typescript
// PERSONNEL INTENT: Require location context
if (intent === 'personnel' && !payload.gps) {
  const hasLocationInText = /\b(state|district|division|telangana|maharashtra|kerala|tamil nadu|karnataka|andhra|rajasthan|gujarat|madhya pradesh|uttar pradesh|bihar|odisha|punjab|haryana|bengal|assam)\b/i.test(text);
  if (!hasLocationInText) {
    return {
      agentId: 'admin',
      status: 'completed',
      confidence: 0.0,
      findings: [
        'Please provide your location (GPS) or specify a geographic area (state/district) to look up personnel directories.',
        'Example: "Who is the executive engineer for NH-44 in Telangana?"',
      ],
      citations: [],
      metadata: { reason: 'personnel-requires-location' },
      latencyMs: Date.now() - start,
    };
  }
}
```

### 3.2 International Abort — Block FTS5 for Non-India GPS

**Problem:** Even when GPS is present and country detection works, the `personnel` intent has no international handler. The code should abort cleanly.

**Fix — update the international path in `runAdminAgent`:**

```typescript
if (payload.gps) {
  const country = await resolveCountry(payload.gps.lat, payload.gps.lng);
  if (!country.isIndia) {
    // STRICT ABORT for personnel intent — no international personnel data exists
    if (intent === 'personnel') {
      return {
        agentId: 'admin',
        status: 'completed',
        confidence: 0.95,
        findings: [
          `Current GPS location is in ${country.countryName} (${country.countryCode}), outside Indian jurisdiction.`,
          `VIGIA personnel directories are restricted to Indian infrastructure authorities (NHAI, State PWD, PMGSY).`,
          `For ${country.countryName} road authority contacts, consult your national transport ministry.`,
        ],
        citations: [],
        metadata: { countryCode: country.countryCode, reason: 'out-of-jurisdiction' },
        latencyMs: Date.now() - start,
      };
    }
    // Existing international path for other intents (World Bank + OCDS)...
  }
}
```

### 3.3 Strict FTS5 Geographic Matching

### File: `lib/tools/search-unified.ts` (pwd_contacts query)

**Problem:** The FTS5 query on `pwd_contacts` uses generic keyword matching. A query for "engineer road" returns any engineer in the database regardless of geographic relevance.

**Fix — enforce geographic alignment in the FTS5 query:**

```typescript
// In queryLocalFts5Unified, pwd_contacts section:

// Extract geographic context from query
const statePattern = /\b(telangana|maharashtra|kerala|tamil nadu|karnataka|andhra pradesh|rajasthan|gujarat|madhya pradesh|uttar pradesh|bihar|odisha|punjab|haryana|west bengal|assam|jharkhand|chhattisgarh|goa|himachal|uttarakhand|manipur|meghalaya|mizoram|nagaland|sikkim|tripura|arunachal)\b/i;
const stateMatch = query.match(statePattern);

if (isPersonnelQuery) {
  if (!stateMatch) {
    // No geographic context in query — return empty rather than random results
    // This prevents the "Dubai → Telangana" hallucination class
    return [];
  }

  // Require state match in FTS5 query
  const geoConstrainedQuery = `${ftsQuery} AND ${stateMatch[1]}`;
  const rows = db.prepare(
    `SELECT name, designation, division, state, phone, email, office_address, source_url
     FROM pwd_contacts
     WHERE pwd_contacts MATCH ?
     AND state LIKE ?
     ORDER BY rank LIMIT ?`
  ).all(geoConstrainedQuery, `%${stateMatch[1]}%`, limit) as any[];
  // ... process rows
}
```

---

## Part 4: Post-Generation Faithfulness Verification (Industry Enhancement)

Beyond the 3 core patches, this section adds industry-standard post-generation verification to catch hallucinations that slip through retrieval.

### 4.1 LLM-as-Judge Faithfulness Scoring

**Where:** After synthesis, before UI delivery (new optional node or inline in `ui-hook.ts`)

**Pattern:** Split faithfulness into two signals:
- **Attribution:** Can every claim in the response be traced to a specific retrieved chunk?
- **Specificity:** Does the response contain specific details (names, numbers, dates)?

**Hallucination signal:** High specificity + Low attribution = hallucination.

```typescript
const FaithfulnessSchema = z.object({
  claims: z.array(z.object({
    claim: z.string(),
    attributedToChunk: z.boolean(),
    chunkIndex: z.number().nullable(),
  })),
  overallFaithfulness: z.number().min(0).max(1),
  flaggedClaims: z.array(z.string()),
});

export async function scoreFaithfulness(
  response: string,
  retrievedChunks: string[]
): Promise<{ score: number; flagged: string[] }> {
  const { object } = await generateObject({
    model: bedrock('amazon.nova-lite-v1:0'),
    schema: FaithfulnessSchema,
    prompt: `You are a faithfulness evaluator. Given a response and the source chunks it was generated from, identify every factual claim in the response and check if it can be attributed to a specific chunk.

RESPONSE: "${response}"

SOURCE CHUNKS:
${retrievedChunks.map((c, i) => `[${i}] ${c}`).join('\n')}

For each claim, mark attributedToChunk=true only if the chunk explicitly states or directly implies the claim. Flag any claim with high specificity (names, numbers, dates) that cannot be attributed.`,
  });
  return { score: object.overallFaithfulness, flagged: object.flaggedClaims };
}
```

**Gate:** If `overallFaithfulness < 0.7`, strip flagged claims from the response before delivery.

### 4.2 Knowledge Refinement (CRAG Pattern)

**Where:** Inside `ingestNode`, after retrieval but before passing to guardrail.

**Purpose:** Strip irrelevant sentences from retrieved chunks so the synthesizer only sees grounded content.

```typescript
// After searchUnified returns results, filter each chunk:
function refineChunk(chunk: string, query: string): string {
  const sentences = chunk.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const queryTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Keep only sentences that share at least one meaningful term with the query
  const relevant = sentences.filter(s => {
    const lower = s.toLowerCase();
    return queryTerms.some(term => lower.includes(term));
  });

  return relevant.length > 0 ? relevant.join('. ') + '.' : chunk;
}
```

### 4.3 Retrieval Grading (Binary Gate)

**Where:** Inside `runAdminAgent`, after `searchUnified` returns results.

**Purpose:** Classify each retrieved chunk as RELEVANT or IRRELEVANT before including in evidence. This is the CRAG "retrieval evaluator" step.

```typescript
// Lightweight heuristic grading (no LLM call needed for speed):
function gradeRetrievalRelevance(chunk: UnifiedResult, query: string, intent: string): boolean {
  // Hard threshold on similarity
  if (chunk.similarity < 0.4) return false;

  // For personnel queries: chunk must contain personnel-related terms
  if (intent === 'personnel') {
    return /engineer|officer|contact|phone|designation|division/i.test(chunk.chunkText);
  }

  // For tender queries: chunk must contain contract/financial terms
  if (intent === 'tender_search') {
    return /contract|tender|cost|lakhs|crore|concessionaire|awarded|dlp|defect/i.test(chunk.chunkText);
  }

  return true; // Default: trust similarity score
}

// Apply before building findings:
const gradedResults = results.filter(r => gradeRetrievalRelevance(r, text, intent ?? 'condition'));
```

---

## Part 5: Preventing Illogical Answers (Spatial + Temporal Coherence)

### 5.1 Temporal Coherence Check

Prevent answers that reference future dates as past events or mix up project timelines:

```typescript
function checkTemporalCoherence(findings: string[]): string[] {
  const now = new Date();
  const warnings: string[] = [];

  for (const f of findings) {
    // Detect dates in findings
    const dateMatches = f.match(/\b(20\d{2}[-/]\d{2}[-/]\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})\b/g);
    if (dateMatches) {
      for (const d of dateMatches) {
        const parsed = new Date(d);
        if (parsed > now && f.includes('completed')) {
          warnings.push(`⚠️ TEMPORAL INCONSISTENCY: "${f}" references a future date as completed.`);
        }
      }
    }
  }
  return warnings;
}
```

### 5.2 Cross-Agent Consistency Validation

When multiple agents return evidence, verify they're discussing the same road/project:

```typescript
function validateCrossAgentConsistency(evidence: NormalizedEvidence[]): string | null {
  const admin = evidence.findLast(e => e.agentId === 'admin' && e.status === 'completed');
  const telemetry = evidence.findLast(e => e.agentId === 'telemetry' && e.status === 'completed');

  if (!admin || !telemetry) return null;

  // Check if admin evidence mentions a different road than telemetry detected
  const adminRoad = admin.metadata?.roadNumber as string | undefined;
  const telemetryRoad = telemetry.metadata?.roadNumber as string | undefined;

  if (adminRoad && telemetryRoad && adminRoad !== telemetryRoad) {
    return `⚠️ CROSS-AGENT MISMATCH: Admin references ${adminRoad} but telemetry detected ${telemetryRoad}. Results may be about different roads.`;
  }
  return null;
}
```

---

## Implementation Priority & Sequence

| Priority | Patch | Impact | Effort |
|----------|-------|--------|--------|
| **P0** | 3.1 GPS Gate for Personnel | Fixes Dubai→Telangana bug immediately | 15 min |
| **P0** | 3.2 International Abort | Prevents all out-of-jurisdiction hallucinations | 15 min |
| **P0** | 1.1 `.findLast()` fix | Fixes retry evaluation bug | 5 min |
| **P1** | 1.2 Data Void Detection | Prevents low-confidence pass-through | 30 min |
| **P1** | 3.3 FTS5 Geographic Match | Prevents random personnel results | 30 min |
| **P1** | 2.1 Query Rewriter | Replaces hardcoded retry string | 45 min |
| **P2** | 1.3 Authority Matrix Fallback | Provides useful fallback for data voids | 30 min |
| **P2** | 4.3 Retrieval Grading | Filters irrelevant chunks pre-synthesis | 30 min |
| **P3** | 4.1 Faithfulness Scoring | Post-generation hallucination catch | 1 hr |
| **P3** | 4.2 Knowledge Refinement | Strips noise from chunks | 30 min |
| **P3** | 5.1-5.2 Coherence Checks | Catches illogical temporal/spatial answers | 45 min |

---

## Updated Graph Topology

```
START → router → [conversational? → END]
                → ingest (parallel agents)
                → guardrail
                    ├─ citizen claim → ui_hook → END
                    ├─ data void (retry=0) → rewriter → ingest (retry)
                    ├─ data void (retry≥1) → authority fallback → END
                    ├─ contradiction (retry=0) → rewriter → ingest (retry)
                    ├─ contradiction (retry≥1, verified) → ui_hook → END
                    └─ clean pass → [faithfulness check] → ui_hook → END
```

---

## Success Criteria

1. **Zero out-of-jurisdiction hallucinations** — Dubai GPS never returns Indian personnel
2. **Retry evaluates fresh evidence** — `.findLast()` ensures latest admin result is checked
3. **Data voids produce actionable fallbacks** — Authority Matrix contacts, not empty responses
4. **Query rewriting is dynamic** — LLM generates context-aware broader queries
5. **Faithfulness > 0.7** — All responses must have >70% of claims attributable to retrieved chunks
6. **No illogical temporal claims** — Future dates never described as "completed"
7. **Geographic coherence** — FTS5 results must match query geography or return empty

---

## Testing Plan

```bash
# Test 1: Dubai GPS → should return out-of-jurisdiction message
payload: { text: "who is the engineer", gps: { lat: 25.2, lng: 55.27 } }
expected: "outside Indian jurisdiction"

# Test 2: Personnel without GPS or state → should request location
payload: { text: "who is the engineer for this road" }
expected: "Please provide your location"

# Test 3: Data void → should trigger rewrite then authority fallback
payload: { text: "NH-999 contract details" }  # non-existent road
expected: Authority Matrix response after 1 retry

# Test 4: Retry evaluates new evidence
payload: { text: "NH-44 condition", imageUrl: "..." }  # contradiction scenario
expected: debugTrace shows retry evaluated LATEST admin evidence

# Test 5: FTS5 geographic enforcement
query: "executive engineer road" (no state)
expected: empty results from pwd_contacts, not random Telangana data
```

---

## References

- Asai et al. "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection" (2023) — arxiv:2310.11511
- Yan et al. "Corrective Retrieval Augmented Generation" (2024) — arxiv:2401.15884
- Dhuliawala et al. "Chain-of-Verification Reduces Hallucination in Large Language Models" (2023) — arxiv:2309.11495
- Gao et al. "Precise Zero-Shot Dense Retrieval without Relevance Labels" (HyDE, 2022) — arxiv:2212.10496
- Jeong et al. "Adaptive-RAG: Learning to Adapt Retrieval-Augmented Large Language Models through Question Complexity" (2024) — arxiv:2403.14403
- "HalluGuard: Evidence-Grounded Small Reasoning Models to Mitigate Hallucinations in RAG" (2025) — arxiv:2510.00880
- Microsoft Foundry RAG Evaluators — learn.microsoft.com/azure/ai-foundry/concepts/evaluation-evaluators/rag-evaluators
- LangChain Blog "Self-Reflective RAG with LangGraph" (2024) — blog.langchain.dev/agentic-rag-with-langgraph/
