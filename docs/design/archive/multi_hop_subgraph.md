# VIGIA Architecture Spec: Multi-Hop Cross-Referencing Sub-Graph

> **Status:** Design Complete — Awaiting Approval  
> **Created:** 2026-05-24  
> **Pattern:** ReWOO (Reasoning Without Observation) adapted for Federated Retrieval  
> **Location:** Nested inside Admin Agent (`lib/agents/agents/admin.ts`)

---

## Why NOT ReAct

| Dimension | ReAct | Plan-and-Execute (ReWOO) |
|-----------|-------|--------------------------|
| LLM calls per query | 3–7 (one per step) | **1** (planner) + **1** (synthesis) |
| Latency | 6–15s (sequential) | **2–4s** (plan + parallel execute) |
| Token cost | 5x baseline | **1x baseline** |
| Hallucination risk | High (LLM reasons over partial observations) | **Low** (LLM only plans; execution is deterministic) |
| Inspectability | Opaque (reasoning interleaved with actions) | **Full** (plan is a JSON DAG, auditable before execution) |
| Parallelism | None (each step waits for previous) | **Maximum** (independent steps run concurrently) |

**PromptQL benchmark (FRAMES):** Plan-based execution achieves ~100% accuracy vs 40% naive RAG and 60% agentic RAG (ReAct-style).

**Key insight:** VIGIA's data sources are KNOWN and FINITE. We don't need open-ended exploration. A single planning call outputs the full dependency graph, then deterministic TypeScript executes it.

---

## Architecture Overview

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  ADMIN AGENT (Plan-and-Execute Sub-Graph)               │
│                                                         │
│  ┌──────────────┐                                       │
│  │ QUERY PLANNER│  ← 1 LLM call (Bedrock Nova Lite)    │
│  │ (ReWOO-style)│  → outputs JSON execution plan       │
│  └──────┬───────┘                                       │
│         │ plan: Step[]                                  │
│         ▼                                               │
│  ┌──────────────────────────────────────────────┐       │
│  │ DETERMINISTIC EXECUTOR                        │       │
│  │                                               │       │
│  │  Phase 1 (parallel — no dependencies):        │       │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────────┐    │       │
│  │  │searchNHAI│ │searchPWD│ │searchPMGSY  │    │       │
│  │  └────┬────┘ └────┬────┘ └──────┬──────┘    │       │
│  │       │            │             │            │       │
│  │       ▼            ▼             ▼            │       │
│  │  ┌─────────────────────────────────────┐     │       │
│  │  │ ENTITY EXTRACTOR (regex, no LLM)    │     │       │
│  │  │ extracts: district, state, road#    │     │       │
│  │  └────────────────┬────────────────────┘     │       │
│  │                   │                           │       │
│  │  Phase 2 (sequential — uses Phase 1 output): │       │
│  │  ┌──────────────────────────────────┐        │       │
│  │  │ searchPWD(district="Khammam")    │        │       │
│  │  │ searchNHAI(concessionaire="X")   │        │       │
│  │  └──────────────────────────────────┘        │       │
│  │                                               │       │
│  └──────────────────────┬───────────────────────┘       │
│                         │                               │
│  ┌──────────────────────▼───────────────────────┐       │
│  │ EVIDENCE MERGER                               │       │
│  │ → deduplicates, ranks by relevance            │       │
│  │ → outputs NormalizedEvidence (existing schema)│       │
│  └───────────────────────────────────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
    │
    ▼
  Guardrail (existing) → Data Void / Contradiction / Clean Pass
```

---

## 1. The Query Planner

### Design

One LLM call. Outputs a JSON execution plan with variable placeholders (ReWOO `#E` pattern). Zero reasoning during execution — all intelligence is front-loaded into the plan.

### Planner Output Schema

```typescript
const PlanSchema = z.object({
  steps: z.array(z.object({
    id: z.string(),                    // "E1", "E2", "E3"
    tool: z.enum(['searchNHAI', 'searchPWD', 'searchPMGSY', 'searchAll']),
    query: z.string(),                 // search query for this step
    extract: z.array(z.string()).optional(),  // entities to extract: ["district", "state", "concessionaire"]
    dependsOn: z.array(z.string()).optional(), // ["E1"] — waits for E1 to complete
    injectFrom: z.record(z.string(), z.string()).optional(), // { "district": "E1.district" }
  })),
  reasoning: z.string(),              // one-line explanation of the plan
});
```

### Planner Prompt

