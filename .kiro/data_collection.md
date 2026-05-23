# VIGIA Data Integrity Phase: Design Specification

**Document:** `data_collection.md`  
**Status:** DRAFT — Awaiting approval  
**Date:** 2026-05-23  
**Scope:** Eradicate mock data, re-architect trust model, add real data sources

---

## Current Mock Data Inventory

| Component | Mock Data | Impact |
|-----------|-----------|--------|
| `lib/tools/mock-data.ts` → `getCurrentRoadCondition()` | Hardcoded score 6/10, "Minor potholes km 45" | Used when `intent === 'condition'` |
| `lib/tools/mock-data.ts` → `getHistoricalCondition()` | 3 fake records (7, 8, 9 scores) | Used when `intent === 'condition'` |
| `lib/tools/mock-data.ts` → `getExecutiveEngineer()` | "Data not publicly available", generic PWD | Used when `intent === 'personnel'` |
| `lib/tools/mock-data.ts` → `getLastRelayingDate()` | Hardcoded 2022-03-15 | Currently unused in pipeline |
| `lib/agents/agents/telemetry.ts` (inline) | IMU: 2.4g, 14 events, 200m, confidence 0.92 | Always returned when GPS present |

---

## Phase 1: Zero-Trust Vision Agent (Real-Time Conditions)

### Problem Statement

The current Vision Agent (`lib/agents/agents/vision.ts`) treats user-uploaded photos as authoritative ground truth. The Guardrail node (`lib/agents/guardrail.ts`) then uses vision evidence to detect "contradictions" against admin records — effectively allowing any citizen photo to override official data. This is a trust inversion.

### Current Flow

```
User uploads photo → Vision Agent (Bedrock VLM) → confidence 0.7+
Admin Agent → findings contain "compliant/completed"
Guardrail → contradiction detected → retry loop → contradictionVerified: true
Synthesizer → "CRITICAL: verified contradiction between official documents and visual evidence"
```

### Proposed Architecture

#### 1.1 Vision Agent Output Reclassification

The Vision Agent will no longer output `trustLevel: 'verified-spatial'`. Its output becomes a **Citizen Claim** with a new trust level.

**Changes to `lib/agents/state.ts`:**

```typescript
// Add new trust level
trustLevel: z.enum(['verified-spatial', 'legally-binding', 'official-portal', 'citizen-claim']),

// Add new pipeline status for pending user interaction
PipelineStatusSchema = z.enum([
  'routing', 'ingesting', 'guardrail', 'retrying',
  'synthesizing', 'complete', 'failed',
  'awaiting-user-action',  // NEW
]),

// Add pending action field to state
pendingAction: z.object({
  type: z.enum(['flag-for-review', 'verify-depin']),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  visionFindings: z.array(z.string()),
  suggestedActions: z.array(z.string()),
}).optional(),
```

#### 1.2 Updated Vision Agent Output

**Changes to `lib/agents/agents/vision.ts`:**

```typescript
// Change citation trust level
citations: [{
  sourceId: 'vision-citizen-claim',
  label: 'Citizen Photo Assessment',
  url: payload.imageUrl,
  trustLevel: 'citizen-claim',  // NOT 'verified-spatial'
}],

// Add explicit claim framing in findings
findings: [
  `[CITIZEN CLAIM] ${object.findings[0]}`,
  ...object.findings.slice(1),
  'Note: This is an unverified citizen submission. Official condition data may differ.',
],
```

#### 1.3 Guardrail Update

**Changes to `lib/agents/guardrail.ts`:**

The contradiction detection logic currently triggers when vision confidence ≥ 0.7. Update to:

```typescript
// OLD: Treats vision as ground truth
const visionIsHigh = visionEvidence.confidence >= 0.7;

// NEW: Citizen claims do NOT trigger contradiction
const isCitizenClaim = visionEvidence.citations.some(c => c.trustLevel === 'citizen-claim');
if (isCitizenClaim) {
  // Do NOT flag contradiction — instead set pending action
  return {
    pendingAction: {
      type: 'flag-for-review',
      coordinates: state.payload.gps,
      visionFindings: visionEvidence.findings,
      suggestedActions: [
        'Flag this coordinate for official PWD review',
        'Verify against DePIN telemetry data',
      ],
    },
    pipelineStatus: 'synthesizing', // Continue to synthesizer, don't retry
    debugTrace: [trace],
  };
}
```

#### 1.4 Chat Stream Integration

The `pendingAction` field flows through to the UI via `extractUIPayload()`. The frontend renders it as an interactive follow-up:

**Changes to `lib/agents/ui-hook.ts`:**

```typescript
export interface UIPayload {
  // ... existing fields ...
  pendingAction?: {
    type: 'flag-for-review' | 'verify-depin';
    coordinates?: { lat: number; lng: number };
    visionFindings: string[];
    suggestedActions: string[];
  };
}
```

