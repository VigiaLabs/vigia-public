# VIGIA-PUBLIC (VIGIASearch) — Master Design Spec V2

**Status:** Active · supersedes everything in `docs/design/archive/` (the 15 `.kiro/` module/pipeline docs, the old root `MASTER_V2.md`, `DEMO_DAY_SCRIPT_V2.md`).
**Scope:** the public road-infrastructure search engine — Next.js app + API routes, the LangGraph-style agent pipeline, the standalone FastAPI/Express search engine, the MCP server, voice, caching.
**Audited:** 2026-07-25 against current `main`. Review + improvement spec only; nothing here is implemented yet.
**Companion specs:** [vigia-raspi V2](../../../vigia-raspi/.claude/design/VIGIA_RASPI_V2.md), [vigia-amazon V2](../../../vigia-amazon/docs/design/VIGIA_AMAZON_V2.md), [vigia2 V2](../../../../AndroidStudioProjects/vigia2/docs/design/VIGIA2_V2.md).

---

## 0. Reading guide

IDs: `P-CRIT-n`, `P-SEC-n`, `P-BUG-n`, `P-QUAL-n`, `P-AZ-n`. Severities P0/P1/P2 as in sibling specs.

The archived `MASTER_V2.md` defined the **claim-safe evidence contract** (ingest → normalize → validate → retrieve → gate → render; verified/derived/inferred/unavailable/conflicted rendered distinctly). That contract is sound and is **carried forward unchanged** — this spec assumes it and focuses on the correctness, security, and cost defects in the code that implements it.

---

## Review Reconciliation (v2.1 — cross-reviewed and verified against source, 2026-07-25)

An independent second review (Codex) cross-checked this spec; every item was re-verified by reading the cited files. **Authoritative where it conflicts with the original findings.**

### REVISED

- **P-CRIT-1 (cache key) — EXPANDED and IMPLEMENTED.** Verification found the defect is worse than described: the normalizer used ASCII `\w`, which strips **all** Devanagari/Indic characters, so every non-Latin query collapsed to a blank key (not just cross-language collision). Also `responseLanguage` is an object `{code,name,nativeName}` — it must be keyed on `.code` (a naive `String()` yields `"[object Object]"` for every language, silently re-breaking the fix). GPS also scopes road answers and is now in the key. **Implemented fix:** `\p{L}\p{M}\p{N}\s` normalizer, `.code` keying, coarse GPS scope, schema bumped to `v19`. Verified: distinct keys per Hindi query and per language; tsc clean.
- **P-BUG-1 (dynamic import) — IMPLEMENTED** via `import('@upstash/redis' as string)` (no `Function()`/eval, no forced type resolution).

### New CONFIRMED findings

- **P-SEC-5 — Voice/transcription endpoints unauthenticated, un-rate-limited, unbounded (P1).** `app/api/voice/speak/route.ts` and `app/api/transcribe/route.ts` have no auth and no `checkRateLimit`; `transcribe-handler.ts:117` decodes caller-supplied base64 into memory with no size ceiling and can chain Sarvam→Azure/Deepgram (billable). Duplicate aliases (`/tts`+`/voice/speak`, `/transcribe`+`/voice/transcribe`) widen the surface. Fix: auth + Redis rate limit (P-SEC-2), a hard audio-size cap **before** decode, and collapse the duplicate routes.

### Verification hygiene (from the cross-review)

- **P-QUAL-6** — ESLint scans generated `.next` under nested `.claude/worktrees` (~12.8k irrelevant findings); add ignore rules and lint only owned source.
- **P-QUAL-7** — `better-sqlite3` prebuilt for a stale Node ABI blocks the V2 test suite; pin/rebuild against the project's Node.

**Confirmed still valid (no change):** SSRF via `imageUrl` (P-SEC-1 — now implemented), unauthenticated LLM endpoints + process-local rate limiter (P-SEC-2), spoofable XFF (P-QUAL-1), missing-Origin acceptance (P-SEC-4), FastAPI wildcard CORS (P-SEC-3), MCP remote/auth, error leakage (P-QUAL-2).

### Revised priority (public)

1. P-CRIT-1 cache (done) + P-SEC-1 SSRF (done).
2. P-SEC-2 Redis rate limit + Bedrock spend cap; P-SEC-5 voice auth/limits.
3. P-SEC-3/4 CORS + origin; MCP remote transport + auth.
4. P-QUAL batch (incl. lint/ABI hygiene).

---

## 1. Architecture recap (as-built)

```
Browser / App / Voice ─► /api/chat (SSE)  ─┐
                         /api/evidence      ├─► agent graph: router→ingest→(vision|spatial|
                         /api/voice/*       │     telemetry|budget)→guardrail→faithfulness→synthesizer→uiHook
                                            └─► optional Fargate engine (VIGIA_ENGINE_URL, SSE)
Standalone: vigia-search-engine/main.py (FastAPI, Bedrock) + server/index.ts (Express SSE)
Cross-cutting: semantic-cache (Upstash Redis), rate-limit (in-memory), lib/mcp/server.ts (stdio MCP)
Data: authority-matrix.json, nh44-sections.json, road-centroids.json
```

