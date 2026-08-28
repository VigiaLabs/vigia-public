# The VIGIA interview companion: learn CS fundamentals by defending a real system

*A long-form preparation guide for Android, backend, systems and general software-engineering
interviews. It connects data structures, operating systems, networking, databases, distributed systems,
security and system design to decisions—and mistakes—in the VIGIA projects.*

Reading an article will not get anyone a large-tech offer. Coding skill requires timed practice;
system-design skill requires drawing and defending systems; behavioural skill requires concise evidence
from work you actually did. A project helps because it gives abstract concepts consequences. A race is not
just a textbook interleaving when it can pay twice. At-least-once delivery is not trivia when it can speak
the same collision warning three times. Process death is not an Android footnote when it erases a device
claim halfway through pairing.

That is how to use this companion: do not memorise VIGIA's framework list. Reconstruct the requirements,
identify the invariant, find the failure mode, choose a data structure or protocol, state the trade-off,
and describe how you would prove and operate it. That reasoning transfers to any interview.

---

## What interviewers are actually sampling

Most software-engineering loops sample several dimensions independently:

| Dimension | What the interviewer is looking for | How this guide helps | What still needs practice |
|---|---|---|---|
| Coding and data structures | Correct code, useful decomposition, complexity, tests, communication under time | Grounds patterns in real components | Timed problem solving in the interview language |
| CS fundamentals | Mental models for memory, concurrency, networking, storage and security | Builds connected explanations instead of definitions | Rapid recall and follow-up questions |
| System design | Requirements, estimates, boundaries, data model, failure handling, trade-offs and operations | Provides five worked design surfaces | Whiteboard mocks with hostile follow-ups |
| Mobile/Android depth | Lifecycle, background limits, Compose state, persistence, permissions and performance | Uses the audited Android app | Real-device debugging and platform documentation |
| Behavioural | Ownership, judgment, conflict, learning, measurable result | Turns defects and redesigns into honest stories | Your own 90-second STAR narratives |

The weighting varies by company, level, team and year. Do not prepare for a mythical single “FAANG
interview.” Read the current job description and recruiter material, but build durable fundamentals: they
survive changes in company names and round formats.

## A ten-week preparation loop

Two focused hours most days is enough for a serious first pass. Compress or stretch the calendar; preserve
the feedback loop.

| Weeks | Coding | Fundamentals/design | Communication |
|---|---|---|---|
| 1–2 | Arrays, hashing, two pointers, sliding window, stack/queue | Complexity, memory, Kotlin/Java collections, Android lifecycle | Explain a solved problem before coding it |
| 3–4 | Linked lists, trees, tries, heaps | Processes/threads, coroutines, locks, state machines, backpressure | One project deep dive; one failure story |
| 5–6 | Graphs, topological sort, union-find, shortest paths | TCP/TLS/HTTP, SSE/MQTT/FCM, databases, transactions, indexes | One 45-minute system-design mock each week |
| 7–8 | Binary search, intervals, greedy, 1-D/2-D DP | Idempotency, consistency, queues, caching, security/key management | Two coding mocks and behavioural drill |
| 9 | Mixed timed sets; re-solve failures | Full VIGIA mobile and hazard-system designs | Full mock loop; calibrate answers to level |
| 10 | No new pattern unless a gap is obvious | Review weak mental models and operational trade-offs | Concision, sleep, logistics, questions for interviewer |

Maintain a failure log with four columns: problem or question, why the first approach failed, the corrected
principle, and the date you re-solved/re-explained it without help. Count clean re-solves, not videos watched.

---

## Part I — Complexity and data structures, connected to production code

### Big-O is a growth model, not a stopwatch

`O(n)` describes how work grows as input grows; it hides constants, cache locality, allocation, I/O and
contention. An `O(n)` scan over a contiguous array can beat an `O(log n)` tree lookup for practical sizes.
An Android UI can jank even when an algorithm is asymptotically good if it allocates on every frame.

Know how to derive, not recite:

- Consecutive loops add: `O(n) + O(n) = O(n)`.
- Nested dependent loops often multiply: `n × n = O(n²)`.
- Halving the search space gives `O(log n)`.
- Visiting vertices and edges once gives `O(V + E)`.
- Keeping only the best `k` elements with a heap gives `O(n log k)`.
- Amortised analysis explains why an array append is `O(1)` on average despite occasional resize.

In VIGIA's SSE UI path, repeatedly creating `answer = answer + delta` can copy all prior characters for
each delta. For `n` total characters delivered in tiny chunks, cumulative copying can approach `O(n²)` and
cause allocation/recomposition pressure. A bounded builder/buffer with batched state publication changes the
constant factors and the growth behaviour visible to the UI.

**Interview follow-up:** “Would a StringBuilder alone fix it?” Not completely. It reduces copying, but a
producer can still outrun the consumer. Bound total answer/event/line size, apply backpressure, batch UI
updates, set idle/total deadlines and cancel the network call.

