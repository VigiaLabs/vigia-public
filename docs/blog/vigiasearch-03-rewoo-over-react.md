Consider a question that sounds simple: "what is the phone number of the executive engineer responsible for NH-163G?"

It is actually a two-database problem. The answer does not live in any single record. You have to query NHAI contract data to find which district NH-163G passes through, then use that district to query the PWD personnel directory for the responsible engineer. The engineer's name is never in the NH-163G chunks. It only lives in PWD records, which you cannot retrieve well without the district first.

This post is about how VIGIASearch resolves queries like that quickly and safely. VIGIASearch is a road intelligence assistant for India built for the IIT Madras Road Safety Hackathon 2026, and the full system is covered in the [pillar article](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning). Here I want to focus on one decision: choosing a plan-and-execute retrieval loop over a ReAct agent.

### The obvious approach, and why it is slow

The standard way to orchestrate multi-step queries is **ReAct**: give the model a set of tools and let it reason about which one to call, observe the result, then decide the next step. ReAct works, but it has a compounding latency problem.

Each reasoning-observation cycle is a separate LLM call. A three-step query becomes three sequential calls, each waiting on the previous. At the scale of a citizen portal, a cross-reference query becomes a 9 to 12 second wait. It is also non-transparent, since you cannot inspect what the model plans to do until it is already doing it.

There is an accuracy cost too. A benchmark worth citing:

> the PromptQL FRAMES evaluation found plan-based execution achieves close to 100% accuracy on multi-hop factual queries, compared to around 40% for naive RAG and 60% for ReAct-style agentic RAG.

ReAct's sequential observation loop compounds errors. A wrong observation in step two poisons every step that follows.

### ReWOO: do all the thinking up front

We chose **Plan-and-Execute** instead, specifically the ReWOO pattern (Reasoning Without Observation). All reasoning is front-loaded into a single planning call. The model receives the query, the available data sources, and a few rules, and outputs a complete JSON execution plan before any retrieval happens. That plan is a dependency graph.

Step E1 queries NHAI for the road and extracts the district. Step E2 queries PWD for the executive engineer using the district from E1. A deterministic TypeScript executor then runs the plan, running steps without dependencies in parallel and sequencing those that have them.

![ReWOO plan-and-execute sequence for a cross-source query](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247934503/aa21c850-7d69-42e5-ac31-5db413f96897.png)

The planning call costs about 1.2 seconds. The parallel searches run in about 1.5 seconds each. A two-step cross-reference query resolves in roughly 5.5 to 6.5 seconds total, compared to 9 to 12 for the equivalent ReAct chain. And the plan is a fully auditable JSON object you can inspect and log before execution begins.

### Determinism is the real prize

Latency is the headline, but determinism is what actually made the system safe.

Once the plan is generated, execution is pure TypeScript with no further LLM calls in the critical path. Entity extraction between steps uses a two-tier approach: Tier 1 reads directly from structured metadata fields, which is instant and costs zero tokens, and only if a field is missing does Tier 2 make a fast, narrowly-scoped `generateObject` call against the retrieved chunk text.

A ReAct agent reasons over partial observations, which opens a window where the model can decide mid-chain to query an unexpected source or hallucinate a tool call that does not exist. Our executor only knows how to call `searchNHAI`, `searchPWD`, and `searchPMGSY`. There is no room for the execution phase to go sideways on routing.

### Why the unified store made this possible

None of this would work without the retrieval layer underneath. We had started with three separate keyword-indexed silos, which broke the moment a user paraphrased. "Village roads near Khammam" and "PMGSY Khammam" are the same question, but only one hit the regex trigger.

We migrated everything to a unified pgvector table with a `source_type` discriminator. Every source (contracts, personnel directories, rural road records, authority contacts) is embedded as natural language chunks in the same table. For cross-source precision, the planner wraps each source as a targetable tool with a `source_type` filter, so a plan can route to a specific silo when it needs to, while single-source queries still ride on plain semantic similarity.

### Takeaway

If your RAG queries span multiple sources with real dependencies between them, front-loading the reasoning into one plan buys you three things at once: lower latency, higher multi-hop accuracy, and an execution phase you can actually trust because a deterministic runner, not a model, is driving it.