Verified-strong (keep): the multi-agent claim-safe pipeline, citation/provenance UI, faithfulness scoring, guardrail node, disclosure builders (NHAI/complaint/eMARG), zod `PayloadSchema` validation, body-size caps, `Cache-Control: no-store` on API responses.

---

## 2. P0 — Critical findings

### P-CRIT-1 — Semantic cache ignores response language and style → wrong-language / wrong-style answers
**File:** `lib/cache/semantic-cache.ts:36-39` (`queryToKey` normalizes only the query text) vs `app/api/chat/route.ts:117-120` (`shouldUseCache` excludes only image/follow-up/complaint — **not** language or style).
**Failure:** the cache key is `vigia:cache:<schemaVersion>:<normalized-query>`. Two users asking the identical question in different `responseLanguage` (e.g. Hindi vs English) or different `responseStyle` (concise / detailed / citizen-friendly) collide on the same key. A Hindi-speaking driver can receive a cached **English** answer, or a "citizen-friendly" request can return a cached "detailed" answer. For the multilingual pitch — the whole point of the product for non-English drivers — this is a correctness failure that will surface live.
**V2 fix:** include `responseLanguage` and `responseStyle` in `queryToKey` (and bump `CACHE_SCHEMA_VERSION`). Consider GPS/region bucketing too, since answers are road-segment-scoped. Add a test: same query, two languages → two distinct keys → two distinct answers.

### P-SEC-1 — SSRF via user-supplied `imageUrl`
**File:** `app/api/chat/route.ts:109-116` + `lib/agents/state.ts:8` (`imageUrl: z.string().url()`) → `lib/agents/agents/vision.ts:57,78,86` (passed to Bedrock Nova as `image: payload.imageUrl`).
**Failure:** `imageUrl` is validated only as a syntactically valid URL — any scheme, any host, including `http://169.254.169.254/...` (cloud metadata), internal service IPs, or `file://`-like tricks depending on the fetcher. Whether the fetch happens in your Node process or in Bedrock, an attacker steers a server-side request to internal resources, and at minimum controls exactly what the model ingests as "citizen-submitted evidence." Public, unauthenticated endpoint (see P-SEC-2) makes this trivially reachable.
**V2 fix:** (1) restrict scheme to `https:`; (2) resolve the host and **reject private/loopback/link-local ranges** (RFC1918, 127/8, 169.254/16, ::1, fc00::/7) before any fetch; (3) preferably require images to be uploaded to your own bucket and reference by opaque key instead of accepting arbitrary URLs; (4) cap fetch size + timeout. Apply to `/api/evidence` too.

### P-SEC-2 — Public LLM endpoints protected only by a broken in-memory rate limiter → Bedrock cost-DoS
**Files:** `lib/security/rate-limit.ts:17` (`const buckets = new Map()`, process-local) used by `app/api/chat/route.ts:70` and `app/api/evidence/route.ts:40`; no authentication on either route.
**Failure:** the rate limiter is an in-process `Map`. Behind multiple Fargate tasks / serverless instances, each instance has its own counter, so effective limit = configured limit × instance count, and every cold start resets it to zero. There is no auth on `/api/chat` or `/api/evidence`. An attacker (or a bad crawler) drives unbounded Bedrock inference spend — a direct financial-DoS on an unauthenticated, LLM-backed endpoint. Secondary: the cleanup loop (`rate-limit.ts:23-27`) iterates the entire map on **every** request — O(n) amplification under load.
**V2 fix:** move rate limiting to **Upstash Redis** (already a dependency for the semantic cache) keyed by IP + a lightweight token, so it is shared across instances and survives restarts; use a sliding-window or token-bucket Lua script (atomic, no per-request full scan). Add at minimum a cheap proof-of-work or signed-session gate for anonymous chat, and a hard global spend circuit-breaker on Bedrock.

---

## 3. P1 — High findings

### P-SEC-3 — FastAPI search engine CORS `allow_origins="*"` with POST
**File:** `vigia-search-engine/main.py:594` — `CORSMiddleware(allow_origins=os.environ.get("CORS_ORIGINS","*").split(","), allow_methods=["POST","GET"], allow_headers=["*"])`.
**Failure:** defaults to `*`. If the Fargate engine is internet-reachable (it is fronted for SSE), any origin can POST to `/v1/search` and drive Bedrock through it — another unauthenticated cost surface, and it bypasses the Next.js rate limiting entirely.
**V2 fix:** require `CORS_ORIGINS` to be set (fail closed if unset in prod), allow-list the known frontends, and put the engine behind auth (shared secret header or the same Redis rate limit) — it must not be a naked public Bedrock proxy.

### P-SEC-4 — `isSameOrigin` treats a missing `Origin` header as same-origin
**File:** `app/api/evidence/route.ts:24-36` — `if (!origin) return true`.
**Failure:** the CSRF-style origin check passes for any request that simply omits `Origin` (curl, server-to-server, many bots). Combined with no auth and the weak limiter, the "origin not allowed" guard provides little real protection.
**V2 fix:** for state-changing/expensive endpoints, treat missing Origin as **untrusted** unless the request carries a valid same-site token; or drop the check in favour of the auth + Redis-limit approach in P-SEC-2. Document the intended threat model.

