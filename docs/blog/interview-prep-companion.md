*Every post in the VIGIA engineering series ends with a "🎓 CS Fundamentals" study companion — the concepts, tied to real code, with interview Q&A. This guide is the hub that ties them together into an actual interview-prep track. It's the thing I wish someone had handed me: how to turn a portfolio of real projects into offers from companies like Microsoft and Amazon.*

*I wrote it for myself first. If you're a junior reading this later — you're welcome here too. Bookmark it, come back every few weeks, and use the series as your worked examples.*

---

## First, an honest answer: will reading get you the offer?

No — and anyone who tells you a blog series alone will is lying. But the reading covers the leg most people neglect. A big-tech loop is a **three-legged stool**, scored semi-independently. You can be brilliant at two legs and still get rejected on the third.

| Leg | Weight | Does reading build it? |
|---|---|---|
| **Coding / DSA** (live, 30–45 min, correct-and-fast) | The biggest filter, especially for new grads | **No.** Reading gives you the vocabulary, not the reflex. Only solving ~150 problems, timed, builds this. |
| **System Design** | Heavy for SDE-II+, shows up even for new grads | **Yes — this is where projects win.** Most new grads have never designed a real distributed system. The VIGIA series is five of them. |
| **Behavioral** | Often the deciding round — 50%+ of an Amazon loop | **Raw material, yes; framing, no.** Your project stories are gold once they're rewritten as STAR answers tagged to a principle. |

So use this guide to make your **explanations sharp** and your **design + behavioral rounds unbeatable** — and put the raw hours into LeetCode *in parallel*. The reading is the multiplier, not the substitute.

---

## How this guide maps to the series

Each engineering post already teaches its topic in depth. Read the post for the *why*; use this guide for the *interview shape* of the same idea.

| If you're studying… | Read these posts | Interview topics they cover |
|---|---|---|
| **Computer Architecture, real-time, DSA** | Edge / *Riding the Blue Wave* (Ep 1–6) | SIMD, memory hierarchy, ring buffers, sliding window, P99 latency |
| **DBMS, graphs, ML systems** | SAGE (Ep 0–5) | Graph data models, provenance, speculative execution, statistics |
| **ACID, event-driven, crypto** | RoadIntelligence IDE (Ep 0–5) | Transactions, idempotency, hash-chained ledgers, signatures |
| **Software architecture, OS, networks** | VIGIA Mobile (Ep 0–5) | Modularity/DAGs, FSMs, BLE/ECDH, MQTT QoS, TEE key storage |
| **System design, RAG, vector DBs** | VIGIASearch (5 posts) | LangGraph orchestration, pgvector/HNSW, ReWOO, anti-hallucination |

---

## An 8-week study plan

Scale the weeks to your runway; the **order** matters more than the exact count.

- **Weeks 1–2 — Patterns, not problems.** Arrays, hashing, two-pointers, sliding window, stacks. ~4 problems/day. Re-read Edge Ep5 (sliding window / deque) and the VIGIASearch state-bug post alongside — you'll recognise the patterns in shipped code.
- **Weeks 3–4 — Trees, graphs, heaps.** BFS/DFS, topological sort, top-K with heaps. Pair with the ReWOO post (DAG + topo sort) and SAGE's graph posts. Add one **system-design drill** per weekend.
- **Weeks 5–6 — DP, intervals, binary search.** The hardest reflex — do fewer, understand each fully. Meanwhile write out **all your STAR stories** and say them aloud until they're 90 seconds, not 4 minutes.
- **Week 7 — Mock loops.** Timed coding with a peer or Pramp; one full system-design mock. Drill the complexity table until Big-O is instant.
- **Week 8 — Spaced review + polish.** Re-solve what you failed, not new problems. Re-read the rapid-fire. Rehearse behavioral answers against the actual principle lists. Sleep.

---

## The DSA → LeetCode bridge

Every concept the series explains maps to a coding-round pattern. This is how you convert "I understand a ring buffer" into "I can solve the problem that tests it." Grind the problems; the **Source** column is where to re-read the intuition.

