# VIGIA Zero-Mock Data Engine — Technical Design Specification

> **Version:** 1.0.0  
> **Date:** 2026-05-21  
> **Author:** VIGIA Architecture Team  
> **Status:** PROPOSED  
> **Audience:** Engineering, Product, Hackathon Judges

---

## Table of Contents

1. [Module 1: Daily Ingestion Pipeline Architecture (Dual-Track ETL/RAG)](#module-1-daily-ingestion-pipeline-architecture)
2. [Module 2: Rubric-to-Data Stream Mapping](#module-2-rubric-to-data-stream-mapping)
3. [Module 3: Global Applicability Engine](#module-3-global-applicability-engine)
4. [Module 4: Offline Edge Resilience](#module-4-offline-edge-resilience)
5. [Appendix: Migration Path from Current Mocks](#appendix-migration-path)

---

## Executive Summary

This specification replaces all 7 hardcoded mocks identified in the VIGIA architecture audit with production-grade, verifiable data streams. The design uses a **Hybrid RAG** architecture combining semantic vector search (for unstructured government PDFs) with deterministic FTS5 lookup (for structured identifiers), backed by a serverless AWS ingestion pipeline running on a daily CRON cadence.

**Design Principles:**
- Zero-trust security at every data boundary
- Idempotent pipelines — safe to re-run without duplication
- Edge-first resilience for low-connectivity field use
- Global fallback for international road networks
- Audit trail on every data mutation

---

## Module 1: Daily Ingestion Pipeline Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EventBridge Scheduler (CRON)                       │
│                    Rate: daily 02:00 UTC                              │
└──────────────┬──────────────────────────────────┬────────────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────────┐       ┌──────────────────────────────────┐
│   Track A: Unstructured  │       │   Track B: Structured APIs       │
│   (PDF → Vector Store)   │       │   (JSON/CSV → SQLite FTS5)       │
│                          │       │                                  │
│  ┌────────────────────┐  │       │  ┌────────────────────────────┐  │
│  │ Lambda: pdf-scraper │  │       │  │ Lambda: api-etl            │  │
│  │ → S3 raw bucket    │  │       │  │ → Data.gov.in              │  │
│  └────────┬───────────┘  │       │  │ → NHAI Dashboard APIs      │  │
│           │               │       │  │ → State PWD portals        │  │
│           ▼               │       │  └────────────┬───────────────┘  │
│  ┌────────────────────┐  │       │               │                  │
│  │ Lambda: pdf-parser  │  │       │               ▼                  │
│  │ LlamaIndex +        │  │       │  ┌────────────────────────────┐  │
│  │ SemanticSplitter    │  │       │  │ Lambda: fts5-loader        │  │
│  └────────┬───────────┘  │       │  │ → SQLite FTS5 rebuild      │  │
│           │               │       │  └────────────────────────────┘  │
│           ▼               │       │                                  │
│  ┌────────────────────┐  │       └──────────────────────────────────┘
│  │ pgvector (RDS)     │  │
│  │ Vector embeddings  │  │
│  └────────────────────┘  │
└──────────────────────────┘
```

### 1.2 Track A: Unstructured Document Ingestion

**Target Sources:**
| Source | URL Pattern | Update Frequency |
|--------|-------------|-----------------|
| CPPP (Central Public Procurement Portal) | `https://eprocure.gov.in/cppp/` | Daily |
| NHAI Award Letters | `https://nhai.gov.in/nhai/sites/default/files/` | Weekly |
| MoRTH Circulars | `https://morth.nic.in/circulars` | Monthly |

**Lambda: `pdf-scraper` (Step 1)**

```
Runtime:        Python 3.12
Memory:         512 MB
Timeout:        5 min
Trigger:        EventBridge CRON (daily 02:00 UTC)
Output:         s3://vigia-raw-documents/{source}/{YYYY-MM-DD}/{sha256}.pdf
```

**Idempotency Strategy:**
1. Compute SHA-256 hash of each downloaded PDF.
2. Check against DynamoDB table `document_hashes` (partition key: `sha256`, sort key: `source`).
3. If hash exists → skip (already processed). If new → write to S3, insert hash record.
4. S3 `PutObject` event triggers the parser Lambda asynchronously.

```typescript
// Pseudocode: idempotency check
const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
const existing = await dynamo.get({ TableName: 'document_hashes', Key: { sha256: hash } });
if (existing.Item) return { status: 'skipped', reason: 'duplicate' };
await s3.putObject({ Bucket: 'vigia-raw-documents', Key: `cppp/${date}/${hash}.pdf`, Body: pdfBuffer });
await dynamo.put({ TableName: 'document_hashes', Item: { sha256: hash, source: 'cppp', ingestedAt: Date.now() } });
```

**Lambda: `pdf-parser` (Step 2)**

```
Runtime:        Python 3.12
Memory:         2048 MB (PDF parsing is memory-intensive)
Timeout:        10 min
Trigger:        S3 PutObject event on vigia-raw-documents/*
Dependencies:   llamaindex, pypdf2, sentence-transformers
```

**Semantic Splitting Strategy:**

```python
from llama_index.core.node_parser import SemanticSplitterNodeParser
from llama_index.embeddings.bedrock import BedrockEmbedding

embed_model = BedrockEmbedding(model_name="amazon.titan-embed-text-v2:0")

splitter = SemanticSplitterNodeParser(
    buffer_size=2,            # 2-sentence sliding context window
    breakpoint_percentile_threshold=85,  # Split when semantic similarity drops below 85th percentile
    embed_model=embed_model,
)

# Each node retains surrounding legal/financial context
nodes = splitter.get_nodes_from_documents(documents)
```

**Why `SemanticSplitterNodeParser`:** Government PDFs mix financial tables, legal clauses, and project metadata in unpredictable layouts. Fixed-size chunking breaks mid-sentence across critical data boundaries. Semantic splitting preserves the full context of each clause (e.g., keeping "Concessionaire: ABC Ltd" in the same chunk as "Contract Value: ₹450 Cr").

**Embedding & Storage:**
- Model: `amazon.titan-embed-text-v2:0` (1024 dimensions)
- Target: pgvector on RDS PostgreSQL 16
- Index type: HNSW (`lists=100`, `probes=10`) for sub-50ms retrieval

### 1.3 Track B: Structured Data API Ingestion

**Target Sources:**
| Source | Endpoint | Format | Auth |
|--------|----------|--------|------|
| Data.gov.in (Road Statistics) | `https://data.gov.in/resource/{id}` | JSON/CSV | API Key (free) |
| NHAI Project Monitoring | `https://nhai.gov.in/api/projects` | JSON | None (public) |
| PMGSY OMMAS | `https://omms.nic.in/` | HTML/JSON | None |
| State PWD Dashboards | Varies by state | JSON/HTML | None |

**Lambda: `api-etl`**

```
Runtime:        Node.js 22.x
Memory:         256 MB
Timeout:        3 min
Trigger:        EventBridge CRON (daily 03:00 UTC, after Track A)
Output:         s3://vigia-structured-data/{source}/{YYYY-MM-DD}.jsonl
```

**ETL Normalization Schema:**

```typescript
interface NormalizedProjectRecord {
  roadNumber: string;          // "NH-44", "SH-15"
  projectName: string;
  concessionaire: string;
  contractMode: 'HAM' | 'EPC' | 'BOT' | 'DBFOT';
  sanctionedAmountCrore: number | null;
  expenditureAmountCrore: number | null;
  awardDate: string | null;    // ISO 8601
  completionDate: string | null;
  state: string;
  districtsCovered: string[];
  lengthKm: number | null;
  sourceUrl: string;
  ingestedAt: string;          // ISO 8601
}
```

**Lambda: `fts5-loader` (Step 2)**

Rebuilds the SQLite FTS5 database from the normalized JSONL files:

```sql
-- Schema: data/nhai_production.db
CREATE VIRTUAL TABLE IF NOT EXISTS projects USING fts5(
  road_number,
  project_name,
  concessionaire,
  contract_mode,
  state,
  content,               -- Full-text searchable blob
  tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS project_metadata (
  id INTEGER PRIMARY KEY,
  road_number TEXT NOT NULL,
  sanctioned_amount_crore REAL,
  expenditure_amount_crore REAL,
  award_date TEXT,
  completion_date TEXT,
  length_km REAL,
  source_url TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  UNIQUE(road_number, source_url)  -- Idempotency constraint
);
```

The rebuilt `.db` file is uploaded to S3 and pulled by the application at deploy time (or via a CloudFront-cached endpoint for edge nodes).

### 1.4 Hybrid Index Query Strategy

```
User Query: "Who is the contractor for NH-44 near Hyderabad?"
                    │
                    ▼
         ┌─────────────────────┐
         │   Query Router      │
         │   (deterministic)   │
         └──────┬──────┬───────┘
                │      │
    ┌───────────┘      └───────────┐
    ▼                              ▼
┌────────────────┐      ┌──────────────────────┐
│ SQLite FTS5    │      │ pgvector Semantic     │
│ MATCH "NH-44" │      │ similarity_search(    │
│ → exact hits   │      │   embed("contractor  │
│                │      │   NH-44 Hyderabad"))  │
└───────┬────────┘      └──────────┬───────────┘
        │                          │
        ▼                          ▼
┌─────────────────────────────────────────────┐
│         Reciprocal Rank Fusion (RRF)        │
│   Merge + deduplicate by road_number        │
│   Return top-K with source citations        │
└─────────────────────────────────────────────┘
```

**Decision Logic:**
- If query contains an explicit road identifier (regex: `/[NS]H-?\d+|MDR-?\d+/i`) → FTS5 first, vector second
- If query is purely semantic ("roads in bad condition near Pune") → vector first, FTS5 as fallback
- Results merged via RRF with `k=60` constant


---

## Module 2: Rubric-to-Data Stream Mapping

### 2.1 Complete Data Source Matrix

This matrix maps every hackathon evaluation criterion to a **verifiable, non-mocked** data source.

| # | Data Point | Current Status | Production Source | Ingestion Track | Latency |
|---|-----------|---------------|-------------------|-----------------|---------|
| 1 | Road Type, Name & Geometry | ✅ LIVE | OpenStreetMap Overpass API | Real-time (per-request) | ~200ms |
| 2 | Amount Sanctioned / Spent | ❌ MOCK | CPPP Award PDFs + Data.gov.in | Track A + Track B | Daily batch |
| 3 | Contractor / Concessionaire Name | ❌ MOCK | CPPP Award PDFs + NHAI Dashboard | Track A + Track B | Daily batch |
| 4 | Last Relaying Date | ❌ MOCK | Contract "Completion Date" from PDFs | Track A (proxy) | Daily batch |
| 5 | Complaint Routing Authority | ❌ STATIC | MoRTH Jurisdictional Rules (deterministic JSON) | Static config (versioned) | Instant |
| 6 | RTI Filing Authority | ❌ STATIC | RTI Act 2005 + State PIO Directories | Static config (versioned) | Instant |
| 7 | Executive Engineer Contacts | ❌ MOCK | State PWD Public Directories (scraped) | Track B | Weekly |
| 8 | IMU Telemetry | ❌ MOCK | Crowdsourced accelerometer (Phase 2) | Real-time | N/A (future) |
| 9 | Visual Severity (iRAP) | ✅ LIVE | Amazon Bedrock Nova Lite VLM | Real-time (per-request) | ~1.5s |
| 10 | International Infrastructure Data | ❌ ABSENT | OCDS API + World Bank Projects API | Track B (on-demand) | Per-request |

### 2.2 Data Point 1: Road Type, Name & Geometry

**Status:** Already live. No changes needed.

**Source:** OpenStreetMap Overpass API  
**File:** `lib/tools/gati-shakti.ts`  
**Mechanism:** POST to `https://overpass-api.de/api/interpreter` with `way(around:100,{lat},{lon})["highway"]`  
**Fallback:** If Overpass is rate-limited (HTTP 429), cache last-known result in local SQLite keyed by geohash-6 precision.

### 2.3 Data Point 2: Amount Sanctioned/Spent & Contractor Name

**Production Source:** Dual-track ingestion from:
1. **Track A** — CPPP award letter PDFs containing structured tables with:
   - `Tender ID`, `Name of Work`, `Estimated Cost`, `Contract Award Amount`, `Name of Contractor`
2. **Track B** — Data.gov.in dataset `road-transport-year-book` (CSV) containing state-level expenditure aggregates.

**Extraction Strategy (Track A):**

```python
# LlamaIndex metadata extraction from PDF nodes
from llama_index.core.extractors import QuestionsAnsweredExtractor

extractors = [
    QuestionsAnsweredExtractor(questions=[
        "What is the sanctioned amount or estimated cost?",
        "What is the expenditure or contract award amount?",
        "Who is the contractor or concessionaire?",
        "What is the road number or highway identifier?",
    ]),
]
```

Each extracted chunk is stored with structured metadata in pgvector:

```sql
-- pgvector schema for financial metadata
CREATE TABLE contract_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  road_number TEXT,
  concessionaire TEXT,
  sanctioned_crore NUMERIC(12,2),
  expenditure_crore NUMERIC(12,2),
  award_date DATE,
  completion_date DATE,
  source_pdf_hash TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contract_embed ON contract_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
```

### 2.4 Data Point 3: Last Relaying Date (Proxy Strategy)

**Problem:** No Indian government API publishes "last relaying date" directly.

**Solution:** Use the **Project Completion Date** from NHAI award contracts as an authentic proxy. Rationale: road relaying is the final deliverable of a construction/maintenance contract — the completion date is the closest verifiable data point.

**Extraction Pipeline:**
1. Track A parser identifies PDF sections containing date patterns near keywords: `completion`, `relaying`, `resurfacing`, `work order`, `date of completion`.
2. Extracted dates are stored in `project_metadata.completion_date`.
3. Query logic: `SELECT completion_date FROM project_metadata WHERE road_number = ? ORDER BY completion_date DESC LIMIT 1`

**Confidence Labeling:**
```typescript
interface RelayingDateResult {
  date: string;
  confidence: 'high' | 'medium' | 'low';
  proxySource: 'contract_completion' | 'work_order' | 'estimated';
  sourceUrl: string;
}
```

- `high` — Date extracted from a "Date of Completion" field in an award letter
- `medium` — Date extracted from a "Work Order" or "Commencement" field + contract duration
- `low` — Only estimated cost date available (no completion confirmation)

### 2.5 Data Point 4: Complaint & RTI Routing Authority

**Production Source:** Deterministic JSON lookup matrix — no LLM inference needed.

**Design Decision:** These are jurisdictional rules defined by law (MoRTH notification, RTI Act 2005). They change infrequently (annually at most). A static, version-controlled JSON file is the correct architecture — not a database or API call.

**File:** `data/authority-matrix.json`

```json
{
  "version": "2026-01-15",
  "lastVerified": "2026-05-01",
  "authorities": {
    "IN": {
      "NH": {
        "complaint": {
          "primary": "NHAI Project Implementation Unit (PIU)",
          "portal": "https://pgportal.gov.in",
          "phone": "1033",
          "escalation": "Ministry of Road Transport and Highways",
          "legalBasis": "NHAI Act 1988, Section 16"
        },
        "rti": {
          "officer": "Central Public Information Officer",
          "designation": "CPIO, NHAI",
          "filingUrl": "https://rtionline.gov.in",
          "fee": "₹10",
          "responseDays": 30,
          "legalBasis": "RTI Act 2005, Section 6"
        }
      },
      "SH": { /* ... per-state overrides ... */ },
      "MDR": { /* ... district-level routing ... */ }
    }
  }
}
```

**State-Level Overrides:** Nested under `authorities.IN.SH.{stateCode}` with portal URLs verified against official gazette notifications.

### 2.6 Data Point 5: Executive Engineer Personnel Contacts

**Problem:** No centralized API exists. Data is published on individual state PWD websites as HTML directories.

**Production Source:** Targeted web scraping of public PWD directories.

**Phase 1 Target:** Maharashtra PWD (`https://mahapwd.gov.in/`) and Kerala PWD (`https://keralapwd.gov.in/`)

**Scraping Specification:**

```
Lambda: pwd-directory-scraper
Runtime:        Python 3.12
Memory:         512 MB
Timeout:        5 min
Trigger:        EventBridge CRON (weekly, Sunday 04:00 UTC)
Target Pages:   
  - Maharashtra: https://mahapwd.gov.in/en/officer-list
  - Kerala: https://keralapwd.gov.in/officers
```

**Normalized Schema:**

```typescript
interface ExecutiveEngineerRecord {
  name: string;
  designation: 'Executive Engineer' | 'Superintending Engineer' | 'Chief Engineer';
  division: string;           // "Pune Division", "Ernakulam Division"
  circle: string;             // "Pune Circle"
  state: string;
  phone: string | null;       // Only if publicly listed
  email: string | null;       // Only if publicly listed
  officeAddress: string;
  jurisdictionRoads: string[]; // ["NH-48 km 0-120", "SH-4"]
  sourceUrl: string;
  scrapedAt: string;          // ISO 8601
  verifiedAt: string | null;  // Manual verification timestamp
}
```

**Privacy & Legal Compliance:**
- Only scrape data explicitly published on government websites for public access
- Respect `robots.txt` directives
- Cache with 7-day TTL — do not hammer source servers
- Display "Source: Maharashtra PWD Public Directory" attribution in UI

**Fallback (states without scrapeable directories):**
Return honest response: `"Executive Engineer contact not available in public records for {state}. File RTI under Section 6 of RTI Act 2005 to obtain."` — this is itself a valid, actionable output.


---

## Module 3: Global Applicability Engine

### 3.1 Design Rationale

The hackathon rubric explicitly scores "global applicability across countries." The current system is India-specific. This module adds a **country-aware fallback protocol** that dynamically routes queries to international open-data APIs when GPS coordinates resolve outside India.

### 3.2 Country Detection & Routing Protocol

```
GPS Coordinates (lat, lng)
         │
         ▼
┌─────────────────────────────┐
│  OpenStreetMap Reverse       │
│  Geocode (Nominatim)         │
│  → Extract country_code      │
└──────────────┬───────────────┘
               │
               ▼
       ┌───────────────┐
       │ country_code  │
       │   == "IN" ?   │
       └───┬───────┬───┘
           │       │
      YES  │       │  NO
           ▼       ▼
┌──────────────┐  ┌──────────────────────────────┐
│ India Path   │  │ International Path            │
│ (SQLite FTS5 │  │ (OCDS + World Bank APIs)      │
│  + pgvector  │  │                               │
│  + PWD dirs) │  │ Bypass local NHAI tables      │
└──────────────┘  └──────────────────────────────┘
```

**Implementation in MCP Server:**

```typescript
// lib/mcp/server.ts — enhanced routing
async function resolveCountry(lat: number, lng: number): Promise<string> {
  // Fast bounding-box pre-check (avoids API call for obvious India coords)
  if (lat >= 6.5 && lat <= 35.7 && lng >= 68.1 && lng <= 97.4) {
    return 'IN'; // Within India's bounding box — confirm with Overpass
  }
  
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=3`,
    { headers: { 'User-Agent': 'VIGIA/1.0' } }
  );
  const data = await res.json();
  return data.address?.country_code?.toUpperCase() ?? 'UNKNOWN';
}
```

### 3.3 International Data Source: Open Contracting Data Standard (OCDS)

**API:** `https://data.open-contracting.org/api/`  
**Coverage:** 60+ countries publishing procurement data in OCDS format  
**Auth:** None (public API)

**Integration Schema:**

```typescript
interface OCDSRelease {
  ocid: string;                    // Open Contracting ID
  tag: ('planning' | 'tender' | 'award' | 'contract' | 'implementation')[];
  tender: {
    title: string;
    description: string;
    value: { amount: number; currency: string };
    procuringEntity: { name: string };
  };
  awards: Array<{
    title: string;
    value: { amount: number; currency: string };
    suppliers: Array<{ name: string; id: string }>;
    contractPeriod: { startDate: string; endDate: string };
  }>;
}
```

**Query Strategy:**
```typescript
async function queryOCDS(countryCode: string, roadKeywords: string): Promise<OCDSRelease[]> {
  const endpoint = `https://data.open-contracting.org/api/v1/releases`;
  const params = new URLSearchParams({
    country: countryCode,
    q: roadKeywords,
    tag: 'award,contract',
    limit: '10',
  });
  const res = await fetch(`${endpoint}?${params}`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'VIGIA/1.0' },
  });
  return (await res.json()).releases ?? [];
}
```

### 3.4 International Data Source: World Bank Projects API

**API:** `https://search.worldbank.org/api/v2/projects`  
**Coverage:** 170+ countries, infrastructure projects since 1947  
**Auth:** None (public API)

