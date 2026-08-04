*Every post in the VIGIA engineering series ends with a "🎓 CS Fundamentals" study companion — the concepts, tied to real code, with interview Q&A. This guide is the hub that ties them together into an actual interview-prep track. It's the thing I wish someone had handed me: how to turn a portfolio of real projects into offers from companies like Microsoft and Amazon.*

*I wrote it for myself first. If you're a junior reading this later — you're welcome here too. Bookmark it, come back every few weeks, and use the series as your worked examples.*

*Plan on roughly **8 weeks — about 56 days** — to work through it end to end at a steady pace (faster and slower tracks are below).*

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

## How long does this take?

**Budget about 8 weeks — roughly 56 days — at a steady ~2 focused hours a day.** End to end, the guide is about **150 practice problems plus ~40 hours of reading, system-design drills, and mock rounds.** Pick the track that fits your runway:

- **Intensive — ~4 weeks (28 days):** 4–5 hrs/day. For when placement season is already on you.
- **Steady (recommended) — ~8 weeks (56 days):** ~2 hrs/day. Sustainable alongside classes or a job.
- **Relaxed — ~12 weeks (84 days):** ~1 hr/day. Start early, avoid burnout.

Whatever the pace, protect the *order* of the plan below — patterns before problems, coding before mocks. Rushing DP in week 2 or skipping mocks in week 7 is how the timeline actually slips.

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

## The 150-problem practice list

The bridge above tells you *which* patterns your projects already taught you. This is the actual grind — a curated ~150 problems covering the full interview surface, grouped by pattern, each tagged **E**asy / **M**edium / **H**ard. It mirrors the well-known NeetCode-150 spine (the highest-signal set) so you can cross-reference video solutions anywhere. Each group notes the VIGIA concept it echoes, so the reading and the grind reinforce each other.

**Rules of the grind:** do them *by pattern*, not randomly. Medium is the interview default — spend most time there. If a problem takes over 30–40 minutes, read the solution, understand it, and *re-solve it from scratch two days later*. Understanding beats count.

### Arrays & Hashing — *ties to: hash maps everywhere, the append-only reducer bug (Mobile Ep1 / VIGIASearch)*
Contains Duplicate (E) · Valid Anagram (E) · Two Sum (E) · Group Anagrams (M) · Top K Frequent Elements (M) · Product of Array Except Self (M) · Encode and Decode Strings (M) · Longest Consecutive Sequence (M)

### Two Pointers — *ties to: producer/consumer scanning, ring buffers (Edge Ep4)*
Valid Palindrome (E) · Two Sum II Input Array Is Sorted (M) · 3Sum (M) · Container With Most Water (M) · Trapping Rain Water (H)

### Sliding Window — *ties to: EMA temporal smoothing, frame windows (Edge Ep5)*
Best Time to Buy and Sell Stock (E) · Longest Substring Without Repeating Characters (M) · Longest Repeating Character Replacement (M) · Permutation in String (M) · Minimum Window Substring (H) · Sliding Window Maximum (H)

### Stack — *ties to: FSM voice loop, expression evaluation (Mobile Ep2)*
Valid Parentheses (E) · Min Stack (M) · Evaluate Reverse Polish Notation (M) · Generate Parentheses (M) · Daily Temperatures (M) · Car Fleet (M) · Largest Rectangle in Histogram (H)

### Binary Search — *ties to: nearest-neighbour / sorted lookups in pgvector (VIGIASearch)*
Binary Search (E) · Search a 2D Matrix (M) · Koko Eating Bananas (M) · Find Minimum in Rotated Sorted Array (M) · Search in Rotated Sorted Array (M) · Time Based Key-Value Store (M) · Median of Two Sorted Arrays (H)

### Linked List — *ties to: queues, streaming buffers, LRU (IDE Ep3)*
Reverse Linked List (E) · Merge Two Sorted Lists (E) · Linked List Cycle (E) · Reorder List (M) · Remove Nth Node From End (M) · Copy List With Random Pointer (M) · Add Two Numbers (M) · Find the Duplicate Number (M) · LRU Cache (M) · Merge K Sorted Lists (H) · Reverse Nodes in K-Group (H)

### Trees — *ties to: knowledge graphs, hierarchies, recursion (SAGE Ep2)*
Invert Binary Tree (E) · Maximum Depth of Binary Tree (E) · Diameter of Binary Tree (E) · Balanced Binary Tree (E) · Same Tree (E) · Subtree of Another Tree (E) · Lowest Common Ancestor of a BST (M) · Binary Tree Level Order Traversal (M) · Binary Tree Right Side View (M) · Count Good Nodes (M) · Validate BST (M) · Kth Smallest in a BST (M) · Construct Tree from Preorder/Inorder (M) · Binary Tree Max Path Sum (H) · Serialize and Deserialize Binary Tree (H)