| Concept from the series | Interview pattern | Representative problems | Source |
|---|---|---|---|
| EMA / temporal smoothing over a frame window | Sliding window (fixed & variable) | Sliding Window Maximum · Longest Substring Without Repeating · Minimum Window Substring | Edge Ep5 |
| Seqlock ring buffer, producer/consumer | Queue / deque, circular buffer | Design Circular Queue · Implement Queue via Stacks · Sliding Window Max | Edge Ep4/6 |
| ReWOO plan = task dependency graph | Topological sort on a DAG | Course Schedule I/II · Alien Dictionary · Parallel Courses | VIGIASearch (ReWOO) |
| RRF fusion / reranking results | Heaps, top-K, merge k-sorted | Top K Frequent Elements · Kth Largest · Merge k Sorted Lists | VIGIASearch (pillar) |
| Two knowledge graphs, provenance links | Graph BFS/DFS, union-find | Number of Islands · Clone Graph · Cheapest Flights Within K Stops | SAGE Ep2 |
| pgvector nearest-neighbour lookup | Binary search, sorting | Search in Rotated Sorted Array · K Closest Points to Origin | VIGIASearch (pillar) |
| Append-only reducer, read-latest bug | Array semantics, prefix/suffix | Product of Array Except Self · Subarray Sum Equals K | VIGIASearch (state bug) |
| Multi-module DAG, no cycles | Cycle detection, topological order | Course Schedule · Graph Valid Tree · Redundant Connection | Mobile Ep1 |
| Hash-chained reward ledger | Hashing, design, running state | Design HashMap · Design Twitter · LRU Cache | IDE Ep3 |
| Geohash prefix spatial lookup | Tries / prefix trees | Implement Trie · Word Search II · Design Search Autocomplete | VIGIASearch (pillar) |
| FSM voice loop (states + transitions) | State machines, simulation, stack | Decode String · Basic Calculator · Asteroid Collision | Mobile Ep2 |
| Speculative / anticipatory execution | DP, memoization, pruning | Word Break · Coin Change · Decode Ways | SAGE Ep3 |

**How to use the Source column:** when a pattern won't click, open the post and re-read *why that structure was chosen in real code*. Grounding an abstract pattern in a system you (or I) actually shipped is the fastest way to make it stick — and it doubles as a design-round talking point.

---

## Complexity cheat sheet

The question that follows every coding answer: *"what's the time and space?"* Say it without thinking.

| Operation / structure | Time | Space | Note |
|---|---|---|---|
| Hash map get / put | O(1) avg, O(n) worst | O(n) | Worst on collision; the default "make it faster" tool |
| Binary search (sorted) | O(log n) | O(1) | Needs a sorted / monotonic predicate |
| Sort (merge / heap / quick avg) | O(n log n) | O(n) / O(1) / O(log n) | Quicksort worst O(n²); mergesort stable |
| Heap push / pop | O(log n) | O(n) | Top-K in O(n log k) |
| BFS / DFS on a graph | O(V + E) | O(V) | Topo sort, shortest unweighted path |
| Dijkstra (with heap) | O(E log V) | O(V) | Non-negative weights |
| Trie insert / search (length L) | O(L) | O(alphabet · nodes) | Prefix queries, geohash-like |
| Sliding window | O(n) | O(k) | Each element enters/leaves once |
| 1-D dynamic programming | O(n · states) | O(n) → O(1) rolling | Often space-reducible |
| ANN search (HNSW) | ~O(log n) | O(n · M) | Approximate; the vector-DB answer |

---

## System-design drill cards

The design round rewards structure, not trivia. Say this framework out loud and follow it:

> **R-E-C-B** — **R**equirements (functional + non-functional, *ask before you draw*) → **E**stimate (QPS, storage, read/write ratio) → **C**omponents (draw the boxes, name the data store) → **B**ottleneck-and-defend (find the limit, pick one trade-off, justify it with CAP / consistency / cost).

Interviewers score the *process*, not the "right" diagram. Each card below takes a VIGIA system one level past what its post states — the version an interviewer pushes you to.

**Scale the RAG portal to 10M queries/day** *(from VIGIASearch)*
- Estimate: 10M/day ≈ 115 QPS average, ~500 QPS peak; read-heavy.
- Bottleneck: LLM calls (cost + latency), not retrieval.
- Levers: semantic cache (embed the query, hit on cosine ≥ 0.95) to collapse paraphrases; CDN for static; async faithfulness scoring off the hot path.
- Scale pgvector: read replicas, then shard by `source_type`/region; tune the HNSW index (recall vs latency).
- Defend: cache-hit ratio vs staleness (24h TTL).