**Integration Schema:**

```typescript
interface WorldBankProject {
  id: string;                      // e.g., "P176345"
  project_name: string;
  countryshortname: string;
  sector: string[];                // Filter for "Transportation"
  totalamt: number;                // USD
  boardapprovaldate: string;
  closingdate: string;
  status: 'Active' | 'Closed' | 'Pipeline';
  impagency: string;              // Implementing agency
  project_abstract: string;
}
```

**Query Strategy:**
```typescript
async function queryWorldBank(countryCode: string): Promise<WorldBankProject[]> {
  const res = await fetch(
    `https://search.worldbank.org/api/v2/projects?format=json&countrycode_exact=${countryCode}&sector_exact=Transportation&rows=20`,
    { headers: { 'User-Agent': 'VIGIA/1.0' } }
  );
  const data = await res.json();
  return data.projects ? Object.values(data.projects) as WorldBankProject[] : [];
}
```

### 3.5 Normalized International Output

Regardless of source (OCDS or World Bank), the Admin Agent returns a unified `NormalizedEvidence` structure:

```typescript
// International query result — same schema as India path
{
  agentId: 'admin',
  status: 'completed',
  confidence: 0.75,  // Lower than India (less granular data)
  findings: [
    "Country: Kenya (KE)",
    "Project: Nairobi-Mombasa Highway Rehabilitation (World Bank P176345)",
    "Implementing Agency: Kenya National Highways Authority",
    "Total Amount: USD 450M (World Bank IDA Credit)",
    "Status: Active (approval: 2024-03-15, closing: 2029-06-30)",
  ],
  citations: [
    { sourceId: 'worldbank-P176345', label: 'World Bank Projects', url: 'https://projects.worldbank.org/en/projects-operations/project-detail/P176345', trustLevel: 'official-portal' }
  ],
  metadata: { countryCode: 'KE', dataSource: 'world_bank', projectId: 'P176345' }
}
```

### 3.6 Supported Country Coverage Matrix

| Tier | Countries | Data Sources Available | Quality |
|------|-----------|----------------------|---------|
| Tier 1 (Full) | India | NHAI + CPPP + Data.gov.in + State PWDs + OSM | High |
| Tier 2 (Good) | UK, Colombia, Mexico, Nigeria, Kenya, Ukraine | OCDS national portals + World Bank + OSM | Medium |
| Tier 3 (Basic) | 170+ World Bank member states | World Bank Projects API + OSM | Low |
| Tier 4 (Minimal) | All others | OpenStreetMap road data only | Minimal |


---

## Module 4: Offline Edge Resilience

### 4.1 Design Rationale

Road infrastructure incidents occur in areas with poor connectivity — rural highways, mountainous terrain, construction zones. The rubric scores "robustness in low-network conditions." This module implements a **dual-mode data sync** with automatic failover to a compressed, geofenced local database.

### 4.2 Dual-Mode Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUD TIER                                │
│  (Always authoritative — full semantic search + RAG)             │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ pgvector    │  │ SQLite FTS5  │  │ PDF Semantic Chunks    │ │
│  │ (RDS)       │  │ (full DB)    │  │ (S3 + CloudFront)      │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                    CloudFront CDN
                    (geofenced .db files)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        EDGE TIER                                 │
│  (Life-safety subset — instant offline access)                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  vigia_edge.db (SQLite, <2MB compressed)                  │   │
│  │  ├── emergency_contacts     (trauma centers, police)      │   │
│  │  ├── pwd_helpdesks          (regional engineer phones)    │   │
│  │  ├── road_segments          (NH/SH within 50km radius)    │   │
│  │  └── last_sync_metadata     (freshness tracking)          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Storage: IndexedDB (via sql.js WASM) or Origin Private FS      │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Edge Database Schema: `vigia_edge.db`

```sql
-- Life-safety: trauma centers within 50km radius
CREATE TABLE emergency_contacts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                    -- "District Hospital Pune"
  type TEXT NOT NULL,                    -- "trauma_center" | "police" | "fire" | "ambulance"
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  phone TEXT NOT NULL,                   -- "+91-20-26127000"
  address TEXT,
  open_24h BOOLEAN DEFAULT 1,
  geohash TEXT NOT NULL                  -- geohash-5 for spatial lookup
);

