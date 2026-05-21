'use server';

/**
 * Global Applicability Engine — Module 3
 * Country detection + international data sources (OCDS, World Bank)
 * for non-India GPS coordinates.
 */

// ─── Country Detection ──────────────────────────────────────────────

export interface CountryInfo {
  countryCode: string;  // ISO 3166-1 alpha-2 (e.g., "IN", "KE", "US")
  countryName: string;
  isIndia: boolean;
  source: 'bounding-box' | 'nominatim';
}

/**
 * Resolves country from GPS coordinates.
 * Fast bounding-box pre-check for India, Nominatim reverse geocode for others.
 */
export async function resolveCountry(lat: number, lng: number): Promise<CountryInfo> {
  // Fast bounding-box pre-check for India (avoids API call)
  if (lat >= 6.5 && lat <= 35.7 && lng >= 68.1 && lng <= 97.4) {
    return { countryCode: 'IN', countryName: 'India', isIndia: true, source: 'bounding-box' };
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=3`,
      {
        headers: { 'User-Agent': 'VIGIA/1.0 (infrastructure-monitoring)' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return { countryCode: 'UNKNOWN', countryName: 'Unknown', isIndia: false, source: 'nominatim' };

    const data = await res.json();
    const code = (data.address?.country_code ?? 'unknown').toUpperCase();
    const name = data.address?.country ?? 'Unknown';

    return { countryCode: code, countryName: name, isIndia: code === 'IN', source: 'nominatim' };
  } catch {
    return { countryCode: 'UNKNOWN', countryName: 'Unknown', isIndia: false, source: 'nominatim' };
  }
}

// ─── OCDS (Open Contracting Data Standard) ──────────────────────────

export interface OCDSResult {
  ocid: string;
  title: string;
  description: string;
  procuringEntity: string;
  valueAmount: number | null;
  valueCurrency: string | null;
  suppliers: string[];
  startDate: string | null;
  endDate: string | null;
  source: string;
  sourceUrl: string;
}

/**
 * Query OCDS API for road/infrastructure procurement data.
 * Coverage: 60+ countries publishing in OCDS format.
 */
export async function queryOCDS(countryCode: string, keywords: string): Promise<OCDSResult[]> {
  try {
    const params = new URLSearchParams({
      q: keywords,
      country: countryCode,
      limit: '10',
    });

    const res = await fetch(`https://data.open-contracting.org/api/v1/releases?${params}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'VIGIA/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const releases = data.releases ?? data.results ?? [];

    return releases.slice(0, 10).map((r: any) => ({
      ocid: r.ocid ?? r.id ?? '',
      title: r.tender?.title ?? r.planning?.budget?.description ?? 'Untitled',
      description: r.tender?.description ?? '',
      procuringEntity: r.tender?.procuringEntity?.name ?? r.buyer?.name ?? 'Unknown',
      valueAmount: r.tender?.value?.amount ?? r.awards?.[0]?.value?.amount ?? null,
      valueCurrency: r.tender?.value?.currency ?? r.awards?.[0]?.value?.currency ?? null,
      suppliers: (r.awards ?? []).flatMap((a: any) => (a.suppliers ?? []).map((s: any) => s.name)),
      startDate: r.awards?.[0]?.contractPeriod?.startDate ?? null,
      endDate: r.awards?.[0]?.contractPeriod?.endDate ?? null,
      source: 'Open Contracting Data Standard (OCDS)',
      sourceUrl: `https://data.open-contracting.org/search?q=${encodeURIComponent(keywords)}&country=${countryCode}`,
    }));
  } catch {
    return [];
  }
}

// ─── World Bank Projects API ────────────────────────────────────────

export interface WorldBankResult {
  projectId: string;
  projectName: string;
  countryName: string;
  sector: string;
  totalAmount: number;
  currency: string;
  approvalDate: string | null;
  closingDate: string | null;
  status: string;
  implementingAgency: string;
  projectAbstract: string;
  source: string;
  sourceUrl: string;
}

/**
 * Query World Bank Projects API for transportation/infrastructure projects.
 * Coverage: 170+ countries, projects since 1947.
 */
export async function queryWorldBank(countryCode: string): Promise<WorldBankResult[]> {
  try {
    const res = await fetch(
      `https://search.worldbank.org/api/v2/projects?format=json&countrycode_exact=${countryCode}&sector_exact=Transportation&rows=10&os=0`,
      {
        headers: { 'User-Agent': 'VIGIA/1.0' },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const projects = data.projects ? Object.values(data.projects) as any[] : [];

    return projects.slice(0, 10).map((p: any) => ({
      projectId: p.id ?? '',
      projectName: p.project_name ?? '',
      countryName: p.countryshortname ?? '',
      sector: Array.isArray(p.sector) ? p.sector.join(', ') : (p.sector1?.Name ?? 'Transportation'),
      totalAmount: p.totalamt ?? 0,
      currency: 'USD',
      approvalDate: p.boardapprovaldate ?? null,
      closingDate: p.closingdate ?? null,
      status: p.status ?? 'Unknown',
      implementingAgency: p.impagency ?? 'Unknown',
      projectAbstract: (p.project_abstract ?? '').slice(0, 300),
      source: 'World Bank Projects API',
      sourceUrl: `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}`,
    }));
  } catch {
    return [];
  }
}

// ─── Unified International Query ────────────────────────────────────

export interface InternationalResult {
  countryCode: string;
  countryName: string;
  ocdsResults: OCDSResult[];
  worldBankResults: WorldBankResult[];
  dataQualityTier: 'tier2-good' | 'tier3-basic' | 'tier4-minimal';
}

// Tier 2 countries with OCDS national portals
const TIER2_COUNTRIES = new Set(['GB', 'CO', 'MX', 'NG', 'KE', 'UA', 'PH', 'PY', 'UG', 'ZA']);

/**
 * Unified international infrastructure query.
 * Queries both OCDS and World Bank, returns combined results.
 */
export async function queryInternational(
  countryCode: string,
  countryName: string,
  keywords: string
): Promise<InternationalResult> {
  const [ocdsResults, worldBankResults] = await Promise.all([
    queryOCDS(countryCode, keywords),
    queryWorldBank(countryCode),
  ]);

  let tier: InternationalResult['dataQualityTier'] = 'tier4-minimal';
  if (TIER2_COUNTRIES.has(countryCode)) tier = 'tier2-good';
  else if (worldBankResults.length > 0 || ocdsResults.length > 0) tier = 'tier3-basic';

  return { countryCode, countryName, ocdsResults, worldBankResults, dataQualityTier: tier };
}
