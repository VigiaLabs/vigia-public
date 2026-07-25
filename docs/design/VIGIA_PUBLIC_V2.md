# VIGIA-PUBLIC (VIGIASearch) — Master Design Spec V2 (rev 2.2)

**Status:** Active, internally reconciled. Supersedes v2.0/v2.1 and everything in `docs/design/archive/`.
**Scope:** the public road-infrastructure search engine — Next.js app + API routes, the LangGraph-style agent pipeline, the standalone FastAPI/Express engine, MCP server, voice, caching.
**Audited against:** `main` + `fix/v2-p0-security` (`a5d5fe5` cache/SSRF, `f7fdd84` voice). Two cross-reviews (Codex ×2) + first-party re-verification.
**Companion specs:** [vigia-raspi V2](../../../vigia-raspi/.claude/design/VIGIA_RASPI_V2.md) · [vigia-amazon V2](../../../vigia-amazon/docs/design/VIGIA_AMAZON_V2.md) · [vigia2 V2](../../../../AndroidStudioProjects/vigia2/docs/design/VIGIA2_V2.md).

---

## 0. How to read

**Finding status:** `OPEN` · `IMPLEMENTED` · `IMPLEMENTED-PARTIAL` · `RETRACTED` · `SUPERSEDED` · `CLOSED`. One entry per finding. **Severity:** `P0/P1/P2`. OPEN/PARTIAL findings carry file:line · failure · fix · **acceptance** · deps. The status matrix (§1) is authoritative; the claim-safe evidence contract from the archived MASTER_V2 is carried forward unchanged.

---

## 1. Implementation status matrix (keyed by branch@commit)

| ID | Title | Sev | Status | Where |
|----|-------|-----|--------|-------|
| P-CRIT-1 | Cache key collision (language/style/Unicode/GPS) | P0 | IMPLEMENTED-PARTIAL | `fix/v2-p0-security@a5d5fe5` — key construction correct & verified, but cache is inert (P-BUG-1) and needs NFC + evidence-version + better geo cell |
| P-BUG-1 | `@upstash/redis` not a real dependency → cache disabled | P1 | OPEN | my v2.1 "implemented" was wrong; import throws, `catch` swallows, cache off |
| P-SEC-1 | SSRF via user `imageUrl` | P0 | IMPLEMENTED-PARTIAL | `fix/v2-p0-security@a5d5fe5` — literals blocked & bytes-fetched, but rebinding + fe80/10 + streaming gaps remain |
| P-SEC-5 | Voice/transcribe endpoints unbounded/unauth | P1 | IMPLEMENTED-PARTIAL | `fix/v2-p0-security@f7fdd84` — Next routes capped+limited; Express engine + auth + distributed limit still open |
| P-SEC-2 | Unauth LLM endpoints + process-local rate limiter | P0 | OPEN | Bedrock cost-DoS |
| P-SEC-3 | FastAPI wildcard CORS | P1 | OPEN | — |
| P-SEC-4 | `isSameOrigin` accepts missing Origin | P1 | OPEN | — |
| P-SEC-6 | MCP server stdio-only + unauthenticated | P1 | OPEN | blocks Foundry + security once remote |
| P-QUAL-1 | Spoofable `x-forwarded-for` | P2 | OPEN | — |
| P-QUAL-2 | Error-message leakage to client | P2 | OPEN | — |
| P-QUAL-3 | Three divergent answer paths | P2 | OPEN | Next / Express / FastAPI |
| P-QUAL-4 | No schema validation on data JSON | P2 | OPEN | authority-matrix etc. |
| P-QUAL-5 | Evidence contract not enforced in code | P2 | OPEN | — |
| P-QUAL-6 | ESLint scans generated `.next` in worktrees | P2 | OPEN | ~12.8k noise |
| P-QUAL-7 | `better-sqlite3` stale Node ABI blocks tests | P2 | OPEN | — |

---

## 2. Architecture recap (as-built)

```
Browser/App/Voice → /api/chat (SSE), /api/evidence, /api/voice/*  → agent graph
  (router→ingest→(vision|spatial|telemetry|budget)→guardrail→faithfulness→synthesizer→uiHook)
  optional Fargate engine (VIGIA_ENGINE_URL, SSE)
Standalone: vigia-search-engine/main.py (FastAPI, Bedrock) + server/index.ts (Express SSE)
Cross-cutting: semantic-cache (Upstash), rate-limit (in-memory), lib/mcp/server.ts (stdio MCP)
```
Verified-strong (keep): the claim-safe multi-agent pipeline, citation/provenance UI, faithfulness scoring, guardrail node, disclosure builders, zod `PayloadSchema`, body-size caps, `Cache-Control: no-store`.

