/**
 * NH-44 Data Sources — Confirmed Public URLs for Scraping
 * 
 * These are the actual sources where expenditure, maintenance, and financial
 * progress data can be obtained for NH-44 sections.
 * 
 * Run: npx tsx scripts/scrape-nh44-sources.ts
 */

// ─── Source 1: Financial Progress (Expenditure vs Sanctioned) ─────────────────
// The NHAI State-wise Project Reports contain columns for:
// - Sanctioned cost, Cumulative physical progress (%), Cumulative financial progress (₹ Cr)
// - Scheduled start/completion dates, Actual progress

export const FINANCIAL_PROGRESS_SOURCES = [
  {
    id: 'nhai-maharashtra-report',
    description: 'NHAI Maharashtra State Report — has NH-44 (Nagpur-Hinganghat) with physical + financial progress columns',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/maharashtra_project_status.pdf',
    fallbackUrl: 'https://www.scribd.com/document/523732603/maharastra-nhai-report-pdf',
    fields: ['project_name', 'nh_number', 'length_km', 'scheduled_start', 'scheduled_completion', 'physical_progress_pct', 'financial_progress_crore', 'sanctioned_cost_crore'],
    nhCoverage: ['NH-44', 'NH-53', 'NH-547'],
  },
  {
    id: 'nhai-project-status-july-2024',
    description: 'NHAI Project Status Update July 2024 — 46 pages, all states, physical + financial progress',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/project_status_july_2024.pdf',
    fallbackUrl: 'https://www.scribd.com/document/812571666/nhai-project',
    fields: ['project_name', 'nh_number', 'state', 'length_km', 'mode', 'concessionaire', 'sanctioned_cost_crore', 'expenditure_crore', 'physical_progress_pct'],
    nhCoverage: ['All NHs including NH-44'],
  },
  {
    id: 'morth-annual-report-2024-25',
    description: 'MoRTH Annual Report 2024-25 — Chapter on NHAI expenditure, scheme-wise allocation vs actual spend',
    url: 'https://morth.nic.in/sites/default/files/Annual_Report_2024_25_English.pdf',
    fallbackUrl: 'https://www.scribd.com/document/830409870/Annual-Report-English-With-Cover',
    fields: ['scheme', 'allocation_crore', 'expenditure_crore', 'km_constructed', 'km_awarded'],
    nhCoverage: ['Aggregate by scheme (Bharatmala, NHDP, etc.)'],
  },
  {
    id: 'nhai-awarded-2024-25',
    description: 'NHAI Awarded Projects FY 2024-25 — includes PBMC maintenance contracts with dates and costs',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_24_25.pdf',
    fallbackUrl: 'https://www.scribd.com/document/883520162/Awarded-Projects-2024-25',
    fields: ['project_name', 'nh_number', 'state', 'length_km', 'mode', 'concessionaire', 'awarded_cost_crore', 'award_date', 'project_type'],
    nhCoverage: ['All NHs — includes EPC, HAM, PBMC, O&M contracts'],
    note: 'This PDF explicitly includes PBMC (Performance Based Maintenance Contracts) alongside construction projects',
  },
];

// ─── Source 2: O&M / Maintenance / Relaying Dates ─────────────────────────────
// For roads under HAM/BOT, the original contractor maintains during concession period.
// For completed EPC roads, NHAI awards separate O&M/PBMC/TOT contracts.

export const MAINTENANCE_SOURCES = [
  {
    id: 'nhai-tot-bundle-16',
    description: 'TOT Bundle 16 — NH-44 Hyderabad-Nagpur 251km, awarded Sept 2024 to Highway Infrastructure Trust',
    url: null, // No direct PDF — data from press releases
    pressReleases: [
      'https://www.thehindubusinessline.com/economy/logistics/nhai-awards-toll-operate-and-transfer-bundle-for-6661-crore/article68664872.ece',
      'https://m.economictimes.com/news/economy/infrastructure/nhai-awards-251-km-hyderabad-nagpur-corridor-for-rs-6661-cr-under-tot-model/articleshow/113531437.cms',
    ],
    data: {
      road_number: 'NH-44',
      section: 'Hyderabad-Nagpur Corridor',
      state: 'Telangana',
      length_km: 251,
      concessionaire: 'Highway Infrastructure Trust (KKR InvIT)',
      mode: 'TOT (Toll-Operate-Transfer)',
      award_date: '2024-09-18',
      concession_period_years: 20,
      award_amount_crore: 6661,
      maintenance_responsibility: 'Concessionaire (all periodic renewal, resurfacing, routine maintenance)',
      maintenance_start_date: '2024-09-18',
    },
  },
  {
    id: 'nhai-panipat-jalandhar-arbitration',
    description: 'NH-44 Panipat-Jalandhar — arbitration settled, financial data available from tribunal records',
    pressReleases: [
      'https://economictimes.com/industry/transportation/roadways/nhai-settles-arbitration-claims-in-panipat-jalandhar-highway-project-cases/articleshow/131060011.cms',
      'https://indianmasterminds.com/news/government/nhai-arbitration-claims-panipat-jalandhar-nh44-203647/',
    ],
    data: {
      road_number: 'NH-44',
      section: 'Panipat-Jalandhar',
      state: 'Haryana/Punjab',
      claims_by_concessionaire_crore: 8375,
      awarded_to_nhai_crore: 819.96,
      note: 'Concessionaires claims rejected. NHAI won net ₹819.96 Cr.',
    },
  },
  {
    id: 'nhai-awarded-pbmc-2024-25',
    description: 'PBMC contracts in NHAI Awarded 2024-25 PDF — maintenance contracts with start dates',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_24_25.pdf',
    fallbackUrl: 'https://www.scribd.com/document/883520162/Awarded-Projects-2024-25',
    note: 'Filter for project_type = "PBMC" to get maintenance contracts with dates',
  },
];

// ─── Source 3: Additional Confirmed URLs ──────────────────────────────────────

export const ADDITIONAL_SOURCES = [
  {
    id: 'prs-india-demand-for-grants',
    description: 'PRS India analysis of MoRTH budget — expenditure vs allocation breakdown',
    urls: [
      'https://prsindia.org/budgets/parliament/demand-for-grants-2024-25-analysis-road-transport-and-highways',
      'https://prsindia.org/budgets/parliament/demand-for-grants-2025-26-analysis-road-transport-and-highways',
      'https://prsindia.org/budgets/parliament/demand-for-grants-2026-27-analysis-road-transport-and-highways',
    ],
    fields: ['total_expenditure', 'nhai_allocation', 'scheme_wise_breakdown'],
  },
  {
    id: 'nhai-rams-portal',
    description: 'NHAI Road Asset Management System — has road condition data (requires login)',
    url: 'http://www.rams.nhai.gov.in/',
    note: 'Requires NHAI credentials. Contains pavement condition index, roughness data, maintenance history.',
    accessible: false,
  },
];
