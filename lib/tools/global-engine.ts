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

interface NominatimResponse {
  address?: {
    country_code?: string;
    country?: string;
  };
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

    const data = await res.json() as NominatimResponse;
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
  valueType: 'contract-value' | 'award-value' | 'tender-estimate' | null;
  valueSourceField: string | null;
  suppliers: string[];
  startDate: string | null;
  endDate: string | null;
  source: string;
  sourceUrl: string;
}

interface OCDSValue {
  amount?: number;
  currency?: string;
}

interface OCDSParty {
  name?: string;
}

interface OCDSClassification {
  scheme?: string;
  id?: string;
  description?: string;
}

interface OCDSItem {
  classification?: OCDSClassification;
  additionalClassifications?: OCDSClassification[];
}

interface OCDSAward {
  value?: OCDSValue;
  suppliers?: OCDSParty[];
  items?: OCDSItem[];
  contractPeriod?: { startDate?: string; endDate?: string };
}

interface OCDSContract {
  value?: OCDSValue;
  period?: { startDate?: string; endDate?: string };
}

interface OCDSRelease {
  ocid?: string;
  id?: string;
  buyer?: OCDSParty;
  tender?: {
    title?: string;
    description?: string;
    value?: OCDSValue;
    procuringEntity?: OCDSParty;
    items?: OCDSItem[];
  };
  awards?: OCDSAward[] | null;
  contracts?: OCDSContract[] | null;
}

function releaseSearchText(release: OCDSRelease): string {
  const classifications = [
    ...(release.tender?.items ?? []),
    ...(release.awards ?? []).flatMap((award) => award.items ?? []),
  ].flatMap((item) => [item.classification, ...(item.additionalClassifications ?? [])]);

  return [
    release.tender?.title,
    release.tender?.description,
    ...classifications.flatMap((classification) => [classification?.id, classification?.description]),
  ].filter(Boolean).join(' ').toLowerCase();
}

function isRoadRelease(release: OCDSRelease, keywords: string): boolean {
  const text = releaseSearchText(release);
  const roadClassification = /\b45233\d{3}\b/.test(text);
  const roadLanguage = /\b(road|highway|motorway|carriageway|pavement|resurfacing|bridge)\b/.test(text);
  const queryTokens = keywords.toLowerCase().match(/[a-z0-9-]{3,}/g) ?? [];
  const queryMatch = queryTokens.length === 0 || queryTokens.some((token) => text.includes(token));
  return (roadClassification || roadLanguage) && queryMatch;
}

function pickOCDSValue(release: OCDSRelease): {
  value: OCDSValue | null;
  type: OCDSResult['valueType'];
  sourceField: string | null;
} {
  const contractValue = release.contracts?.find((contract) => contract.value?.amount !== undefined)?.value;
  if (contractValue) return { value: contractValue, type: 'contract-value', sourceField: 'contracts[].value' };

  const awardValue = release.awards?.find((award) => award.value?.amount !== undefined)?.value;
  if (awardValue) return { value: awardValue, type: 'award-value', sourceField: 'awards[].value' };

  if (release.tender?.value?.amount !== undefined) {
    return { value: release.tender.value, type: 'tender-estimate', sourceField: 'tender.value' };
  }

  return { value: null, type: null, sourceField: null };
}

/**
 * Query a validated official OCDS publisher for road procurement data.
 * Only the UK Find a Tender connector is enabled until another publisher has
 * been endpoint-, schema-, and provenance-tested.
 */
export async function queryOCDS(countryCode: string, keywords: string): Promise<OCDSResult[]> {
  if (countryCode !== 'GB') return [];

  try {
    const endpoint = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100';
    const res = await fetch(endpoint, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'VIGIA/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const data = await res.json() as { releases?: OCDSRelease[] };
    const releases = (data.releases ?? []).filter((release) => isRoadRelease(release, keywords));

    return releases.slice(0, 10).map((release) => {
      const selectedValue = pickOCDSValue(release);
      return {
        ocid: release.ocid ?? release.id ?? '',
        title: release.tender?.title ?? 'Untitled',
        description: release.tender?.description ?? '',
        procuringEntity: release.tender?.procuringEntity?.name ?? release.buyer?.name ?? 'Unknown',
        valueAmount: selectedValue.value?.amount ?? null,
        valueCurrency: selectedValue.value?.currency ?? null,
        valueType: selectedValue.type,
        valueSourceField: selectedValue.sourceField,
        suppliers: (release.awards ?? []).flatMap((award) =>
          (award.suppliers ?? []).flatMap((supplier) => supplier.name ? [supplier.name] : []),
        ),
        startDate: release.contracts?.[0]?.period?.startDate ?? release.awards?.[0]?.contractPeriod?.startDate ?? null,
        endDate: release.contracts?.[0]?.period?.endDate ?? release.awards?.[0]?.contractPeriod?.endDate ?? null,
        source: 'Open Contracting Data Standard (OCDS)',
        sourceUrl: `https://www.find-tender.service.gov.uk/api/1.0/ocdsRecordPackages/${encodeURIComponent(release.ocid ?? release.id ?? '')}`,
      };
    });
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
  totalAmountRaw: string;
  currency: string;
  approvalDate: string | null;
  closingDate: string | null;
  status: string;
  implementingAgency: string;
  projectAbstract: string;
  source: string;
  sourceUrl: string;
}

interface WorldBankProject {
  id?: string;
  project_name?: string;
  countryshortname?: string;
  sector?: Array<{ Name?: string }>;
  sector1?: { Name?: string };
  totalamt?: string | number;
  boardapprovaldate?: string;
  closingdate?: string;
  status?: string;
  impagency?: string;
  project_abstract?: string | null;
}

interface WorldBankResponse {
  projects?: Record<string, WorldBankProject>;
}

/**
 * Query World Bank Projects API for transportation/infrastructure projects.
 * Coverage: 170+ countries, projects since 1947.
 */
export async function queryWorldBank(countryCode: string): Promise<WorldBankResult[]> {
  try {
    // NOTE: the correct sector filter is `mjsector_exact` (major sector). `sector_exact`
    // returns zero rows — it does not match the World Bank taxonomy.
    const res = await fetch(
      `https://search.worldbank.org/api/v2/projects?format=json&countrycode_exact=${countryCode}&mjsector_exact=Transportation&rows=10&os=0`,
      {
        headers: { 'User-Agent': 'VIGIA/1.0' },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) return [];

    const data = await res.json() as WorldBankResponse;
    const projects = data.projects ? Object.values(data.projects) : [];

    return projects.slice(0, 10).map((p) => ({
      projectId: p.id ?? '',
      projectName: p.project_name ?? '',
      countryName: p.countryshortname ?? '',
      sector: Array.isArray(p.sector)
        ? p.sector.map((sector: { Name?: string }) => sector.Name).filter(Boolean).join(', ')
        : (p.sector1?.Name ?? 'Transportation'),
      // totalamt arrives as a comma-formatted string (e.g. "750,000,000").
      totalAmount: Number(String(p.totalamt ?? '0').replace(/,/g, '')) || 0,
      totalAmountRaw: String(p.totalamt ?? '0'),
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
  if (ocdsResults.length > 0) tier = 'tier2-good';
  else if (worldBankResults.length > 0) tier = 'tier3-basic';

  return { countryCode, countryName, ocdsResults, worldBankResults, dataQualityTier: tier };
}