### Hash maps, sets and idempotency

A hash table maps a key through a hash function into buckets. Expected lookup/insert is `O(1)` with a good
distribution and controlled load factor; worst case is `O(n)`. Equality and hash-code consistency are part
of correctness.

For hazard delivery, an in-memory `HashSet<eventId>` suppresses duplicates only until process death and can
grow without bound. A production design uses a unique database constraint on a stable event ID in the same
transaction that inserts the inbox row. The database becomes the durable set. An LRU may reduce repeated
database reads, but it is an optimisation—not the correctness boundary.

Practice: Two Sum, Group Anagrams, Longest Consecutive Sequence, Top K Frequent Elements, Subarray Sum
Equals K, LRU Cache. Explain expected/worst complexity and the effect of adversarial keys.

### Queues, deques and backpressure

A queue is FIFO; a stack is LIFO; a deque supports both ends. They appear in BFS, work scheduling, audio
output and sliding windows. A bounded queue forces a policy when full: suspend producer, drop oldest, drop
newest, coalesce, reject or spill durably. `Channel.UNLIMITED` avoids making that decision and transfers the
failure into memory exhaustion.

For speech output, priority complicates FIFO. A critical warning may pre-empt conversation, but “clear the
queue” needs an effect policy: persist both messages, cancel current TTS safely, mark whether it may resume,
deduplicate the warning and honour expiry/audio focus. A priority queue orders by severity/deadline, but
starvation requires ageing or separate bounded lanes.

Practice: Implement Queue Using Stacks, Design Circular Queue, Sliding Window Maximum, Task Scheduler,
Find Median from Data Stream.

### Trees, heaps and tries

Balanced search trees preserve `O(log n)` ordered lookup/range operations. Heaps provide `O(1)` peek and
`O(log n)` insert/remove for min/max priority, ideal for top-k and scheduling. Tries index prefixes in
`O(L)` time for key length `L`, trading memory for prefix queries.

Geohash turns a two-dimensional location into a hierarchical prefix. Nearby locations often share a prefix,
which supports tile partitioning and trie/B-tree-style prefix lookup, but cells have boundary artefacts:
always query neighbouring cells and perform an exact distance check. “Use geohash” is incomplete without
precision, polar/boundary behaviour and false-positive filtering.

Practice: Binary Tree Level Order Traversal, Validate BST, Kth Smallest in BST, Serialize/Deserialize Tree,
K Closest Points, Merge K Sorted Lists, Implement Trie, Word Search II.

### Graphs: modules, plans and distributed dependencies

A graph is vertices plus edges. BFS finds shortest paths in unweighted graphs; DFS explores components and
supports cycle detection; topological sorting orders a DAG; Dijkstra handles non-negative weighted edges;
union-find maintains dynamic connectivity.

The Android module graph is a DAG, but acyclic does not mean well designed. `feature:copilot` can depend on
`feature:maps` and `feature:pairing` without forming a cycle, while still increasing coupling and change
impact. A strong interview answer discusses fan-in/fan-out, ownership, API stability and build impact—not
only topological order.

A ReWOO execution plan is also a DAG: nodes are tool operations, edges are data dependencies. Independent
nodes can run concurrently; topological execution respects prerequisites. Ask what happens when a node
fails: fail all, continue partial, retry idempotently or take a corrective branch? The data structure does
not choose the product policy.

Practice: Number of Islands, Clone Graph, Course Schedule I/II, Graph Valid Tree, Redundant Connection,
Network Delay Time, Cheapest Flights Within K Stops, Alien Dictionary.

### Dynamic programming, greedy and intervals

Dynamic programming applies when a problem has overlapping subproblems and optimal substructure. Define the
state, transition, base cases and evaluation order before code. Memoisation is top-down caching; tabulation is
bottom-up. Many 1-D DPs reduce space when only recent states are needed.

Greedy algorithms make a locally optimal choice and require a proof—exchange argument, cut property or
invariant—not intuition. Interval problems model meeting rooms, retry windows, event expiry and telemetry
time ranges; sorting endpoints often exposes the solution.

Practice: House Robber, Coin Change, Word Break, Longest Increasing Subsequence, Longest Common Subsequence,
Edit Distance, Jump Game, Gas Station, Merge Intervals, Meeting Rooms II.

### A compact 150-problem spine

Use a recognised curated list such as NeetCode 150 as a spine, but track patterns and re-solves. A balanced
distribution is roughly: arrays/hashing 8; two pointers 5; sliding window 6; stack 7; binary search 7;
linked lists 11; trees 15; tries 3; heaps 7; backtracking 9; graphs 13; advanced graphs 6; 1-D DP 12;
2-D DP 11; greedy 8; intervals 6; math/geometry 8; bit manipulation 7. Medium problems are the default
training surface. If stuck after a serious bounded attempt, study the solution, close it, reproduce it, then
re-solve after two days and again after two weeks.

---

## Part II — Operating systems and concurrency

### Process, thread, coroutine and lifecycle