### P-CRIT/BUG note — MCP server: stdio-only + unauthenticated tools (blocks the roadmap + a security gap once remote)
**File:** `lib/mcp/server.ts` (whole file) — stdio transport, four tools (tender search, road info, RTI authority, complaint routing), no auth.
**Failure/blocker:** (a) the roadmap's "expose VIGIASearch as an MCP server for Foundry agents" requires a **remote (streamable-HTTP) transport** — stdio can't be consumed by a hosted Foundry agent; (b) once remote, the tools are unauthenticated and would let any caller query your road-authority retrieval and drive downstream cost.
**V2 fix:** add a streamable-HTTP transport alongside stdio; put the remote endpoint behind an API key / OAuth; rate-limit per client. Keep the tool schemas identical so Foundry registration is a transport swap. This is both the headline IC upgrade ("India's road data, agent-readable") and a prerequisite security task.

### P-BUG-1 — Dynamic `import` via `Function(...)` to load Upstash Redis
**File:** `lib/cache/semantic-cache.ts:24` — `await (Function('p','return import(p)')(modPath))`.
**Failure:** the `Function`-constructor indirection to dodge the bundler is an `eval`-family pattern: it trips CSP/security scanners, breaks in strict-CSP runtimes, and hides a hard dependency. If it silently fails, caching degrades to no-op with no signal (which also masks P-CRIT-1 in some environments).
**V2 fix:** use a normal top-level dynamic `import('@upstash/redis')` (Next.js supports it) or add the dependency properly and import statically; log a clear warning if Redis is unconfigured rather than swallowing.

---

## 4. P2 — Quality / hardening

- **P-QUAL-1** — `getClientIp` trusts `x-forwarded-for` blindly (`chat/route.ts:36`, `evidence/route.ts:15`); an attacker spoofs the header to evade IP rate limiting. Once behind a known proxy/CDN, take the client IP from the trusted hop only.
- **P-QUAL-2** — Error responses return `error.message` to the client (`evidence/route.ts:95`, others). Avoid leaking internal messages/stack detail; return generic text + log the detail server-side.
- **P-QUAL-3** — Consolidate the three answer paths (Next.js `/api/chat`, `server/index.ts` Express, `vigia-search-engine/main.py` FastAPI) — three copies of pipeline wiring drift apart. Pick one authoritative engine; the others become thin adapters.
- **P-QUAL-4** — `authority-matrix.json` / `nh44-sections.json` / `road-centroids.json` are the ground truth for claim-safety; add a schema + CI validation so a malformed data edit can't silently corrupt disclosures.
- **P-QUAL-5** — The evidence contract (from archived MASTER_V2) should be encoded as runtime assertions in the guardrail/faithfulness nodes, not just prose, so "no synthetic project/amount/date inserted" is enforced, not documented.

---

## 5. Azure / IC-2027 transition (November window)

- **P-AZ-1 — Bedrock → Azure OpenAI.** `vigia-search-engine/main.py` (`get_bedrock`), `lib/agents/bedrock-provider.ts`, and the vision agent's Nova-Lite call all move to Azure OpenAI (chat + vision). Keep the agent-graph node interfaces identical so it's a provider swap. Dual-run against AWS until parity.
- **P-AZ-2 — MCP server remote + Foundry registration.** Per the P1 finding: host the MCP server as streamable-HTTP, register in the Foundry tool catalog. This is the single highest-visibility IC move in this repo.
- **P-AZ-3 — Voice lane.** `lib/voice/azure-stt.ts` / `azure-tts.ts` already exist — wire them as the primary voice path (Azure AI Speech) with Sarvam as fallback; align with the Android dual-lane work.
- **P-AZ-4 — Citation-level provenance as a demonstrable guarantee.** The evidence contract already renders sources; for the IC "zero hallucination" claim, make provenance machine-checkable (document id + authority + retrieval timestamp on every critical claim) and show the faithfulness score in the UI.

---

## 6. Priority-ordered work plan

| Order | ID | Item | Effort |
|---|---|---|---|
| 1 | P-CRIT-1 | Language+style in cache key (+ bump schema version) | ~0.5 d |
| 2 | P-SEC-2 | Redis-backed rate limit + Bedrock spend circuit-breaker | ~1.5 d |
| 3 | P-SEC-1 | SSRF guard on imageUrl (scheme + private-IP block) | ~1 d |
| 4 | P-SEC-3/4 | Engine CORS lockdown; fix isSameOrigin threat model | ~1 d |
| 5 | MCP | Remote streamable-HTTP transport + auth | ~2 d |
| 6 | P-BUG-1, P-QUAL-1..5 | Hardening + consolidation batch | ~2 d |
| 7 | P-AZ-1..4 | Azure migration (Nov window) | see roadmap |

**Definition of done for V2:** no unauthenticated unbounded Bedrock/Azure-OpenAI cost surface; cache never returns a wrong-language/style answer; no server-side request reachable to internal ranges; MCP server consumable by Foundry with auth; the claim-safe contract enforced in code, not just prose.