-- Regional PWD engineer helpdesks (immediate escalation)
CREATE TABLE pwd_helpdesks (
  id INTEGER PRIMARY KEY,
  state TEXT NOT NULL,
  division TEXT NOT NULL,                -- "Pune Division"
  designation TEXT NOT NULL,             -- "Executive Engineer"
  name TEXT,                             -- May be null if not public
  phone TEXT,
  office_address TEXT,
  jurisdiction_roads TEXT NOT NULL,      -- JSON array: ["NH-48","SH-4"]
  geohash TEXT NOT NULL
);

-- Minimal road segment data for offline identification
CREATE TABLE road_segments (
  id INTEGER PRIMARY KEY,
  road_number TEXT NOT NULL,             -- "NH-44"
  road_name TEXT,
  road_type TEXT NOT NULL,               -- "NH" | "SH" | "MDR"
  state TEXT NOT NULL,
  start_lat REAL,
  start_lng REAL,
  end_lat REAL,
  end_lng REAL,
  geohash TEXT NOT NULL,
  complaint_authority TEXT NOT NULL,     -- Pre-resolved authority name
  complaint_phone TEXT                   -- Pre-resolved phone number
);

-- Sync metadata
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Expected keys: 'last_sync_at', 'center_lat', 'center_lng', 'radius_km', 'version'

