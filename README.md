<div align="center">

<img src="https://cdn.hashnode.com/res/hashnode/image/upload/v1783250336416/ae3c3edd-3ab6-4629-aa04-e2bca4bd69a3.png" alt="VIGIASearch banner" width="100%" />

# VIGIASearch

### A Hallucination-Resistant Road Intelligence System

*A synthesis-first civic assistant that audits Indian road infrastructure from official government evidence, and would rather say "I don't know, here is the official helpline" than fabricate an answer.*

[![Read the Blog](https://img.shields.io/badge/Read_the_Blog-ridingbluewaves.hashnode.dev-2563eb?style=for-the-badge&logo=hashnode&logoColor=white)](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning)

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black)
![LangGraph](https://img.shields.io/badge/Orchestration-LangGraph-1c3c3c?style=flat-square)
![Bedrock](https://img.shields.io/badge/Inference-AWS_Bedrock_Nova-ff9900?style=flat-square&logo=amazonaws&logoColor=white)
![pgvector](https://img.shields.io/badge/Retrieval-pgvector_+_FTS5-4169e1?style=flat-square&logo=postgresql&logoColor=white)
![PWA](https://img.shields.io/badge/Offline-PWA_+_Edge_SQLite-5a0fc8?style=flat-square&logo=pwa&logoColor=white)
![License](https://img.shields.io/badge/License-Apache_2.0-green?style=flat-square)

**Built for Problem Statement 2 · IIT Madras Road Safety Hackathon 2026**

</div>

---

## What it does

VIGIASearch answers citizen questions about Indian road infrastructure using evidence from official government documents, never from the model's imagination. It handles queries such as:

- Who is the executive engineer responsible for NH-163G, and what is their phone number?
- What was the sanctioned budget versus actual expenditure for a project?
- When was this road last relayed, and who is liable for it now?
- How do I file a complaint or an RTI request for a specific stretch?

The system is built around one stubborn principle: a fabricated engineer or a made-up phone number is more dangerous than an honest "I don't know," because a citizen might act on it during an emergency.

## Full architecture

<div align="center">
<img src="https://cdn.hashnode.com/res/hashnode/image/upload/v1783250520872/91b45843-3ba8-4dd7-bf38-1383879f98b1.png" alt="VIGIASearch full-system architecture" width="100%" />
</div>

## Core ideas

| Principle | How it is implemented |
|-----------|----------------------|
| **Evidence-backed answers** | Every factual claim cites a retrieved government document. Contact details are copied, never generated. |
| **Anti-hallucination in layers** | Self-RAG retrieval grading, a CRAG corrective retry loop, deterministic consistency checks, and an async faithfulness scorer. |
| **Deterministic where it matters** | The LLM plans and reasons; plain TypeScript holds the line on jurisdiction, retries, and routing. |
| **Offline-first** | IndexedDB persistence, PWA caching, and a geohash-tiled edge SQLite database for low-connectivity roads. |

## How it works

- **Router** classifies intent and selects agents (Admin, Vision, Telemetry).
- **Ingest** dispatches the agents concurrently with `Promise.allSettled`, so one timeout never sinks the whole response.
- **Admin agent** runs a ReWOO plan-and-execute retrieval loop over a unified **pgvector** store, resolving cross-source queries (for example, road to district to engineer) in about 5.5 seconds instead of the 9 to 12 a ReAct chain would take.
- **Guardrail** grades retrieval quality, rewrites and retries once on a data void or contradiction, and falls back to an Authority Matrix helpline when evidence runs out.
- **Streaming answer** is delivered with citations, and an LLM-as-Judge faithfulness scorer runs asynchronously as an observability signal.

A full write-up of the engineering decisions, including the ones we got wrong first, is on the blog:

**[Engineering VIGIASearch: Building a Hallucination-Resistant Road Intelligence System →](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning)**

## Tech stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Tailwind, Framer Motion, Leaflet |
| **Orchestration** | LangGraph (stateful graph, conditional edges, retry loop) |
| **Inference** | AWS Bedrock Nova (via the Vercel AI SDK) |
| **Retrieval** | pgvector unified store, SQLite FTS5 fallback, Cohere Rerank v3 (flagged) |
| **Ingestion** | AWS EventBridge CRON, Lambda, Titan embeddings |
| **Offline** | PWA (`next-pwa`), Dexie / IndexedDB, edge SQLite over CloudFront |
| **Voice** | Deepgram and Azure Speech for STT / TTS |

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.local` and provide the required keys (AWS Bedrock credentials, Postgres/pgvector connection, and optional `COHERE_API_KEY`, `UPSTASH_REDIS_REST_URL`, and voice provider keys). See [`docs/TECHNICAL_OVERVIEW.md`](docs/TECHNICAL_OVERVIEW.md) for the full environment reference.

## Documentation

- [`docs/TECHNICAL_OVERVIEW.md`](docs/TECHNICAL_OVERVIEW.md) — architecture, data layer, API reference, deployment
- [`docs/langgraph_pipeline.md`](docs/langgraph_pipeline.md) — the orchestration graph in detail
- [`docs/data.md`](docs/data.md) — data sources and coverage

## License

Released under the Apache License 2.0. See [`LICENSE`](LICENSE).

<div align="center">

Part of the ongoing **[Riding the Blue Wave](https://ridingbluewaves.hashnode.dev/)** build series.

</div>
