Most write-ups about LangGraph pipelines talk about the graph topology: the nodes, the edges, the pretty diagram. The decisions that actually determined whether our pipeline was reliable happened one level down, in how we managed state. This post is about three of those, including a bug that took a full day to find and a single character to fix.

VIGIASearch is a road intelligence assistant for India built for the IIT Madras Road Safety Hackathon 2026. The whole system is in the [pillar article](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning). Here I want to stay close to the state machine.

### Validate at the boundary, not after

Our Ingest node runs three agents at once: Vision, Admin, and Telemetry. The first decision was where to normalise their output. We call our answer Shadow Normalization.

Every agent returns its output through a `Zod .safeParse()` against a strict `NormalizedEvidence` schema before that output is allowed into the global graph state. The schema enforces that confidence is a float between 0 and 1, that severity is one of a fixed enum, that citations carry a valid trust level.

![Shadow Normalization: per-agent Zod validation boundary](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247938441/a08446e6-df3f-45dc-9a7d-79184beafd1e.png)

If an agent returns partial data under a timeout, it is recorded with a partial or error status and a zeroed confidence rather than crashing the node. If validation fails outright, that agent's slot becomes an error result. The alternative was one centralised normalisation step that ran after all agents finished, but that would let a single malformed agent output corrupt evidence from the others. Validating at each agent boundary isolates failures to the agent that caused them.

Dispatch itself uses `Promise.allSettled`, not `Promise.all`, for the same reason. `Promise.all` would kill the whole pipeline if one agent timed out. `allSettled` lets the other two finish and passes partial evidence downstream, and the Guardrail is built to reason about completeness rather than assume every agent reported.

### The one-character bug

Here is the one that hurt.

LangGraph's state channels use reducers to merge updates. Our evidence array uses an append-only reducer, which is the sensible default: each node appends its evidence rather than clobbering the array. On a retry, the Admin agent runs again and its fresh evidence is appended after the original first-pass evidence.

Our contradiction check used `.find()` to pull the admin evidence. `.find()` returns the first matching element, which after a retry is the stale first-pass result. So the retry would run, append better evidence, and the check would keep evaluating the old evidence and conclude nothing had changed. The retry looked like it was doing nothing.

The fix was a single character: `.findLast()` instead of `.find()`, so every guardrail check evaluates the most recent evidence from each agent. Nothing about this surfaces in a unit test of the node. It only appears when you run a full end-to-end contradiction scenario and watch a retry quietly accomplish nothing.

### Keep the retry counter boring

The retry counter itself lives in graph state as a plain integer, read by the conditional edge after the Guardrail. We considered two fancier options and rejected both.

Rewinding message history to re-run from a checkpoint is dangerous, because the conversation log is append-only by design and editing it corrupts the persistence layer. A separate retry sub-graph adds debugging surface for no real benefit. An integer checked by a conditional edge is deterministic, bounded to a single retry, costs zero tokens, and is trivially testable. In a pipeline where a wrong answer can be harmful, boring and predictable wins.

### Tell the user what is happening

The last decision was about perceived reliability rather than actual correctness. A contradiction-and-retry path takes several seconds, since the Guardrail rewrites the query, re-dispatches the Admin agent, and re-grades the new evidence. In early testing that silence felt like the app had frozen.

The fix was to stream short status messages at each transition. The user sees that a contradiction was found and the query is being rewritten, then that it is re-searching, then that it is validating the new evidence, and if the void persists, that it is routing to authority contacts. The same channel surfaces the plan-and-execute reasoning trace on multi-hop queries. The work now reads as deliberate rather than stalled, and if the retry confirms the contradiction instead of resolving it, the user already understands why the answer is about to say that the records and the physical reality disagree.

### Takeaway

The graph diagram is the easy part. Reliability lived in the state channels: validate each agent at its own boundary, always read the newest evidence after a retry, keep the control state as dumb as possible, and stream progress so a slow-but-correct path does not look broken.

