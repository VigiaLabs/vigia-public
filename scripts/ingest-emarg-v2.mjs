import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const portalUrl = 'https://emarg.gov.in/knowUrRoad.htm';
const searchEndpoint = 'https://emarg.gov.in/kyr/roadListFreeTextSearch.do';
const detailEndpoint = 'https://emarg.gov.in/public/getRoadDetailsByEncRoadDetailsId.do';
const queryConfig = JSON.parse(await readFile(resolve('data/v2/emarg-search-queries.json'), 'utf8'));
const queries = process.argv.length > 2 ? process.argv.slice(2) : queryConfig.queries;

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing ${field}.`);
  return value;
}

async function createSession() {
  const response = await fetch(portalUrl, {
    headers: { Accept: 'text/html', 'User-Agent': 'VIGIA/2.0 source-ingestion' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`eMARG portal returned HTTP ${response.status}.`);
  const html = await response.text();
  const token = html.match(/id="form_token"[^>]*value="([^"]+)"/)?.[1];
  if (!token) throw new Error('eMARG did not expose a public road-search form token.');
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  return { token, cookie };
}

async function searchRoads(query, session) {
  const body = new URLSearchParams({ form_token: session.token, roadNameParam: query });
  const response = await fetch(searchEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: session.cookie,
      'User-Agent': 'VIGIA/2.0 source-ingestion',
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`eMARG road search returned HTTP ${response.status}.`);
  const records = JSON.parse(await response.text());
  if (!Array.isArray(records)) throw new Error('eMARG road search did not return an array.');
  return records;
}

async function fetchRoadDetails(roadDetailsId, session) {
  const response = await fetch(detailEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: session.cookie,
      'User-Agent': 'VIGIA/2.0 source-ingestion',
    },
    body: new URLSearchParams({ roadDetailsId: String(roadDetailsId) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`eMARG road detail ${roadDetailsId} returned HTTP ${response.status}.`);
  return response.json();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

const session = await createSession();
const searchResults = (await Promise.all(queries.map(async (query) => ({
  query,
  records: await searchRoads(query, session),
})))).flatMap(({ query, records }) => records.map((record) => ({ ...record, matchedQuery: query })));

const uniqueRoads = [...new Map(searchResults.map((record) => [record.road_details_id, record])).values()];
const details = await mapWithConcurrency(uniqueRoads, 8, async (road) => ({
  road,
  detail: await fetchRoadDetails(road.road_details_id, session),
}));

const records = details.map(({ road, detail }) => ({
  roadDetailsId: road.road_details_id,
  encryptedRoadDetailsId: detail.encRoadDetailsId ?? null,
  roadId: road.road_id ?? null,
  connectionCode: road.cn_code ?? detail.cnCode ?? null,
  roadName: requireString(road.road_name ?? detail.roadName, 'road name'),
  stateName: requireString(road.state_name, 'state name'),
  districtName: requireString(road.district_name, 'district name'),
  blockName: requireString(road.block_name, 'block name'),
  maintenancePhase: road.road_from ?? null,
  scheme: road.scheme ?? null,
  packageNumber: detail.packageDetail?.packageNo ?? null,
  contractorName: detail.contractorName ?? null,
  maintenanceStartDateRaw: detail.strMaintenanceStartDate ?? null,
  stipulatedMaintenanceEndDateRaw: detail.strStipulatedDateOfCompletion ?? null,
  actualMaintenanceCompletionDateRaw: detail.actualCompletionMaintenanceDateStr ?? null,
  consolidatedGrossExpenditureInr: typeof detail.consolidatedGrossExpenditure === 'number'
    ? detail.consolidatedGrossExpenditure
    : null,
  averageMarksLabel: detail.averageMarks ?? null,
  bituminousLengthKm: road.bt_length ?? detail.btLength ?? null,
  concreteLengthKm: road.cc_length ?? detail.ccLength ?? null,
  actualLengthKm: road.actual_length ?? detail.actualLength ?? null,
  carriagewayWidthM: road.carriage_way_width ?? detail.carriageWayWidth ?? null,
  roadWidthM: road.road_width ?? detail.roadWidth ?? null,
  trafficDensity: road.traffic_density ?? detail.trafficDensity?.trafficDensity ?? null,
  matchedQuery: road.matchedQuery,
  sourceUrl: portalUrl,
  sourceSearchEndpoint: searchEndpoint,
  sourceDetailEndpoint: detailEndpoint,
}));

const snapshot = {
  schemaVersion: 'vigia-emarg-road-maintenance-v2',
  datasetLabel: 'eMARG public Know Your Road maintenance records',
  sourcePublisher: 'National Rural Infrastructure Development Agency, Ministry of Rural Development, Government of India',
  sourceUrl: portalUrl,
  fetchedAt: new Date().toISOString(),
  queries,
  recordCount: records.length,
  semantics: {
    consolidatedGrossExpenditureInr: 'Road-level maintenance expenditure shown by the eMARG public road-detail response; not a sanction or estimate.',
    maintenanceStartDateRaw: 'Maintenance contract start date; not a physical relaying date.',
    actualMaintenanceCompletionDateRaw: 'Maintenance-contract completion field when published; not a physical relaying date.',
  },
  records,
};

await mkdir(resolve('data/v2'), { recursive: true });
const outputPath = resolve('data/v2/emarg-road-maintenance.json');
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Wrote ${records.length} sourced eMARG road records to ${outputPath}`);
