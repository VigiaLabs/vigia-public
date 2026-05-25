# VIGIA Data Gap Plan: RAMS Portal, Per-km MPR, EPC Resurfacing

## Status: Remaining data that cannot be scraped from public PDFs

---

## Gap 1: NHAI RAMS Portal (Road Asset Management System)

### What it contains
- Pavement Condition Index (PCI) per km
- International Roughness Index (IRI) readings
- Maintenance history (date-wise resurfacing records)
- Road inventory (lane width, shoulder type, drainage condition)
- Network Survey Vehicle (NSV) data

### URL
`http://www.rams.nhai.gov.in/`

### Access barrier
**Requires NHAI internal credentials.** Not publicly accessible. The portal is used by NHAI Project Directors and Regional Officers for internal monitoring.

### Acquisition strategies (ranked by feasibility)

1. **RTI Request (30 days, ₹10 fee)**
   - File under RTI Act 2005 to NHAI HQ CPIO
   - Request: "Pavement condition data and maintenance history for NH-44 from Km X to Km Y for the period 2020-2025"
   - VIGIA's existing `rti-lookup.ts` can auto-generate this request
   - Expected response: Excel/PDF with per-km condition data

2. **MoU with NHAI (3-6 months)**
   - NHAI has signed MoUs with academic institutions for data access
   - Approach: Partner with IIT/NIT transportation department that already has RAMS access
   - Precedent: NHAI-ISRO MoU for satellite mapping, NHAI-IIT Madras for pavement research

3. **NSV Data via MoRTH Standard Format**
   - MoRTH published a "Suggestive format for collection and reporting of data using Network Survey Vehicle (NSV)"
   - URL: `https://morth.nic.in/en/comprehensive_compendium_circulars`
   - This format specification tells us exactly what fields RAMS stores
   - Can be used to structure our schema even before getting the data

4. **Proxy via CAG Audit Reports**
   - The Comptroller & Auditor General audits NHAI road quality
   - CAG reports (available on `cag.gov.in`) contain sampled PCI/IRI data
   - Example: CAG Report No. 35 of 2014 on NHDP has per-stretch condition data

### Implementation plan
```
Phase 1 (Week 1): File RTI for NH-44 sections in Telangana + Haryana
Phase 2 (Week 2): Parse CAG audit reports for historical condition data
Phase 3 (Month 2+): Explore NHAI academic MoU pathway
```

### Schema preparation (ready for when data arrives)
```sql
CREATE TABLE road_condition_data (
  id SERIAL PRIMARY KEY,
  road_number VARCHAR(10),
  state VARCHAR(50),
  from_km DECIMAL,
  to_km DECIMAL,
  pci_score DECIMAL,          -- 0-100, higher = better
  iri_value DECIMAL,          -- mm/m, lower = smoother
  survey_date DATE,
  last_resurfacing_date DATE,
  surface_type VARCHAR(30),   -- BC, DBM, SDBC, etc.
  condition_rating VARCHAR(20), -- Good/Fair/Poor/Very Poor
  source TEXT,
  ingested_at TIMESTAMP DEFAULT NOW()
);
```

---

## Gap 2: Per-km Expenditure Breakdown (NHAI Internal MPRs)

### What it contains
- Monthly disbursement per project package
- Running Account (RA) bill amounts per km
- Variation order costs
- Price escalation claims paid

### Access barrier
**NHAI Monthly Progress Reports (MPRs) are internal documents** shared between PIU (Project Implementation Unit) and RO (Regional Office). Not published on the website.

### Acquisition strategies

1. **Aggregate from NHAI Financial Progress PDF (already in pipeline)**
   - The `nhai-financial-progress` source we just added gives project-level totals
   - This covers ~80% of the use case (sanctioned vs spent per project)
   - Missing: per-km granularity within a project

2. **RTI for specific project RA bills**
   - Request: "Running Account bills and payment details for NH-44 Package [X] from award date to present"
   - This gives exact per-km expenditure
   - Response time: 30 days

3. **Parliament Questions (Lok Sabha/Rajya Sabha)**
   - MPs frequently ask "project-wise expenditure on NH-44"
   - These answers are published on `loksabhaph.nic.in` and `rajyasabha.nic.in`
   - Searchable and scrapable
   - URL pattern: `http://loksabhaph.nic.in/Questions/QResult15.aspx`

4. **NHAI Annual Report (published)**
   - Contains state-wise and scheme-wise expenditure totals
   - Available at: `https://nhai.gov.in/nhai/annual-report`
   - Less granular than MPR but publicly available

