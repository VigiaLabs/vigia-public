# VIGIA Track B Expansion: PMGSY Rural Roads Scraper & Integration

**Document:** `rural_road_data.md`  
**Status:** DRAFT — Awaiting approval  
**Date:** 2026-05-23  
**Scope:** Ingest PMGSY rural road data from OMMAS portal for Telangana & Maharashtra districts

---

## Background

The PMGSY (Pradhan Mantri Gram Sadak Yojana) program has built 357,000+ km of rural roads across India. The data lives in the OMMAS portal (`omms.nic.in`) — a legacy ASP.NET WebForms application with no public API. Data is only accessible via dropdown-driven HTML reports.

### Target Scope

| State | Districts | Rationale |
|-------|-----------|-----------|
| Telangana | Khammam, Warangal | Aligns with NH-163G corridor (our highest-confidence NHAI data) |
| Maharashtra | Pune, Nagpur | Aligns with NH-44 corridor + Maharashtra PWD contacts already indexed |

### Data Source URLs

| Portal | URL | Access Method |
|--------|-----|---------------|
| OMMAS Citizen Reports | `https://omms.nic.in/Home/CitizenFeedback` | Headless browser (Playwright) |
| OMMAS State Abstract | `https://omms.nic.in/Home/GetStateWiseAbstractData` | POST request (JSON) |
| eMARG Maintenance | `https://emarg.gov.in/application_main.htm` | Headless browser |
| PMGSY Official | `https://pmgsy.nic.in/` | Reference only |

**Note:** The OMMAS portal uses ASP.NET ViewState and requires JavaScript execution for dropdown cascading (State → District → Block). A headless browser (Playwright) is mandatory.

---

## Step 1: Playwright Scraper

### File: `infrastructure/pipeline/track-b/pmgsy-scraper.py`

**Runtime:** Python 3.12 + Playwright  
**Deployment:** AWS Lambda with Playwright layer OR local CRON  
**Schedule:** Weekly (Sunday 04:00 UTC)  
**Output:** JSONL to `data/pmgsy_roads.jsonl` (local) or `s3://vigia-structured-data/pmgsy/` (production)

### Navigation Logic

```python
# Pseudocode for OMMAS scraping flow:
1. Launch Chromium (headless)
2. Navigate to https://omms.nic.in/Home/CitizenFeedback
3. Wait for page load (ASP.NET ViewState initialization)
4. For each target (state, district):
   a. Select state from dropdown (#ddlState)
   b. Wait for district dropdown to populate (AJAX postback)
   c. Select district from dropdown (#ddlDistrict)
   d. Wait for block dropdown to populate
   e. Select "All Blocks" if available
   f. Click "View Report" button
   g. Wait for HTML table to render
   h. Parse table rows: Road Name, Sanctioned Cost, Contractor, Length, Status
   i. Store results with source_url
5. Close browser
```

### Target Configuration

```python
TARGETS = [
    {"state": "Telangana", "state_code": "36", "districts": [
        {"name": "Khammam", "code": "507"},
        {"name": "Warangal", "code": "506"},
    ]},
    {"state": "Maharashtra", "state_code": "27", "districts": [
        {"name": "Pune", "code": "521"},
        {"name": "Nagpur", "code": "517"},
    ]},
]
```

### Output Schema (JSONL)

```json
{
  "road_name": "Approach Road to Tallada from NH-163G",
  "state": "Telangana",
  "district": "Khammam",
  "block": "Sathupalli",
  "contractor": "Sri Constructions",
  "cost_lakhs": 45.67,
  "length_km": 2.3,
  "status": "Completed",
  "scheme": "PMGSY-III",
  "source_url": "https://omms.nic.in/Home/CitizenFeedback?state=36&district=507"
}
```

### Error Handling

- **Timeout (30s per page):** Skip district, log warning, continue
- **Empty table:** Record as `{"status": "no_data", "district": "..."}` for monitoring
- **ViewState expiry:** Refresh page and retry once
- **Rate limiting:** 5-second delay between district requests

### Dependencies

```
playwright==1.44.0
```

Lambda layer: `playwright-aws-lambda` (pre-built Chromium binary for Lambda)

---

## Step 2: Edge Database Schema

### FTS5 Table: `pmgsy_contracts`

```sql
CREATE VIRTUAL TABLE pmgsy_contracts USING fts5(
  road_name,
  state,
  district,
  block,
  contractor,
  cost_lakhs UNINDEXED,
  length_km UNINDEXED,
  status,
  scheme,
  source_url UNINDEXED,
  tokenize='porter'
);
```

### Loader Function

**File:** `scripts/load-pmgsy.ts`

```typescript
// Reads data/pmgsy_roads.jsonl and inserts into pmgsy_contracts FTS5 table
// Called after scraper completes (local) or triggered by S3 event (production)

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'data', 'nhai_mock.db');
const JSONL_PATH = join(process.cwd(), 'data', 'pmgsy_roads.jsonl');

function load() {
  const db = new Database(DB_PATH);
  
  db.exec(`DROP TABLE IF EXISTS pmgsy_contracts`);
  db.exec(`CREATE VIRTUAL TABLE pmgsy_contracts USING fts5(
    road_name, state, district, block, contractor,
    cost_lakhs UNINDEXED, length_km UNINDEXED,
    status, scheme, source_url UNINDEXED,
    tokenize='porter'
  )`);

  const lines = readFileSync(JSONL_PATH, 'utf-8').split('\n').filter(Boolean);
  const insert = db.prepare(`INSERT INTO pmgsy_contracts VALUES (?,?,?,?,?,?,?,?,?,?)`);

  const tx = db.transaction(() => {
    for (const line of lines) {
      const r = JSON.parse(line);
      insert.run(r.road_name, r.state, r.district, r.block, r.contractor,
                 r.cost_lakhs, r.length_km, r.status, r.scheme, r.source_url);
    }
  });

  tx();
  console.log(`✓ Loaded ${lines.length} PMGSY records`);
  db.close();
}
```

