# VIGIASearch — Evaluation & Stress-Test Guide

**Problem statement:** IIT Madras Road Safety Hackathon 2026 → **1.2 RoadWatch**
**Live system:** https://main.d1y3lme21jz1c7.amplifyapp.com/

This document maps VIGIASearch to the RoadWatch **Key Aspects** and **Evaluation Criteria** *word for word*, shows exactly where each requirement is implemented in the codebase, and gives a reproducible suite of stress-test queries (single-hop, multi-hop, contradiction, jurisdiction, global, and offline) that a judge can run live.

> **Robustness hardening (Track B).** Three failure modes found during live testing have been fixed in code and must be **redeployed and re-tested before the finale**:
> 1. **Jurisdiction-safe personnel retrieval** — national-highway queries never substitute a State PWD engineer for a project-specific NHAI officer. Exact road identifiers are required before project records are attached. `lib/tools/search-federated.ts`, `lib/agents/agents/admin.ts`.
> 2. **Geo-anchor gate** — a personnel query with no district/state anchor no longer surfaces a semi-random officer; it routes to the Authority Matrix fallback. `lib/agents/agents/admin.ts`, `lib/agents/guardrail.ts`.
> 3. **Text-based global routing** — a foreign country/city named in text (no GPS) now routes to the World Bank / OCDS engine. `lib/tools/geo-resolve.ts`, `lib/agents/agents/admin.ts`.
>
> Before the finale, run `npm run test:demo:live`; do not rely on a previously cached chat answer.

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
- **Last relaying date** — VIGIA reports a physical relaying/resurfacing date only when an indexed source explicitly records that event and date. Contract award, completion, inspection, DLP, and O&M commencement dates are never substituted. For the current NH-44 case study, `2024-09-18` is identified only as TOT Bundle-16 O&M commencement.
- *Code:* `lib/agents/router.ts` (maintenance→tender_search routing rule), `lib/agents/claim-safety.ts` (physical-relaying claim gate), `lib/tools/search-unified.ts` (structured NH project fields).

**Demo query:** `For the NH-44 Hyderabad-Nagpur corridor, what is the road type, current O&M concessionaire, and TOT award value?`

### ▸ "Routing to the correct Executive Engineer or Authority for complaints"

- Intent classifier routes `complaint` / `rti` / `personnel` queries to dedicated resolvers (`getComplaintAuthority`, `getRTIAuthority`) and the PWD personnel directory.
- For national highways, project records and named-officer records are treated as different evidence classes. VIGIA returns the NHAI PIU route when no project-specific named NHAI officer is published; it does not substitute a State PWD engineer.
- When specific data is absent, the **Authority Matrix fallback** returns the correct portal, helpline, and escalation path (e.g. NHAI 1033, pgportal.gov.in) instead of a dead end.
- *Code:* `lib/agents/planner.ts`, `lib/agents/executor.ts`, `lib/tools/complaint-routing.ts`, `lib/tools/rti-lookup.ts`, `lib/agents/guardrail.ts` (`buildAuthorityFallback`).

**Demo query:** `For NH-163G, what verified project records exist and where should I file a pothole complaint? Do not name an officer unless the source explicitly does.`

### ▸ "Amount sanctioned/spent"

- `sanctioned_cost_crore` and `expenditure_cost_crore` are first-class fields in the structured contract data and are always included in the Project Overview when present.
- The system is explicit about the limit of public data: it distinguishes **sanctioned** (available) from **actual expenditure** (often not published) rather than conflating them — the prompt forbids presenting sanctioned cost as spent.
- *Code:* `lib/tools/search-unified.ts` (cost fields), `lib/voice/chat-prompt.ts` ("DATA WE DO NOT HAVE" block).

**Demo query:** `What was the TOT concession award value for the Hyderabad–Nagpur stretch of NH-44?`

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
| A2 | `Sanctioned cost of the Panipat–Jalandhar section of NH-44` | Structured cost field + scope guard | Explicit data-void/coverage response. The index contains a minor-bridge asset and arbitration records, but no verified sanctioned cost for the whole section; neither may be substituted. |
| A3 | `PMGSY rural roads in Khammam district` | PMGSY source + paraphrase robustness | Rural road records via semantic match (no keyword trigger needed). |