**Design offline-first for 1M rural devices** *(from the edge tier)*
- Requirement: works with zero connectivity; emergency contacts must never fail.
- Partition: geohash-4 tiles; ship gzipped SQLite via CDN PoPs.
- Sync: delta updates on reconnect; version each tile; discuss last-write-wins vs CRDTs.
- CAP: choose **AP** — availability over consistency at the edge.
- Defend: tile granularity (cache misses vs download size).

**Design a tamper-evident reward ledger** *(from the reward ledger)*
- Core: hash-chained append-only log; each entry hashes the previous.
- Idempotency: a dedup key per event so at-least-once delivery becomes effectively-once.
- Concurrency: optimistic / conditional writes to prevent double-spend (a TOCTOU race).
- Scale: partition by user; periodic Merkle checkpoints for fast verification.
- Defend: strong consistency here vs eventual elsewhere — money needs linearizability.

**Design device↔cloud trusted telemetry** *(from the BLE handshake)*
- Identity: a per-device asymmetric keypair in a TEE; sign every payload.
- Trust: key pinning / trust-on-first-use; the server verifies a signature, not a shared secret.
- Freshness: nonces + timestamps to kill replay.
- Scale: mTLS or a signed-token gateway; rotate keys; keep a revocation list.
- Defend: proof-of-possession vs bearer tokens (the blast radius of a leak).

---

## Core CS rapid-fire

The fundamentals fired at you between rounds. The series covers each in depth; this is the fast-recall version. Read the answer, then close your eyes and say it back.

**Operating Systems**
- **Process vs thread** — Process = isolated address space; thread = execution unit sharing the process's memory. Threads switch cheaper but need synchronisation.
- **Deadlock's four conditions** — Mutual exclusion, hold-and-wait, no preemption, circular wait. Break any one. (Edge Ep6 hits the related priority-inversion, fixed by priority inheritance.)
- **Mutex vs semaphore** — Mutex = ownership, one holder. Semaphore = a counter permitting N holders.
- **Virtual memory** — Maps virtual→physical pages via the page table + TLB; enables isolation and memory beyond RAM via swapping.

**Computer Networks**
- **TCP vs UDP** — TCP: connection, ordered, reliable, congestion-controlled (HTTP/SSE). UDP: fire-and-forget, low latency. MQTT layers reliability on top (Mobile Ep5).
- **URL → page** — DNS → TCP handshake → TLS handshake → HTTP request → response → render. Name each layer.
- **SSE vs WebSocket vs polling** — One-way server push over HTTP · full-duplex · repeated requests. Pick by directionality and overhead.
- **TLS handshake** — Negotiate cipher → verify cert against a CA → key exchange (ECDHE) → derive session keys → encrypted. Forward secrecy from ephemeral keys — the same idea as the BLE handshake.

**DBMS**
- **ACID** — Atomicity, Consistency, Isolation, Durability. The reward ledger leans on A + D; the double-spend guard is isolation.
- **Isolation levels** — Read uncommitted → read committed → repeatable read → serializable. Higher = fewer anomalies, less concurrency.
- **Normalization vs denormalization** — Remove redundancy (writes/joins) vs duplicate for read speed. A RAG unified store is a denormalized read model.
- **Why B-tree indexes** — Sorted for O(log n) range + point queries, shallow for few disk seeks. Vector DBs swap in HNSW/IVF for approximate nearest-neighbour.

**Architecture & distributed**
- **CAP theorem** — Under partition, choose Consistency or Availability. Edge tier → AP; ledger → CP. Name your choice per component.
- **Memory hierarchy & locality** — Registers → L1/L2/L3 → RAM → disk, each ~10× slower. Temporal + spatial locality make caches work (the deque-over-array choice in Edge Ep5).
- **SIMD / vectorization** — One instruction over a vector of values (NEON/UDOT in Edge Ep3); the hardware basis of fast INT8 inference.
- **Symmetric vs asymmetric crypto** — One shared key (fast, AES) vs a keypair with no shared secret (ECC). Mobile Ep3 is the exact case where a non-exportable key *forces* asymmetric.

---

## The behavioral story bank

The round that decides it. Every answer is **S**ituation → **T**ask → **A**ction → **R**esult, told in ~90 seconds, "I" not "we", one metric at the end. Below are five worked examples from the VIGIA build — the technique matters more than the specific stories, so use them as templates for your own projects. Each is tagged to the Amazon Leadership Principle it best demonstrates; reuse a story across principles by shifting the emphasis.