### Tries — *ties to: geohash prefix lookups, autocomplete (VIGIASearch edge tier)*
Implement Trie (M) · Design Add and Search Words (M) · Word Search II (H)

### Heap / Priority Queue — *ties to: RRF fusion, top-K reranking (VIGIASearch)*
Kth Largest Element in a Stream (E) · Last Stone Weight (E) · K Closest Points to Origin (M) · Kth Largest Element in an Array (M) · Task Scheduler (M) · Design Twitter (M) · Find Median from Data Stream (H)

### Backtracking — *ties to: plan enumeration, speculative branches (SAGE Ep3)*
Subsets (M) · Combination Sum (M) · Permutations (M) · Subsets II (M) · Combination Sum II (M) · Word Search (M) · Palindrome Partitioning (M) · Letter Combinations of a Phone Number (M) · N-Queens (H)

### Graphs — *ties to: dependency DAGs, provenance graphs (VIGIASearch ReWOO / SAGE)*
Number of Islands (M) · Clone Graph (M) · Max Area of Island (M) · Pacific Atlantic Water Flow (M) · Surrounded Regions (M) · Rotting Oranges (M) · Walls and Gates (M) · Course Schedule (M) · Course Schedule II (M) · Redundant Connection (M) · Number of Connected Components (M) · Graph Valid Tree (M) · Word Ladder (H)

### Advanced Graphs — *ties to: routing, scheduling, weighted paths (VIGIASearch multi-hop)*
Network Delay Time (M) · Reconstruct Itinerary (H) · Min Cost to Connect All Points (M) · Swim in Rising Water (H) · Alien Dictionary (H) · Cheapest Flights Within K Stops (M)

### 1-D Dynamic Programming — *ties to: sequence reasoning, anticipatory compute (SAGE Ep3)*
Climbing Stairs (E) · Min Cost Climbing Stairs (E) · House Robber (M) · House Robber II (M) · Longest Palindromic Substring (M) · Palindromic Substrings (M) · Decode Ways (M) · Coin Change (M) · Maximum Product Subarray (M) · Word Break (M) · Longest Increasing Subsequence (M) · Partition Equal Subset Sum (M)

### 2-D Dynamic Programming — *ties to: alignment, edit-distance-style matching*
Unique Paths (M) · Longest Common Subsequence (M) · Best Time to Buy/Sell Stock with Cooldown (M) · Coin Change II (M) · Target Sum (M) · Interleaving String (M) · Longest Increasing Path in a Matrix (H) · Distinct Subsequences (H) · Edit Distance (M) · Burst Balloons (H) · Regular Expression Matching (H)

### Greedy — *ties to: scheduling decisions, resource budgets (Edge real-time)*
Maximum Subarray (M) · Jump Game (M) · Jump Game II (M) · Gas Station (M) · Hand of Straights (M) · Merge Triplets to Form Target (M) · Partition Labels (M) · Valid Parenthesis String (M)

### Intervals — *ties to: time windows, temporal coherence checks (VIGIASearch guardrail)*
Insert Interval (M) · Merge Intervals (M) · Non-Overlapping Intervals (M) · Meeting Rooms (E) · Meeting Rooms II (M) · Minimum Interval to Include Each Query (H)

### Math & Geometry — *ties to: coordinate/geohash math, matrix ops*
Rotate Image (M) · Spiral Matrix (M) · Set Matrix Zeroes (M) · Happy Number (E) · Plus One (E) · Pow(x, n) (M) · Multiply Strings (M) · Detect Squares (M)

### Bit Manipulation — *ties to: INT8 quantization, feature flags, CPUID detection (Edge Ep3)*
Single Number (E) · Number of 1 Bits (E) · Counting Bits (E) · Reverse Bits (E) · Missing Number (E) · Sum of Two Integers (M) · Reverse Integer (M)

**That's ~150 problems.** If you clear the Mediums here and can explain the complexity of each, you're at the bar for most Microsoft and Amazon coding rounds. Track them in a spreadsheet with three columns: *first-try / needed-hint / re-solve-clean* — the third column is the one that predicts interview performance.

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