### B. Multi-hop / cross-source (the hardest class)
| # | Query | Exercises | Expected |
|---|---|---|---|
| B1 | `For NH-163G, what verified project records exist and where should I file a pothole complaint?` | Exact-road retrieval + authority routing | Indexed NH-163G project records plus NHAI PIU, CPGRAMS, and 1033. No State PWD engineer is presented as the NHAI project officer. |
| B2 | `Who is responsible for NH 44?` | Exact-road personnel disclosure | Confirms indexed NH-44 records, discloses that no project-specific named NHAI officer is indexed, and returns the cited NHAI PIU route. |
| B3 | `Compare the contractor and budget for NH-44 versus a PMGSY road near Nagpur` | Independent parallel plan steps | Two source silos queried in parallel, results not blended. |

### C. Anti-hallucination / guardrail
| # | Query | Exercises | Expected |
|---|---|---|---|
| C1 | `Who is the executive engineer for NH-9999?` (nonexistent) | Exact-ID gate → authority disclosure | Explicitly says no exact indexed project record exists, attaches no neighbouring-road chunks, and routes to NHAI PIU, pgportal, and 1033. |
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
| F1 | Upload a road-damage photo + `What do you see and what should I do?` | Multimodal vision + citizen-evidence guardrail | The sent image appears in the user message and clears from the composer. The answer starts with visible observations, labels them as an unverified citizen photo assessment, then offers authority lookup and complaint-email drafting. |
| F2 | Open **Sources** for a PDF-backed answer | Passage provenance | Every quote shows its exact excerpt and locator. PDF sources show the indexed page number and open at that page; HTML sources explicitly say that a PDF page number is not applicable. |
| F3 | Upload two different road photos with the same text | Image cache isolation | Each photo is analyzed independently; a previous photo answer is never returned from semantic cache. |

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
5. **Expected:** the app detects offline within ≤15s (`useNetworkStatus`), shows the versioned pack and last-sync state, and returns national emergency channels plus any matching source-linked authority contacts. National contacts do not require a GPS fix.
6. Set throttling back to **Online**; the next query uses the full cloud pipeline.

> Note: V2 bundles `public/offline/vigia-edge-national.db.gz`; the first online visit installs it into IndexedDB. The app never claims that a queued report was filed with an authority.

---

## 5. Known limitations (stated honestly for judges)

- **Per-km live condition (PCI/IRI)** is ~0% coverage — it lives behind NHAI's credentialed RAMS portal. We infer maintenance timelines from contract DLP clauses instead of claiming live condition data.
- **Actual expenditure** is frequently unpublished. VIGIA shows expenditure only when the source explicitly labels an expenditure/payment field; sanctioned cost is displayed separately and is never substituted.
- **Reranking** (Cohere Rerank v3) and **response caching** (Upstash Redis) are implemented and wired behind `COHERE_API_KEY` / `UPSTASH_REDIS_REST_URL`; they activate when those env vars are set and degrade gracefully otherwise.
- **Faithfulness scoring** is a post-hoc observability signal attached to metadata, not a pre-delivery filter — the hard guarantees come from retrieval grading and the strict synthesis prompt.

---

## 6. V2 automated release gate

Run `npm run test:v2` before every deployment. It rebuilds the versioned offline SQLite pack and rejects missing source URLs/quotes, semantic field substitutions, missing golden failure classes, mismatched pack versions, and absent evidence-state UI labels.

Run `npm run release:verify:v2` when internet access is available. It repeats the deterministic checks and verifies that every top-level authoritative source is reachable over HTTPS.

Android V2 verification is separate: run `./gradlew :core:network:test :feature:copilot:test :app:assembleDemoDebug` in the Android repository. This validates SSE claim/offline metadata parsing, Copilot state handling, and produces the demo APK.

For offline manual verification, load the site once online, confirm the banner shows pack `2026.07.15`, then switch DevTools to Offline. `What emergency road helplines are cached offline?` must show only source-linked cached records. `Report this pothole` must say it is queued locally and must **not** claim that any authority was notified. Restore connectivity and confirm the queued count returns to zero after analysis synchronizes.