A process owns an isolated virtual address space and OS resources. Threads are scheduled execution units
sharing process memory. A coroutine is a language/runtime abstraction: it can suspend without occupying a
thread, but CPU work still runs on a thread and blocking calls still block one.

On Android:

- Activity recreation may preserve a ViewModel, but process death destroys it.
- `StateFlow` and `SharedFlow` are in-process; neither is durable.
- Room/DataStore/files can survive process death; reboot/app update semantics depend on storage/migration.
- WorkManager persists deferrable work intent; execution time is inexact.
- A foreground service is user-visible ongoing work under strict start/type/permission policy—not a way to
  make the process immortal.
- Force stop is stronger: scheduled work/receivers generally remain stopped until user interaction.

**VIGIA application:** pending device claim, hazard inbox and payout idempotency ID must survive process
death; a live BLE GATT connection and ephemeral ECDH session key should not. Persist restart-safe state, then
re-establish transient resources through an idempotent state machine.

### Safety, liveness and state machines

A safety property says something bad never happens: never two active recorders; never cash out twice; never
accept telemetry from an unclaimed peer. A liveness property says something good eventually happens: a
bounded retry reaches Ready or an explainable terminal error; a persisted alert becomes visible; a pending
payout reconciles.

An enum is not automatically an FSM. A useful state machine defines:

1. states and events;
2. valid transition table;
3. guards/invariants;
4. effects and their owner;
5. deadlines/cancellation;
6. durable checkpoints;
7. retry/idempotency;
8. terminal and recovery paths.

For BLE: `Idle → Scanning → Connecting → Discovering → Bonding → Authenticating → Ready`, with every
operation bounded. If `connect()` catches its own structured failure, calls `disconnect()` and resets to
`Idle`, the service's retry loop cannot distinguish failure from success. Error propagation is part of the
state-machine API.

### Races, locks and structured concurrency

A race exists when correctness depends on scheduling. “If key absent, generate and store” can generate twice
when two callers interleave. “If payout button enabled, submit” can submit twice across two devices. UI
debounce is not a transaction.

Know the tools:

- Mutex: mutual exclusion with ownership.
- Semaphore: count of concurrent permits.
- Atomic operation/CAS: indivisible state transition; foundation of lock-free structures.
- Database unique constraint/transaction: durable concurrency boundary.
- Structured concurrency: child work belongs to a scope; cancellation/failure policy is explicit.
- Supervisor semantics: one child failure need not cancel siblings—use only when partial success is valid.

Deadlock requires mutual exclusion, hold-and-wait, no preemption and circular wait. Break one. Also know
starvation, livelock, priority inversion, memory visibility and the difference between thread safety and
coroutine safety.

**Interview drill:** barge-in occurs as SSE emits completion and TTS fires `onDone`. Write the events and
possible interleavings. Choose a single transition reducer/generation ID so stale callbacks cannot affect the
new turn; cancellation closes response/TTS/recorder exactly once.

---

## Part III — Networking and distributed systems

### From URL to authenticated response

For `https://api.example/path`, explain: DNS resolves name; a connection is established (TCP for HTTP/1.1
and HTTP/2, QUIC/UDP for HTTP/3); TLS authenticates the server and derives traffic keys; HTTP carries method,
headers and body; intermediaries may proxy/cache; the application authenticates/authorises the caller.

TLS server authentication, OAuth bearer tokens, device signatures and AWS IoT client certificates solve
different questions:

- TLS: is this the intended server and is transport confidential/integrity-protected?
- User token: which user/session is calling and what scopes/claims apply?
- Device proof: does the caller possess a registered device key for this exact fresh request?
- Client certificate/SigV4: may this IoT client connect/publish/subscribe under broker policy?

### SSE vs WebSocket vs MQTT vs FCM

| Mechanism | Shape | Strength | Cost/failure to discuss |
|---|---|---|---|
| SSE | Server→client stream over HTTP response | Simple incremental text/events; HTTP intermediaries | reconnect/event IDs, proxy timeouts, bounded parsing/backpressure |
| WebSocket | Full-duplex long-lived connection | Interactive bidirectional protocol | custom heartbeat/reconnect/backpressure, background/battery |
| MQTT | Brokered pub/sub with QoS/session concepts | Topic fan-out, constrained clients | client auth, duplicate/reorder, stable session ID, broker policy |
| FCM | OS-managed mobile push | Background-aware ingress | no unlimited runtime, priority policy, token rotation, deletion/gap sync |

Choose from requirements, not fashion. VIGIA uses SSE for one response stream and MQTT/FCM for alerts.
The production mistake would be to infer end-to-end reliability from transport names.

### Delivery semantics and idempotency

“Exactly once” is usually scoped. MQTT QoS 2 can suppress duplicate MQTT protocol delivery within its
exchange; it cannot atomically include your Room insert, notification, TTS and server acknowledgement.

Build effectively-once effects:

