# VIGIA — Technical Overview

**Version:** 0.1.0  
**Last updated:** May 2026  
**Repository:** `vigia-public`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Application Structure](#4-application-structure)
5. [AI & RAG Pipeline](#5-ai--rag-pipeline)
6. [Retrieval & Data Layer](#6-retrieval--data-layer)
7. [Data Ingestion Pipeline (AWS)](#7-data-ingestion-pipeline-aws)
8. [Frontend & User Experience](#8-frontend--user-experience)
9. [Offline-First & PWA](#9-offline-first--pwa)
10. [Voice & Multilingual Support](#10-voice--multilingual-support)
11. [API Reference](#11-api-reference)
12. [Security & Reliability](#12-security--reliability)
13. [Testing](#13-testing)
14. [Environment Variables](#14-environment-variables)
15. [Deployment & Operations](#15-deployment--operations)
16. [Data Sources & Coverage](#16-data-sources--coverage)
17. [Future Roadmap](#17-future-roadmap)

---

## 1. Executive Summary

**VIGIA** (Government Infrastructure Intelligence) is an AI-powered audit platform that helps citizens verify budgets, track spatial data, and investigate Indian road infrastructure projects using evidence from official government documents.

The system answers questions such as:

- Who is responsible for maintaining a given highway?
- What was the sanctioned budget vs. actual expenditure for a project?
- How do I file a complaint or RTI request for a specific road?
- Who is the executive engineer for a district or division?

VIGIA is built around three core principles:

| Principle | Implementation |
|-----------|----------------|
| **Evidence-backed answers** | All factual claims must cite retrieved government documents |
| **Anti-hallucination** | CRAG guardrails, faithfulness scoring, and strict copy-paste rules for contact details |
| **Offline-first** | IndexedDB persistence, PWA caching, and edge SQLite sync for low-connectivity use |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client (Next.js PWA)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Chat Shell  │  │  Map/Spatial │  │ Voice Input  │  │  IndexedDB  │ │
│  │  + Sources   │  │  Dashboard   │  │  + TTS/STT   │  │  (Dexie)    │ │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
└─────────┼───────────────────────────────────────────────────────────────┘
          │ POST /api/chat (streaming)
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      LangGraph RAG Pipeline (Node.js)                   │
│                                                                         │
│   Router → Ingest → Guardrail → UI Hook → LLM Synthesizer             │
│              ↓          ↑                                               │
│           Agents    (retry loop)                                        │
│   ┌─────────┴─────────┐                                                 │
│   │ Admin │ Vision │ Telemetry │                                       │
│   └───────────────────┘                                                 │
└─────────┬───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Retrieval Layer                                 │
│   pgvector (RDS)  ←→  Lambda retrieval-proxy  ←→  SQLite FTS5 fallback │
│   Titan Embed v2       Cohere reranker (optional)                       │
└─────────┬───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AWS Ingestion Pipeline (CDK)                         │
│   Track A: PDF scraper → PDF parser → pgvector                         │
│   Track B: API ETL (Data.gov.in, PMGSY) → pgvector                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. User submits a query via the chat UI (text, voice, or image).
2. Message is persisted immediately to IndexedDB.
3. `/api/chat` checks semantic cache, then runs the LangGraph pipeline inline with streaming progress steps.
4. Evidence is retrieved from pgvector (or FTS5 fallback), graded by the Guardrail node, and transformed by the UI Hook.
5. Amazon Bedrock (Nova Lite/Pro) generates the final response with injected evidence context.
6. Response streams to the client with metadata: sources, spatial markers, budget data, and faithfulness score.
7. Assistant reply is cached and persisted to IndexedDB.

---

## 3. Technology Stack

### Frontend

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Framer Motion |
| Components | Radix UI (Dialog), Lucide icons |
| Maps | Leaflet + React-Leaflet, OSRM routing |
| Fonts | Manrope, Fraunces, Source Serif 4 |
| PWA | next-pwa + Workbox service worker |

### Backend & AI

| Layer | Technology |
|-------|------------|
| LLM | Amazon Bedrock — Nova Lite, Nova Pro |
| Embeddings | Amazon Titan Embed Text v2 (1024 dims) |
| Orchestration | LangGraph (`@langchain/langgraph`) |
| Streaming | Vercel AI SDK (`ai`, `@ai-sdk/amazon-bedrock`) |
| RSC | `@ai-sdk/rsc` for server actions |

### Data & Persistence

| Layer | Technology |
|-------|------------|
| Vector DB | PostgreSQL + pgvector (RDS) |
| Local search | better-sqlite3 FTS5 |
| Client storage | Dexie (IndexedDB) |
| Edge offline DB | sql.js WASM + geohash CDN sync |
| Semantic cache | Upstash Redis (optional) |

### Voice

| Layer | Technology |
|-------|------------|
| STT | Deepgram, Azure Speech SDK |
| TTS | Azure Neural Voices (13 Indian locales) |

### Infrastructure

| Layer | Technology |
|-------|------------|
| IaC | AWS CDK (TypeScript) |
| Compute | AWS Lambda |
| Storage | S3, DynamoDB |
| Scheduling | EventBridge CRON |
| Secrets | AWS Secrets Manager |

---

## 4. Application Structure

```
vigia-public/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout, fonts, PWA meta
│   ├── (chat)/
│   │   ├── layout.tsx            # Chat layout with providers
│   │   ├── page.tsx              # New chat (/)
│   │   └── t/[threadId]/page.tsx # Thread view
│   ├── api/
│   │   ├── chat/route.ts         # Main streaming chat endpoint
│   │   ├── evidence/route.ts     # Evidence retrieval
│   │   ├── health/route.ts       # Health check
│   │   ├── transcribe/route.ts   # Legacy STT
│   │   ├── tts/route.ts          # Legacy TTS
│   │   └── voice/
│   │       ├── transcribe/route.ts
│   │       └── speak/route.ts
│   ├── ai/provider.tsx           # AI SDK RSC provider
│   └── actions.tsx               # Server actions
│
├── components/
│   ├── chat/                     # Chat UI (32 components)
│   ├── layout/                   # App shell, sidebar, mobile nav
│   ├── ui/                       # Reusable primitives
│   └── brand/                    # Logo, branding
│
├── lib/
│   ├── agents/                   # LangGraph pipeline nodes
│   │   ├── graph.ts              # StateGraph definition
│   │   ├── router.ts             # Intent classification
│   │   ├── ingest.ts             # Parallel agent dispatch
│   │   ├── guardrail.ts          # CRAG quality gate
│   │   ├── ui-hook.ts            # Evidence → UI payload
│   │   ├── synthesizer.ts        # Final audit finding
│   │   ├── faithfulness.ts       # LLM-as-judge scoring
│   │   ├── planner.ts            # ReWOO plan generation
│   │   ├── executor.ts           # Plan execution
│   │   ├── rewriter.ts           # Query rewrite on retry
│   │   └── agents/
│   │       ├── admin.ts          # Document retrieval agent
│   │       ├── vision.ts         # Image damage analysis
│   │       └── telemetry.ts      # GPS/accelerometer IRI
│   ├── tools/                    # Retrieval & lookup tools
│   ├── db/                       # IndexedDB (Dexie) layer
│   ├── edge/                     # Edge CDN sync + failover
│   ├── voice/                    # STT/TTS, locale detection
│   ├── cache/                    # Semantic response cache
│   ├── security/                 # Rate limiting
│   ├── map/                      # Route geometry fetching
│   └── mcp/                      # Model Context Protocol client
│
├── infrastructure/               # AWS CDK + Lambda pipeline
│   ├── cdk/
│   │   ├── app.ts
│   │   └── stacks/ingestion-stack.ts
│   └── pipeline/
│       ├── track-a/                # PDF ingestion
│       ├── track-b/                # API ETL
│       ├── query/                  # Retrieval proxy Lambda
│       └── shared/                 # Config & types
│
├── data/                           # Static datasets
│   ├── authority-matrix.json       # Complaint/RTI routing
│   ├── nh44-sections.json          # NH-44 case study data
│   └── nhai_mock.db                # Local FTS5 database
│
├── scripts/                        # Ingestion & utility scripts
├── tests/                          # Integration & pipeline tests
└── docs/                           # Technical documentation
```

### Import Boundaries

The codebase enforces strict module boundaries (see `CONTRIBUTING.md`):

```
components/*  →  lib/*  →  infrastructure/*
     ↓              ↓
  (UI only)   (no React)   (AWS/Lambda only)
```

- UI components must not define Dexie schemas or business logic.
- `lib/db/*` is browser-safe only — no React imports.
- Chat orchestration lives in route handlers and `lib/agents/*`.

---

## 5. AI & RAG Pipeline

VIGIA uses a **LangGraph stateful orchestration pipeline** with 5 nodes and a corrective retrieval (CRAG) loop.

```
User Query → Router → Ingest → Guardrail → UI Hook → LLM Response
                         ↓          ↑
                      Agents    (retry loop)
```

### 5.1 Router Node

**File:** `lib/agents/router.ts`  
**Model:** Amazon Nova Lite

Classifies user intent into one of:

| Intent | Description |
|--------|-------------|
| `condition` | Road condition / quality queries |
| `complaint` | How to file a complaint |
| `rti` | RTI filing guidance |
| `personnel` | Officer / contact lookup |
| `tender_search` | Contract / tender information |
| `conversational` | General chat (short-circuited to LLM) |

Conversational queries bypass the full pipeline and go directly to the LLM.

### 5.2 Ingest Node

**File:** `lib/agents/ingest.ts`

Dispatches specialist agents in parallel via `Promise.allSettled`:

| Agent | File | Purpose |
|-------|------|---------|
| **Admin** | `lib/agents/agents/admin.ts` | Plan-and-Execute (ReWOO) document retrieval |
| **Vision** | `lib/agents/agents/vision.ts` | Road image damage severity analysis |
| **Telemetry** | `lib/agents/agents/telemetry.ts` | GPS + accelerometer roughness (IRI) estimation |

Each agent has a 6-second timeout. On retry (after Guardrail failure), only the Admin agent re-runs with a rewritten query.

The Admin agent uses a **Plan-and-Execute sub-graph**:

1. Generate a multi-step retrieval plan from the query.
2. Execute tool calls in topological order (no intermediate LLM steps).
3. Cross-reference results from multiple sources.

### 5.3 Guardrail Node

**File:** `lib/agents/guardrail.ts`

Implements **CRAG (Corrective RAG)** — the quality control gate:

1. **Retrieval grading** — Minimum cosine similarity threshold: 0.4
2. **Data void detection** — All evidence below threshold triggers rewrite
3. **Query rewrite** — LLM broadens or reframes the query
4. **Retry loop** — Re-runs Ingest (max 2 retries)
5. **Authority fallback** — On persistent data void, returns portal URLs and helplines from the Authority Matrix
6. **Contradiction detection** — Cross-checks official docs vs. visual/telemetry evidence

### 5.4 UI Hook Node

**File:** `lib/agents/ui-hook.ts`

Zero-LLM-token data transformation. Extracts:

- Spatial markers (lat/lng for map rendering)
- Budget data (sanctioned vs. spent)
- Citations (source document + chunk references)
- Pending actions (complaint routing cards)
- Frontend formatting metadata

### 5.5 Synthesizer & Faithfulness

**Files:** `lib/agents/synthesizer.ts`, `lib/agents/faithfulness.ts`

The final LLM response is generated in `/api/chat/route.ts` with injected pipeline evidence. Post-generation:

- **Faithfulness scoring** — LLM-as-judge evaluates whether the response is faithful to retrieved chunks (async, non-blocking)
- **Semantic caching** — Responses cached in Upstash Redis for identical queries

### 5.6 Anti-Hallucination Measures

| Measure | Implementation |
|---------|----------------|
| Strict system prompt | COPY-PASTE instructions for contact details |
| VERIFIED CONTACT DETAILS block | Structured extraction for personnel queries |
| Nova Pro upgrade | Personnel queries use Nova Pro instead of Nova Lite |
| Faithfulness scoring | Post-generation async LLM-as-judge |
| Geographic enforcement | PWD contact search constrained to queried state/district |
| Authority fallback | Never hallucinate when data void persists |

---

## 6. Retrieval & Data Layer

### 6.1 Unified Search

**File:** `lib/tools/search-unified.ts`

```
Query → Titan Embed v2 → pgvector cosine search (top 20)
                                    ↓
Query → SQLite FTS5 keyword search (top 20)
                                    ↓
                        RRF merge → top 10
                                    ↓
                    Cohere rerank (optional) → top 5
```

| Layer | Technology | Purpose |
|-------|------------|---------|
| Primary | pgvector + Lambda proxy | Semantic search with real similarity scores |
| Fallback | Local SQLite FTS5 | Keyword search when pgvector unreachable |
| Hybrid | Reciprocal Rank Fusion | Merges vector + keyword results |
| Reranking | Cohere cross-encoder | Top-K refinement (optional) |

### 6.2 Tool Library

| Tool | File | Purpose |
|------|------|---------|
| `searchUnified` | `lib/tools/search-unified.ts` | Primary semantic search |
| `searchFederated` | `lib/tools/search-federated.ts` | Multi-source federated search |
| `tenderSearch` | `lib/tools/tender-search.ts` | Contract/tender lookup |
| `pwdContacts` | `lib/tools/pwd-contacts.ts` | State PWD officer directories |
| `rtiLookup` | `lib/tools/rti-lookup.ts` | RTI filing guidance |
| `complaintRouting` | `lib/tools/complaint-routing.ts` | Authority Matrix complaint paths |
| `gatiShakti` | `lib/tools/gati-shakti.ts` | Gati Shakti portal integration |
| `globalEngine` | `lib/tools/global-engine.ts` | World Bank / OCDS international data |
| `reranker` | `lib/tools/reranker.ts` | Cohere cross-encoder reranking |

### 6.3 Client-Side Persistence

**File:** `lib/db/offline-store.ts`

Dexie schema (v2):

| Store | Purpose |
|-------|---------|
| `threads` | Conversation threads |
| `messages` | Turn-level messages with sync status |
| `requests` | Legacy offline request queue |
| `responses` | Cached API responses |
| `evidence` | Staged evidence for offline viewing |
| `settings` | App settings and migration flags |

**Behavior:**

- User messages saved immediately as `pending`.
- Background sync resolves pending messages when online.
- Conservative cleanup (45-day retention, never deletes pending records).
- Quota guard with emergency 7-day cleanup on `QuotaExceededError`.

### 6.4 Edge Offline Database

**File:** `lib/edge/sync.ts`

Geofenced sync from CDN for offline road segment and contact data:

- Downloads SQLite databases by geohash tile (~40 km precision).
- Stores in IndexedDB, queried via sql.js WASM.
- Enables basic offline lookups without network access.

---

## 7. Data Ingestion Pipeline (AWS)

**Deploy:** `cd infrastructure && npx cdk deploy`

### 7.1 Infrastructure (CDK Stack)

**File:** `infrastructure/cdk/stacks/ingestion-stack.ts`

| Resource | Name | Purpose |
|----------|------|---------|
| S3 | `vigia-raw-documents` | Raw PDF storage (90-day lifecycle) |
| S3 | `vigia-structured-data` | Structured JSONL output |
| S3 | `vigia-fts5-db` | Versioned FTS5 database for edge CDN |
| DynamoDB | `vigia-document-hashes` | PDF deduplication by SHA-256 |
| RDS | `vigia-pgvector` | PostgreSQL 16 + pgvector extension |
| Lambda | `pdf-scraper` | Downloads new PDFs from NHAI/MoRTH |
| Lambda | `pdf-parser` | Text extraction, chunking, embedding |
| Lambda | `api-etl` | Data.gov.in + PMGSY ingestion |
| Lambda | `retrieval-proxy` | Query embedding + pgvector search |
| EventBridge | Daily CRON | Triggers Track A and Track B |

### 7.2 Track A — PDF Ingestion

```
EventBridge CRON (daily)
    → pdf-scraper Lambda (512MB)
        - Downloads new PDFs from NHAI/MoRTH websites
        - Deduplicates via DynamoDB hash table
        - Stores raw PDF in S3
    → pdf-parser Lambda (2048MB, 10min timeout)
        - Extracts text + tables from PDF
        - Semantic chunking (preserves table structure)
        - Generates Titan Embed v2 embeddings per chunk
        - Upserts into pgvector
```

### 7.3 Track B — API Ingestion

```
EventBridge CRON (daily)
    → api-etl Lambda (256MB)
        - Fetches from Data.gov.in, PMGSY OMMAS portal
        - Transforms to structured JSONL
        - Stores in S3
        - Embeds and upserts into pgvector
```

### 7.4 Estimated AWS Costs

See `docs/aws_costs.md` for full breakdown.

| Scenario | Monthly Estimate |
|----------|-----------------|
| Hackathon/MVP (~500 queries/day) | $60–$93 |
| With NAT Gateway | ~$92.50 |
| Without NAT Gateway | ~$59.50 |

RDS PostgreSQL is the dominant cost (~50–80%). Bedrock inference costs are minimal at this scale.

---

## 8. Frontend & User Experience

### 8.1 Routing

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `ChatShell` | New conversation |
| `/t/[threadId]` | `ChatShell` | Existing thread |

URL-driven thread routing with IndexedDB hydration on load.

### 8.2 Chat Components

| Component | Purpose |
|-----------|---------|
| `chat-shell.tsx` | Main orchestrator — messages, voice, map, sources |
| `input-bar.tsx` | Text input, image upload, location toggle |
| `chat-message.tsx` | Rendered message with markdown |
| `markdown-body.tsx` | Markdown renderer with citation support |
| `live-pipeline.tsx` | Real-time pipeline step indicators |
| `pipeline-trace.tsx` | Debug trace visualization |
| `sources-panel.tsx` | Evidence source drawer |
| `sources-strip.tsx` | Inline source chips |
| `source-carousel.tsx` | Swipeable source cards |
| `citation-chip.tsx` / `citation-pill.tsx` | Inline citations |
| `map-dashboard.tsx` | Leaflet map with road markers |
| `map-carousel.tsx` | Spatial evidence carousel |
| `financial-bar.tsx` | Budget sanctioned vs. spent chart |
| `pending-action-card.tsx` | Complaint/RTI action cards |
| `voice-session-bar.tsx` | Voice recording UI |
| `voice-input.tsx` | Microphone capture |
| `voice-visualizer.tsx` | Audio waveform display |
| `mobile-sources-sheet.tsx` | Mobile bottom sheet for sources |
| `message-action-bar.tsx` | Copy, speak, follow-up actions |

### 8.3 Layout & Navigation

| Component | Purpose |
|-----------|---------|
| `app-shell.tsx` | Root shell with sidebar + mobile nav |
| `sidebar.tsx` | Desktop sidebar with query history |
| `mobile-sidebar.tsx` | Mobile drawer navigation |
| `mobile-bottom-nav.tsx` | Bottom tab bar (mobile) |
| `sidebar-settings.tsx` | Settings panel |
| `query-history.tsx` | Thread list with search |
| `pwa-install-badge.tsx` | Install prompt for PWA |

### 8.4 Context Providers

| Provider | File | Purpose |
|----------|------|---------|
| `EvidenceProvider` | `components/chat/evidence-context.tsx` | Shared evidence state |
| `HeaderTabProvider` | `components/chat/header.tsx` | Chat/Map tab switching |
| `MapProvider` | `lib/context/map-context.tsx` | Map state and markers |
| `SidebarProvider` | `lib/context/sidebar-context.tsx` | Sidebar open/close |
| `AI` (RSC) | `app/ai/provider.tsx` | AI SDK server actions |

### 8.5 Design System

- **Fonts:** Manrope (body), Fraunces (display), Source Serif 4 (answers)
- **Tokens:** Semantic CSS variables in `app/globals.css`
- **Motion:** Framer Motion for page transitions and pipeline steps
- **Responsive:** Mobile-first with bottom nav, desktop sidebar

---

## 9. Offline-First & PWA

### 9.1 Progressive Web App

**Config:** `next.config.ts`, `public/manifest.json`

| Feature | Implementation |
|---------|----------------|
| Installable | Web app manifest with icons (192px, 512px) |
| Standalone display | Full-screen app experience |
| Service worker | Workbox precaching + runtime caching |
| Shortcuts | "New Search" and "History" app shortcuts |

**Runtime caching strategies:**

| Pattern | Strategy | Cache Name |
|---------|----------|------------|
| Google Fonts | CacheFirst | `google-fonts-cache` |
| `/_next/static/` | CacheFirst | `next-static-cache` |
| `/_next/image/` | StaleWhileRevalidate | `next-image-cache` |

### 9.2 Offline Chat Flow

```
1. User sends message
2. Message saved to IndexedDB immediately (syncStatus: pending)
3. If online → POST /api/chat → store assistant reply (syncStatus: synced)
4. If offline → UI shows pending state
5. On reconnect → background sync resolves pending messages
```

### 9.3 Edge Database Sync

For users in areas with intermittent connectivity:

- Geohash-tiled SQLite databases synced from CDN (`NEXT_PUBLIC_EDGE_CDN`)
- Contains road segments, PWD helpdesk contacts, emergency numbers
- Queried locally via sql.js WASM without network

---

## 10. Voice & Multilingual Support

### 10.1 Supported Locales

13 Indian BCP-47 locales with Azure Neural Voices:

| Locale | Language | Voice |
|--------|----------|-------|
| `en-IN` | English | NeerjaNeural |
| `hi-IN` | Hindi | SwaraNeural |
| `ta-IN` | Tamil | PallaviNeural |
| `te-IN` | Telugu | ShrutiNeural |
| `mr-IN` | Marathi | AarohiNeural |
| `bn-IN` | Bengali | TanishaaNeural |
| `gu-IN` | Gujarati | DhwaniNeural |
| `kn-IN` | Kannada | SapnaNeural |
| `ml-IN` | Malayalam | SobhanaNeural |
| `pa-IN` | Punjabi | VaaniNeural |
| `or-IN` | Odia | SubhasiniNeural |
| `ur-IN` | Urdu | GulNeural |

### 10.2 Voice Pipeline

```
User speaks → Deepgram/Azure STT → locale detection
    → Chat API (with responseLanguage) → Azure TTS → audio playback
```

**Key files:**

| File | Purpose |
|------|---------|
| `lib/voice/locale.ts` | Script detection, locale resolution, multilingual prompts |
| `lib/voice/azure-stt.ts` | Azure Speech-to-Text |
| `lib/voice/azure-tts.ts` | Azure Text-to-Speech |
| `lib/voice/transcribe-handler.ts` | STT route handler |
| `hooks/use-voice-chat.ts` | Client-side voice session management |
| `lib/voice/speak-text.ts` | TTS playback orchestration |

Language detection uses Unicode script ranges (Devanagari, Tamil, Malayalam, etc.) and ISO 639-1 prefix mapping.

---

## 11. API Reference

### POST `/api/chat`

Main streaming chat endpoint.

**Request:**
```json
{
  "messages": [{ "role": "user", "parts": [{ "type": "text", "text": "..." }] }],
  "responseLanguage": "hi-IN",
  "voiceLocale": "hi-IN"
}
```

**Response:** AI SDK UI message stream with:

- `text-delta` — Streaming response text
- `data-vigia-step` — Pipeline progress steps
- `message-metadata` — Evidence, sources, spatial markers, budget data, faithfulness score

**Limits:** 256 KB body, 30 requests/minute per IP.

### POST `/api/voice/transcribe`

Speech-to-text for voice input. Accepts audio blob, returns transcript + detected locale.

### POST `/api/voice/speak`

Text-to-speech. Accepts text + locale, returns audio stream.

### GET `/api/health`

Health check. Returns `{ status: "ok", timestamp }`.

### POST `/api/evidence`

Evidence retrieval endpoint for staged evidence display.

---

## 12. Security & Reliability

### 12.1 Rate Limiting

**File:** `lib/security/rate-limit.ts`

In-memory sliding window rate limiter:

- Chat: 30 requests/minute per IP
- Returns `429 Too Many Requests` with `Retry-After` header

### 12.2 Input Validation

- Maximum request body: 256 KB
- Message array required and non-empty
- Voice locale validated against supported locales

### 12.3 Failover

**File:** `lib/edge/failover.ts`

Network mode detection with graceful degradation:

- Primary: pgvector via Lambda proxy
- Fallback: Local SQLite FTS5
- Edge: CDN-synced SQLite for offline

### 12.4 Security Scanning

```bash
npm run security:scan   # Custom security scan script
npm run security:audit    # npm audit
npm run security:hooks    # Enable pre-commit hooks
```

Pre-commit hook at `.githooks/pre-commit` runs on commit.

---

## 13. Testing

### Test Suite

| Test | File | Coverage |
|------|------|----------|
| NH-44 data integrity | `tests/nh44-data.test.ts` | Structured NH-44 section data |
| NH-44 pipeline full | `tests/nh44-pipeline-full.test.ts` | End-to-end pipeline for NH-44 queries |
| NH-44 query E2E | `tests/nh44-query-e2e.test.ts` | Query → response validation |
| Hallucination fix | `tests/hallucination-fix.test.ts` | Anti-hallucination guardrails |
| Multi-hop subgraph | `tests/multi-hop-subgraph.test.ts` | Multi-hop retrieval decomposition |

### Utility Scripts

| Script | Purpose |
|--------|---------|
| `scripts/test-pwa-cache.js` | PWA cache validation |
| `scripts/security-scan.js` | Security vulnerability scan |
| `scripts/embed-unified.ts` | Batch embedding for ingestion |
| `scripts/ingest-nh44.ts` | NH-44 data ingestion |
| `scripts/seed-db.ts` | Database seeding |
| `scripts/seed-pwd-contacts.ts` | PWD contact seeding |

---

## 14. Environment Variables

### Application (Next.js)

| Variable | Required | Purpose |
|----------|----------|---------|
| `APP_AWS_REGION` | Yes | Bedrock + Lambda region. Prefer this name in Amplify because `AWS_*` user env vars are reserved. |
| AWS credentials | Yes* | Use the default AWS credential chain, an IAM role, or local AWS CLI profile. Do not set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in Amplify env vars. |
| `DEEPGRAM_API_KEY` | For voice | Deepgram STT |
| `AZURE_SPEECH_KEY` | For voice | Azure STT/TTS |
| `AZURE_SPEECH_REGION` | For voice | Azure region (e.g., `centralindia`) |
| `COHERE_API_KEY` | Optional | Cross-encoder reranking |
| `UPSTASH_REDIS_REST_URL` | Optional | Semantic response cache |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Semantic response cache |
| `NEXT_PUBLIC_EDGE_CDN` | Optional | Edge DB CDN base URL |

### Infrastructure (Lambda/CDK)

| Variable | Purpose |
|----------|---------|
| `PG_HOST` | PostgreSQL host |
| `PG_PORT` | PostgreSQL port (default: 5432) |
| `PG_DATABASE` | Database name (default: `vigia`) |
| `PG_USER` | Database user (default: `vigia_pipeline`) |
| `PG_SECRET_ARN` | Secrets Manager ARN for DB password |
| `RAW_BUCKET` | S3 raw documents bucket |
| `STRUCTURED_BUCKET` | S3 structured data bucket |
| `FTS5_BUCKET` | S3 FTS5 database bucket |
| `HASH_TABLE` | DynamoDB hash dedup table |
| `DATA_GOV_API_KEY` | Data.gov.in API key |
| `CDK_DEFAULT_ACCOUNT` | AWS account for CDK deploy |
| `CDK_DEFAULT_REGION` | AWS region for CDK deploy |

---

## 15. Deployment & Operations

### Local Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # Production build with PWA
npm run start        # Production server
npm run lint         # ESLint
```

### Production Build

- PWA service worker generated in `public/sw.js` (Workbox)
- Webpack build (`next build --webpack`) for PWA compatibility
- PWA disabled in development mode

### AWS Infrastructure

```bash
cd infrastructure
npm install
npx cdk deploy     # Deploy ingestion pipeline
```

### Monitoring

- CloudWatch Logs for Lambda functions
- Health endpoint: `GET /api/health`
- Pipeline debug trace emitted in chat metadata

---

## 16. Data Sources & Coverage

See `docs/data.md` for the full data source catalog.

### Primary Sources (Ingested)

| Source | Fields | Coverage |
|--------|--------|----------|
| NHAI Awarded Projects PDFs | Road, lanes, contractor, cost, dates | 100% |
| NHAI Financial Progress | Sanctioned vs. spent, progress % | 95% cost, 60% expenditure |
| NHAI O&M/PBMC Contracts | Maintenance responsibility, dates | 80% |
| NHAI Periodic Renewal Sanctions | Resurfacing dates and costs | 40% last-maintained |
| NHAI TOT Bundle Status | 20-year O&M obligations | Key bundles |
| MoRTH Annual Report | Scheme-wise budget allocation | Macro-level |
| PMGSY OMMAS Portal | Rural road data | District-level |
| State PWD Directories | Officer names, phones, emails | Maharashtra, Telangana |
| Authority Matrix | Complaint/RTI routing per road type | All road classes |
| NH-44 Structured Data | 10 sections, full project metadata | Case study |

### Data Gaps

| Data Point | Coverage | Blocker |
|------------|----------|---------|
| Per-km condition (PCI/IRI) | 0% | NHAI RAMS requires credentials |
| Exact resurfacing dates (EPC) | 20% | Internal PIU registers |
| Per-km expenditure | 0% | Running Account bills not public |

---

## 17. Future Roadmap

### Planned Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Complaint Routing** | Direct PGPortal API integration for automated filing | Planned (gov support needed) |
| **DePIN Telemetry** | Crowdsourced road condition via phone sensors + token rewards | Future |
| **NHAI RAMS Integration** | PCI/IRI data via institutional MoU | Blocked (requires credentials) |
| **Multi-language Voice** | Expand from 13 to all 22 scheduled languages | In progress |
| **Parliament Q&A** | MP project expenditure questions from Lok Sabha archives | Planned |
| **Web Search Fallback** | Graceful degradation for roads not in index | Planned |
| **CAG Audit Reports** | Sampled PCI/IRI from audit reports | Planned |

### Technical Debt

| Item | Location | Notes |
|------|----------|-------|
| Chat provider stub | `lib/chat/provider.tsx` | AI SDK RSC integration path documented in CONTRIBUTING.md |
| Legacy chat types | `lib/chat/types.ts`, `types/chat.ts` | Consolidate on refactor |
| MCP client | `lib/mcp/client.ts` | Spawns subprocess per call — needs connection pooling |

---

## Appendix: Key File Index

| Domain | Primary Files |
|--------|--------------|
| Pipeline graph | `lib/agents/graph.ts` |
| Chat API | `app/api/chat/route.ts` |
| Chat UI | `components/chat/chat-shell.tsx` |
| Offline DB | `lib/db/offline-store.ts` |
| Unified search | `lib/tools/search-unified.ts` |
| Authority Matrix | `data/authority-matrix.json` |
| CDK stack | `infrastructure/cdk/stacks/ingestion-stack.ts` |
| PWA config | `next.config.ts`, `public/manifest.json` |
| Voice locale | `lib/voice/locale.ts` |
| Pipeline docs | `docs/langgraph_pipeline.md` |
| Data docs | `docs/data.md` |
| Cost docs | `docs/aws_costs.md` |
| Contributing | `CONTRIBUTING.md` |

---

*This document reflects the state of the codebase as of May 2026. For pipeline-specific details, see `docs/langgraph_pipeline.md`. For data source specifics, see `docs/data.md`.*