-- Spatial index via geohash prefix matching
CREATE INDEX idx_emergency_geohash ON emergency_contacts(geohash);
CREATE INDEX idx_helpdesk_geohash ON pwd_helpdesks(geohash);
CREATE INDEX idx_road_geohash ON road_segments(geohash);
```

**Size Budget:** Target < 2MB compressed (gzip). A 50km radius in a dense Indian state contains ~20 trauma centers, ~5 PWD divisions, ~50 road segments = ~500 rows total.

### 4.4 Geofenced Sync Strategy

```typescript
// Triggered on app load + every 6 hours if online
async function syncEdgeDatabase(lat: number, lng: number): Promise<void> {
  const geohash = encodeGeohash(lat, lng, 4); // ~40km precision
  const cacheKey = `edge_db_${geohash}`;
  
  // Check if we already have a fresh copy for this geofence
  const meta = await edgeDb.get('SELECT value FROM sync_metadata WHERE key = ?', ['last_sync_at']);
  const lastSync = meta ? parseInt(meta.value) : 0;
  const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
  
  if (lastSync > sixHoursAgo) return; // Still fresh
  
  // Fetch geofenced edge DB from CloudFront
  const url = `https://edge.vigia.app/db/${geohash}.db.gz`;
  const res = await fetch(url);
  
  if (!res.ok) return; // Fail silently — keep existing cache
  
  const compressed = await res.arrayBuffer();
  const dbBytes = pako.ungzip(new Uint8Array(compressed));
  
  // Replace local edge DB atomically
  await replaceEdgeDatabase(dbBytes);
}
```

**CloudFront Distribution:**
- Pre-computed `.db.gz` files per geohash-4 tile (~600 tiles cover all of India)
- Generated nightly by a Lambda that queries the master DB and builds per-tile SQLite files
- Cache TTL: 24 hours at edge, 6 hours at origin
- Total CDN storage: ~600 tiles × 2MB = ~1.2GB

### 4.5 Network Detection & Automatic Failover

```typescript
// lib/hooks/useNetworkStatus.ts
import { useState, useEffect, useCallback } from 'react';