1. producer assigns a stable event/operation ID;
2. consumer validates and inserts under a unique constraint;
3. state change and outbox/checkpoint commit in one transaction;
4. side effect has status/generation and can resume safely;
5. retries reuse the same ID;
6. reconciliation repairs ambiguous outcomes.

Payment timeout is the classic ambiguity: the server may have committed even though the client saw no
response. A new retry ID can pay twice. The same idempotency key plus server unique constraint returns the
existing outcome.

### Timeouts, retry and backoff

Every remote/hardware stage needs a deadline. A retry policy states:

- which failures are transient (timeout, selected 5xx/429, disconnect) versus semantic (401/403, invalid
  signature, already claimed under policy);
- per-attempt and overall deadline;
- exponential backoff with random jitter to avoid synchronised retry storms;
- maximum attempts/circuit-breaker or user action;
- idempotency and cancellation;
- observable retry reason/count/next time.

An unbounded scan is not resilience; it is a coroutine that can never satisfy liveness. Retrying a 403 is
not resilience; it is load and battery waste.

### Consistency and authority

CAP says that during a network partition a distributed system cannot provide both linearizable consistency
and availability for every operation. It does not mean label the whole product “AP” or “CP.” Choose per
operation:

- Cached hazard history: available and possibly stale; show freshness/expiry.
- Current BLE presence: physical/link observation, ephemeral—not server or Room truth.
- Device ownership: server-authoritative and fail closed for privileged action.
- Wallet balance: cached display may remain available; payout authorization is server-transactional.
- Chat draft/history: local durability can favour availability and later sync.

Know read-your-writes, monotonic reads, eventual consistency, linearizability, optimistic concurrency,
quorum basics, outbox/inbox, saga and reconciliation. Use the weakest model that preserves the invariant.

---

## Part IV — DBMS and storage

### ACID and transaction boundaries

- Atomicity: all or none.
- Consistency: application/database invariants remain true.
- Isolation: concurrent transactions appear according to the chosen isolation level.
- Durability: committed data survives specified failures.

For payout, a useful backend transaction atomically checks authoritative available balance, records the
idempotency key and immutable ledger entries, and writes an outbox event. Calling Stripe cannot usually be
inside the database's atomic boundary; a state machine and webhook reconciliation bridge that distributed
boundary.

For alert ingress, validation may precede the transaction; `INSERT eventId UNIQUE` plus inbox state commits
before notification. If the process dies after commit but before notification, recovery can find pending
rows. If notification occurs before commit, a crash can repeat it with no durable acknowledgement.

### Indexes and query plans

B-tree indexes support ordered equality/range lookup in roughly `O(log n)` with high fan-out and few disk
pages. Hash indexes target equality. Composite-index order matters; an index on `(scope, sequence)` supports
gap queries by scope. Indexes accelerate reads but cost storage and write amplification.

Vector indexes such as HNSW trade exactness and memory/build cost for approximate nearest-neighbour latency.
Do not say HNSW is simply `O(log n)` as a universal guarantee; discuss recall, `efSearch`, graph degree,
filter interaction and benchmark evidence.

### Schema migration and backup

Production mobile databases evolve while users retain old data. Room schema export plus explicit auto/manual
migrations and tests from every supported version are release inputs. `fallbackToDestructiveMigration()`
turns a missing migration into data deletion and is unacceptable for chats/events without explicit product
consent and recovery.

Android backup can include databases, files and preferences. Encryption at rest does not answer whether data
should move to a new device. Define an allow-list/exclusions for tokens, wrapped key blobs, pairing state,
FCM/MQTT state, payment state and sensitive history; test backup and device transfer.

---

## Part V — Security fundamentals through the mobile threat model

### Threat model before controls

List assets (account, device ownership, wallet/rewards, location, conversations, alert integrity), actors
(stolen-phone holder, malicious nearby BLE peer, rooted-device malware, compromised Pi, network attacker,
abusive account, compromised backend/vendor), entry points and trust boundaries. Then enumerate abuse cases,
mitigations, residual risk, detection and revocation/recovery.

Security vocabulary must be exact:

- Hash: one-way digest; not encryption.
- MAC/HMAC: integrity/authenticity under one shared secret; not non-repudiation.
- Signature: private-key proof over exact bytes; public verification; still needs canonicalisation/freshness.
- Encryption: confidentiality; authenticated encryption also protects integrity.
- ECDH: key agreement; **not authentication by itself**.
- HKDF: derives context-bound key material from input keying material; not password hashing.
- Nonce: unique/fresh value used according to protocol; not automatically secret.

### Android Keystore: three different claims

1. A Keystore-generated P-256 private key is non-exportable to the app API.
2. Its operations may be implemented by StrongBox, TEE or another reported security level.
3. Malware able to invoke the authorised app/key may still request signatures unless user authentication or
   other policy blocks it.

These are different. Inspect `KeyInfo`; decide user authentication, attestation, rotation and revocation;
bind server authorization narrowly.

