# VIGIASearch — Evaluation & Stress-Test Guide

**Problem statement:** IIT Madras Road Safety Hackathon 2026 → **1.2 RoadWatch**
**Live system:** https://main.d1y3lme21jz1c7.amplifyapp.com/

This document maps VIGIASearch to the RoadWatch **Key Aspects** and **Evaluation Criteria** *word for word*, shows exactly where each requirement is implemented in the codebase, and gives a reproducible suite of stress-test queries (single-hop, multi-hop, contradiction, jurisdiction, global, and offline) that a judge can run live.

> **Robustness hardening (Track B).** Three failure modes found during live testing have been fixed in code and must be **redeployed and re-tested before the finale**:
> 1. **Jurisdiction-constrained personnel retrieval** — multi-hop now returns the engineer for the *correct* district (fixes a "Khammam → Nirmal" drift). `lib/tools/search-federated.ts`, `lib/agents/executor.ts`, `lib/tools/geo-resolve.ts`.
> 2. **Geo-anchor gate** — a personnel query with no district/state anchor no longer surfaces a semi-random officer; it routes to the Authority Matrix fallback. `lib/agents/agents/admin.ts`, `lib/agents/guardrail.ts`.
> 3. **Text-based global routing** — a foreign country/city named in text (no GPS) now routes to the World Bank / OCDS engine. `lib/tools/geo-resolve.ts`, `lib/agents/agents/admin.ts`.
>
> These live on branch `claude/infallible-wilbur-b3c5a9`. They are **not on the live Amplify URL until merged to `main`** and redeployed.

---

## 1.2.1 Short Description (what we were asked to build)

> *"AI-powered chatbot that enables citizens to monitor road quality, track public spending, and report issues to the responsible authorities, increasing transparency in road infrastructure."*

VIGIASearch is exactly this: a chat-first engine where a citizen types a plain-language question and receives a cited, jurisdiction-correct answer covering road quality, public spending, and the complaint/RTI authority — with active guardrails against fabricated data.

---

## 1.2.3 Key Aspects for Coders to Include — coverage matrix

Each key aspect is quoted verbatim, followed by how VIGIASearch satisfies it, where it lives in the code, and a **demo query** you can paste into the live site.

### ▸ "Shows Road Type (NH/SH/MDR etc), last relaying date, and contractor name"

- **Road Type** — resolved from GPS via `getRoadInfoByCoordinates()` and from the road number prefix in the Admin agent (`NH`/`SH`/`MDR`/`rural`). Surfaced in the **Project Overview** section of every infrastructure answer.
- **Contractor name** — the `concessionaire` field from NHAI contract data / `contractor` from PMGSY, carried through retrieval into citations.
- **Last relaying date** — this is the honest, engineered part. No public database contains a literal "last relaying date," so VIGIASearch performs **inferential routing**: maintenance-timeline questions are routed to `tender_search`, and the response prompt derives the Defect Liability Period from the project completion date and contract mode (**5 years for EPC, 15 for HAM/BOT/DBFOT**), stating the inference chain transparently rather than guessing.
- *Code:* `lib/agents/router.ts` (maintenance→tender_search routing rule), `lib/voice/chat-prompt.ts` (INFERENTIAL MAPPING block), `lib/tools/search-unified.ts` (structured NH project fields).

**Demo query:** `What type of road is NH-44, who built it, and when was it last relayed?`

### ▸ "Routing to the correct Executive Engineer or Authority for complaints"

- Intent classifier routes `complaint` / `rti` / `personnel` queries to dedicated resolvers (`getComplaintAuthority`, `getRTIAuthority`) and the PWD personnel directory.
- Multi-hop **Plan-and-Execute** connects a road to its responsible engineer across two data silos: NHAI contract → extract district → PWD directory lookup for that district's Executive Engineer.
- When specific data is absent, the **Authority Matrix fallback** returns the correct portal, helpline, and escalation path (e.g. NHAI 1033, pgportal.gov.in) instead of a dead end.
- *Code:* `lib/agents/planner.ts`, `lib/agents/executor.ts`, `lib/tools/complaint-routing.ts`, `lib/tools/rti-lookup.ts`, `lib/agents/guardrail.ts` (`buildAuthorityFallback`).

