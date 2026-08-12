A citizen standing next to a broken highway asks who to call. If the system invents a plausible-sounding engineer and phone number, that citizen wastes time chasing a person who does not exist while the real hazard sits unreported. VIGIASearch is our attempt to build a road intelligence assistant for India that would rather say "I don't know, here is the official helpline" than fabricate an answer. This article walks through the engineering decisions that made that possible, and the ones we got wrong first.

Everything here is drawn from our public repository: [**github.com/VigiaLabs/vigia-public**](https://github.com/VigiaLabs/vigia-public). It was built for Problem Statement 2 of the IIT Madras Road Safety Hackathon 2026.

**What this article covers:**

- Why we picked a LangGraph state machine over a linear chain or a fully autonomous agent framework
- How a unified pgvector store replaced three brittle keyword-indexed silos
- Why we run a ReWOO plan-and-execute retrieval loop instead of ReAct, and the latency numbers behind it
- The layered Guardrail (Self-RAG grading, CRAG corrective retry, deterministic consistency checks) that does the real anti-hallucination work
- The state-management bugs nobody warns you about, including a one-character fix that took a full day to find
- Zero-trust handling of citizen photos, offline edge resilience, and honest limits of the underlying data

Here is the whole system on one page before we take it apart:

![VIGIASearch full-system architecture overview](https://cdn.hashnode.com/res/hashnode/image/upload/v1783250520872/91b45843-3ba8-4dd7-bf38-1383879f98b1.png)

> **This is the full deep-dive.** If you want the focused versions, three companion posts in this series each take one idea further: [how we stopped the model from inventing engineers](https://ridingbluewaves.hashnode.dev/how-we-stopped-our-rag-agent-from-inventing-engineers), [ReWOO over ReAct for multi-hop latency](https://ridingbluewaves.hashnode.dev/rewoo-over-react-cutting-multi-hop-rag-latency-from-12s-to-55s), and [a LangGraph state bug and its one-character fix](https://ridingbluewaves.hashnode.dev/a-langgraph-bug-that-hid-behind-an-append-only-reducer).

### Why LangGraph, why not some other framework?

There were really three serious alternatives we considered: a **simple linear chain (LangChain LCEL)**, a **serverless function-per-step approach**, and a full agent framework like **AutoGen** or **CrewAI**.

The linear chain was tempting, simple to reason about, works well when retrieval quality is reliable. Our situation is almost the opposite, though. We are dealing with government data that is ***incomplete***, ***fragmented***, and sometimes ***contradictory***. A linear chain has no ability to detect that what it retrieved was "garbage" and try again. It simply passes bad evidence to the LLM, which then confidently generates a bad answer. That is exactly the hallucination class we were trying to eliminate.

**AutoGen** and **CrewAI** were the other extreme, frameworks designed for fully autonomous multi-agent loops where agents communicate in natural language and plan dynamically. Powerful, but they introduce enormous *unpredictability*. A citizen asking about a pothole should not trigger an open-ended reasoning loop that might take *30 seconds* and ten LLM calls to resolve. These frameworks are built for exploratory, long-horizon tasks. We had a concrete 5-second latency budget and a well-defined problem space. They may be better suited to ***planning infrastructure*** decisions than auditing road data (Maybe an idea for the future...).

[**LangGraph**](https://www.youtube.com/watch?v=cUfLrn3TM3M) sits in the middle. It gives you a **stateful**, directed graph where you define the nodes and the routing logic explicitly, but crucially, you get conditional edges, so the graph can take different paths based on the **state** of the data. For us, that meant clean retrieval goes straight to synthesis, contradictory or low-confidence retrieval loops back through a query rewriter and tries again, and if even the retry fails, we route to an ***Authority Matrix*** fallback that gives the citizen a direct helpline rather than a hallucinated answer.

One constraint **LangGraph.js** imposed on us was worth calling out. The JavaScript SDK has no native fan-out/fan-in, meaning you cannot spawn parallel branches and merge them natively. Our pipeline needs three agents running simultaneously: an Admin agent searching our database, a Vision agent analysing any uploaded photo, and a Telemetry agent processing GPS data. Our solution was to make the Ingest node a single graph node that internally dispatches all three agents via `Promise.allSettled`. This matters because `Promise.all` would kill the entire pipeline if one agent timed out, whereas `Promise.allSettled` lets the other two complete and passes partial evidence downstream. The Guardrail node is designed to reason about completeness, so a missing telemetry result does not break the whole response, it just means we have less evidence to draw from.

The compiled graph looks like this:

![VIGIA LangGraph pipeline: 4-node topology with retry loop](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247930765/65c4b960-1e6b-4ec7-ad03-aed923ef993f.png)

---

### Why a unified vector database over separate keyword-indexed silos?

Our initial architecture had three separate data paths: **NHAI contracts** queried by road number, **PMGSY rural data** queried by regex pattern matching on keywords like `"PMGSY" or "Khammam"`, and PWD personnel contacts queried by intent classification. This breaks the moment a user paraphrases. `"Village roads near Khammam"` and `"PMGSY Khammam"` are semantically identical questions but the first would miss the regex trigger entirely and return nothing.

The migration to a unified **pgvector table** with a `source_type` discriminator solved this. Every data source (contracts, personnel directories, rural road records, authority contact information) gets embedded as natural language chunks and stored in the same table. A query for `"who is the engineer for roads in Khammam?"` now finds the PWD officer entry purely through semantic similarity, no keyword trigger required. The entire if/else routing tree in the Admin agent collapsed to a single `searchUnified()` call.

The local SQLite FTS5 tables remain as a server-side fallback. When pgvector or the Lambda proxy is unreachable, keyword search takes over. This is ***separate*** from the offline edge architecture described later.

The daily refresh pipeline runs in three tracks on **AWS EventBridge CRON**. *Track A* handles PDF scraping from NHAI and MoRTH, parsing and chunking documents and upserting embeddings every morning.

*Track B* handles structured API data from Data.gov.in and the PMGSY OMMAS portal. A third unified embedder takes the structured sources (PWD directories, PMGSY road records, and the Authority Matrix), formats them as natural language chunks, and embeds them into the same pgvector table. The total daily embedding cost for all three tracks is under *~$0.20*.

![Unified vector database ingestion pipeline](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247932593/af3f6441-8b93-4198-89c6-4b8c83344841.png)

---

### Multi-hop reasoning: why we chose Plan-and-Execute over ReAct

Unifying all sources into one vector table solved the retrieval problem for single-source queries. But it introduced a new problem for cross-source queries. Consider: `"what is the phone number of the executive engineer responsible for NH-163G?"`

This is a two-database problem. The answer does not live in any single record. You need to query NHAI contract data to find which **district** NH-163G passes through, then use that district to query the PWD personnel directory for the responsible **executive engineer**. Even within the unified store, chunks for NH-163G will not contain the engineer's name. That lives only in PWD records, which require the district name to retrieve meaningfully.

The early `searchUnified()` approach would blend NHAI contract chunks and PWD contact chunks in the same similarity ranking, injecting noise into exactly the slots where precision matters most. The fix was to add a `source_type` filter to the Lambda, a single indexed column that costs nothing at query time, and wrap each source as a discrete, targetable tool: `searchNHAI`, `searchPWD`, `searchPMGSY`. The unified store remains the foundation. The planner layer on top can now route to a specific silo when needed.

The naive agent approach for orchestrating these multi-step queries is [**ReAct**](https://www.philschmid.de/langgraph-gemini-2-5-react-agent): give the LLM a set of tools and let it reason through which ones to call, observe the results, and decide on the next step. ReAct *works*, but it has a compounding latency problem.

Each reasoning-observation cycle is a separate LLM call. A three-step query becomes three sequential calls, each waiting on the previous. At the scale of a citizen portal, that is a 9 to 12 second wait for a cross-reference query. It is also non-transparent, you cannot inspect what the LLM plans to do until it is already doing it.

A benchmark worth citing:

> the PromptQL FRAMES evaluation found plan-based execution achieves close to 100% accuracy on multi-hop factual queries, compared to around 40% for naive RAG and 60% for ReAct-style agentic RAG.

ReAct's sequential observation loop compounds errors, a wrong observation in step two poisons every step that follows.

We chose **Plan-and-Execute** instead, specifically the ***ReWOO pattern (Reasoning Without Observation)***. In ReWOO, all reasoning is front-loaded into a single planning call. The LLM receives the query, the available data sources, and a few rules, and outputs a complete **JSON execution plan** upfront, before any retrieval happens. That plan is a dependency graph:

Step E1 queries NHAI for the road and extracts the district, Step E2 queries PWD for the executive engineer using the district from E1. A deterministic TypeScript executor then runs the plan, parallelising any steps without dependencies and sequencing those that have them.

![ReWOO plan-and-execute sequence for a cross-source query](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247934503/aa21c850-7d69-42e5-ac31-5db413f96897.png)

The planning call costs about 1.2 seconds. The parallel searches run in about ~1.5 seconds each. A two-step cross-reference query resolves in roughly ~5.5 to 6.5 seconds total, compared to 9 to 12 seconds for the equivalent ReAct chain, and the plan is a fully auditable JSON object you can inspect and log before execution begins.

**Determinism** matters here too. Once the plan is generated, execution is pure TypeScript with no further LLM calls in the critical path. Entity extraction between steps uses a two-tier approach: Tier 1 reads directly from structured metadata fields (instant, zero tokens), and only if the field is missing does Tier 2 make a fast `generateObject` call to `nova-lite-v1` against the retrieved chunk text. A ReAct agent reasons over partial observations, which creates a window where the LLM might decide mid-chain to query an unexpected source or hallucinate a tool call that does not exist. Our executor only knows how to call `searchNHAI`, `searchPWD`, and `searchPMGSY`, so there is no room for the execution phase to go sideways on routing.

For a standalone treatment of this tradeoff, with the latency numbers in one place, see [ReWOO over ReAct: cutting multi-hop RAG latency from 12s to 5.5s](https://ridingbluewaves.hashnode.dev/rewoo-over-react-cutting-multi-hop-rag-latency-from-12s-to-55s).

---

### The Guardrail is where the real anti-hallucination work happens

The most dangerous hallucination class in a road safety application is not invented statistics. It is *fabricated personnel details*. When a citizen asks `"who is the executive engineer responsible for NH-77?"`, an LLM that does not know the answer will often generate a plausible-sounding name. Plausible-sounding is worse than obviously wrong, because a citizen might actually try to contact that person and waste crucial time, especially when it relates to *safety*.

Our Guardrail node addresses this in layers, drawing on two named techniques from the academic literature.

**Self-RAG (Asai et al., 2023)** is the pattern of having the system evaluate its own retrieval quality before deciding whether to pass results forward. Rather than trusting whatever the retriever returns, the Guardrail grades it first. Every admin evidence result carries a confidence score derived from retrieval similarity. Anything below a 0.5 threshold, or with no findings, or carrying an explicit "no relevant data" marker, is treated as a data void and routed to a query rewrite rather than passed to synthesis. This is the single check that does the most work, since most fabrications happen when an LLM is handed thin or empty evidence and fills the gap.

**CRAG (Yan et al., 2024)** adds the corrective loop: when retrieval quality is low, rewrite the query and try again. We implemented a rewriter node that takes the original query, the intent classification, and the reason for failure, and generates a semantically broader version. For data voids, it generalises geographic terms and adds synonyms. For contradictions, where an official document says "completed" but a photo shows severe damage, it adds terms like "amendment", "variation order", and "addendum", because the most common real-world explanation is that a corrective amendment was never indexed alongside the original record. We started with a hardcoded fallback string for this retry, which failed immediately when tested against anything other than the single scenario we had built it for. The LLM-based rewriter replaced it. The retry is bounded to a single pass. If the rewritten query still comes back empty, the Guardrail stops generating and routes to an ***Authority Matrix*** fallback that hands the citizen a real helpline and portal rather than a confident guess.

![Guardrail decision tree](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247936437/86a06577-7402-4fbb-8cfb-e69557c48185.png)

Beyond grading retrieval, the Guardrail runs a set of deterministic consistency checks on the assembled evidence before anything reaches synthesis. A temporal coherence check flags any finding that describes a future-dated event as already completed. A cross-agent consistency check verifies that the Admin and Telemetry agents are actually discussing the same road, so if Admin evidence references NH-44 but the GPS trace was on a different road number, that mismatch is surfaced rather than silently merged. And contradiction detection compares high-confidence visual damage against official "compliant/completed" claims, triggering the corrective retry described above. These are a few dozen lines of TypeScript rather than model calls, which makes them cheap, deterministic, and trivially testable.

There is one more layer, but it sits downstream of delivery rather than gating it, so it is worth being precise about. After the response is generated, an LLM-as-Judge faithfulness scorer (our take on Chain-of-Verification, Dhuliawala et al., 2023) splits the response into individual claims and checks whether each one can be attributed to a specific retrieved chunk. The hallucination signal is high specificity combined with low attribution: specific names, dates, or figures that cannot be traced back to any evidence chunk. This runs asynchronously after the answer streams, and the resulting score and any flagged claims are attached to the response as metadata, an observability signal we can monitor and surface rather than a pre-delivery filter. The hard anti-hallucination guarantees live earlier in the pipeline, in the retrieval grading and the strict "use only the evidence above, never invent a name or number" instructions wrapped around the synthesis prompt. The faithfulness score is how we measure whether those guarantees are holding.

---

### The spatial guardrails

The most acute hallucination class in a personnel directory application is returning real people in the wrong jurisdiction.

During testing, I was running the system from Dubai and asked `"who is the engineer for this road."`

It returned the contact details of a *Telangana* executive engineer. The keyword query had matched on `"engineer"` with no geographic constraint, and the top result happened to be a *Telangana* officer. The first fix was a hard **location constraint**: when a personnel query arrives with a GPS coordinate that resolves outside India, the Admin agent returns an out-of-jurisdiction message immediately and never touches the personnel directory at all.

The harder case is a personnel query with no GPS and no state named in the text. Here we intentionally moved away from a hard gate in the agent, since a strict location constraint rejected too many legitimate queries. Instead we pushed the defense down into the retrieval layer as ***defense-in-depth***. The keyword (FTS5) fallback enforces a mandatory geographic constraint: if the query is a personnel query and contains no recognisable Indian state name, the personnel table is not queried and an empty result is returned rather than a random officer. When a state is present, the SQL match is constrained to records where the state column matches it. An empty result then flows into the data-void path and is handled gracefully. The model is instructed, in the system prompt, never to associate an officer with a location the evidence does not explicitly support, and low-similarity retrievals (below 0.5) are treated with skepticism. A wrong officer delivered with confidence is a far more serious failure than no officer at all.

A third class of check operates across agents, in the Guardrail. When the Admin and Telemetry agents both return evidence, we verify they are discussing the same road: if Admin evidence references one road number and the Telemetry GPS trace was on another, that mismatch is flagged rather than silently merged into one answer. A parallel temporal check flags any finding that describes a future date as a completed event. Both are deterministic checks that run before synthesis.

---

### The stateful orchestration decisions nobody usually talks about

Most discussions of LangGraph pipelines focus on the graph topology. The decisions that actually determined whether our implementation was reliable happened at the level of state management.

The first is what we call ***Shadow Normalization***. Every agent in the Ingest node (Vision, Admin, and Telemetry) returns its output through a `Zod .safeParse()` against a strict NormalizedEvidence schema before that output enters the global graph state. The schema enforces that confidence is a float between 0 and 1, that severity is one of a fixed enum, that citations carry a valid trust level. If an agent returns partial data under a timeout, it is recorded with a partial or error status and a zeroed confidence rather than crashing the node. If validation fails outright, that agent's slot becomes an error result. The alternative was a centralised normalisation step that ran after all agents completed, but that would let one malformed agent output corrupt evidence from the others. By validating at the individual agent boundary, failures are isolated to the agent that caused them.

![Shadow Normalization: per-agent Zod validation boundary](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247938441/a08446e6-df3f-45dc-9a7d-79184beafd1e.png)

The second is the retry counter pattern, and the bug that came with it. LangGraph's state channels use an append-only reducer for the evidence array, so on a retry the fresh Admin evidence is appended after the original first-pass evidence rather than replacing it. The naive contradiction check using `.find()` would evaluate the first matching element, the stale first-pass result, and the retry would appear to have done nothing. The fix was a single character: `.findLast()` instead of `.find()`, so every guardrail check evaluates the most recent evidence from each agent. This does not surface until you run a full end-to-end contradiction scenario.

The retry counter itself lives in graph state as a plain integer, read by the conditional edge after the Guardrail. We considered two alternatives: rewinding message history to re-run from a checkpoint, and building a separate retry sub-graph. Rewriting message history is dangerous because the conversation log is append-only by design, and editing it corrupts the persistence layer. A separate sub-graph adds debugging surface for no benefit. An integer counter checked by a conditional edge is deterministic, bounded to a single retry, costs zero tokens, and is trivially testable.

The third is streaming the pipeline's status as it works. A contradiction-and-retry path takes several seconds, since the Guardrail rewrites the query, re-dispatches the Admin agent, and re-grades the new evidence, and in early testing that silence felt like the app had hung. The fix was to stream short status messages at each transition. As the retry is triggered the user sees the system report that a contradiction was found and the query is being rewritten, then that it is re-searching with the refined query, then that it is validating the new evidence, and if the data void persists, that it is routing to authority contacts. The same channel surfaces the Plan-and-Execute reasoning trace on multi-hop queries. The work now reads as deliberate rather than stalled, and if the retry confirms the contradiction instead of resolving it, the user already understands why the answer is about to say the records and the physical reality disagree.

The append-only reducer bug and the rest of these state decisions have their own post: [A LangGraph bug that hid behind an append-only reducer](https://ridingbluewaves.hashnode.dev/a-langgraph-bug-that-hid-behind-an-append-only-reducer).

---

### Axing the duplicate synthesiser

One redundancy we caught during a latency audit: two separate LLM calls were generating what was functionally the same response.

The LangGraph pipeline had a Synthesiser node that made a full Bedrock call and wrote an `auditFinding` into state. The API route then made a second `streamText` call that produced the response the user actually saw. The Synthesiser's output was never surfaced on the clean path. It was written into state and effectively superseded by the streaming call. We were paying for an LLM round-trip and several hundred output tokens per query for a result that was discarded.

Removing the Synthesiser from the graph topology and routing the Guardrail output straight to the UI Hook eliminated the node. The graph went from five nodes to four, and the clean path got noticeably faster. (The synthesiser code still exists in the repo, but it is no longer wired into the compiled graph.) This is the kind of redundancy you accumulate when you build a pipeline iteratively. The Synthesiser was added early when the topology was being laid out, and the route's `streamText` was added later without anyone revisiting whether the intermediate synthesis step was still earning its place.

---

### The zero-trust vision problem

The original pipeline treated a citizen-uploaded photo as high-trust evidence. If a user uploaded a picture of a pothole and the Vision agent classified it as severe damage with high confidence, that was enough to trigger the contradiction loop against official NHAI documents. On the surface this seemed right. If someone is standing in front of a destroyed road, their photo should matter. But it creates a trust inversion, where an anonymous, unverified submission is allowed to override a legally-binding government record.

Citizen evidence is not worthless. It just belongs in a different trust tier. An NHAI completion certificate has a legal basis and a traceable chain of accountability. A photo uploaded through a web form has neither. Treating them as equal-weight evidence is also gameable: anyone wanting to manufacture false contradictions could do so with a single photo.

The redesign introduced a fourth trust level, `citizen-claim`, alongside `verified-spatial`, `legally-binding`, and `official-portal`. The Vision agent now tags every photo finding with this trust level and prepends a `[CITIZEN CLAIM]` marker to the finding text, along with an explicit "this is an unverified citizen submission" note. The Guardrail's contradiction detector explicitly ignores citizen-claim vision evidence and will not trigger the retry loop on it. Instead, when a high-confidence citizen vision finding arrives, the Guardrail attaches a `pendingAction` to the state: a "Flag this coordinate for official PWD review" action that surfaces below the response. The citizen's finding is still acknowledged and shown, the synthesis sees it clearly framed as an unverified claim and hedges accordingly, and the pipeline does not raise a spurious "official record contradicted" alert.

| Trust Level | Source | Contradiction trigger | Synthesis weight |
|---|---|---|---|
| `legally-binding` | NHAI completion certificates, contract PDFs | Yes | Primary |
| `official-portal` | PWD directories, PMGSY OMMAS | Yes | Primary |
| `verified-spatial` | GPS telemetry, offline edge DB | Yes | Supporting |
| `citizen-claim` | User-uploaded photos | **No** | Acknowledged, hedged |

This also closes a subtler and more dangerous failure. Falsely flagging a stretch of road as critically contradicted on the strength of one bad-angle photo could steer a citizen away from a perfectly safe route. In this domain a false positive is not merely noise, it is potentially harmful advice.

The guardrail, the jurisdiction gates, and this zero-trust vision layer get their own focused write-up here: [How we stopped our RAG agent from inventing engineers](https://ridingbluewaves.hashnode.dev/how-we-stopped-our-rag-agent-from-inventing-engineers).

---

### Data freshness vs what the data actually contains

Our primary source corpus covers ten data types from NHAI, MoRTH, PMGSY, state PWD directories, and a manually-curated authority matrix. Coverage by field:

| Data field | Coverage | Notes |
|---|---|---|
| Contractor name | ~95% | Near-complete across sources |
| Road type | ~95% | Near-complete |
| Maintenance responsibility | ~80% | Some state roads missing |
| Last maintenance date | ~40% | Mostly inferred, not directly reported |
| Per-km condition (PCI/IRI) | ~0% | Lives in NHAI RAMS, requires institutional credentials |

That last number matters. The most useful question a citizen can ask is "how bad is this road right now?", and the honest answer is that the data to answer it precisely does not exist in any public database.

Our engineering response was inferential routing. When a user asks "when was NH-44 last relayed?", no government field answers that directly. But contract PDFs contain completion dates, contract modes, and Defect Liability Period clauses. Under an EPC contract the DLP is five years from completion. Under HAM or BOT it is fifteen. Given the completion date and the contract mode, we can derive the DLP expiry, the date after which the concessionaire's maintenance obligation ends and NHAI becomes directly responsible. That is not the same as "last relaying date," but it is a grounded, citable inference from real documents rather than a guess.

Two things make this work. First, the Router classifies maintenance-timeline questions ("last relaying," "when was it resurfaced," "DLP," "completion date") as `tender_search` rather than `condition`, with an explicit routing rule, because the answer lives in contract data, not in condition-monitoring systems. Second, VIGIA's main response system prompt (the one wrapped around the streaming answer, since the standalone synthesiser was removed) carries explicit inferential-mapping rules: it instructs the model to infer last-relaying from the project completion date, to apply the 5-year-EPC / 15-year-HAM-BOT DLP rule, to state the inference chain transparently, and never to invent a date that is not in the evidence.

![Inferential routing versus the condition-data gap](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247940357/960455dd-0eb6-484b-b772-a49f9c3ab1ba.png)

The CAG audit reports are the only other public source of actual pavement condition data. The Comptroller and Auditor General samples road stretches during audits and publishes IRI readings. These are in our planned secondary sources, along with Parliament Q&A archives, where MPs' questions surface per-project expenditure figures not published elsewhere.

---

### Offline edge resilience

Road infrastructure incidents tend to happen where connectivity is worst. A pothole on a remote state highway, a collapse on a mountain pass, exactly where a citizen most needs to know who to call and exactly where a cloud-only app fails them.

The architecture has two tiers. The cloud tier is the full pipeline: pgvector semantic search, LangGraph reasoning, LLM synthesis. The edge tier is a geofenced SQLite database, `vigia_edge.db`, containing emergency contacts, PWD helpdesk numbers, and nearby road segments for the user's locality, each row tagged with a geohash.

![Two-tier cloud and offline-edge architecture](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247942079/0435b247-b9e7-403c-bab2-f0aa611428eb.png)

The edge database is generated by a Lambda that partitions India into geohash-4 tiles, queries the master database per tile, and ships compact gzipped SQLite files through CloudFront. On the device, lookups are done by geohash prefix. The server resolves the user's coordinate to a geohash and matches rows on the leading characters of that hash, so a query returns the contacts and roads in the surrounding cell rather than requiring an exact tile hit. Connectivity is tracked by the `useNetworkStatus` hook, which probes `/api/health` with a HEAD request every 15 seconds on a 3-second timeout. If the probe fails the app is offline. If latency exceeds 2 seconds it enters degraded mode, where it still attempts the cloud pipeline but with a shortened timeout and an automatic fallback to the edge database if that times out. Fully offline, the app returns emergency contacts and PWD helpline numbers for the current location (it needs a GPS fix to do the geohash lookup), which are precisely the data points that matter when there is no time to wait for an LLM.

Geohash-4 was a deliberate balance. Finer precision means smaller tiles but more of them and more cache misses as a user moves. Coarser means bigger files. Geohash-4 keeps a typical tile small while covering a usefully large local area per download.

---

### Global applicability: tiered country routing

The Admin agent applies a tiered country model that activates from GPS coordinates.

India gets the full pipeline: NHAI contract data, PMGSY rural roads, PWD personnel directories, the Authority Matrix, and the complete LangGraph reasoning chain. For coordinates outside India, the agent resolves the country and routes to an international engine. It queries the World Bank Projects API and any available Open Contracting Data Standard (OCDS) procurement data for that country, mapping whatever it finds into the same NormalizedEvidence schema as the India path, with a data-quality tier attached to the confidence score. Where neither returns project data, the response falls back to OpenStreetMap road geometry and says so plainly.

Crucially, the non-India path hard-aborts personnel queries. There is no equivalent of India's PWD directory for most countries, so rather than risk fabricating "the engineer responsible for this road in Nigeria," the agent returns a clean out-of-jurisdiction message pointing the user to their national transport ministry. Refusing to answer is the correct behaviour here.

---

### What we would do differently, and what we already shipped behind a flag

Two retrieval improvements are worth calling out, but honesty requires a correction to how I'd normally frame them. Both are already implemented and wired into the codebase, gated behind environment variables, rather than being purely future work.

The retrieval stack blends keyword (FTS5) and pgvector semantic results. On top of that, a cross-encoder reranker (Cohere Rerank v3) is already integrated on the tender-search path. It takes the candidate chunks, scores each directly against the query, and returns the top results. It is gated on `COHERE_API_KEY`, and if the key is absent, the code degrades gracefully to passthrough ordering. So the reranker is built and callable today. What remains is enabling it across all retrieval paths and validating the latency budget in production.

Similarly, response caching is already in the request path, backed by Upstash Redis with a 24-hour TTL, gated on `UPSTASH_REDIS_REST_URL`. One honest caveat: it is currently a normalised-string cache, not a true semantic one. It keys on the lowercased, punctuation-stripped query text, so "who is the contractor for NH-44" hits the cache on a repeat but a reworded variant does not. GPS- and image-attached queries are inherently unique and effectively bypass it. The upgrade I'd actually prioritise is making this cache semantic, embedding the query and matching on cosine similarity above a high threshold (around 0.95), so paraphrases of common questions collapse onto the same cached answer. That would take repeat-query latency from seconds to milliseconds for a large fraction of text-only citizen lookups.

---

### Closing thoughts

If there is a single lesson in all of this, it is that hallucination is not one problem you solve once. It shows up in a different disguise at every layer: thin retrieval fills a gap with a fake name, a citizen photo overrides a legal record, a keyword match returns an officer from the wrong state, an append-only reducer hands a stale result to the wrong check. Each one needed its own guard, and most of them only surfaced when we ran the full pipeline end to end rather than testing a node in isolation.

The pattern that kept paying off was pushing decisions down to the cheapest deterministic layer that could make them. A `source_type` filter instead of a smarter prompt. A regex geographic gate in FTS5 instead of trusting the model to respect jurisdiction. An integer retry counter instead of rewinding message history. The LLM does the reasoning it is good at, and plain TypeScript holds the line everywhere a wrong answer would be dangerous.

The code is open at [**github.com/VigiaLabs/vigia-public**](https://github.com/VigiaLabs/vigia-public). If any of this was useful, a star helps, and issues or questions are welcome. This is one article in an ongoing series on building VIGIA, so more is on the way.


---

## 🧰 The stack, from zero — and what we chose it over

The whole toolbox for a hallucination-resistant RAG system, and the road not taken:

- **Orchestration — LangGraph.js (stateful graph, conditional edges) over a linear LCEL chain or autonomous agents.** A chain can't detect bad retrieval and retry; autonomous agents blow the latency/cost budget. A conditional graph branches on evidence quality within a fixed budget.
- **Vector store — pgvector on Postgres with an HNSW index over an exact scan or a separate vector DB.** One table + a `source_type` discriminator; **HNSW** gives ~log-n approximate nearest-neighbour (the vector analogue of a B-tree).
- **Hybrid retrieval + rerank — FTS5 keyword + pgvector semantic, then a Cohere Rerank v3 cross-encoder** (gated on `COHERE_API_KEY`, degrading to passthrough). Bi-encoder recall → cross-encoder precision: classic **two-stage retrieval**.
- **Validation — Zod `safeParse` at each agent boundary (Shadow Normalization)** over trusting raw agent output, with **`Promise.allSettled`** fan-out for fault isolation.
- **LLM — Amazon Bedrock (nova-lite)** for entity extraction on the ReWOO path.
- **Cache — Upstash Redis (24h TTL)**, honestly a normalized-string cache today (semantic upgrade planned).
- **Edge/offline — geohash-4 SQLite tiles shipped via CloudFront**, with a health-probe degraded mode. TypeScript on **AWS Lambda** throughout.

## 🚢 From demo to production

- **Scale pgvector** — replicas, then shard by `source_type`/region; tune the HNSW recall/latency knobs.
- **Roll the reranker across all retrieval paths** and validate the latency budget.
- **Make the cache semantic** — embed the query, hit on cosine ≥ 0.95 so paraphrases collapse.
- **Observability** on retrieval quality and LLM spend, with the async faithfulness scorer promoted to a monitored SLI.

---

## 🎓 CS Fundamentals — study companion

*This is the **master study section** for VIGIASearch — the deep-dive spans nearly every CS core: **System Design** (orchestration, RAG), **DBMS** (vector databases, indexing, ANN search), **DSA** (dependency DAGs, reducers), **Computer Networks** (edge/CDN, health probes, geohash), **Concurrency**, and **ML Systems** (anti-hallucination). The four companion posts each drill into one slice; this section connects them. It's a near-complete "design a production RAG system" interview prep on its own.*

### System Design — orchestration & the framework choice
- **State machine vs linear chain vs autonomous agents.** The three rejected options map to a spectrum of *control*: a **linear chain (LCEL)** is a fixed pipeline with no ability to detect bad retrieval and retry; **AutoGen/CrewAI** are fully autonomous multi-agent loops — powerful but unpredictable, unbounded latency, unbounded cost. **LangGraph** sits in the middle: an explicit **directed graph with conditional edges**, so the path is deterministic but *state-dependent* (clean retrieval → synthesis; low-confidence → rewrite-and-retry; still failing → helpline fallback). The lesson: **match the amount of autonomy to your latency/safety budget.** A 5-second citizen query does not want a 30-second open-ended agent loop.
- **Conditional routing = a finite state machine over data.** The graph is an FSM whose transitions depend on evidence quality — the single most reusable pattern for "reliable LLM pipeline."
- **Removing a redundant node (the duplicate synthesiser).** Two LLM calls were producing the same answer; one was discarded. Cutting it (5 nodes → 4) is a **latency + cost** win found by auditing the critical path. Iterative systems accumulate this redundancy — profiling to find and delete it is real engineering.

### DBMS — vector databases & retrieval
- **Vector database (pgvector).** Documents are embedded into high-dimensional vectors; retrieval is **nearest-neighbour** by cosine similarity. This is the DBMS heart of any RAG system. Know: embeddings, similarity metrics (cosine/dot/L2), and that this is **approximate nearest neighbour (ANN)** search at scale.
- **ANN indexing (HNSW / IVF).** Exact nearest-neighbour over millions of vectors is O(N) per query. Production vector search uses **HNSW** (Hierarchical Navigable Small World — a layered proximity graph giving ~log N search) or **IVF** (inverted-file clustering). This is the vector analogue of a B-tree: an index that trades a little recall for a massive speedup.
- **The discriminator column.** A single indexed `source_type` column lets one physical table serve many logical sources with cheap filtering — a schema-design choice (single-table + discriminator vs many tables) that keeps semantic search unified while allowing targeted routing.
- **Hybrid search + reranking.** The stack blends **keyword (FTS5)** and **semantic (pgvector)** results, then a **cross-encoder reranker** (Cohere Rerank v3) re-scores candidates directly against the query. Bi-encoders (embeddings) are fast but coarse; cross-encoders are slow but precise — so you retrieve wide with the cheap method and rerank the top-K with the expensive one. Classic **two-stage retrieval**.
- **Caching & TTL.** A Redis response cache with a 24-hour **TTL**. The honest caveat — it's a *normalised-string* cache (exact-ish match), not *semantic* — is a great cache-design talking point: a **semantic cache** embeds the query and hits on cosine similarity ≥ ~0.95, so paraphrases collapse onto one cached answer. Cache-key design determines hit rate.

### Data Structures & Algorithms
- **ReWOO plan = a dependency DAG** run by topological order with parallelism on independent steps (see the ReWOO companion). Latency = critical path.
- **Reducers = fold; append-only ⇒ read newest with `.findLast()`** (see the state-bug companion). The append-only reducer bug is the flagship DSA story.

### Computer Networks — edge, CDN, resilience
- **Two-tier cloud/edge architecture.** Full pipeline in the cloud; a geofenced **SQLite** DB (`vigia_edge.db`) on the edge for offline. This is the **offline-first / edge-computing** pattern: keep the latency- and availability-critical data (emergency contacts) local because incidents happen where connectivity is worst.
- **Geohash spatial indexing.** India is partitioned into **geohash-4** tiles; lookups match on the geohash *prefix*. Geohash encodes lat/long into a string where **shared prefix = spatial proximity**, turning a 2-D range query into a 1-D prefix match (indexable like any string). Geohash-4 is a deliberate **granularity trade-off**: finer = smaller tiles but more cache misses as the user moves; coarser = bigger downloads.
- **CDN distribution.** Edge DBs are gzipped and shipped via **CloudFront** — content delivered from geographically near **PoPs** to cut latency. Compression (gzip) trades CPU for bandwidth.
- **Health probing & degraded mode.** `useNetworkStatus` sends a **HEAD** request to `/api/health` every 15s with a 3s timeout. HEAD = headers only, no body — the cheapest liveness check. Latency > 2s → **degraded mode** (try cloud with a short timeout, fall back to edge). This is a **circuit-breaker / graceful-degradation** design: detect failure fast, degrade instead of hang.
- **Scheduled ingestion (CRON/EventBridge).** Daily refresh via EventBridge CRON — batch **ETL** on a schedule, the freshness mechanism for third-party data.

### Concurrency
- **`Promise.allSettled` fan-out** for the three agents (fault isolation vs `Promise.all`'s fail-fast) — see the state-bug companion.
- **Boundary validation (Shadow Normalization)** with Zod `safeParse` — parse-don't-validate at each agent edge.

### ML Systems — anti-hallucination (summary; full detail in the guardrail companion)
- **Self-RAG** (grade retrieval, 0.5 threshold), **CRAG** (bounded rewrite-and-retry), **Chain-of-Verification** (async faithfulness scoring), **trust tiers** (zero-trust citizen photos), and **inferential routing** (deriving DLP-expiry from contract completion date + contract type when the raw field doesn't exist) — grounded inference over honest data gaps.

### The through-line
- **Push every decision to the cheapest deterministic layer that can make it.** A `source_type` filter instead of a smarter prompt; a regex geo-gate instead of trusting jurisdiction; an integer retry counter instead of rewinding history. The LLM reasons where it's good; plain code holds the line wherever a wrong answer is dangerous. This one sentence is the whole system's design philosophy.

**Interview Q&A.**
1. *Design a RAG system that won't hallucinate.* → Unified vector store + hybrid retrieval → grade retrieval (Self-RAG) → correct on weak retrieval (CRAG, bounded) → strict "answer only from evidence" synthesis → async faithfulness check → refuse-and-redirect on voids.
2. *Why an orchestration graph over a linear chain or an autonomous agent?* → A chain can't detect bad retrieval and retry; autonomous agents are unbounded in latency/cost; a state graph with conditional edges is deterministic yet can branch on evidence quality within a fixed budget.
3. *How does a vector DB find nearest neighbours fast?* → ANN indexes: HNSW (layered proximity graph, ~log N) or IVF (cluster + probe); trade a little recall for large speedups over O(N) exact search.
4. *Bi-encoder vs cross-encoder — why use both?* → Bi-encoders (embeddings) are fast/coarse for wide recall; cross-encoders are slow/precise for reranking the top-K — two-stage retrieval.
5. *How do you make an app work where connectivity is worst?* → Offline-first edge tier (local SQLite), spatially indexed by geohash prefix, shipped via CDN, with health-probe-driven graceful degradation.
6. *What is geohash and why prefix-match?* → Interleaves lat/long into a string where shared prefix ⇒ spatial proximity, so a 2-D lookup becomes an indexable 1-D prefix query.
7. *How would you make a query cache handle paraphrases?* → Make it semantic: embed the query, match on cosine similarity above a high threshold, instead of exact/normalised-string keys.

**Quick-review flashcards.**
- Orchestration: chain (rigid) < LangGraph FSM (conditional) < autonomous agents (unbounded).
- Vector DB → ANN via HNSW/IVF; cosine similarity.
- Two-stage retrieval: bi-encoder recall → cross-encoder rerank.
- Cache: string-key (exact) vs semantic (embed + cosine ≥ 0.95); TTL for freshness.
- Edge: offline SQLite + geohash-prefix + CDN + HEAD health probe + degraded mode.
- Philosophy: cheapest deterministic layer wins; LLM only where safe.

### ⚖️ This vs That — the architecture decisions, and the roads not taken

| Decision | Alternatives | Why this choice |
|---|---|---|
| **LangGraph state machine** | Linear chain (LCEL); autonomous agents (AutoGen/CrewAI) | A chain can't detect garbage retrieval and retry; autonomous loops blow the latency/cost budget and are unpredictable. A conditional graph branches on evidence quality within a fixed budget. |
| **Unified pgvector store** | Three keyword-indexed silos | Keyword/regex silos miss paraphrases and can't span sources; one embedded table makes everything semantically searchable, with a `source_type` filter for precision. |
| **ReWOO plan-and-execute** | ReAct observe-loop | ReAct = N sequential LLM calls + error compounding; ReWOO = one plan + deterministic parallel DAG (~2× faster, auditable). |
| **Layered deterministic guardrail** | A single "be careful" synthesis prompt | Prompts are probabilistic; thresholds, geo-regexes, and trust tiers are deterministic and testable — one guard per failure disguise. |
| **Offline edge tier (SQLite + geohash + CDN)** | Cloud-only | Incidents happen where connectivity is worst; local emergency contacts must survive zero network. |
| **Delete the duplicate synthesiser** | Keep both LLM calls | Two calls produced one answer; the discarded one was pure latency + token cost. |
| **Inferential routing over honest gaps** | Fabricate a "last relaid" date; or say nothing | Per-km condition data doesn't exist publicly; deriving DLP expiry from completion date + contract type is a grounded, citable inference instead of a guess or a dead end. |

**The one to defend:** *push every decision to the cheapest deterministic layer that can make it — LLM where it reasons well, plain code where a wrong answer is dangerous.* Everything else (the state graph, the unified store, ReWOO, the layered guardrail, the geo-gates, the integer retry counter) is a specific application of that single principle. It's the sentence that ties the whole system together and the strongest thing to say in an interview about it.