The wallet's Ed25519 implementation is different: generate in software, AES-GCM-wrap the PKCS#8 blob with a
Keystore key, persist ciphertext, decrypt into app memory to sign. It is protected at rest against blob theft
without Keystore access; it is not a TEE-resident Ed25519 signing key. Backup exclusions and memory exposure
remain relevant.

### Authenticated BLE protocol

An interview-quality protocol binds:

- protocol version and roles;
- both identities and ephemeral public keys;
- both nonces/challenges;
- QR/provisioning authority and selected physical peer;
- transcript signature/key confirmation;
- HKDF labels/context and separate directional keys;
- message counters/nonces for AEAD;
- timeout, replay cache/counter, downgrade rejection;
- key rotation/revocation and lost-device recovery.

Fresh ephemeral ECDH keys plus erasure provide forward secrecy. A static Keystore ECDH identity key does
not. A QR pin is only as trustworthy as the QR's provenance; attacker-controlled QR replacement pins the
attacker. Server ownership claim is part of the protocol, not an optional network follow-up.

### OAuth/OIDC and redirects

Know authorization code + PKCE at a high level: generate verifier/challenge; send request with state/nonce;
identity provider authenticates; redirect returns code; app verifies state and exchanges code with verifier;
OIDC token claims are validated by the responsible component. Verified HTTPS App Links bind a domain to an
app and reduce redirect interception. A broad custom scheme such as `vigia:` can be claimed by another app;
if a private-use scheme is necessary, use reverse-domain naming and exact host/path with state/PKCE.

Production auth must fail closed. A missing identity-provider configuration may show a configuration error;
it must never select a demo repository that accepts plausible credentials.

---

## Part VI — Android and mobile-system depth

### Compose and UDF

Declarative UI means the rendered tree is a function of state. UDF sends immutable state down and events up.
The difficult parts are state ownership, effect lifetime and recomposition stability—not syntax.

- `remember`: survives recomposition, not recreation/process death.
- `rememberSaveable`: saves compatible small UI state across recreation/process restoration; not secrets or
  large durable state.
- ViewModel: screen-level state/effects across configuration change; not durable process storage.
- `collectAsStateWithLifecycle`: controls collection by lifecycle; does not automatically cancel an upstream
  producer launched elsewhere.
- `@Immutable`/`@Stable`: behavioural promises to Compose; incorrect annotations can hide invalidation.

Explain why an 1,100-line ViewModel is risky: high fan-in, unrelated reasons to change, complex constructor,
state/effect races and hard test setup. The fix is cohesive workflows/state machines, not blindly one class
per function or a mandatory module called domain.

### Permissions and background execution

Ask dangerous/sensitive permissions in context, explain the benefit, handle denial and revocation, and
degrade without fabricating data. Location permission can change after a Flow starts; checking once and then
waiting forever is a lifecycle bug.

Choose background mechanism by requirement:

- immediate short FCM handling: validate/persist/notify;
- longer deferrable persistent sync: WorkManager;
- user-visible ongoing permitted work: correctly typed foreground service with notification;
- active-screen work: lifecycle/ViewModel coroutine;
- exact user-visible alarm: AlarmManager only when policy/permission/use case justifies it.

### Performance

Measure cold/warm/hot startup, frame timing/jank, memory, battery/network and P95/P99 operation latency on
physical release builds. Baseline Profiles precompile representative hot paths; Macrobenchmark produces
evidence. R8 changes code and reflection behaviour, so smoke-test Amplify, Room, Hilt, MQTT and Stripe in the
minified candidate. Never promise a generic performance percentage without this app's before/after data.

---

## Part VII — Five system-design drills

Use **R-E-D-F-O-R**:

1. **Requirements:** functional, non-functional, out of scope, abuse/privacy.
2. **Estimates:** users/devices, QPS, event size/rate, retention, peak factor, latency/battery budget.
3. **Data and APIs:** identifiers, schema, authority, idempotency, versioning.
4. **Flow/components:** hot path first, then async/background.
5. **Overload/failure:** partition, duplicate, reorder, slow dependency, process/region loss, backpressure.
6. **Reliability/operations:** SLI/SLO, alert, runbook, rollout, kill switch, reconciliation.

### Drill 1: Design road-hazard delivery for one million vehicles

Clarify event producers, regional/geospatial targeting, expiry, severity and latency SLO. Give every hazard a
stable ID/version and signed provenance. Ingest to a durable regional log; spatially index/partition; fan out
to broker/push; client converges MQTT/FCM into a transactional inbox. Apply backpressure and collapse updates
for the same hazard. Use sequence checkpoints/gap API, not hope. Discuss hot geohash cells, regional failover,
privacy-preserving location subscriptions, abuse moderation and P99 ingress-to-visible metrics.

Follow-ups: How do you prevent duplicate TTS? What if FCM arrives before MQTT with older version? What if a
region is isolated? How do expired alerts disappear? What if notification permission is denied?

### Drill 2: Design secure phone-to-edge pairing