---

## 3. Open findings

### P-BUG-1 — Redis cache dependency is missing → caching permanently disabled (P1, OPEN)
**File:** `lib/cache/semantic-cache.ts:24` (`import('@upstash/redis' as string)`); `@upstash/redis` is **absent** from `package.json`, `package-lock.json`, and `node_modules`.
**Failure:** the `as string` cast only stops TypeScript from resolving the module; at runtime the dynamic import throws, the `catch` returns null, and caching is silently off. (The pre-fix `Function()` hack had the same missing dep — so no regression, but my v2.1 "P-BUG-1 implemented" claim was wrong.) The good P-CRIT-1 key construction never runs in production.
**Fix:** declare `@upstash/redis` as a real dependency; use a statically analyzable dynamic import; add an integration test proving a built production artifact can `set`/`get` a cache entry (and log a clear warning, not silence, when Redis is unconfigured).
**Acceptance:** production build sets and retrieves a cache entry in a test; missing-config path logs a warning.

### P-CRIT-1 — Cache key scoping (P0, IMPLEMENTED-PARTIAL → finish)
**Done (`a5d5fe5`, verified):** key includes language (`responseLanguage.code`, not the object — a `String()` would collapse all languages to `"[object Object]"`), style, and coarse GPS; normalizer uses `\p{L}\p{M}\p{N}` so Devanagari/Indic queries no longer collapse to a blank key; schema bumped to `v19`. Verified: distinct keys per Hindi query and per language.
**Still to do:** apply Unicode **NFC normalization** before keying (canonically-equivalent strings must match); include a **corpus/evidence version** in the key so stale answers invalidate when data updates; reconsider the flat 24-h TTL for updated evidence; replace 2-dp GPS (~1.1 km) with a **road-segment / administrative-authority / explicit geospatial cell** rather than a raw lat-lon round. Blocked from taking effect by P-BUG-1.
**Acceptance:** NFC-equivalent queries share a key; an evidence-version bump invalidates prior entries; two nearby but different road segments don't collide.

### P-SEC-1 — SSRF guard (P0, IMPLEMENTED-PARTIAL → finish)
**Done (`a5d5fe5`, verified):** `lib/security/url-guard.ts` blocks non-https, literal private/loopback/link-local (incl. `[::1]`), rechecks after DNS, caps size/timeout; the vision agent now fetches bytes itself instead of handing Bedrock a URL. Verified against 10 literal cases.
**Remaining defects (Codex, confirmed):**
- **DNS rebinding window:** `lookup()` at `url-guard.ts:100` then a plain `fetch()` at `:112` re-resolves the host — TOCTOU between check and connect.
- **IPv6 range bug:** `startsWith('fe80')` only catches `fe80`, missing `fe81–febf` (the range is `fe80::/10`).
- **Streaming:** `await res.arrayBuffer()` buffers the whole body before the post-read size check; a chunked response with no/lying `content-length` is fully buffered.
**Fix:** pin the verified IP through the HTTP dispatcher/DNS callback (connect to the pinned address, not the hostname); fix the `fe80::/10` mask (top 10 bits, not a string prefix); stream with a cumulative byte limit and cancel on overflow. Add IPv4/IPv6/rebinding tests.
**Acceptance:** a host that resolves public-then-private is rejected at connect; `fe81::`–`febf::` are blocked; an oversized chunked response is cancelled mid-stream.

### P-SEC-5 — Every billable ingress must be protected (P1, IMPLEMENTED-PARTIAL → finish)
**Done (`f7fdd84`):** `/api/voice/speak` and the Next transcribe handler have per-IP rate limiting + a 6 MB pre-decode audio cap. tsc passes.
**Not yet met (spec bar = auth + Redis rate limit on every billable path):** the routes remain **unauthenticated**; the limiter is **process-local**; duplicate aliases (`/tts`+`/voice/speak`, `/transcribe`+`/voice/transcribe`) remain; and the **standalone Express engine** endpoints `/sarvam-proxy/stt`, `/sarvam-proxy/tts`, `/v1/search` (`server/index.ts:66,89,108`) are entirely unauthenticated and un-rate-limited, with `/v1/search` accepting unbounded query/history structures.
**Fix:** shared/distributed rate limiting (P-SEC-2) + auth on every billable ingress including the Express/FastAPI service; bound `/v1/search` query + history sizes; collapse duplicate aliases.
**Acceptance:** each billable route (Next + Express + FastAPI) rejects unauthenticated/over-limit calls; `/v1/search` rejects oversized input.

