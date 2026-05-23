# VIGIA Unified Vector Store: Eliminating Regex Routing

**Document:** `unified_vector_store.md`  
**Status:** DRAFT — Awaiting approval  
**Date:** 2026-05-23  
**Goal:** Migrate all data sources into a single pgvector table, eliminate keyword-based routing, let semantic search find relevant data regardless of phrasing

---

## Problem Statement

The current admin agent uses fragile regex patterns to decide which data source to query:

```
if /pmgsy|rural|Khammam/ → queryPmgsyContracts()
if /personnel/ intent → queryPwdContacts()
if has_road_number → searchTenderByRoadNumber()
else → "no road number found"
```

This breaks when users paraphrase ("village roads near Khammam" vs "PMGSY Khammam"), misses cross-domain queries ("who is building rural roads and who is the engineer in charge?"), and requires manual keyword maintenance.

---

## Target Architecture

```
User Query
    │
    ▼
embed(query) via Bedrock Titan Embed v2
    │
    ▼
pgvector cosine similarity search (ALL data, single table)
    │
    ▼
Top-K chunks (contracts + contacts + rural roads + authorities)
    │
    ▼
[Optional: Cohere Rerank → Top 3]
    │
    ▼
LLM generates response from whatever's relevant
```

**No regex. No keyword triggers. No if/else per data type.**

---

## Unified Schema: `contract_embeddings`

Extend the existing pgvector table with a `source_type` discriminator:

```sql
-- Existing table (already deployed)
CREATE TABLE contract_embeddings (
  id SERIAL PRIMARY KEY,
  road_number VARCHAR(20),
  concessionaire VARCHAR(200),
  chunk_text TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  source_pdf_hash VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- NEW COLUMNS for unified store:
  source_type VARCHAR(20) NOT NULL DEFAULT 'nhai_contract',
  state VARCHAR(50),
  district VARCHAR(50),
  metadata JSONB DEFAULT '{}'
);

-- Add index on source_type for filtered queries
CREATE INDEX idx_source_type ON contract_embeddings(source_type);
CREATE INDEX idx_state ON contract_embeddings(state);
```

### Source Types

| `source_type` | Data | Records | Refresh |
|---------------|------|---------|---------|
| `nhai_contract` | NHAI/MoRTH PDF chunks | ~5,000 | Daily (Track A) |
| `pmgsy_road` | PMGSY rural road records | ~1,600 | Weekly (OMMAS scraper) |
| `pwd_contact` | PWD officer directory | ~100+ | Weekly (directory scraper) |
| `authority` | RTI/complaint authorities | ~20 | Monthly (manual) |

---

## Data Embedding Strategy

### PWD Contacts → Vector Chunks

Each officer record becomes a single chunk:

```
"Executive Engineer, R&B Division Khammam, Telangana. Phone: 9440818085. 
Email: eerb_kmm@yahoo.co.in. Office: R&B Division Office, Khammam. 
Jurisdiction: State highways and district roads in Khammam district, Telangana.
Source: Telangana R&B Official Directory (tg-roadcutting.cgg.gov.in)"
```

**Why this works:** When a user asks "who is the engineer for roads near Khammam?", the embedding of their query will be semantically close to this chunk — no keyword matching needed.

### PMGSY Records → Vector Chunks

Each PMGSY record becomes a chunk:

```
"PMGSY-III Rural Connectivity project in Khammam District, Telangana. 
Sanctioned cost: ₹59.4 Crore. Contractor: State SRRDA. Status: Sanctioned.
Scheme: PMGSY-III (Pradhan Mantri Gram Sadak Yojana Phase 3).
This covers rural road construction connecting unconnected habitations in Khammam.
Source: PMGSY OMMAS Portal (omms.nic.in)"
```

### Authority Matrix → Vector Chunks

Each authority entry becomes a chunk:

```
"To file a complaint about a National Highway (NH) in India, contact the 
NHAI Project Implementation Unit (PIU). Portal: pgportal.gov.in. Helpline: 1033.
Escalation: Ministry of Road Transport and Highways. Legal basis: NHAI Act 1988, Section 16.
For RTI requests: Central Public Information Officer (CPIO), NHAI. 
Filing URL: rtionline.gov.in. Fee: ₹10. Response within 30 days (RTI Act 2005, Section 6)."
```

---

## Embedding Pipeline (New Lambda: `vigia-unified-embedder`)

### Trigger: Daily CRON (04:00 UTC) + On-demand after scraper runs