Requirements: nearby association, manufacturer identity, account ownership, offline behaviour, recovery,
firmware/app compatibility. QR carries version/device ID/key fingerprint and authority signature. CDM candidate
must bind to QR identity. Run authenticated ephemeral ECDH; claim server-side with account token + device proof
+ idempotency; persist only restart-safe checkpoints. Define `OfflineRestricted`. Cover wrong peer, QR swap,
MITM, replay, compromised Pi, stolen phone, reset/resale, rotation/revocation and staged protocol migration.

### Drill 3: Design an idempotent reward payout

The server owns balance/eligibility/rate. Client requests expiring quote, persists idempotency key, creates
intent, handles user action, then observes `Processing` until verified webhook/reconciliation produces
`Settled` or terminal/reversed state. Database transaction enforces unique idempotency and ledger conservation;
outbox bridges Stripe. Webhook signatures, duplication, reorder and retries are normal. Reconciliation compares
provider and internal states. Metrics include settlement latency, ambiguous state age and reconciliation drift.

### Drill 4: Design the streaming voice copilot

Budget stages: VAD end detection, upload/STT, backend first token, sentence boundary, TTS first audio. Use a
turn/generation ID so stale callbacks cannot mutate new turns. Bounded SSE parser and sentence queue apply
backpressure. FSM owns recorder, request and TTS; barge-in cancels one generation exactly once. Persist partial
answer in batches. Handle call/audio focus, background policy, language, network loss and unsafe/expired context.
Measure time-to-first-useful-audio and completion at percentiles.

### Drill 5: Take the Android app from prototype to production

Start with release invariants, not module diagram: fail-closed auth/claim, truthful context, durable alert,
non-destructive migration/backup, disabled-until-correct payout. Build CI/tests/observability beside fixes.
Then decompose high-fan-in workflows, migrate archived map stack, update dependencies, benchmark, sign and
promote through internal/closed/staged tracks. Feature flags/kill switches for economic/network/speech paths;
same immutable artefact promoted; runbooks and error budgets decide rollout speed.

---

## Part VIII — Behavioural stories without theatre

Use **Situation → Task → Action → Result → Reflection**. Keep the situation short; spend time on your decision,
alternatives, evidence and result. Say “I” for your contribution and “we” for team outcome. Never invent a
metric or imply a design was shipped when it was only specified.

### Story: correcting your own production claim

- Situation: documentation described strict feature leaves, hardware-backed keys and reliable dual-path
  alerts.
- Task: determine whether the repository earned those claims before production/public explanation.
- Action: traced real dependency/data/lifecycle paths, ran prod lint/tests, compared platform/cloud contracts,
  documented fail-open and durability gaps, and reordered the roadmap around correctness.
- Result: implementation-grade stop-ship invariants and accurate public articles; risky assumptions became
  testable work rather than portfolio marketing.
- Reflection: architecture diagrams are hypotheses until code and failure tests provide evidence.

This story can demonstrate ownership, dive deep, earn trust, judgment and learning—without pretending the
production fixes are already implemented.

### Build a bank of eight stories

Prepare: hardest bug; failure/mistake; disagreement; ambiguous requirement; security/reliability improvement;
performance measurement; simplification/deletion; leadership/helping teammate. For each record two principles/
competencies, one metric/evidence source, one trade-off, and what you would change now. Rehearse 60–120 seconds,
then accept follow-ups for five minutes.

Bad answer: “We used Clean Architecture and it worked.”

Strong answer: “The ViewModel had become a 1,100-line integration point. I first characterised search and
barge-in behaviour with transition tests, then extracted one workflow without changing the module graph. That
reduced constructor fan-in and let us inject a fake clock/stream. I did not create a domain module until a
second feature reused the policy. The trade-off was a temporary adapter and two-step migration.”

---

## Rapid-fire questions to answer aloud

### OS/concurrency

1. Process vs thread vs coroutine?
2. Safety vs liveness?
3. Deadlock's four necessary conditions?
4. Mutex vs semaphore vs atomic CAS?
5. What does structured concurrency guarantee—and what does it not?
6. How does process death differ from activity recreation and force stop?
7. What is backpressure? Name four full-buffer policies.
8. How do you prevent stale asynchronous callbacks updating a new UI generation?

### Networking/distributed

1. DNS→connection→TLS→HTTP→application authorization?
2. TCP vs UDP; where does QUIC fit?
3. SSE vs WebSocket vs MQTT vs FCM?
4. Why is QoS 1 at-least-once, and what scope does QoS 2 cover?
5. Retry, timeout, backoff and jitter—why all four?
6. Idempotency vs deduplication?
7. Linearizability vs eventual consistency?
8. Outbox/inbox and reconciliation?

### DBMS

1. ACID with one VIGIA example per property?
2. Isolation anomalies and when serializable is worth its cost?
3. B-tree vs hash vs vector index?
4. Unique constraint as concurrency control?
5. Schema migration and rollback on mobile?
6. Why is a cached database not authoritative for settled money?