**Demo query:** `Who is the executive engineer I should contact about a pothole on NH-163G, and give me their phone number.`

### ▸ "Amount sanctioned/spent"

- `sanctioned_cost_crore` and `expenditure_cost_crore` are first-class fields in the structured contract data and are always included in the Project Overview when present.
- The system is explicit about the limit of public data: it distinguishes **sanctioned** (available) from **actual expenditure** (often not published) rather than conflating them — the prompt forbids presenting sanctioned cost as spent.
- *Code:* `lib/tools/search-unified.ts` (cost fields), `lib/voice/chat-prompt.ts` ("DATA WE DO NOT HAVE" block).

**Demo query:** `How much money was sanctioned for the Hyderabad–Nagpur stretch of NH-44?`

### ▸ "Global applicability across countries"

- Four-tier country routing keyed on GPS: **India** (full pipeline) → **OCDS** procurement data (60+ countries) → **World Bank Projects API** (170+ member states) → **OpenStreetMap** geometry.
- International results are mapped into the same `NormalizedEvidence` schema, so the UI and citations are identical across countries.
- Personnel queries **hard-abort** outside India rather than fabricating a foreign engineer's contact details.
- *Code:* `lib/tools/global-engine.ts` (`resolveCountry`, `queryInternational`), `lib/agents/agents/admin.ts` (country detection + personnel abort).

**Demo query:** `What road infrastructure projects are funded near Nairobi, Kenya?`

### ▸ "Offline functionality and robustness in low-network conditions"

- Two-tier design: cloud pipeline + a **geofenced on-device SQLite tier** (`vigia_edge.db`) generated nightly as geohash-4 tiles over CloudFront.
- `useNetworkStatus` probes `/api/health` every 15s (HEAD, 3s timeout); >2s latency → **degraded mode** (short-timeout cloud attempt with automatic edge fallback); no network → **offline mode** returning emergency contacts + PWD helplines by geohash.
- The SSE pipeline persists partial tokens on cancellation, and agent dispatch uses `Promise.allSettled` so a single timed-out source never collapses the whole response.
- *Code:* `lib/hooks/useNetworkStatus.ts`, `lib/edge/failover.ts`, `lib/edge/sync-server.ts`, `lib/agents/ingest.ts`.

**Demo:** load the app, then throttle to Offline in DevTools → Network and ask `Emergency road contacts near me` with location enabled. (See §4 for the full offline procedure.)

---

## 1.2.4 Evaluation Criteria — how we score against each

Each criterion is quoted verbatim.

### ▸ "Data accuracy"
Accuracy here is defined negatively — **the system's job is to never assert something it cannot cite.** Layers:
1. **Self-RAG retrieval grading** — evidence below 0.5 similarity, empty, or marker-flagged is treated as a data void, not answered.
2. **CRAG corrective retry** — one bounded query rewrite before giving up.
3. **Strict anti-hallucination synthesis prompt** — "every name, number, email, and cost you output MUST appear verbatim in the evidence"; no parametric memory allowed.
4. **Post-hoc faithfulness scoring** (LLM-as-Judge) — splits the answer into claims, flags any high-specificity claim not attributable to a chunk, and attaches the score to response metadata as an observability signal.
- *Code:* `lib/agents/guardrail.ts`, `lib/agents/rewriter.ts`, `lib/agents/faithfulness.ts`, `app/api/chat/route.ts`.

### ▸ "Complaint routing mechanism"
Covered above (1.2.3). Deterministic resolvers + multi-hop personnel lookup + Authority Matrix fallback, each with an explicit escalation path and legal basis. *Code:* `lib/tools/complaint-routing.ts`, `lib/agents/guardrail.ts`.