### Production Flow (AWS)

```
Lambda (pmgsy-scraper) → JSONL → S3 (vigia-structured-data/pmgsy/)
  → S3 Event → Lambda (fts5-loader) → Rebuilds SQLite → Uploads to S3 (vigia-fts5-db)
```

---

## Step 3: Admin Agent Integration

### Query Logic Update

**File:** `lib/tools/tender-search.ts`

Add a new function `queryPmgsyContracts()` that searches the `pmgsy_contracts` FTS5 table:

```typescript
export async function queryPmgsyContracts(query: string): Promise<TenderResult[]> {
  const db = new Database(dbPath, { readonly: true });
  
  // Check table exists
  const exists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='pmgsy_contracts'`
  ).get();
  if (!exists) { db.close(); return []; }

  const ftsQuery = query.split(/\s+/).join(' OR ');
  const rows = db.prepare(
    `SELECT road_name, state, district, contractor, cost_lakhs, length_km, status, source_url
     FROM pmgsy_contracts WHERE pmgsy_contracts MATCH ? ORDER BY rank LIMIT 5`
  ).all(ftsQuery);

  db.close();

  return rows.map((r: any, i: number) => ({
    roadNumber: `PMGSY-${r.district}`,
    projectName: r.road_name,
    concessionaire: r.contractor,
    mode: 'PMGSY',
    totalLengthKm: r.length_km ? parseFloat(r.length_km) : null,
    startDate: null,
    state: r.state,
    budgetCrore: r.cost_lakhs ? parseFloat(r.cost_lakhs) / 100 : null,
    source: 'PMGSY OMMAS Portal',
    sourceUrl: r.source_url || 'https://omms.nic.in',
    score: 1 / (i + 1),
  }));
}
```

### Trigger Conditions

In `searchTenderByRoadNumber()`, add PMGSY query when:

```typescript
const isPmgsyQuery = /\b(village|pmgsy|rural|gram sadak|habitation)\b/i.test(query)
  || /\b(Khammam|Warangal|Pune|Nagpur)\b/i.test(query);

if (isPmgsyQuery) {
  const pmgsyResults = await queryPmgsyContracts(query);
  // Merge with existing results via RRF or append
  fts5Results = [...fts5Results, ...pmgsyResults];
}
```

### NormalizedEvidence Mapping

When PMGSY results are returned, the admin agent formats them as:

```typescript
findings: pmgsyResults.map(r => 
  `${r.projectName} — ${r.concessionaire} (₹${r.budgetCrore?.toFixed(2)} Cr, ${r.totalLengthKm} km) [${r.status}]`
),
citations: pmgsyResults.map((r, i) => ({
  sourceId: `pmgsy-${r.state}-${i}`,
  label: 'PMGSY OMMAS Portal',
  url: r.sourceUrl,
  trustLevel: 'official-portal' as const,
})),
```

---

## CDK Infrastructure Changes

### New Lambda: `vigia-pmgsy-scraper`

```typescript
const pmgsyScraper = new lambda.Function(this, 'PmgsyScraper', {
  functionName: 'vigia-pmgsy-scraper',
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'pmgsy_scraper.handler',
  code: lambda.Code.fromAsset('pipeline/track-b/pmgsy-scraper'),
  timeout: Duration.minutes(10),
  memorySize: 2048, // Playwright needs memory for Chromium
  layers: [playwrightLayer], // Pre-built Chromium layer
  environment: {
    STRUCTURED_BUCKET: structuredBucket.bucketName,
    TARGET_STATES: 'Telangana,Maharashtra',
  },
});

// Weekly schedule (Sunday 04:00 UTC)
new events.Rule(this, 'PmgsyScraperSchedule', {
  schedule: events.Schedule.cron({ minute: '0', hour: '4', weekDay: 'SUN' }),
  targets: [new targets.LambdaFunction(pmgsyScraper)],
});
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| OMMAS portal changes HTML structure | Pin selectors, add structural validation, alert on parse failure |
| OMMAS blocks automated access | Rotate user agents, add delays, use residential proxy if needed |
| ViewState/AJAX timing issues | Explicit `wait_for_selector` with 30s timeout per interaction |
| Large data volume (thousands of roads per district) | Paginate, limit to first 100 per district for MVP |
| Lambda cold start with Playwright | Use provisioned concurrency (1 instance) for weekly run |

---

## Data Volume Estimate

| District | Estimated Roads | Records |
|----------|----------------|---------|
| Khammam (TG) | ~200-400 | ~300 |
| Warangal (TG) | ~300-500 | ~400 |
| Pune (MH) | ~400-600 | ~500 |
| Nagpur (MH) | ~300-500 | ~400 |
| **Total** | | **~1,600 records** |

---

## Implementation Order

```
1. Write Playwright scraper (Python) → test locally against OMMAS
2. Create FTS5 schema + loader script (TypeScript)
3. Run scraper → generate JSONL → load into SQLite
4. Update tender-search.ts with PMGSY query path
5. Test end-to-end: "What rural roads are being built near Khammam?"
6. Deploy Lambda + CRON (production)
```

---

## Success Criteria

- Query "PMGSY roads in Khammam" returns real road names, contractors, costs from OMMAS
- Citation chips link to `https://omms.nic.in/Home/CitizenFeedback?state=36&district=507`
- Trust level renders as `official-portal` (blue dot in SourceCluster)
- No mock data in the response path

---

**Awaiting approval to begin implementation (recommended start: Step 1 — Playwright scraper).**