type NetworkMode = 'online' | 'degraded' | 'offline';

interface NetworkStatus {
  mode: NetworkMode;
  latencyMs: number | null;
  lastChecked: number;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    mode: 'online',
    latencyMs: null,
    lastChecked: Date.now(),
  });

  const probe = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus({ mode: 'offline', latencyMs: null, lastChecked: Date.now() });
      return;
    }

    try {
      const start = performance.now();
      const res = await fetch('/api/health', {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      const latency = performance.now() - start;

      if (!res.ok || latency > 2000) {
        setStatus({ mode: 'degraded', latencyMs: latency, lastChecked: Date.now() });
      } else {
        setStatus({ mode: 'online', latencyMs: latency, lastChecked: Date.now() });
      }
    } catch {
      setStatus({ mode: 'offline', latencyMs: null, lastChecked: Date.now() });
    }
  }, []);

  useEffect(() => {
    probe();
    const interval = setInterval(probe, 15_000); // Probe every 15s
    window.addEventListener('online', probe);
    window.addEventListener('offline', probe);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', probe);
      window.removeEventListener('offline', probe);
    };
  }, [probe]);

  return status;
}
```

### 4.6 UI Rendering Strategy by Network Mode

| Mode | Data Source | UI Indicator | Capabilities |
|------|------------|--------------|-------------|
| `online` | Cloud (pgvector + FTS5 + LLM) | Green dot | Full RAG pipeline, vision analysis, semantic search |
| `degraded` | Cloud with timeout fallback to edge | Yellow dot | Attempt cloud (3s timeout), fall back to edge DB for life-safety data |
| `offline` | Edge DB only (`vigia_edge.db`) | Red dot + banner | Emergency contacts, PWD helpdesks, road identification, complaint phone numbers |

**Failover in the Pipeline:**

```typescript
// lib/agents/ingest.ts — enhanced with edge fallback
async function dispatchWithFallback(
  agentId: AgentId,
  payload: VigiaState['payload'],
  networkMode: NetworkMode
): Promise<NormalizedEvidence> {
  if (networkMode === 'offline') {
    return queryEdgeDatabase(agentId, payload);
  }

  if (networkMode === 'degraded') {
    try {
      return await withTimeout(dispatchAgent(agentId, payload, undefined, new AbortController().signal), 3000);
    } catch {
      return queryEdgeDatabase(agentId, payload);
    }
  }

  return dispatchAgent(agentId, payload, undefined, new AbortController().signal);
}