### ▸ "Budget transparency including the source"
Every budget figure is emitted with a **citation carrying a trust level** (`legally-binding` for NHAI contracts, `official-portal` for PMGSY/PWD) and a source URL. The response format mandates inline `[Source: …]` attribution. Sanctioned vs actual is never conflated. *Code:* `lib/tools/search-unified.ts` (`getTrustLevel`), `lib/agents/ui-hook.ts`.

### ▸ "User interface & accessibility"
Perplexity-style streaming UI with a live reasoning-step ticker, a citations/sources bar with trust badges, a geospatial map view (react-leaflet + OSRM route geometry), and full multilingual voice I/O (Azure/Sarvam STT-TTS) for low-literacy and hands-free use. Streaming status text turns multi-second guardrail retries into visible "thinking," not a hang.

### ▸ "Information integration across countries"
The tiered global engine (1.2.3) unifies India, OCDS, World Bank, and OSM behind one schema and one chat interface — the same query surface works regardless of country. *Code:* `lib/tools/global-engine.ts`.

---

## 2. Stress-test query suite

Run these live. Each lists the query, what it exercises, and the expected behaviour a judge should observe.

### A. Single-source retrieval
| # | Query | Exercises | Expected |
|---|---|---|---|
| A1 | `Who is the contractor for NH-44?` | Basic semantic retrieval + citation | Concessionaire name with an NHAI `legally-binding` citation. |
| A2 | `Sanctioned cost of the Panipat–Jalandhar section of NH-44` | Structured cost field | ₹ figure + Project Overview, sanctioned (not "spent"). |
| A3 | `PMGSY rural roads in Khammam district` | PMGSY source + paraphrase robustness | Rural road records via semantic match (no keyword trigger needed). |

### B. Multi-hop / cross-source (the hardest class)
| # | Query | Exercises | Expected |
|---|---|---|---|
| B1 | `Phone number of the executive engineer responsible for NH-163G` | ReWOO plan: NHAI→district→PWD, jurisdiction-constrained | A `[CROSS-REFERENCE]` answer: NH-163G → **Khammam** district → the **Khammam** EE (9440818085, eerb_kmm@yahoo.co.in) — *not* a neighbouring district's officer. **This is the Track-B fix; verify post-deploy.** |
| B2 | `Who do I complain to about NH-44 in Telangana and how much was it sanctioned for?` | Two parallel intents in one query | Both a routed authority **and** a sanctioned figure, each cited. |
| B3 | `Compare the contractor and budget for NH-44 versus a PMGSY road near Nagpur` | Independent parallel plan steps | Two source silos queried in parallel, results not blended. |

### C. Anti-hallucination / guardrail
| # | Query | Exercises | Expected |
|---|---|---|---|
| C1 | `Who is the executive engineer for NH-9999?` (nonexistent) | Geo-anchor gate → data-void → fallback | **No invented name and no random officer.** Routes cleanly to the Authority Matrix (NHAI PIU, pgportal, 1033). **Track-B fix; verify post-deploy.** |
| C2 | `What is the exact IRI roughness score of NH-66 today?` | "Data we do not have" | Explicit "not available in the VIGIA index," no fabricated number. |
| C3 | `Tell me the engineer for NH-66` (a west-coast road) with evidence only about Telangana | Cross-region hallucination trap | Refuses to associate NH-66 with a Telangana officer. |

### D. Spatial / jurisdiction (the Dubai bug regression tests)
| # | Query | Exercises | Expected |
|---|---|---|---|
| D1 | `Who is the engineer for this road?` with GPS set **outside India** (e.g. Dubai) | Jurisdiction hard-abort | Out-of-jurisdiction message; personnel directory is never queried. |
| D2 | `Executive engineer road` with **no state and no GPS** | Geographic enforcement | Empty result handled as data void — **not** a random officer. |
| D3 | Same personnel query **with** "Telangana" in the text | State-constrained match | Only Telangana records returned. |