```
You are a retrieval planner for VIGIA, an Indian infrastructure database with 3 data sources:
- searchNHAI: Contract data (road numbers, concessionaires, costs, districts, states, project modes)
- searchPWD: Personnel directory (executive engineers, phone numbers, emails, divisions, states)
- searchPMGSY: Rural road data (road names, contractors, costs, districts, states, schemes)

Given a user query, output a JSON execution plan. Rules:
1. If the query needs data from multiple sources, create separate steps for each.
2. If Step B needs information from Step A's results (e.g., need district from NHAI to find PWD contact), mark dependsOn and injectFrom.
3. Steps WITHOUT dependencies run in PARALLEL.
4. Use "extract" to specify what entities to pull from results (district, state, concessionaire, roadNumber).
5. Maximum 4 steps. Most queries need 1-2.
6. For personnel queries about a specific road, ALWAYS plan: Step 1 = searchNHAI for the road (extract district), Step 2 = searchPWD with that district.

USER QUERY: "{query}"
INTENT: {intent}
GPS: {gps_context}
```

### Example Plans

**Simple query:** "What is the budget for NH-44?"
```json
{
  "steps": [
    { "id": "E1", "tool": "searchNHAI", "query": "NH-44 budget sanctioned cost" }
  ],
  "reasoning": "Single source query — NHAI contracts contain budget data"
}
```

**Cross-reference query:** "Phone number of EE for NH-163G in Telangana"
```json
{
  "steps": [
    { "id": "E1", "tool": "searchNHAI", "query": "NH-163G Telangana", "extract": ["district", "state"] },
    { "id": "E2", "tool": "searchPWD", "query": "Executive Engineer Telangana", "dependsOn": ["E1"], "injectFrom": { "district": "E1.district" } }
  ],
  "reasoning": "Need district from NHAI contract data to find the specific PWD executive engineer"
}
```

**Multi-hop query:** "Contractor for PMGSY road in Pune AND EE phone for NH-163G"
```json
{
  "steps": [
    { "id": "E1", "tool": "searchPMGSY", "query": "PMGSY rural road contractor Pune Maharashtra" },
    { "id": "E2", "tool": "searchNHAI", "query": "NH-163G Telangana", "extract": ["district"] },
    { "id": "E3", "tool": "searchPWD", "query": "Executive Engineer Telangana", "dependsOn": ["E2"], "injectFrom": { "district": "E2.district" } }
  ],
  "reasoning": "E1 and E2 run in parallel. E3 waits for E2 to get the district for targeted PWD lookup."
}
```

### Latency Budget

| Component | Time |
|-----------|------|
| Planner LLM call | ~1.2s |
| Phase 1 (parallel searches) | ~1.5s |
| Entity extraction (regex) | <5ms |
| Phase 2 (dependent searches) | ~1.5s |
| **Total sub-graph** | **~3–4s** |

Compare to ReAct: 3 sequential LLM calls × 1.5s + 3 tool calls × 1.5s = **~9s**

---

## 2. The Deterministic Executor

### Execution Algorithm

```typescript
async function executeplan(plan: Plan, payload: Payload): Promise<ExecutionResult[]> {
  const results: Map<string, ExecutionResult> = new Map();

  // Topological sort: group steps by dependency depth
  const phases = topologicalSort(plan.steps);

  for (const phase of phases) {
    // All steps in this phase run in parallel
    const phaseResults = await Promise.all(
      phase.map(async (step) => {
        // Inject extracted entities from dependencies
        let query = step.query;
        if (step.injectFrom) {
          for (const [param, ref] of Object.entries(step.injectFrom)) {
            const [depId, field] = ref.split('.');
            const depResult = results.get(depId);
            const value = depResult?.extracted?.[field];
            if (value) {
              query = `${query} ${value}`;
            }
          }
        }

        // Execute the tool
        const chunks = await executeTool(step.tool, query, payload);

        // Extract entities if requested
        const extracted = step.extract
          ? extractEntities(chunks, step.extract)
          : undefined;

        return { stepId: step.id, chunks, extracted };
      })
    );

    // Store results for dependent steps
    for (const result of phaseResults) {
      results.set(result.stepId, result);
    }
  }

  return Array.from(results.values());
}
```

### Entity Extraction (Zero LLM — Pure Regex)