```python
# Pseudocode for the unified embedder

def handler(event):
    # 1. Load all data sources
    pwd_contacts = load_pwd_contacts()      # from pwd_contacts FTS5 or JSONL
    pmgsy_roads = load_pmgsy_roads()        # from pmgsy_roads.jsonl
    authorities = load_authority_matrix()    # from authority-matrix.json
    
    # 2. Format each record into a natural language chunk
    chunks = []
    for contact in pwd_contacts:
        chunks.append({
            "text": format_pwd_chunk(contact),
            "source_type": "pwd_contact",
            "state": contact["state"],
            "district": contact["division"],
            "metadata": {"phone": contact["phone"], "email": contact["email"], "source_url": contact["source_url"]}
        })
    
    for road in pmgsy_roads:
        chunks.append({
            "text": format_pmgsy_chunk(road),
            "source_type": "pmgsy_road",
            "state": road["state"],
            "district": road["district"],
            "metadata": {"cost_lakhs": road["cost_lakhs"], "length_km": road["length_km"], "source_url": road["source_url"]}
        })
    
    for authority in authorities:
        chunks.append({
            "text": format_authority_chunk(authority),
            "source_type": "authority",
            "state": authority.get("state"),
            "metadata": {"portal": authority["portal"], "phone": authority["phone"]}
        })
    
    # 3. Embed via Bedrock Titan Embed v2
    for chunk in chunks:
        chunk["embedding"] = embed_text(chunk["text"])
    
    # 4. Upsert into pgvector (ON CONFLICT by source_type + state + district)
    upsert_to_pgvector(chunks)
```

### Target Regions (Matching PWD + PMGSY Scope)

| State | Districts | Data Types |
|-------|-----------|-----------|
| Telangana | Khammam, Warangal, Adilabad, Siddipet, Medchal, Sangareddy, Kothagudem, Peddapalli, Wanaparthy, Nirmal, Gajwel, Vikarabad | PWD contacts + PMGSY roads |
| Maharashtra | Pune, Nagpur, Satara, Solapur, Kolhapur | PWD contacts + PMGSY roads |
| All India | — | NHAI contracts (all states) + Authority matrix |

---

## Simplified Admin Agent (Post-Migration)

The entire `tender_search` case collapses to:

```typescript
case 'tender_search':
case 'condition':
case 'personnel':
default: {
  // Single semantic search across ALL data
  const results = await searchUnified(text);
  
  if (results.length === 0) {
    return { agentId: 'admin', status: 'completed', confidence: 0.1,
      findings: ['No relevant data found in VIGIA index for this query.'],
      citations: [], latencyMs: Date.now() - start };
  }

  return {
    agentId: 'admin',
    status: 'completed',
    confidence: results[0].similarity > 0.8 ? 0.9 : results[0].similarity > 0.6 ? 0.7 : 0.5,
    findings: results.map(r => r.chunkText),
    citations: results.map((r, i) => ({
      sourceId: `${r.sourceType}-${i}`,
      label: SOURCE_LABELS[r.sourceType],
      url: r.metadata?.source_url,
      trustLevel: TRUST_LEVELS[r.sourceType],
    })),
    metadata: { resultCount: results.length, topSimilarity: results[0].similarity },
    latencyMs: Date.now() - start,
  };
}
```

**Deleted code:**
- `queryPmgsyContracts()` — no longer needed
- `queryPwdContacts()` — no longer needed  
- `queryFts5()` — becomes fallback only (offline/pgvector-down)
- All PMGSY_TRIGGER regex
- All keyword-based routing in the default case
- The `if (!roadNumber)` guard

---

## Retrieval Proxy Update

The existing `vigia-retrieval-proxy` Lambda needs a minor update:

```typescript
// Current: searches only nhai_contract chunks
const query = `SELECT chunk_text, similarity FROM contract_embeddings 
  ORDER BY embedding <=> $1 LIMIT $2`;

// Updated: searches ALL source types, returns source_type + metadata
const query = `SELECT chunk_text, source_type, state, district, metadata,
  1 - (embedding <=> $1) as similarity 
  FROM contract_embeddings 
  ORDER BY embedding <=> $1 LIMIT $2`;
```

The response now includes `source_type` so the admin agent can map to the correct trust level and citation format.

---

## FTS5 as Offline Fallback

The local FTS5 tables (`nhai_sections`, `pwd_contacts`, `pmgsy_contracts`) remain as:
1. **Offline fallback** — when pgvector/Lambda is unreachable
2. **Exact-match boost** — for road number queries like "NH-163G" where keyword match is faster and more precise than semantic search
3. **Development mode** — local dev without AWS credentials