**The one-character bug** · *Dive Deep*
- **S:** A LangGraph retry appeared to run but changed nothing — evidence stayed stale after every correction pass.
- **T:** Find why a day of "working" retries produced no different answer, with no failing unit test pointing at it.
- **A:** I traced the state channel to an append-only reducer: `.find()` was reading the first (stale) evidence, not the newest. I reproduced it end-to-end, then fixed it with `.findLast()`.
- **R:** Retries became effective; I added an end-to-end test so the bug class couldn't return. One character, one day — reliability lives in the state, not the diagram.

**The trust inversion** · *Earn Trust / Ownership*
- **S:** Our pipeline let an anonymous citizen photo override a legally-binding government road record.
- **T:** Stop a gameable failure where one bad-angle photo could flag a safe road as hazardous.
- **A:** I redesigned evidence into trust tiers — citizen claims acknowledged but hedged, unable to trigger contradictions, routed instead to a "flag for official review" action.
- **R:** Eliminated the trust inversion and the spurious-alert class while still surfacing citizen input. I treated a subtle correctness risk as seriously as a crash.

**Symmetric was impossible** · *Are Right, A Lot / Invent and Simplify*
- **S:** We planned a shared-HMAC pairing between the phone and the Raspberry Pi.
- **T:** Implement it against a hardware-backed, non-exportable key — and it wouldn't build.
- **A:** I recognised the constraint as a signal, not a blocker: you can't share a secret the hardware refuses to export. I moved us to an asymmetric ECDH/ECDSA handshake where no secret is shared and the session key is derived, not sent.
- **R:** A strictly more secure design — replay-resistant, forward-secret — that the constraint pointed straight at. The obstacle was the answer.

**Cutting latency in half** · *Bias for Action / Customer Obsession*
- **S:** Multi-hop citizen queries took 9–12s on a ReAct agent — too slow for a public portal.
- **T:** Hit a ~5s budget without losing accuracy on cross-source queries.
- **A:** I replaced ReAct with a ReWOO plan-and-execute loop: one planning call emits a dependency DAG, then a deterministic executor runs independent steps in parallel.
- **R:** Cross-reference queries dropped to ~5.5s, and execution became auditable and hallucination-resistant because a fixed runner, not the model, drives it. Faster *and* safer.

**Deleting my own code** · *Frugality / Insist on the Highest Standards*
- **S:** A latency audit showed two LLM calls generating the same answer — a synthesiser node whose output was silently discarded.
- **T:** Decide whether to keep a component I'd built earlier.
- **A:** I removed the node (5 → 4), routed the guardrail output straight to the UI, and confirmed nothing on the clean path depended on it.
- **R:** Cut an entire LLM round-trip and hundreds of tokens per query. I killed code I was attached to because it stopped earning its place.

**Prep discipline:** keep a one-line index of ~8 stories, and for each, the 2–3 principles it can serve. In the room you're not recalling a story — you're picking which rehearsed one best answers "tell me about a time you…". Bank one genuine *failure* and what you changed after it; every loop asks for it.

---

## Amazon vs Microsoft: tuning the last 20%

Same fundamentals, different emphasis.

**Amazon** — the loop is **Leadership-Principle-driven end to end**; even coding rounds close with behavioral questions, and a "bar-raiser" weights culture fit heavily. Expect ~2 coding + 1–2 design + heavy LP behavioral. Study the 16 LPs and map each story to 2–3. Common in practice: *Customer Obsession, Ownership, Dive Deep, Bias for Action, Are Right A Lot, Invent and Simplify.* They probe hard — "why, what was the data, what would you change" — so **Dive Deep is your differentiator**.

**Microsoft** — more classically technical and collaborative. Coding rewards **thinking out loud and treating the interviewer as a pair**: clarify, state assumptions, discuss trade-offs before coding. Behavioral centres on **growth mindset** and learning from failure rather than a fixed principle list — lead with how you *changed your mind on evidence*.

**Universal tells** (both companies): clarify before you code, narrate your reasoning, state complexity unprompted, test your own code with an example, and admit your solution's limits. Silence while you think reads as being stuck — externalise it.

---

*This guide is a companion to the VIGIA engineering series. If it helped, the code behind every story is open at [github.com/VigiaLabs/vigia-public](https://github.com/VigiaLabs/vigia-public) — and more is on the way.*