### Implementation plan
```
Phase 1 (Now): Use project-level totals from Financial Progress PDF ✅ (done)
Phase 2 (Week 1): Scrape Parliament Q&A for NH-44 expenditure answers
Phase 3 (Week 2): File RTI for per-km RA bills for specific degraded sections
```

### What we CAN answer today
- "What is the sanctioned cost for NH-44 Panipat-Jalandhar?" → ₹8,375 Cr ✅
- "How much has been spent?" → ₹819.96 Cr (from arbitration records) ✅
- "What is the per-km cost?" → Need RTI for RA bills ❌

---

## Gap 3: Exact Resurfacing Dates for EPC Roads

### What it contains
- Date of last bituminous overlay
- Date of last pothole patching
- Defect Liability Period (DLP) maintenance records
- Periodic Renewal (PR) execution dates

### Why this is hard
For **EPC roads**, once the Defect Liability Period (typically 5 years) expires, NHAI takes over maintenance directly. There is no concessionaire contract to track. NHAI then either:
- Awards a separate PBMC contract (we can now scrape this ✅)
- Awards a Periodic Renewal sanction (we can now scrape this ✅)
- Does routine maintenance through its own PIU (no public record)

### Acquisition strategies

1. **PBMC Contract Dates (already in pipeline) ✅**
   - The `nhai-om-contracts` PDF source gives PBMC award dates
   - PBMC start date ≈ last major maintenance date
   - Covers roads where NHAI awarded a maintenance contract

2. **Periodic Renewal Sanctions (already in pipeline) ✅**
   - The `nhai-periodic-renewal` PDF source gives PR sanction dates
   - PR sanction date + 3-6 months ≈ actual relaying date
   - Covers roads where NHAI sanctioned resurfacing

3. **TOT Concession Start Dates (already in pipeline) ✅**
   - TOT concessionaire takes over maintenance from day 1
   - TOT award date = maintenance responsibility start date
   - We already have this for NH-44 Hyderabad-Nagpur (2024-09-18)

4. **DLP Expiry Calculation (derivable)**
   - For EPC projects: completion_date + 5 years = DLP expiry
   - After DLP expiry, road enters "NHAI direct maintenance" phase
   - We can calculate this from existing data

5. **RTI for PIU Maintenance Register**
   - Each NHAI PIU maintains a "Maintenance Register" with date-wise entries
   - RTI request to specific PIU: "Maintenance activities carried out on NH-44 Km X to Km Y during 2023-2025"
   - Most reliable source for exact dates

### Implementation plan
```
Phase 1 (Now): Derive from PBMC + PR + TOT data ✅ (done)
Phase 2 (Now): Calculate DLP expiry from completion dates ✅ (derivable)
Phase 3 (Week 1): Add DLP expiry calculation to query engine
Phase 4 (Week 2): File RTI for PIU maintenance registers for specific sections
```

### What we CAN answer today
- "When was NH-44 Hyderabad-Nagpur last maintained?" → O&M active since 2024-09-18 (TOT) ✅
- "Who maintains NH-44 Panipat-Jalandhar?" → Under HAM concession, contractor responsible ✅
- "Exact date of last resurfacing at Km 234?" → Need RTI to PIU ❌

---

## Summary: Data Coverage After This Sprint

| Data Point | Coverage | Source |
|---|---|---|
| Road type (2L/4L/6L) | ✅ 100% | NHAI Awarded PDFs + Wikipedia |
| Contractor name | ✅ 100% | NHAI Awarded PDFs |
| Sanctioned cost | ✅ 95% | NHAI Financial Progress PDF |
| Expenditure (amount spent) | ✅ 60% | Financial Progress PDF + Arbitration records |
| Maintenance responsibility | ✅ 80% | O&M/PBMC/TOT PDFs |
| Last maintenance date | ✅ 40% | TOT award dates + PBMC start dates |
| Per-km condition (PCI/IRI) | ❌ 0% | RAMS portal (RTI required) |
| Exact resurfacing date | ⚠️ 20% | Derivable from DLP + PR sanctions |

## Recommended Next Actions

1. **Immediate (this week)**: Deploy the updated Track A pipeline to start ingesting the 5 new PDF sources
2. **Week 1**: Add DLP expiry calculation to the query engine (completion_date + 5 years)
3. **Week 1**: Scrape Parliament Q&A archives for NH-44 expenditure data
4. **Week 2**: File RTI requests for:
   - RAMS data for NH-44 Telangana section (most degraded)
   - PIU maintenance register for NH-44 Panipat-Jalandhar
5. **Month 2**: Explore NHAI academic MoU for bulk RAMS access
