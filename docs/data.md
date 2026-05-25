# VIGIA — Data Sources

## Primary Sources (Currently Ingested into pgvector)

### 1. NHAI Awarded Projects PDFs
- **Years**: FY 2022-23, 2023-24, 2024-25
- **Fields**: Road number, lanes (2L/4L/6L), state, concessionaire, contract mode (HAM/EPC/BOT), sanctioned cost, award date, length (km)
- **Source**: [nhai.gov.in](https://nhai.gov.in)
- **Format**: PDF tables → semantic chunks

### 2. NHAI Financial Progress Report
- **Fields**: Sanctioned cost vs actual expenditure per project, physical progress percentage
- **Source**: [nhai.gov.in](https://nhai.gov.in)
- **Use**: Identifies cost overruns and stalled projects

### 3. NHAI O&M/PBMC Contracts
- **Fields**: Maintenance contract awards with start dates, contractor name, contract period
- **Source**: [nhai.gov.in](https://nhai.gov.in)
- **Use**: Determines who is responsible for road maintenance and when their obligation began

### 4. NHAI Periodic Renewal Sanctions
- **Fields**: Relaying/resurfacing sanction dates and costs
- **Source**: [nhai.gov.in](https://nhai.gov.in)
- **Use**: Tracks when NHAI sanctioned maintenance work — proxy for "last maintained" date

### 5. NHAI TOT Bundle Status
- **Fields**: Toll-Operate-Transfer concessions (20-year O&M obligations)
- **Key Record**: TOT Bundle-16 — NH-44 Hyderabad–Nagpur, 251 km, Highway Infrastructure Trust, ₹6,661 Cr, awarded 2024-09-18
- **Source**: [nhai.gov.in](https://nhai.gov.in) + press releases
- **Use**: TOT concessionaires have strict maintenance obligations; identifies accountability

### 6. MoRTH Annual Report 2024-25
- **Fields**: Scheme-wise budget allocation vs actual expenditure (Bharatmala, NHDP, SARDP-NE, etc.)
- **Source**: [morth.nic.in](https://morth.nic.in)
- **Use**: Macro-level spending analysis per road development scheme

### 7. PMGSY OMMAS Portal
- **Fields**: Road name, district, state, contractor, sanctioned cost, length, completion status
- **Source**: [omms.nic.in](https://omms.nic.in)
- **Use**: Rural road data — covers Pradhan Mantri Gram Sadak Yojana roads

### 8. State PWD Official Directories
- **Fields**: Officer names, phone numbers, emails, office addresses
- **Coverage**: Maharashtra, Telangana
- **Source**: State PWD websites
- **Use**: Personnel queries — "Who is the SE for Pune division?"

### 9. Government Authority Matrix
- **Fields**: Complaint routing (portal URLs, helplines, escalation paths), RTI filing info per road type
- **Coverage**: NH (NHAI), SH (State PWD), MDR (Zilla Parishad), PMGSY (NRRDA)
- **Source**: Manually curated from official sources
- **Use**: When data void detected, provides actionable next steps for citizens

### 10. NH-44 Structured Project Data
- **Fields**: 10 sections with road type classification, contractor, sanctioned/expenditure amounts, maintenance dates, status
- **Sources**: NHAI TOT Award documents, NHAI Arbitration records, Wikipedia
- **Use**: Deep-dive case study for India's longest highway (Srinagar–Kanyakumari)

---

## Secondary Sources (Planned)

### 1. Parliament Q&A Archives
- **Content**: MPs ask project-wise expenditure questions; answers contain per-project financial data
- **Source**: [loksabhaph.nic.in](https://loksabhaph.nic.in)
- **Acquisition**: Web scraping (public data)

### 2. News Articles
- **Content**: NHAI press releases, construction industry news, project delay reports
- **Sources**: constructionworld.in, ET Infra, NHAI press releases
- **Use**: Real-time project updates, delay notifications

### 3. Web Search Integration
- **Content**: For queries about roads not in our index, fall back to web search
- **Use**: Graceful degradation when knowledge base has no relevant chunks

### 4. DePIN Telemetry from VIGIA Users
- **Content**: Crowdsourced road condition data from users' phone accelerometers/cameras
- **Status**: Future feature — requires mobile app + data pipeline
- **Use**: Real-time road condition monitoring without government data dependency

### 5. CAG Audit Reports
- **Content**: Comptroller & Auditor General reports contain sampled PCI/IRI data for audited stretches
- **Source**: [cag.gov.in](https://cag.gov.in)
- **Use**: Only source of pavement condition data without NHAI credentials

### 6. OpenStreetMap
- **Content**: Road geometry, lane counts, surface type
- **Status**: Already used via OSRM for map route rendering
- **Use**: Spatial context and route visualization

---

## Data Gaps (Require RTI or Institutional Access)

### 1. NHAI RAMS Portal
- **URL**: [rams.nhai.gov.in](https://rams.nhai.gov.in)
- **Contains**: Pavement Condition Index (PCI), International Roughness Index (IRI), maintenance history
- **Blocker**: Requires NHAI credentials (not public)
- **Acquisition Path**: RTI application (30 days, ₹10 fee) or academic MoU with NHAI

### 2. Per-km Expenditure
- **Contains**: Running Account bills from NHAI Project Implementation Units (PIUs)
- **Blocker**: Internal documents, not published
- **Acquisition Path**: RTI to specific PIU office

### 3. Exact Resurfacing Dates (EPC Roads)
- **Contains**: PIU maintenance registers showing when resurfacing was done
- **Blocker**: No public record when NHAI maintains directly (as opposed to concessionaire)
- **Acquisition Path**: RTI to PIU; partial derivation possible from DLP expiry + Periodic Renewal sanctions

---

## Data Coverage Summary

| Data Point | Coverage | Source |
|---|---|---|
| Road type (2L/4L/6L) | 100% | NHAI Awarded PDFs |
| Contractor name | 100% | NHAI Awarded PDFs |
| Sanctioned cost | 95% | NHAI Financial Progress PDF |
| Expenditure (spent) | 60% | Financial Progress + Arbitration |
| Maintenance responsibility | 80% | O&M/PBMC/TOT PDFs |
| Last maintenance date | 40% | TOT + PBMC start dates |
| Per-km condition (PCI/IRI) | 0% | RAMS (RTI required) |
| Exact resurfacing date | 20% | Derivable from DLP + PR |

---

## Notes

- All primary sources are **publicly available** government documents
- Data is refreshed via automated pipeline (EventBridge CRON → Lambda → S3 → pgvector)
- PDF parsing uses semantic chunking to preserve table structure and cross-references
- Embedding model: Amazon Titan Embed v2 (1024 dimensions) — good multilingual support for Hindi/English mixed documents