### E. Global tiers
| # | Query | Exercises | Expected |
|---|---|---|---|
| E1 | `Road contracts near Nairobi, Kenya` | Text-based country detection → Tier-2 OCDS / Tier-3 World Bank | International projects mapped into the standard cited format. **Track-B fix — previously returned "not ingested"; verify post-deploy.** Depends on live World Bank/OCDS APIs. |
| E2 | `Who is the road engineer for this road in Nigeria?` | Non-India personnel abort (text-based) | Clean "outside supported jurisdiction" + national-ministry pointer, no fabricated contact. |

### F. Contradiction (with image upload, if enabled)
| # | Query | Exercises | Expected |
|---|---|---|---|
| F1 | Upload a photo of a destroyed road + `Is NH-44 in good condition here?` | Zero-trust vision + contradiction path | Photo tagged `[CITIZEN CLAIM]`; it does **not** override the official record, but surfaces a "Flag for official PWD review" action and a hedged answer. |

### G. Offline / low-network (see §4 for setup)
| # | Scenario | Expected |
|---|---|---|
| G1 | Full offline + GPS, ask for emergency/road contacts | Edge SQLite returns emergency contacts + PWD helplines by geohash, with a cache-age note. |
| G2 | Degraded (>2s latency) network | Short-timeout cloud attempt, automatic edge fallback, no spinner-hang. |
| G3 | Network drop **mid-answer** | Partial answer persisted (`MessageStatus.Partial`), nothing lost. |

---

## 3. Multilingual / voice (accessibility)

- Type or speak in an Indian language; STT → pipeline → TTS closes the loop.
- The companion Android app (`vigia2`) runs this fully hands-free in-vehicle: VAD-driven mic → Sarvam `saarika:v2` STT → this SSE pipeline → per-step + final-answer Sarvam `bulbul:v1` TTS → barge-in interrupt → auto mic reopen. Verified end-to-end in `feature/copilot/CopilotViewModel.kt` (`startAutoVoiceMode` → `transcribeAndSearch` → `startSearch`).

**Demo query (voice):** speak `NH-44 par kis thekedaar ne kaam kiya?`

---

## 4. Offline test procedure (reproducible)

1. Load https://main.d1y3lme21jz1c7.amplifyapp.com/ once while online (this caches the app shell and, if provisioned, downloads the local geohash tile).
2. Grant **location** permission.
3. Open DevTools → **Network** → set throttling to **Offline**.
4. Ask `Emergency and PWD contacts near me`.
5. **Expected:** the app detects offline within ≤15s (`useNetworkStatus`), switches to the edge tier, and returns emergency contacts + PWD helpline numbers for your geohash with an "OFFLINE MODE — cached data" banner. A GPS fix is required (the lookup is geohash-based).
6. Set throttling back to **Online**; the next query uses the full cloud pipeline.

> Note: the full offline tier depends on `data/vigia_edge.db` being present/synced; without it, offline mode reports "sync required." The detection, degraded-mode fallback, and partial-answer persistence work regardless.

---

## 5. Known limitations (stated honestly for judges)

- **Per-km live condition (PCI/IRI)** is ~0% coverage — it lives behind NHAI's credentialed RAMS portal. We infer maintenance timelines from contract DLP clauses instead of claiming live condition data.
- **Actual expenditure** is frequently unpublished; we surface **sanctioned** cost and say so.
- **Reranking** (Cohere Rerank v3) and **response caching** (Upstash Redis) are implemented and wired behind `COHERE_API_KEY` / `UPSTASH_REDIS_REST_URL`; they activate when those env vars are set and degrade gracefully otherwise.
- **Faithfulness scoring** is a post-hoc observability signal attached to metadata, not a pre-delivery filter — the hard guarantees come from retrieval grading and the strict synthesis prompt.