The full system, including the anti-hallucination guardrails that sit on top of this, is in the [pillar article](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning), and the code is open at [github.com/VigiaLabs/vigia-public](https://github.com/VigiaLabs/vigia-public).


---

## 🎓 CS Fundamentals — study companion

*This is the **algorithms + system-design** episode: dependency graphs, topological ordering, parallel scheduling, and the latency/determinism trade-off between planning up front (ReWOO) and reasoning step-by-step (ReAct). Great "how do you make a multi-step pipeline fast and safe?" material.*

### Data Structures & Algorithms
- **The execution plan is a DAG.** ReWOO outputs a JSON plan where `E2` depends on `E1`'s district. That's a **Directed Acyclic Graph** of tasks. Running it correctly means a **topological sort**: steps with no unmet dependencies run now (in parallel), dependent steps wait. This is the same scheduling problem as build systems (`make`), Spark stages, and course-prerequisite ordering.
- **Critical path & parallelism.** Total latency isn't the sum of steps — it's the **critical path** through the DAG. Independent steps run concurrently, so the plan's runtime ≈ planning call + longest dependency chain, not planning + every search sequentially. Knowing that parallelising off-critical-path work is free latency is a core scheduling insight.
- **Front-loading reasoning to break the sequential chain.** ReAct is inherently sequential — each step needs the previous *observation*, so N steps = N sequential LLM calls (9–12s). ReWOO makes **one** planning call, then a deterministic executor runs the DAG. You trade N round-trips for 1 + parallel retrieval (~5.5s). This is "do the expensive coordination once, up front."

### System Design
- **Determinism as a safety property.** After planning, execution is pure TypeScript calling a *fixed* tool set (`searchNHAI`/`searchPWD`/`searchPMGSY`). A ReAct agent reasons over partial observations and can go "off-routing" mid-chain — call an unexpected source or hallucinate a nonexistent tool. Removing the LLM from the critical execution path removes an entire class of failure. **Constrain the action space** when a wrong action is dangerous.
- **Error compounding.** ReAct's sequential observe-then-decide loop means a wrong observation at step 2 poisons every later step (the cited FRAMES benchmark: ~100% plan-based vs ~60% ReAct vs ~40% naive on multi-hop). Front-loaded planning with a validated plan avoids mid-chain drift.
- **Two-tier entity extraction (cheapest-layer-first).** Between steps, Tier 1 reads structured metadata (instant, zero tokens); only if a field is missing does Tier 2 make a narrow LLM call. This is the recurring VIGIA pattern — **push work to the cheapest deterministic layer**, escalate to the model only when forced.
- **Auditability.** The plan is a JSON object you can log and inspect *before* execution. A pre-committed, inspectable plan is far easier to trust, test, and debug than an agent whose next move you can't see until it happens.

### DBMS (retrieval layer)
- **Unified store + `source_type` discriminator.** One `pgvector` table holds all sources; an indexed `source_type` column lets the planner target a specific silo (avoiding cross-source noise in the similarity ranking) while single-source queries ride plain semantic similarity. A cheap indexed filter beats a smarter prompt.

**Interview Q&A.**
1. *ReAct vs Plan-and-Execute (ReWOO) — trade-offs?* → ReAct: flexible, but N sequential LLM calls (high latency) and mid-chain error compounding. ReWOO: one planning call + deterministic parallel execution — lower latency, auditable, but the plan is fixed up front.
2. *How do you schedule steps with dependencies?* → Model as a DAG, topologically sort, run independent steps in parallel, sequence dependents; latency is the critical path.
3. *Why is a deterministic executor safer than an agentic loop?* → Fixed, constrained action set means no mid-chain routing surprises or hallucinated tool calls — the LLM can't drive execution off the rails.
4. *Why does ReAct compound errors on multi-hop queries?* → Each step conditions on the previous observation, so one wrong observation poisons all downstream steps.

**Quick-review flashcards.**
- Plan = task DAG → topological sort → parallel where independent.
- Latency = critical path, not sum of steps.
- ReAct = N sequential LLM calls; ReWOO = 1 plan + deterministic exec.
- Determinism = constrained action space = safety.

### ⚖️ This vs That — the architecture decisions, and the roads not taken

| Decision | Alternatives | Why this choice |
|---|---|---|
| **ReWOO plan-and-execute** | ReAct reason-observe loop | ReAct is N sequential LLM calls (9–12s) and compounds errors; ReWOO front-loads one plan, runs a deterministic parallel DAG (~5.5s), and is auditable before execution. |
| **Deterministic TS executor, fixed tools** | LLM-driven execution per step | An LLM in the loop can hallucinate tool calls or reroute mid-chain; a fixed executor can't go sideways. |
| **Two-tier entity extraction** | Always LLM-extract between steps | Structured-field reads are instant and free; only fall back to a narrow LLM call when a field is missing. |
| **Unified pgvector + `source_type` filter** | Blend all sources in one similarity ranking / separate keyword silos | Blending injects cross-source noise; an indexed discriminator gives cross-source precision cheaply and still allows plain semantic search. |

**The one to defend:** *front-load the reasoning, then let a deterministic runner drive.* The insight: **for multi-hop retrieval with real dependencies, one planning call + a deterministic DAG executor buys lower latency, higher accuracy, and an execution phase you can actually trust** — because a wrong LLM decision can't happen where a wrong decision would be dangerous. You spend the model where it's good (planning) and TypeScript where it must be safe (execution).
