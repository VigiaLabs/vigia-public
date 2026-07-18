# VIGIASearch

**Perplexity for Indian road infrastructure.** An AI-powered civic transparency engine that lets any citizen ask, in plain language, *who is responsible for this road, how much was sanctioned, when was it last maintained, and who do I call to complain* — and get a cited, hallucination-guarded answer grounded in real government data.

Built for the **IIT Madras Road Safety Hackathon 2026 — RoadWatch track**.

> 🏆 **Finalist — BIMSTEC IIT Madras Road Safety Hackathon 2026** (RoadWatch problem statement).

### 🔴 Live deployment

**https://main.d1y3lme21jz1c7.amplifyapp.com/**

> Companion Android voice copilot (hands-free, in-vehicle): [`vigia2`](https://github.com/) — a live conversational agent that streams answers from this same pipeline over SSE with Sarvam STT/TTS.

---

## What it does

Government road data in India is fragmented across NHAI, MoRTH, state PWD directories, and PMGSY, and buried in PDFs and legacy portals. VIGIASearch consolidates it into a single semantic search engine and wraps a multi-stage reasoning pipeline around it that is engineered specifically to **never fabricate** a name, phone number, budget, or jurisdiction.

- **Ask anything about a road** — road type (NH/SH/MDR), contractor/concessionaire, sanctioned cost, contract mode (EPC/HAM/BOT), and an *inferred* last-maintenance/DLP timeline.
- **Get routed to the right authority** — the correct Executive Engineer, PWD division, or complaint/RTI portal for the road's jurisdiction.
- **Cross-source questions** — e.g. "phone number of the engineer responsible for NH-163G" resolves across NHAI contract data → district → PWD directory automatically.
- **Works globally** — tiered fallback to OCDS procurement data, the World Bank Projects API, and OpenStreetMap for non-India coordinates.
- **Works offline** — a geofenced on-device SQLite tier returns emergency contacts and PWD helplines with no network.

## How it works

A LangGraph stateful orchestration pipeline (Router → Parallel Ingest → Guardrail → UI Hook) running on Amazon Bedrock (Nova Lite / Nova Pro / Titan Embed v2):

| Stage | Role |
|---|---|
| **Router** | Classifies intent (complaint / rti / condition / personnel / tender_search / conversational) and selects agents. |
| **Ingest** | Dispatches Admin, Vision, and Telemetry agents in parallel (`Promise.allSettled`). Admin runs a ReWOO **Plan-and-Execute** sub-graph for multi-hop cross-source queries. |
| **Guardrail** | Self-RAG retrieval grading, CRAG corrective retry, spatial/jurisdiction checks, contradiction detection, and an Authority Matrix fallback when data is genuinely absent. |
| **UI Hook** | Emits sources, spatial map markers, and pending actions; the response is streamed with a strict anti-hallucination system prompt and post-hoc faithfulness scoring. |

Retrieval is a unified **pgvector** store with a `source_type` discriminator, exposed both as a single `searchUnified()` call and as federated per-source tools (`searchNHAI`, `searchPWD`, `searchPMGSY`) for targeted multi-hop retrieval. A local SQLite FTS5 index is the server-side fallback when pgvector is unreachable.

See [`TESTING.md`](TESTING.md) for the full evaluation matrix and a stress-test query suite mapped to the RoadWatch rubric.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Requires AWS Bedrock credentials and (for full retrieval) a deployed `vigia-retrieval-proxy` Lambda over an RDS/pgvector instance. Optional feature flags: `COHERE_API_KEY` (cross-encoder reranking), `UPSTASH_REDIS_REST_URL` (response caching).

## License

MIT © 2026 Tom Mathew and team.