```typescript
function extractEntities(
  chunks: UnifiedResult[],
  fields: string[]
): Record<string, string> {
  const extracted: Record<string, string> = {};

  for (const field of fields) {
    switch (field) {
      case 'district':
        // Most chunks have "District: X" or state field
        const district = chunks[0]?.district ?? chunks[0]?.chunkText.match(/District:\s*([^,.\n]+)/i)?.[1];
        if (district) extracted.district = district;
        break;
      case 'state':
        const state = chunks[0]?.state ?? chunks[0]?.chunkText.match(/(?:State|state):\s*([^,.\n]+)/i)?.[1];
        if (state) extracted.state = state;
        break;
      case 'concessionaire':
        const conc = chunks[0]?.concessionaire ?? chunks[0]?.chunkText.match(/Concessioner?:\s*([^,.\n]+)/i)?.[1];
        if (conc) extracted.concessionaire = conc;
        break;
      case 'roadNumber':
        const road = chunks[0]?.roadNumber ?? chunks[0]?.chunkText.match(/\b(NH[-\s]?\d+\w?|SH[-\s]?\d+)\b/i)?.[1];
        if (road) extracted.roadNumber = road;
        break;
    }
  }

  return extracted;
}
```

### State Schema Extension

```typescript
// New: intermediate execution state (internal to Admin Agent, not exposed to graph)
interface AdminExecutionState {
  plan: Plan;
  phaseResults: Map<string, {
    stepId: string;
    chunks: UnifiedResult[];
    extracted?: Record<string, string>;
  }>;
  mergedEvidence: UnifiedResult[];
}
```

This state is **internal to the Admin Agent** — it does NOT pollute the top-level `VigiaState`. The Admin Agent outputs the same `NormalizedEvidence` as before.

---

## 3. Federated Source Isolation

### Current Problem

```typescript
// Current: one vector space, mixed results
searchUnified(query) → [NHAI chunk, PWD chunk, PMGSY chunk, authority chunk]
```

The planner can't target specific sources. A personnel query gets NHAI contract chunks competing with PWD contacts in the same similarity ranking.

### New: Discrete Targetable Tools

```typescript
// New: source-specific search functions
async function searchNHAI(query: string, limit?: number): Promise<UnifiedResult[]>
async function searchPWD(query: string, limit?: number): Promise<UnifiedResult[]>
async function searchPMGSY(query: string, limit?: number): Promise<UnifiedResult[]>
async function searchAll(query: string, limit?: number): Promise<UnifiedResult[]>  // fallback
```

### Implementation: Filter by `sourceType` in pgvector

The pgvector table already has a `source_type` column. We add a filter parameter to the Lambda:

```typescript
// Lambda payload with source filter
{
  "query": "Executive Engineer Khammam Telangana",
  "limit": 5,
  "sourceType": "pwd_contact"  // NEW: filter at the DB level
}
```

**pgvector SQL change (in Lambda):**
```sql
-- Current:
SELECT * FROM embeddings ORDER BY embedding <=> $1 LIMIT $2;

-- New:
SELECT * FROM embeddings
WHERE ($3::text IS NULL OR source_type = $3)
ORDER BY embedding <=> $1
LIMIT $2;
```

This is a single-column filter on an indexed field — zero performance impact.

### Tool Implementation

```typescript
async function executeTool(
  tool: string,
  query: string,
  payload: Payload
): Promise<UnifiedResult[]> {
  const sourceFilter = {
    searchNHAI: 'nhai_contract',
    searchPWD: 'pwd_contact',
    searchPMGSY: 'pmgsy_road',
    searchAll: null,  // no filter
  }[tool] ?? null;

  return queryPgvectorFiltered(query, 8, sourceFilter);
}
```

---

## 4. Integration with Existing Guardrails

### Output Contract

The Admin Agent's sub-graph outputs the **exact same** `NormalizedEvidence` schema:

```typescript
{
  agentId: 'admin',
  status: 'completed',
  confidence: 0.85,           // max similarity across all steps
  findings: [...],            // merged findings from all steps
  citations: [...],           // merged citations with source URLs
  metadata: {
    planSteps: 3,             // NEW: how many steps were planned
    crossReferenced: true,    // NEW: whether dependent steps were used
    extractedEntities: { district: 'Khammam', state: 'Telangana' },
  },
  latencyMs: 3200,
}
```

### Guardrail Compatibility

| Guardrail Feature | Compatibility |
|-------------------|---------------|
| Data Void Detection | ✅ Same confidence threshold (< 0.5) |
| CRAG Query Rewriting | ✅ Rewriter gets the original query, not sub-queries |
| Authority Matrix Fallback | ✅ Triggers if merged evidence is still low-confidence |
| Contradiction Detection | ✅ Admin evidence compared against Vision as before |
| Temporal Coherence | ✅ Checks merged findings |
| Cross-Agent Consistency | ✅ Unchanged |

