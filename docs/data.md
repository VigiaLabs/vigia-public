# VIGIA Data Sources

## Overview

VIGIA uses 18+ real data sources across government PDFs, live APIs, scraped directories, and curated reference data. Zero mock data remains in production query paths (only IMU telemetry awaits DePIN integration).

---

## Track A: PDF Ingestion Pipeline (pgvector)

Government PDFs are downloaded daily, parsed into semantic chunks, embedded via Amazon Titan Embed v2 (1024-dim), and stored in pgvector with HNSW indexing.

| # | Source | URL | Frequency | Content |
|---|--------|-----|-----------|---------|
| 1 | NHAI Awarded Projects 2022-23 | https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf | Weekly | Road numbers, concessionaires, modes, budgets, award dates |
| 2 | NHAI Projects Under Bidding | https://nhai.gov.in/nhai/sites/default/files/mix_file/Status_of_Projects_where_Bids.pdf | Weekly | Projects in bidding stage |
| 3 | NHAI Awarded Projects 2023-24 | https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_23_24.pdf | Weekly | FY23-24 awarded contracts |
| 4 | NHAI Awarded Projects 2024-25 | https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_24_25.pdf | Weekly | FY24-25 awarded contracts |
| 5 | NHAI Under Implementation | https://nhai.gov.in/nhai/sites/default/files/mix_file/Projects_Under_Implementation.pdf | Weekly | Active construction projects |
| 6 | NHAI Completed Projects | https://nhai.gov.in/nhai/sites/default/files/mix_file/Completed_Projects.pdf | Monthly | Completed projects with dates |
| 7 | Bharatmala Pariyojana Status | https://nhai.gov.in/nhai/sites/default/files/mix_file/Bharatmala.pdf | Monthly | Bharatmala phase status |
| 8 | NHAI TOT Bundles | https://nhai.gov.in/nhai/sites/default/files/mix_file/TOT_Bundles.pdf | Monthly | Toll-Operate-Transfer monetization |
| 9 | MoRTH Annual Report 2023-24 | https://morth.nic.in/sites/default/files/Annual_Report_2023_24_English.pdf | Monthly | Macro road statistics, expenditure |
| 10 | MoRTH Basic Road Statistics | https://morth.nic.in/sites/default/files/Basic_Road_Statistics_of_India.pdf | Monthly | National road length, condition categories |

---

## Track B: Structured Data & Scraped Directories

### PMGSY Rural Roads (OMMAS Portal)

| Source | URL | Method | Records |
|--------|-----|--------|---------|
| OMMAS TimeSeries | https://omms.nic.in/dbweb/Home/TimeSeries | Playwright scraper / published data | 14 records (Khammam, Warangal, Pune, Nagpur) |
| OMMAS Citizen Feedback | https://omms.nic.in/Home/CitizenFeedback | Playwright scraper (requires Indian IP) | Target: ~1,600 records |

**Districts covered:** Khammam (TG), Warangal (TG), Pune (MH), Nagpur (MH)  
**Schemes:** PMGSY-I, PMGSY-II, PMGSY-III, RCPLWEA

### PWD Officer Directories

| State | Source URL | Records | Data Fields |
|-------|-----------|---------|-------------|
| Telangana | https://tg-roadcutting.cgg.gov.in/ContactUs | 14 | EE name, phone, email, division |
| Maharashtra | https://pwd.maharashtra.gov.in/en/pune/ | 14 | CE/SE/EE name, phone, email, address |
| Maharashtra (HQ) | https://pwd.maharashtra.gov.in/en/whos-who/ | (included above) | ACS, Secretary names + contacts |

**Last verified:** 2026-05-23  
**Update frequency:** Weekly scrape (when deployed)

---

## Live APIs (Real-Time)

| # | API | URL | Auth | Purpose |
|---|-----|-----|------|---------|
| 11 | OpenStreetMap Overpass | https://overpass-api.de/api/interpreter | None | Road classification from GPS (NH/SH/MDR/rural) |
| 12 | World Bank Projects | https://search.worldbank.org/api/v2/projects | None | International infrastructure projects (170+ countries) |
| 13 | OCDS Procurement | https://data.open-contracting.org/api/ | None | International procurement contracts (60+ countries) |
| 14 | Nominatim Geocoding | https://nominatim.openstreetmap.org/reverse | None | Country detection for international routing |

---

## Curated Reference Data