### P-SEC-2 — Unauthenticated LLM endpoints behind a process-local limiter (P0, OPEN)
`lib/security/rate-limit.ts` is an in-process `Map` (per-instance, resets on cold start; O(n) cleanup per request); `/api/chat` + `/api/evidence` have no auth → unbounded Bedrock spend. **Fix:** move rate limiting to Upstash Redis (sliding-window/token-bucket Lua, atomic) keyed by IP + a lightweight token, shared across instances; add a cheap anonymous-abuse gate and a **global Bedrock spend circuit-breaker**. **Acceptance:** limit holds across instances and restarts; spend cap trips under a synthetic flood. **Depends on:** P-BUG-1 (real Redis dep).

### P-SEC-3 / P-SEC-4 (P1, OPEN)
FastAPI `allow_origins="*"` with POST (`vigia-search-engine/main.py:594`) — fail closed if `CORS_ORIGINS` unset; allow-list frontends; put the engine behind auth/shared rate limit. `isSameOrigin` returns true on a **missing** Origin (`app/api/evidence/route.ts:24`) — treat missing Origin as untrusted for expensive/mutating routes, or drop it in favour of the P-SEC-2 auth+limit model.

### P-SEC-6 — MCP server stdio-only + unauthenticated (P1, OPEN)
`lib/mcp/server.ts` is stdio transport with four unauthenticated tools. Foundry needs a **remote streamable-HTTP** transport; once remote, the tools need auth + per-client rate limiting. Keep tool schemas identical so Foundry registration is a transport swap. **Acceptance:** a hosted Foundry agent can call the tools over authenticated HTTP; anonymous calls are rejected.

### P-QUAL-1..7 (P2, OPEN)
Trust `x-forwarded-for` only from the known proxy hop (P-QUAL-1); return generic errors, log detail server-side (P-QUAL-2); consolidate the three answer paths to one engine + thin adapters (P-QUAL-3); schema + CI validation for `authority-matrix.json`/`nh44-sections.json`/`road-centroids.json` (P-QUAL-4); encode the evidence contract as runtime assertions in guardrail/faithfulness (P-QUAL-5); ESLint ignore-rules so generated `.next` under `.claude/worktrees` isn't scanned (P-QUAL-6); pin/rebuild `better-sqlite3` against the project Node ABI so the V2 test suite runs (P-QUAL-7).

---

## 6. Resolved / retracted (not scheduled)

None retracted in this repo. P-BUG-1 and the two PARTIAL items are re-opened above with accurate status — they are **not** "done".

---

## 7. Priority-ordered work plan (OPEN/PARTIAL only)

1. **P-BUG-1** make Redis real (unblocks P-CRIT-1 + P-SEC-2).
2. **P-SEC-2** Redis rate limit + Bedrock spend cap.
3. **P-SEC-1** IP-pin fetch + `fe80::/10` fix + streaming cap.
4. **P-SEC-5** protect Express/FastAPI billable routes + auth + bound `/v1/search`.
5. **P-CRIT-1** NFC + evidence-version + road-cell geo key.
6. **P-SEC-3/4** CORS + origin; **P-SEC-6** MCP remote + auth.
7. **P-QUAL-1..7** hardening + lint/ABI hygiene.

---

## 8. Azure / IC-2027 transition

- **P-AZ-1** Bedrock → Azure OpenAI (search engine `get_bedrock`, agent `bedrock-provider`, vision Nova) behind identical node interfaces; dual-run to parity.
- **P-AZ-2** MCP server remote (streamable-HTTP) + Foundry registration — the highest-visibility IC move here.
- **P-AZ-3** wire the existing `lib/voice/azure-stt.ts`/`azure-tts.ts` as the primary voice lane (Azure AI Speech), Sarvam fallback.
- **P-AZ-4** make citation-level provenance machine-checkable; surface the faithfulness score for the "zero hallucination" claim.

---

## Appendix — verification method
Re-verified by reading cited files at `fix/v2-p0-security` (`a5d5fe5`, `f7fdd84`). `tsc --noEmit` passes. SSRF literals + cache key construction runtime-tested. No committed tests yet exercise the SSRF guard, the cache round-trip, or the YAML/param contract; the V2 test suite is blocked by P-QUAL-7.