### Fallback Behavior

If the Planner LLM call fails (timeout, error), the Admin Agent falls back to the current single-shot `searchUnified` behavior. The sub-graph is an enhancement, not a hard dependency.

```typescript
export async function runAdminAgent(payload, retryQuery, intent): Promise<NormalizedEvidence> {
  try {
    // Try Plan-and-Execute sub-graph
    const plan = await generatePlan(payload.text, intent);
    if (plan.steps.length > 0) {
      return await executePlanAndMerge(plan, payload);
    }
  } catch {
    // Fallback: existing single-shot search
  }

  // Existing logic (current behavior)
  return existingAdminLogic(payload, retryQuery, intent);
}
```

---

## 5. Future Extensibility

### Adding New Data Sources

To add telemetry or news articles, simply:

1. Add a new tool enum value: `'searchTelemetry'` or `'searchNews'`
2. Add the source filter mapping
3. Update the Planner prompt with the new source description

The executor, entity extraction, and guardrail integration remain unchanged.

### Example Future Plan (with telemetry + news)

```json
{
  "steps": [
    { "id": "E1", "tool": "searchNHAI", "query": "NH-44 Telangana", "extract": ["district", "concessionaire"] },
    { "id": "E2", "tool": "searchTelemetry", "query": "NH-44 road condition anomalies" },
    { "id": "E3", "tool": "searchNews", "query": "NH-44 Telangana road damage complaints 2026" },
    { "id": "E4", "tool": "searchPWD", "query": "Executive Engineer Telangana", "dependsOn": ["E1"], "injectFrom": { "district": "E1.district" } }
  ],
  "reasoning": "Cross-reference contract data with live telemetry and news to detect discrepancies. Get responsible EE from district."
}
```

**Contradiction detection becomes multi-source:**
- NHAI says "completed, compliant"
- Telemetry shows potholes at GPS coordinates
- News reports citizen complaints
- Vision shows damage in photo
→ Guardrail flags verified discrepancy with 4-source corroboration

---

## 6. Cost & Latency Analysis

### Per-Query Cost (Plan-and-Execute)

| Component | Tokens | Cost |
|-----------|--------|------|
| Planner LLM (Nova Lite) | ~300 in / ~100 out | $0.0004 |
| pgvector searches (2-3) | N/A | $0 (Lambda) |
| Entity extraction | N/A | $0 (regex) |
| Final synthesis (existing) | ~800 in / ~300 out | $0.0008 |
| **Total** | | **$0.0012** |

**vs ReAct equivalent:** 4 LLM calls × $0.0004 = $0.0016 + unpredictable loops = $0.002–0.004

### Latency Comparison

| Pattern | Simple Query | Cross-Reference Query |
|---------|-------------|----------------------|
| Current (single-shot) | 4.5s | 4.5s (wrong answer) |
| ReAct (3 steps) | 4.5s | 9–12s |
| **Plan-and-Execute** | **4.5s** | **5.5–6.5s** |

The planner adds ~1.2s only when cross-referencing is needed. Simple queries can skip the planner entirely (detected by intent/query complexity).

---

## 7. Implementation Sequence

| Phase | Task | Effort |
|-------|------|--------|
| **Phase 1** | Add `sourceType` filter to Lambda | 30 min |
| **Phase 2** | Create `searchNHAI`, `searchPWD`, `searchPMGSY` wrappers | 30 min |
| **Phase 3** | Implement Query Planner (generateObject + schema) | 1 hr |
| **Phase 4** | Implement Deterministic Executor (topological sort + parallel dispatch) | 1.5 hr |
| **Phase 5** | Implement Entity Extractor (regex) | 30 min |
| **Phase 6** | Wire into Admin Agent with fallback | 30 min |
| **Phase 7** | Update progress streaming ("Planning retrieval...", "Cross-referencing district...") | 15 min |
| **Total** | | **~5 hours** |

---

## References

- Xu et al. "ReWOO: Decoupling Reasoning from Observations for Efficient Augmented Language Models" (2023) — arxiv:2305.18323
- PromptQL "Fundamental Failure Modes in RAG Systems" (2025) — Plan-based execution achieves ~100% on FRAMES benchmark
- LangChain Blog "Plan-and-Execute Agents" (2024) — blog.langchain.dev/planning-agents
- "Multi-Step Planning and Reasoning Improves Acting in LLM Agents" (2025) — arxiv:2505.09970