The rest of the system, including the retrieval loop and the anti-hallucination guardrails, is in the [pillar article](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning), and the code is open at [github.com/VigiaLabs/vigia-public](https://github.com/VigiaLabs/vigia-public).


---

## 🎓 CS Fundamentals — study companion

*This is the **state-management / concurrency** episode — reducers (fold), array semantics, `Promise.allSettled` vs `all`, retry idempotency, and validation-at-the-boundary. It's dense with the kind of "why did this bug happen?" reasoning interviewers love.*

### Data Structures & Algorithms
- **Reducers are `fold`.** A LangGraph state channel with an *append-only reducer* is exactly the functional **fold/reduce** operation: `newState = reducer(oldState, update)`. Append-only means the reducer concatenates, so the evidence array **grows** across retries and never overwrites. Knowing your reducer's algebra (append vs replace vs merge) is knowing your state's behaviour over time.
- **`.find()` vs `.findLast()` — the one-character bug.** `.find()` returns the *first* match; on an append-only array, after a retry the first match is the **stale** first-pass result. `.findLast()` returns the *most recent*. This is a precise DSA point: when your collection accumulates newest-at-the-end, "get the current value" means **last**, not first. The bug is a mismatch between the array's growth order and the access pattern.
- **Idempotency of retries.** A retry must actually change what downstream reads, or it's a no-op. The append-then-read-latest fix makes the retry *effective*; the counter (below) makes it *bounded*. "Is my retry idempotent / does it converge?" is a standard reliability question.

### Concurrency
- **`Promise.allSettled` vs `Promise.all`.** Three agents run in parallel. `Promise.all` **fails fast** — one rejection kills the whole batch. `Promise.allSettled` waits for *all* to settle and returns each outcome (fulfilled/rejected) independently, so two agents finishing and one timing out yields **partial** results instead of total failure. This is fault-isolation in a fan-out: choose `allSettled` when partial success is useful, `all` when you need every result or none.
- **Validate at the boundary (fail-fast, isolated).** Each agent's output is `Zod.safeParse`d against a strict schema *before* entering shared state ("Shadow Normalization"). One malformed agent becomes one error slot, not corrupted global state. This is the **defensive-programming / parse-don't-validate** principle: normalise and check at the edge so bad data never propagates inward.

### Operating Systems / distributed-systems flavour
- **Bounded retry via a plain counter.** The retry count is a simple integer read by a conditional edge — deterministic, bounded to one pass, zero tokens. The rejected alternatives (rewinding an append-only log, a retry sub-graph) map to real trade-offs: **never mutate an append-only log** (it's the persistence source of truth — the same reason event logs and WALs are immutable), and don't add debugging surface for no benefit. "Keep the control state dumb" is a reliability heuristic.
- **Observability / perceived latency.** Streaming status messages at each transition doesn't change correctness — it changes *perceived* reliability. A slow-but-correct path that looks frozen is a UX failure; surfacing progress (a form of **observability** turned toward the user) fixes it.

**Interview Q&A.**
1. *What's the difference between `Promise.all` and `Promise.allSettled`?* → `all` rejects as soon as any promise rejects (all-or-nothing); `allSettled` always resolves with every outcome, enabling partial success.
2. *You append results to an array and later read one back wrong after a retry — why?* → `.find()` returns the first (stale) match on an append-only array; read the newest with `.findLast()`.
3. *What is a reducer and why does append-only vs replace matter?* → A fold `(state, update) → state`; append-only grows history (read latest deliberately), replace clobbers — the choice defines your read semantics.
4. *Why validate each agent at its boundary instead of once at the end?* → Isolates failures to the offending agent; centralised post-hoc normalisation lets one bad output corrupt the rest.
5. *Why never rewind/edit an append-only log to retry?* → It's the immutable source of truth for persistence; editing corrupts it. Use out-of-band control state (a counter) instead.

**Quick-review flashcards.**
- Reducer = fold; append-only ⇒ read newest with `.findLast()`, not `.find()`.
- `all` = fail-fast; `allSettled` = partial success.
- Parse/validate at the boundary → isolate bad data.
- Append-only log = immutable; put retry control in a separate counter.

### ⚖️ This vs That — the architecture decisions, and the roads not taken

| Decision | Alternatives | Why this choice |
|---|---|---|
| **`.findLast()` (read newest evidence)** | `.find()` (first match) | Append-only arrays grow newest-last; `.find()` re-reads the stale first-pass result and the retry silently no-ops. |
| **Per-agent boundary validation (Zod)** | One centralised normalisation after all agents | Central normalisation lets one malformed output corrupt the others; boundary parsing isolates the failure. |
| **`Promise.allSettled` dispatch** | `Promise.all` | `all` kills the whole pipeline if one agent times out; `allSettled` passes partial evidence and lets the guardrail reason about completeness. |
| **Integer retry counter + conditional edge** | Rewind message history / a retry sub-graph | Editing the append-only log corrupts persistence; a sub-graph adds debug surface for nothing. An integer is deterministic, bounded, testable. |

**The one to defend:** *the append-only reducer + `.findLast()` fix.* The senior signal: **the graph diagram is easy; reliability lives in the state channels.** Knowing that an append-only reducer changes the meaning of "read the value" — so a retry only works if you deliberately read the *newest* element — is the exact class of bug that never shows in a unit test and only surfaces end-to-end.