**Frontend rendering:** The `ChatShell` renders `pendingAction.suggestedActions` as clickable buttons below the response. Clicking "Flag for PWD review" would POST to a future `/api/flag` endpoint (out of scope for this phase).

#### 1.5 How This Doesn't Break the Chat Stream

- The pipeline still completes normally (`pipelineStatus: 'synthesizing' → 'complete'`).
- The `pendingAction` is metadata attached to the response, not a blocking state.
- The Synthesizer receives the vision findings labeled as `[CITIZEN CLAIM]` and generates an appropriate response acknowledging the visual evidence without asserting it as fact.
- The chat stream is never interrupted — the follow-up buttons are rendered post-response.

---

## Phase 2: Inferential Routing (Project Deadlines & Relaying)

### Problem Statement

There is no government API for "last relaying date" or "maintenance schedule." The current system returns mock data from `getLastRelayingDate()`. However, this information IS inferrable from contract PDFs already in our pgvector database — specifically from "Project Completion Date" and "Defect Liability Period (DLP)" clauses.

### Current Router Prompt (Relevant Section)

```
INTENT CATEGORIES:
- "condition" → user asks about road condition, history, how bad a road is, damage assessment
- "tender_search" → user asks about contractor, budget, tender, cost, project details
```

The router classifies "when was this road last relayed?" as `condition` intent, which triggers `getCurrentRoadCondition()` (mock data).

### Proposed Router Prompt Update

**Changes to `lib/agents/router.ts` prompt:**

```
INTENT CATEGORIES (pick exactly one):
- "complaint" → user wants to file a complaint, report a pothole, ask who to call
- "rti" → user mentions RTI, Right to Information, wants to file an information request
- "condition" → user asks about CURRENT road condition, damage assessment, how bad it is NOW
- "personnel" → user asks about executive engineer, who is in charge, contact details
- "tender_search" → user asks about contractor, budget, tender, cost, project details, concessionaire, OR asks about maintenance timelines, last relaying date, project completion, defect liability period, when road was built/resurfaced

CRITICAL ROUTING RULE:
Questions about "last relaying," "maintenance date," "when was it resurfaced," "completion date," or "DLP" must be routed to "tender_search" — NOT "condition." These dates are found in contract PDFs, not condition monitoring systems.
```

### Proposed Synthesizer System Prompt Update

**Addition to `VIGIA_BASE_SYSTEM_PROMPT` in `lib/voice/chat-prompt.ts`:**

```
INFERENTIAL MAPPING RULES:
- "Last relaying date" → Infer from Project Completion Date in contract evidence. If a project was completed/awarded in year X under EPC mode, the road surface was laid at completion. State this inference explicitly.
- "Maintenance schedule" → Infer from Defect Liability Period (DLP). Standard DLP is 5 years for EPC, 15 years for HAM/BOT. If completion date is known, calculate DLP expiry.
- "When was it resurfaced?" → Same as relaying date inference.
- Always state: "Based on contract records, the project was completed on [date]. Under [mode] contracts, the Defect Liability Period is [X] years, expiring [date]."
- If no completion date is found in evidence, say so explicitly rather than guessing.
```

### Proposed Admin Agent Update

**Changes to `lib/agents/agents/admin.ts` — `tender_search` case:**

When the user query contains maintenance/relaying keywords, append a targeted search suffix:

```typescript
// In the tender_search default case, before calling searchTenderByRoadNumber:
const maintenanceKeywords = /\b(relay|resurface|maintenance|completion|DLP|defect liability)\b/i;
const isMaintenanceQuery = maintenanceKeywords.test(text);

// If maintenance query, also search for completion/DLP terms
const searchQuery = isMaintenanceQuery
  ? `${roadNumber} completion date defect liability period`
  : roadNumber;

const tenders = await searchTenderByRoadNumber(searchQuery);
```

### Mock Data Removal

After this change, `getLastRelayingDate()` in `lib/tools/mock-data.ts` becomes dead code. The `condition` intent path no longer handles relaying questions — they route to `tender_search` which queries real contract data.

---

## Phase 3: Track B PWD Directory Scraper (Executive Contacts)

### Problem Statement

`getExecutiveEngineer()` returns "Data not publicly available" for all queries. However, State PWD websites publish directory listings with real officer names, designations, jurisdictions, and phone numbers.

### Target Sources

| State | URL Pattern | Format |
|-------|-------------|--------|
| Telangana | `https://roads.telangana.gov.in/Officers.aspx` | HTML table |
| Maharashtra | `https://mahapwd.gov.in/en/officers-list` | HTML table |
| Karnataka | `https://kpwd.karnataka.gov.in/info-2/Officers/en` | HTML table |
| Kerala | `https://keralapwd.gov.in/officers` | HTML table |