### Security

1. Hash vs encryption vs MAC vs signature?
2. ECDH vs ECDSA? Does ECDH authenticate?
3. HKDF purpose and context labels?
4. Nonce, counter and replay protection?
5. Keystore non-exportability vs hardware security level vs invocation control?
6. Wrapped software Ed25519 vs Keystore signing key?
7. OAuth authorization code + PKCE and redirect interception?
8. What can certificate pinning and Play Integrity do—and not do?

### Android

1. `remember`, `rememberSaveable`, ViewModel, SavedStateHandle, Room?
2. `Flow`, `StateFlow`, `SharedFlow`, Channel and Room Flow?
3. Does lifecycle-aware collection stop the producer?
4. WorkManager vs foreground service vs FCM callback?
5. Permission denial/revocation and graceful degradation?
6. Compose stability and recomposition measurement?
7. Baseline Profile, Macrobenchmark and R8 release testing?
8. Why can minSdk 34 be a product decision rather than only a technical one?

---

## Mock-interview scoring rubric

Score each dimension 0–3 after every mock:

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Requirements | Builds wrong problem | Assumes most constraints | Clarifies core constraints | Prioritises, quantifies and states out-of-scope/abuse |
| Correctness | Happy path only | Mentions errors | States invariants and main failures | Proves with transitions, idempotency/transactions and recovery |
| Trade-offs | Framework name | One-sided choice | Compares alternatives | Connects choice to workload, cost, risk and rollback |
| Scale/performance | “Use cache” | Rough scaling words | Estimates and bottleneck | Percentiles, backpressure, capacity and measurement plan |
| Security/privacy | “Encrypt it” | Names auth/TLS | Trust boundaries and least privilege | Threat model, key lifecycle, privacy/abuse, revocation |
| Operations | None | Logs/monitoring | SLIs and alerts | SLO/error budget, runbook, staged rollout, reconciliation |
| Communication | Silent/chaotic | Understandable with prompting | Structured and collaborative | Concise, checks alignment, welcomes follow-up, corrects self |

Do not optimise for sounding senior. Optimise for making assumptions and failure modes inspectable. Seniority
appears as judgment: knowing which invariant deserves strong consistency, which cache may be stale, which
retry is unsafe, which module is premature, and which claim should be withdrawn until evidence exists.

---

## Final checklist

- [ ] Solve and re-solve a balanced ~150-problem pattern set; state complexity and tests unprompted.
- [ ] Explain every rapid-fire item above without jargon-only answers.
- [ ] Run five system-design drills twice: first alone, then with hostile follow-ups.
- [ ] Prepare eight truthful behavioural stories with evidence and reflection.
- [ ] Be able to trace one VIGIA request from UI to backend/device and back, including process death.
- [ ] Be able to identify three inaccurate claims in the original architecture and explain the corrections.
- [ ] Practise in the interview language and environment without autocomplete.
- [ ] Ask the recruiter for current round expectations; do not rely on historic company folklore.
- [ ] In the final week, re-solve failures, rehearse aloud and sleep rather than collecting new resources.

The portfolio advantage is not that VIGIA uses Compose, LangGraph, MQTT, AWS or cryptography. It is that the
projects let you discuss real boundaries: a demo authentication fallback that must become fail-closed; an
elegant BLE protocol undermined by identity/state gaps; a wrapped key whose guarantee was overstated; a dual
transport that was not durable; a payment callback named success too early. If you can find those problems,
correct the public story, design the invariant, implement the tests and operate the rollout, you are showing
the reasoning interviewers are trying to sample.