The hybrid router still fuses FTS5 + pgvector via RRF, but the FTS5 path no longer needs keyword triggers — it just searches all tables.

---

## Daily Auto-Refresh Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ Daily CRON Schedule (EventBridge)                            │
│                                                             │
│ 02:00 UTC — Track A: PDF Scraper → Parser → pgvector        │
│             (NHAI/MoRTH PDFs → nhai_contract embeddings)    │
│                                                             │
│ 03:00 UTC — Track B: API ETL → FTS5 Loader                  │
│             (data.gov.in, PMGSY OMMAS → local FTS5)         │
│                                                             │
│ 04:00 UTC — Unified Embedder (NEW)                          │
│             Reads: pwd_contacts + pmgsy_roads + authorities  │
│             Embeds: Bedrock Titan Embed v2                   │
│             Writes: pgvector (pwd_contact, pmgsy_road,       │
│                     authority source_types)                  │
│                                                             │
│ Sunday 04:00 UTC — PWD Scraper (weekly)                     │
│             Scrapes TG/MH directories → updates pwd_contacts│
│             Triggers unified embedder on completion          │
│                                                             │
│ Sunday 04:00 UTC — PMGSY Scraper (weekly)                   │
│             Scrapes OMMAS portal → updates pmgsy_roads       │
│             Triggers unified embedder on completion          │
└─────────────────────────────────────────────────────────────┘
```

### Target Districts Refreshed Daily

| State | Districts | Sources Refreshed |
|-------|-----------|-------------------|
| Telangana | Khammam, Warangal + 10 others | PWD contacts, PMGSY roads |
| Maharashtra | Pune, Nagpur, Satara, Solapur, Kolhapur | PWD contacts, PMGSY roads |
| All India | All states with NHAI projects | Contract PDFs (10 sources) |

---

## Migration Plan

### Phase 1: Schema Migration (Non-breaking)
```sql
ALTER TABLE contract_embeddings ADD COLUMN source_type VARCHAR(20) DEFAULT 'nhai_contract';
ALTER TABLE contract_embeddings ADD COLUMN state VARCHAR(50);
ALTER TABLE contract_embeddings ADD COLUMN district VARCHAR(50);
ALTER TABLE contract_embeddings ADD COLUMN metadata JSONB DEFAULT '{}';
CREATE INDEX idx_source_type ON contract_embeddings(source_type);
```

### Phase 2: Embed Existing Data
- Run unified embedder for PWD contacts (28 records → 28 vectors)
- Run unified embedder for PMGSY roads (14 records → 14 vectors)
- Run unified embedder for authority matrix (~20 entries → ~20 vectors)

### Phase 3: Update Retrieval Proxy
- Return `source_type` + `metadata` in response
- No breaking change to existing callers (new fields are additive)

### Phase 4: Simplify Admin Agent
- Replace all keyword-based routing with single `searchUnified()` call
- Keep FTS5 as offline fallback only
- Delete regex triggers and if/else branches

### Phase 5: Deploy Unified Embedder Lambda
- Add to CDK stack with daily CRON
- Triggered by PWD/PMGSY scraper completion (S3 event)

---

## Cost Impact

| Item | Current | After Migration |
|------|---------|----------------|
| Embedding PWD + PMGSY + Authority | $0 (not embedded) | ~$0.006/run (62 embeddings × $0.0001) |
| Daily embedding cost | $0 | $0.006/day = $0.18/month |
| Query cost | Same (1 embedding per query) | Same |
| Retrieval accuracy | Regex-dependent (misses paraphrases) | Semantic (handles any phrasing) |
| Maintenance burden | High (add keywords per data source) | Zero (just embed new data) |

---

## Success Criteria

After migration, ALL of these queries should return correct results without any keyword matching:

| Query | Expected Result |
|-------|----------------|
| "What PMGSY rural roads are being built near Khammam?" | PMGSY-III Khammam data |
| "village road construction Telangana" | PMGSY Telangana records |
| "who is the engineer for roads in Khammam?" | PWD EE Khammam contact |
| "how do I complain about NH-44?" | Complaint authority + portal |
| "contractor for NH-163G" | G R Infraprojects Limited + project overview |
| "rural connectivity expenditure Pune district" | PMGSY Pune data |
| "RTI for road information" | RTI filing authority + process |
| "road officer phone number Warangal" | PWD EE Warangal contact |

All from a single `embed(query) → pgvector search → LLM` path.

---

**Awaiting approval to begin implementation.**
