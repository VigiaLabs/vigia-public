# VIGIA Master V2

## Objective

VIGIA V2 is a claim-safe road-infrastructure intelligence system. It must never
substitute a related but different fact merely to produce a complete-looking
answer. In particular, it must preserve the distinctions between:

- construction contractor, concessionaire, and O&M operator;
- sanctioned amount, estimate, award value, payment, and expenditure;
- physical relaying, inspection, contract award, and O&M commencement;
- verified condition evidence and a general statement about road safety.

All critical claims must be traceable to an actual source. No synthetic project,
person, phone number, amount, date, contract, or maintenance event may be inserted
into an ingestion dataset.

## Non-Negotiable Evidence Contract

Every critical claim uses the following lifecycle:

1. **Ingest** an authoritative source with its original URL and retrieval time.
2. **Normalize** the source into a typed fact without changing its semantics.
3. **Validate** identifiers, units, dates, geography, and source provenance.
4. **Retrieve** only facts matching the requested road, section, and jurisdiction.
5. **Gate** unsupported claims before answer synthesis.
6. **Render** verified, derived, inferred, unavailable, and conflicted facts distinctly.

Critical values must include a source identifier and an exact source quote or
machine-readable source field. News articles may corroborate but must not be the
sole evidence for a critical government-contract claim when an official record is
expected.

## Canonical V2 Entities

### Road segment

- country and administrative jurisdiction;
- canonical road identifier and aliases;
- section name and chainage bounds;
- road classification, lanes, and surface type;
- source and observation date.

### Contract

- contract identifier and road segment;
- role: construction, EPC, concessionaire, O&M, consultant, or authority;
- supplier and buyer;
- procurement stage and status;
- exact source document.

### Financial event

- type: sanction, estimate, award, contract value, release, payment, or expenditure;
- amount, currency, date, and cumulative/non-cumulative status;
- bill, transaction, or document reference;
- exact source field or quote.

### Maintenance event

- type: physical relaying, resurfacing, overlay, periodic renewal, inspection,
  defect repair, O&M commencement, or contract award;
- actual date versus planned date;
- section/chainage and surface treatment;
- source and evidence status.

### Authority contact

- authority, division/PIU, jurisdiction, and designation;
- officer name only when published by the authority;
- phone/email, effective date, and source.

## Source Plan

### India

1. NHAI award, concession, and project documents already indexed by VIGIA.
2. Verified State PWD authority directories for supported states.
3. PMGSY OMMAS/eMARG maintenance records and payment data where publicly exposed.
4. State PWD periodic-renewal work orders and completion records for literal
   relaying/resurfacing dates.
5. data.gov.in financial datasets for explicitly labelled aggregate expenditure.
6. NHAI RAMS/Data Lake only through authorized access; absence of access is shown
   as a coverage limitation, never filled by inference.

### International

1. World Bank Projects API for project-level financing and implementation data.
2. UK Find a Tender official OCDS API for procurement records.
3. Additional country connectors only after their endpoint, licence, schema, and
   provenance have been validated.

The system must not claim generic OCDS coverage for a country unless a working,
tested publisher connector returned records for that query.

## Guardrails

### Exact-road and section gate

- Normalize NH/SH/MDR identifiers and suffixes.
- Reject evidence for a different road number.
- Ask for a section/state when a road spans multiple jurisdictions.

### Contractor-role gate

- “Built by” requires construction/EPC evidence.
- O&M or concession evidence cannot answer a construction-contractor question.
- All available roles are displayed separately.

### Financial-semantics gate

- Spending questions require payment or expenditure evidence.
- Sanctions, estimates, awards, and concession values cannot be relabelled as spent.
- Currency conversion is disabled unless the rate and date are cited.

### Maintenance-date gate

- “Last relayed” requires a verified relaying, resurfacing, overlay, or periodic
  renewal event with an actual date.
- O&M commencement, inspection, award, or completion dates are forbidden substitutes.

### Safety gate

- Present safety requires recent, segment-matched PCI, IRI, inspection, or verified
  hazard/telemetry evidence.
- Contract completion and active O&M do not prove current safety.

### Critical-value gate

- Names, phones, emails, dates, and amounts must appear in structured evidence.
- Unsupported values result in an explicit unavailable response.

### Conflict and freshness gate

- Conflicting sources remain visible and are marked conflicted.
- Source tier, publication date, retrieval time, and geographic scope determine
  precedence; conflicts are never silently discarded.

## Offline V2

- Bundle national emergency and complaint channels plus verified supported-state
  authority contacts.
- Cache golden road records and recent cited answers.
- Show an offline badge, last-sync timestamp, and stale-data warning.
- Queue citizen reports locally and synchronize after reconnection.
- Do not claim cloud search, live condition, or current personnel data while offline.

## UI Evidence States

Every critical field is labelled as one of:

- Verified
- Derived
- Inferred
- Unavailable
- Conflicting evidence
- Cached offline

The answer view exposes jurisdiction, section, source authority, retrieval time,
role labels, financial type, and an evidence drawer.

## Acceptance Gates

- zero unsupported phone numbers;
- zero unsupported monetary values;
- zero contractor-role substitutions;
- zero sanction/payment/expenditure substitutions;
- zero O&M/inspection/relaying substitutions;
- zero present-safety claims without qualifying condition evidence;
- 100% refusal for nonexistent road identifiers;
- 100% critical claims linked to source evidence;
- offline authority and emergency tests pass after process restart;
- international results identify the publisher and country explicitly.

## Delivery Sequence

### Phase 1 — Claim safety

- [x] Define typed claim and provenance schemas.
- [x] Add critical-query support gates.
- [x] Render evidence-state badges in web responses.
- [x] Mirror claim-state metadata in Android SSE models.

### Phase 2 — Authoritative ingestion

- [x] Add World Bank snapshot ingestion with source metadata.
- [x] Restrict OCDS retrieval to validated official providers.
- [x] Add eMARG road-level maintenance/payment connector.
- [x] Add supported-state periodic-renewal document ingestion.

### Phase 3 — Offline proof

- [x] Version the offline authority/road pack.
- [x] Add stale-data and last-sync UI.
- [x] Add report queue and reconnection test.

### Phase 4 — Evaluation

- [x] Build a golden question set for role, financial, maintenance, safety,
  jurisdiction, international, and offline failures.
- [x] Run all release gates before deployment.
- [x] Preserve a tested rollback image and APK.