| # | File | Content | Last Verified |
|---|------|---------|---------------|
| 15 | `data/authority-matrix.json` | RTI + complaint authorities for NH/SH/MDR/PMGSY with state overrides (MH, KL, KA, TN) | 2026-05-21 |

**Includes:**
- NHAI PIU complaint portal (pgportal.gov.in, helpline 1033)
- State PWD complaint portals (Maharashtra, Kerala, Karnataka, Tamil Nadu)
- RTI filing authorities (CPIO NHAI, SPIOs for states)
- Legal basis citations (NHAI Act 1988, RTI Act 2005, State PWD Acts)
- Fee structure (₹10 RTI fee)
- Response timelines (30 days)

---

## Local FTS5 Database (`data/nhai_mock.db`)

| Table | Records | Source | Search Type |
|-------|---------|--------|-------------|
| `nhai_sections` | 20 | Real NHAI PDF (awarded_year_22_23_0.pdf) | FTS5 keyword/BM25 |
| `pwd_contacts` | 28 | Scraped from TG/MH government sites | FTS5 porter tokenizer |
| `pmgsy_contracts` | 14 | OMMAS TimeSeries (verified government data) | FTS5 porter tokenizer |

---

## AWS pgvector Database (`vigia-pgvector` RDS)

| Table | Engine | Dimensions | Index | Content |
|-------|--------|-----------|-------|---------|
| `contract_embeddings` | pgvector | 1024 (Titan Embed v2) | HNSW (m=16, ef=64) | Semantic chunks from 10 PDFs |

**Access:** Lambda Function URL (`vigia-retrieval-proxy`) → Bedrock embed query → pgvector cosine similarity → top-K chunks

---

## Daily/Weekly Auto-Retrieval Pipeline (AWS Lambda + EventBridge)

| Time (UTC) | Lambda | Frequency | Target | What It Does |
|------------|--------|-----------|--------|-------------|
| 02:00 | `vigia-pdf-scraper` | Daily | 10 NHAI/MoRTH PDFs | Downloads, SHA-256 deduplicates via DynamoDB |
| (S3 trigger) | `vigia-pdf-parser` | On new PDF | All states | Semantic chunking + Titan Embed v2 → pgvector |
| 03:00 | `vigia-api-etl` | Daily | data.gov.in, PMGSY OMMAS | Fetches structured API data → S3 JSONL |
| 03:30 | `vigia-fts5-loader` | Daily | All data | Rebuilds production FTS5 SQLite → S3 |
| 04:00 | `vigia-unified-embedder` | Daily | TG, MH districts | Embeds PWD + PMGSY + authority → pgvector |
| 04:00 Sun | `vigia-pwd-scraper` | Weekly | Telangana, Maharashtra | Scrapes R&B/PWD officer directories |
| 04:30 Sun | `vigia-pmgsy-scraper` | Weekly | Khammam, Warangal, Pune, Nagpur | Scrapes OMMAS portal for rural road data |

### Target Districts (Auto-Refreshed)

| State | Districts | Data Refreshed |
|-------|-----------|---------------|
| Telangana | Khammam, Warangal, Adilabad, Siddipet, Medchal, Sangareddy, Kothagudem, Peddapalli, Wanaparthy, Nirmal, Gajwel, Vikarabad | PWD contacts + PMGSY roads |
| Maharashtra | Pune, Nagpur, Satara, Solapur, Kolhapur | PWD contacts + PMGSY roads |
| All India | All states with NHAI projects | Contract PDFs (10 sources) |

---

## Client-Side Database (Browser IndexedDB)

| Table | Purpose |
|-------|---------|
| `threads` | Chat thread metadata (id, title, updatedAt) |
| `messages` | Chat messages with metadata (role, content, sources, pendingAction) |

**Engine:** Dexie v2 (IndexedDB wrapper)  
**Retention:** 45 days with conservative cleanup

---

## Data That Does NOT Exist (Honest Gaps)

| Data Point | Why It's Missing | What We Do Instead |
|-----------|-----------------|-------------------|
| Real-time road condition scores | No public API exists in India | Suggest photo upload (citizen-claim) |
| Executive Engineer names (most states) | Only TG/MH directories scraped | Explicitly state "not yet indexed" |
| IMU telemetry (acceleration data) | Awaiting DePIN/Solana integration | Hardcoded placeholder in telemetry agent |
| Historical condition trends | No public time-series API | Infer from contract completion dates + DLP |
| data.gov.in road statistics | Requires API key we don't have | Use MoRTH PDF data instead |