### Scraping Strategy

**Runtime:** Python 3.12 Lambda (Track B)  
**Library:** `requests` + `BeautifulSoup4` (static HTML) with `playwright` fallback for JS-rendered pages  
**Schedule:** Weekly (CRON: `0 4 ? * MON *`)  
**Output:** JSONL → S3 → FTS5 loader

#### Scraper Logic

```python
# Pseudocode for the scraper
1. For each state in TARGET_STATES:
   a. Fetch the officers page HTML
   b. Parse <table> rows for: Name, Designation, Division/Circle, Phone, Email
   c. Filter to: Executive Engineer, Superintending Engineer, Chief Engineer
   d. Normalize division names to match road jurisdictions
   e. Output NormalizedContact records

2. Write JSONL to s3://vigia-structured-data/pwd-contacts/{state}/{date}.jsonl
3. Trigger FTS5 loader to rebuild pwd_contacts table
```

### SQLite Table Schema (`pwd_contacts`)

```sql
CREATE VIRTUAL TABLE pwd_contacts USING fts5(
  name,
  designation,
  division,
  state,
  jurisdiction_roads,  -- comma-separated road numbers under this division
  phone,
  email,
  office_address,
  source_url,
  scraped_at,
  tokenize='porter'
);

CREATE TABLE pwd_contact_metadata (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  designation TEXT NOT NULL,
  division TEXT NOT NULL,
  state TEXT NOT NULL,
  jurisdiction_roads TEXT,
  phone TEXT,
  email TEXT,
  office_address TEXT,
  source_url TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  confidence TEXT DEFAULT 'high'  -- 'high' for official directory, 'medium' for inferred
);
```

### FTS5 Query Logic (Next.js App)

**Changes to `lib/agents/agents/admin.ts` — `personnel` case:**

```typescript
case 'personnel': {
  const rn = roadNumber ?? 'Unknown';
  const st = state ?? 'Unknown';

  // Try real PWD directory first
  const contacts = await queryPwdContacts(rn, st);
  if (contacts.length > 0) {
    const ee = contacts[0];
    return {
      agentId: 'admin',
      status: 'completed',
      confidence: 0.85,
      findings: [
        `Name: ${ee.name}`,
        `Designation: ${ee.designation}`,
        `Division: ${ee.division}`,
        ee.phone ? `Phone: ${ee.phone}` : null,
        ee.email ? `Email: ${ee.email}` : null,
        `Office: ${ee.office_address}`,
        `Source: ${ee.source_url} (scraped ${ee.scraped_at})`,
      ].filter(Boolean) as string[],
      citations: [{ sourceId: 'pwd-directory', label: `${st} PWD Official Directory`, url: ee.source_url, trustLevel: 'official-portal' }],
      latencyMs: Date.now() - start,
    };
  }

  // Fallback to generic (current mock behavior, but clearly labeled)
  // ...existing mock code with confidence: 0.2...
}
```

**New tool: `lib/tools/pwd-contacts.ts`:**

```typescript
export async function queryPwdContacts(roadNumber: string, state: string): Promise<PwdContact[]> {
  // Query the pwd_contacts FTS5 table in nhai_production.db (or nhai_mock.db locally)
  const db = new Database(dbPath, { readonly: true });
  const query = `${state} ${roadNumber}`;
  const rows = db.prepare(
    `SELECT * FROM pwd_contacts WHERE pwd_contacts MATCH ? ORDER BY rank LIMIT 3`
  ).all(query);
  db.close();
  return rows;
}
```

### CDK Changes

Add a new Lambda to the ingestion stack:

```typescript
const pwdScraper = new lambda.Function(this, 'PwdScraper', {
  functionName: 'vigia-pwd-scraper',
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'handler.lambda_handler',
  code: lambda.Code.fromAsset('pipeline/track-b/pwd-scraper'),
  timeout: Duration.minutes(5),
  memorySize: 512,
  environment: { STRUCTURED_BUCKET: structuredBucket.bucketName },
});

// Weekly schedule
new events.Rule(this, 'PwdScraperSchedule', {
  schedule: events.Schedule.cron({ minute: '0', hour: '4', weekDay: 'MON' }),
  targets: [new targets.LambdaFunction(pwdScraper)],
});
```

---

## Phase 4: Historical Condition Pivot (Bypassing data.gov.in)

### Problem Statement

`getHistoricalCondition()` returns 3 hardcoded records. The Track B `api-etl.ts` was designed to fetch from `data.gov.in`, but we don't have a `DATA_GOV_API_KEY`. We need a real data source for historical road condition trends.

### Two-Track Solution

#### Track 4A: MoRTH Annual Report Parsing (Immediate)