The Android source and corrected production plan are at
[github.com/VigiaLabs/vigia-android](https://github.com/VigiaLabs/vigia-android).

## Part IX — The cross-repository production bar

The interview story is now larger than the Android module diagram. The phone, Pi, AWS/Azure services,
search/web surfaces, and recovery exports are separate failure domains. The durable [engineering
knowledge pack](../engineering-knowledge/README.md) turns that portfolio into six study tracks, and the
[cross-repository audit](../engineering-knowledge/vigia-cross-repo-audit.md) records the evidence behind
each status.

The key conclusion is deliberately unglamorous: VIGIA uses current, recognizable frameworks, but
framework choice is only the starting line. Android has the strongest production baseline after the
hardening tranche. The other repositories show good modular and domain ideas, yet need more uniform CI,
contract/replay tests, observability, release provenance, and recovery drills. The Pi path additionally
needs a production-only signing/transport posture and fleet update policy. Saying this precisely is a
better interview answer than calling every repository “FAANG-level.”

When asked to defend the architecture, connect the subjects:

| Subject | VIGIA question to answer |
|---|---|
| System design | What is authoritative, what is durable, and what happens when delivery is duplicated or delayed? |
| OOP/design | Which type owns the invariant, and can the policy be tested without Android/network/GPU dependencies? |
| DBMS | Which transaction, index, migration, inbox/outbox, or reconciliation rule makes the state correct? |
| Computer architecture | Where are the latency, cache, memory, thermal, and hardware-trust budgets? |
| Mobile | What survives lifecycle/process death, and how does the app degrade without inventing data? |
| Cloud | Which SLO, identity boundary, telemetry signal, release gate, and rollback make the service operable? |

The resulting portfolio claim is: **production-oriented architecture with an evidence-backed roadmap**,
not a production certification. That distinction is the point of the series.


---

## System design & software-engineering fundamentals

*A breadth map for the "design an X" / "walk me through your architecture" rounds — and a framework for talking about your own projects across every dimension an interviewer probes. The five pillars follow Andrew Ng's framework on the software-engineering fundamentals that matter for AI engineering (DeepLearning.AI); the framing here and the VIGIA mapping are mine.*

The agentic-coding point: even when an agent writes most of the code, you have to know **what tradeoffs exist** — latency, availability, consistency, reliability, maintainability, simplicity, cost — to steer it. A "vibe coder" who doesn't know a tradeoff exists can't direct the agent to make it well. Knowing these five areas is how you drive the tool *and* how you answer a design round.

For each pillar: what it covers, the interview topics it unlocks, and the VIGIA evidence you can point to.

### 1. Building full-stack applications
- **What it is:** front-end and back-end as one system — UI components, page rendering, caching, API choice and design, authentication, state/session management, asynchronous processing, persistence, testing, accessibility.
- **Interview topics:** REST vs GraphQL, SSR vs CSR, auth (JWT / OAuth / sessions), caching layers, async and queues.
- **Your evidence:** the Next.js VIGIASearch UI over a serverless Lambda backend; the Android app over the cloud; SSE streaming; Cognito auth; Upstash caching. You've shipped both ends.

### 2. Managing data
- **What it is:** data is the hard-to-change foundation. Read the access patterns, then choose the data model and storage type (relational / document / key-value / graph / vector), and reason about transactions, concurrency, freshness, privacy/governance, and lifecycle.
- **Interview topics:** SQL vs NoSQL, normalization, indexing, ACID and isolation levels, CAP, sharding/replication, when a graph or vector store is the right call.
- **Your evidence:** you deliberately chose *different* stores per access pattern — pgvector + HNSW for semantic search, DynamoDB `TransactWrite` for the atomic reward ledger, Room/SQLite for offline-first, FalkorDB for the bitemporal graph, H3 for geo-dedup. That is exactly "pick the model to fit the access pattern."

### 3. Designing system architectures
- **What it is:** given the requirements (users, latency budget, cost), decide the frontend/backend boundary, system decomposition, where state lives, monolith vs microservices, and the stack — and evolve it as the project moves prototype → production → scale.
- **Interview topics:** the R-E-C-B framework, monolith vs microservices, statelessness, load balancing, "the right architecture is phase-dependent."
- **Your evidence:** LangGraph state-machine vs linear chain vs autonomous agents; ReWOO vs ReAct; edge vs cloud inference; ROS2 nodes vs a monolith. Your "This vs That" tables *are* architecture-tradeoff reasoning written down.

### 4. Making systems secure & reliable
- **What it is:** a testing strategy (the right unit/integration mix and coverage on the paths that matter), designing around failure (retries, graceful degradation, blast-radius containment), and "shift-left" security — threat-model early, scan dependencies, least privilege.
- **Interview topics:** the test pyramid, idempotency, retries/backoff, circuit breakers, dead-letter queues, defense-in-depth, secrets management.
- **Your evidence:** cryptographic attestation and signatures, mutual TLS, trust tiers, fail-closed verification, the Kover-gated test pyramid in the hardening spec, and secrets kept out of the APK.

### 5. Scaling & operating in production
- **What it is:** the SDLC beyond "it works" — deployment environments, release strategy, CI/CD, infrastructure-as-code, observability, alerts, incident response, and scaling (sharding, indexing, replication, load-balancing) — plus coding hygiene: version control, code review, dependency maintenance, technical-debt management.
- **Interview topics:** CI/CD, blue-green / canary releases, IaC, monitoring and SLI/SLO, horizontal vs vertical scaling, sharding and replication.
- **Your evidence:** the "From demo to production" sections across all five series — CI/CD, CDK infrastructure-as-code, DLQ alarms, observability (X-Ray/CloudWatch), sharding pgvector, baseline profiles — and the whole architecture-hardening spec.

**The interview one-liner:** *"I reason about a system across five layers — full-stack, data, architecture, reliability/security, and production operations — and name the tradeoff each layer forces. In VIGIA, for instance, I used DynamoDB TransactWrite for the money path because it needs atomicity, but pgvector for search because it needs semantic recall: different data needs, different stores."*

That sentence covers the whole surface *and* proves it with a real decision — which is exactly what a design round rewards.

*Framework credit: Andrew Ng, on the software-engineering fundamentals for AI engineering (DeepLearning.AI). Synthesis and VIGIA mapping are my own.*