**Answering before the question is asked** · *Think Big / Customer Obsession*
- **S:** A crisis query against SAGE needed an answer in tens of milliseconds, but the reasoning it required took far longer to compute on demand.
- **T:** Serve a genuinely useful answer inside a 50ms budget without pre-canning responses.
- **A:** I built an anticipatory sandbox that speculatively computes the likely near-futures *ahead* of the question, so when the crisis query lands the answer is already materialised — computing a future that hasn't happened yet.
- **R:** Sub-50ms responses on reasoning that would otherwise take seconds. I moved the expensive work off the critical path by predicting what would be asked.

**Two graphs instead of one** · *Dive Deep / Are Right, A Lot*
- **S:** SAGE needed both a record of *what happened* and a model of *what it believes* — and cramming both into one knowledge graph kept corrupting each with the other's semantics.
- **T:** Stop belief-updates from rewriting the immutable event history (and vice versa).
- **A:** I split it into two graphs — an append-only event graph and a mutable belief graph linked by provenance — so each has one clear job and one consistency model.
- **R:** Clean separation: history stays auditable, beliefs stay revisable. The insight was that "one graph" was a modelling convenience hiding two different consistency requirements.

**Not letting raw noise into the store** · *Insist on the Highest Standards*
- **S:** The easy path was to embed raw incoming signals straight into SAGE's vector store.
- **T:** Keep retrieval quality high as the volume of noisy, low-value raw signals grew.
- **A:** I made ingestion *synthesis-first*: raw signals are distilled into structured evidence before anything is embedded, so raw noise never touches the vector store.
- **R:** Retrieval stayed sharp instead of degrading as data grew. I paid an up-front cost to protect the thing every downstream answer depends on.

**Two frames per second wasn't good enough** · *Dive Deep / Bias for Action*
- **S:** The edge model ran at ~2 FPS on CPU-only hardware — too slow to be real-time, with no GPU available.
- **T:** Get usable frame rates without new hardware.
- **A:** I profiled the pipeline end-to-end, found the real bottlenecks, and attacked them with INT8 quantization and SIMD (NEON/UDOT) vectorization plus zero-copy handoffs, rather than guessing.
- **R:** ~2 FPS to ~7 FPS on the same silicon. The win came from *measuring first* — the intuitive bottleneck wasn't the real one.

**Locks were the wrong tool** · *Invent and Simplify*
- **S:** Sharing camera frames between a producer and consumer thread with mutexes caused stalls and priority inversion in a real-time loop.
- **T:** Hand frames between threads without blocking the real-time path.
- **A:** I replaced the lock with a **seqlock ring buffer** — the reader retries on a version mismatch instead of waiting, so the writer never blocks.
- **R:** Removed the stalls and the inversion. The simplification was recognising that a real-time producer must never wait on a consumer.

**Being honest about the tail** · *Earn Trust / Are Right, A Lot*
- **S:** Our first latency claims used the *average*, which looked great and hid the frames that actually missed deadlines.
- **T:** Report performance in a way that reflected real-time behaviour, not a flattering number.
- **A:** I switched the whole conversation to **P95/P99 tail latency** and tuned with PREEMPT-RT so the worst case, not the mean, met the deadline.
- **R:** Honest, defensible numbers and a system that held its deadline under load. I chose the metric that could hurt us because it was the true one.

**Prep discipline:** keep a one-line index of ~8 stories, and for each, the 2–3 principles it can serve. In the room you're not recalling a story — you're picking which rehearsed one best answers "tell me about a time you…". Bank one genuine *failure* and what you changed after it; every loop asks for it.

---

## Amazon vs Microsoft: tuning the last 20%

Same fundamentals, different emphasis.

**Amazon** — the loop is **Leadership-Principle-driven end to end**; even coding rounds close with behavioral questions, and a "bar-raiser" weights culture fit heavily. Expect ~2 coding + 1–2 design + heavy LP behavioral. Study the 16 LPs and map each story to 2–3. Common in practice: *Customer Obsession, Ownership, Dive Deep, Bias for Action, Are Right A Lot, Invent and Simplify.* They probe hard — "why, what was the data, what would you change" — so **Dive Deep is your differentiator**.

**Microsoft** — more classically technical and collaborative. Coding rewards **thinking out loud and treating the interviewer as a pair**: clarify, state assumptions, discuss trade-offs before coding. Behavioral centres on **growth mindset** and learning from failure rather than a fixed principle list — lead with how you *changed your mind on evidence*.

**Universal tells** (both companies): clarify before you code, narrate your reasoning, state complexity unprompted, test your own code with an example, and admit your solution's limits. Silence while you think reads as being stuck — externalise it.

---

*This guide is a companion to the VIGIA engineering series. If it helped, the code behind every story is open at [github.com/VigiaLabs/vigia-public](https://github.com/VigiaLabs/vigia-public) — and more is on the way.*