async function queryEdgeDatabase(agentId: AgentId, payload: VigiaState['payload']): Promise<NormalizedEvidence> {
  const lat = payload.gps?.lat;
  const lng = payload.gps?.lng;
  if (!lat || !lng) {
    return { agentId, status: 'error', confidence: 0, findings: ['No GPS — cannot query offline database'], citations: [], latencyMs: 0 };
  }

  const geohash = encodeGeohash(lat, lng, 5);
  
  // Query edge DB for life-safety data
  const emergencyContacts = await edgeDb.all(
    'SELECT * FROM emergency_contacts WHERE geohash LIKE ? ORDER BY geohash LIMIT 5',
    [geohash.slice(0, 4) + '%']
  );
  const helpdesks = await edgeDb.all(
    'SELECT * FROM pwd_helpdesks WHERE geohash LIKE ? LIMIT 3',
    [geohash.slice(0, 4) + '%']
  );

  return {
    agentId,
    status: 'completed',
    confidence: 0.6,
    findings: [
      `⚠️ OFFLINE MODE — showing cached life-safety data`,
      ...emergencyContacts.map((e: any) => `${e.type}: ${e.name} — ${e.phone}`),
      ...helpdesks.map((h: any) => `PWD ${h.division}: ${h.phone ?? 'No phone listed'}`),
    ],
    citations: [{ sourceId: 'edge-db', label: 'VIGIA Offline Cache', trustLevel: 'verified-spatial' }],
    metadata: { networkMode: 'offline', cacheAge: Date.now() - (await getLastSyncTime()) },
    latencyMs: 5, // Local DB is near-instant
  };
}
```

### 4.7 Edge DB Generation Pipeline

```
┌────────────────────────────────────────────────────────┐
│  Lambda: edge-db-builder                                │
│  Trigger: Daily 05:00 UTC (after Track A + B complete)  │
│  Memory: 1024 MB                                        │
│  Timeout: 10 min                                        │
│                                                        │
│  For each geohash-4 tile covering India:                │
│    1. Query master DB for emergency contacts in radius  │
│    2. Query PWD helpdesks for the tile's state          │
│    3. Query road_segments intersecting the tile         │
│    4. Build SQLite DB in /tmp                           │
│    5. gzip compress                                     │
│    6. Upload to S3 → CloudFront invalidation            │
└────────────────────────────────────────────────────────┘
```

---

## Appendix: Migration Path from Current Mocks

### Phase 1 (Week 1-2): Foundation
- [ ] Provision RDS PostgreSQL 16 with pgvector extension
- [ ] Deploy `pdf-scraper` Lambda targeting CPPP
- [ ] Deploy `api-etl` Lambda targeting Data.gov.in
- [ ] Replace `nhai_mock.db` with `nhai_production.db` (same FTS5 schema, real data)
- [ ] Deploy `authority-matrix.json` replacing hardcoded TS objects

### Phase 2 (Week 3-4): Intelligence
- [ ] Deploy `pdf-parser` Lambda with LlamaIndex SemanticSplitter
- [ ] Implement Hybrid Query Router (FTS5 + pgvector RRF)
- [ ] Deploy `pwd-directory-scraper` for Maharashtra + Kerala
- [ ] Replace `mock-data.ts` functions with real DB queries

### Phase 3 (Week 5-6): Global & Edge
- [ ] Implement country detection in MCP server
- [ ] Integrate OCDS API + World Bank Projects API
- [ ] Build edge DB generation pipeline
- [ ] Implement `useNetworkStatus` hook + offline failover
- [ ] Deploy CloudFront distribution for geofenced edge DBs

### Phase 4 (Week 7-8): Hardening
- [ ] Load testing (target: 100 concurrent users, p99 < 3s)
- [ ] Chaos testing (kill network mid-pipeline, verify edge failover)
- [ ] Security audit (IAM least-privilege, VPC isolation for RDS)
- [ ] Monitoring: CloudWatch dashboards for pipeline health, ingestion freshness

### Mock Elimination Scorecard

| Mock | Replacement | Phase |
|------|-------------|-------|
| IMU Telemetry (hardcoded 2.4g) | Crowdsourced accelerometer ingestion | Phase 2+ (future) |
| Complaint Routing (static TS) | `authority-matrix.json` (versioned, verified) | Phase 1 |
| RTI Authority (static TS) | `authority-matrix.json` (versioned, verified) | Phase 1 |
| Road Condition (mock score 6/10) | pgvector RAG from inspection reports | Phase 2 |
| Historical Condition (3 static records) | Time-series from ingested project data | Phase 2 |
| Executive Engineer (placeholder) | PWD directory scraper | Phase 2 |
| Last Relaying Date (static 2022-03-15) | Contract completion date proxy (Track A) | Phase 2 |

---

*End of specification.*