The MoRTH Annual Report PDF (`morth-annual-report` in our Track A config) contains macro-level statistics:
- Total NH length by condition category (Good/Fair/Poor)
- State-wise road condition breakdowns
- Year-over-year maintenance expenditure
- Defect statistics by road type

**Changes to `infrastructure/pipeline/track-a/pdf-parser.ts`:**

Add a specialized parser for MoRTH reports that extracts structured condition data:

```typescript
// Additional metadata extraction for MoRTH reports
function extractConditionData(text: string, sourceKey: string): ConditionRecord | null {
  if (!sourceKey.startsWith('morth-')) return null;

  const conditionMatch = text.match(
    /(\d+)\s*km.*?(good|fair|poor|critical)/i
  );
  const yearMatch = text.match(/(20\d{2}[-–]\d{2,4})/);

  if (!conditionMatch) return null;

  return {
    lengthKm: parseInt(conditionMatch[1]),
    condition: conditionMatch[2].toLowerCase(),
    reportYear: yearMatch?.[1] ?? 'unknown',
    source: 'MoRTH Annual Report',
  };
}
```

**pgvector schema addition:**

```sql
CREATE TABLE road_condition_history (
  id SERIAL PRIMARY KEY,
  road_number VARCHAR(20),
  state VARCHAR(50),
  condition_category VARCHAR(20),  -- good/fair/poor/critical
  length_km NUMERIC,
  report_year VARCHAR(10),
  source_pdf_hash VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_condition_road ON road_condition_history(road_number);
CREATE INDEX idx_condition_state ON road_condition_history(state);
```

#### Track 4B: DePIN DynamoDB Ledger (Future Integration)

When the Solana/DePIN telemetry network is live, condition data will flow from on-chain attestations into a DynamoDB table.

**DynamoDB Schema:**

```
Table: vigia-depin-conditions
Partition Key: road_segment_id (String) — e.g., "NH-163G-km45-km50"
Sort Key: timestamp (Number) — Unix epoch ms

Attributes:
  - condition_score: Number (1-10)
  - attestation_count: Number (validators who confirmed)
  - anomaly_types: StringSet (pothole, crack, edge_drop, etc.)
  - avg_acceleration_g: Number
  - solana_tx_signature: String
  - validator_stake_weighted_confidence: Number (0-1)
  - source: String ("depin-v1")
```

**Transition logic in admin agent:**

```typescript
case 'condition': {
  // Priority 1: DePIN ledger (when available)
  const depinData = await queryDePINCondition(roadNumber);
  if (depinData) {
    return { /* real DePIN data, confidence based on attestation_count */ };
  }

  // Priority 2: MoRTH historical (from pgvector road_condition_history)
  const morthData = await queryMoRTHCondition(roadNumber, state);
  if (morthData.length > 0) {
    return { /* real MoRTH macro data, confidence: 0.6 (macro-level, not road-specific) */ };
  }

  // Priority 3: Explicit "no data" (replaces mock)
  return {
    agentId: 'admin',
    status: 'completed',
    confidence: 0.1,
    findings: [
      `No real-time condition data available for ${roadNumber}.`,
      'Historical macro-level data from MoRTH reports may be available.',
      'For current conditions, consider uploading a photo or enabling GPS telemetry.',
    ],
    citations: [],
    latencyMs: Date.now() - start,
  };
}
```

---

## Mock Data Removal Summary

| Mock Function | Replacement | Phase |
|---------------|-------------|-------|
| `getCurrentRoadCondition()` | DePIN ledger → MoRTH macro → explicit "no data" | Phase 4 |
| `getHistoricalCondition()` | `road_condition_history` table (MoRTH parsing) | Phase 4 |
| `getExecutiveEngineer()` | `pwd_contacts` FTS5 table (PWD scraper) | Phase 3 |
| `getLastRelayingDate()` | Inferential routing to contract completion dates | Phase 2 |
| Telemetry IMU (inline) | DePIN attestations (future) → explicit "no data" | Phase 4 |

---

## Implementation Order & Dependencies

```
Phase 2 (Inferential Routing)     — No infrastructure changes, prompt-only
  ↓
Phase 1 (Zero-Trust Vision)       — State schema + guardrail logic changes
  ↓
Phase 3 (PWD Scraper)             — New Lambda + FTS5 table + admin agent update
  ↓
Phase 4 (Historical Condition)    — Track A parser update + DynamoDB schema (future)
```

**Recommended start:** Phase 2 first (lowest risk, highest immediate impact on response quality), then Phase 1.

---

## Open Questions

1. **Phase 1:** Should the "Flag for PWD review" button actually submit anywhere, or is it UI-only for now?
2. **Phase 3:** Which state PWD directory should we target first for the scraper prototype?
3. **Phase 4:** Is the DePIN DynamoDB schema finalized, or should we design for schema evolution?

---

**Awaiting your approval to begin implementing Phase 1 (Zero-Trust Vision Agent).**
