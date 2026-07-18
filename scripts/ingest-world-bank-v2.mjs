import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const countryCode = (process.argv[2] ?? 'KE').toUpperCase();
if (!/^[A-Z]{2}$/.test(countryCode)) {
  throw new Error('Country code must be an ISO 3166-1 alpha-2 code.');
}

const sourceUrl = new URL('https://search.worldbank.org/api/v2/projects');
sourceUrl.search = new URLSearchParams({
  format: 'json',
  countrycode_exact: countryCode,
  mjsector_exact: 'Transportation',
  rows: '100',
  os: '0',
}).toString();

const response = await fetch(sourceUrl, {
  headers: { Accept: 'application/json', 'User-Agent': 'VIGIA/2.0' },
  signal: AbortSignal.timeout(30_000),
});

if (!response.ok) {
  throw new Error(`World Bank API returned HTTP ${response.status}.`);
}

const payload = await response.json();
if (!payload || typeof payload !== 'object' || !payload.projects || typeof payload.projects !== 'object') {
  throw new Error('World Bank API response did not contain a projects object.');
}

const records = Object.values(payload.projects).map((project) => ({
  projectId: project.id ?? null,
  projectName: project.project_name ?? null,
  countryName: project.countryshortname ?? null,
  status: project.status ?? null,
  totalAmountRaw: project.totalamt ?? null,
  implementingAgency: project.impagency ?? null,
  sectors: Array.isArray(project.sector)
    ? project.sector.map((sector) => sector?.Name).filter(Boolean)
    : [],
  primarySector: project.sector1 ?? null,
  boardApprovalDateRaw: project.boardapprovaldate ?? null,
  closingDateRaw: project.closingdate ?? null,
  projectAbstract: project.project_abstract ?? null,
  sourceProjectUrl: project.id
    ? `https://projects.worldbank.org/en/projects-operations/project-detail/${project.id}`
    : null,
}));

if (records.some((record) => !record.projectId || !record.projectName)) {
  throw new Error('At least one World Bank project lacked an identifier or project name.');
}

const snapshot = {
  schemaVersion: 'vigia-world-bank-transport-v2',
  datasetLabel: 'World Bank transportation projects',
  sourcePublisher: 'World Bank',
  sourceUrl: sourceUrl.toString(),
  fetchedAt: new Date().toISOString(),
  countryCode,
  recordCount: records.length,
  records,
};

const outputDirectory = resolve('data/v2');
const outputPath = resolve(outputDirectory, `world-bank-${countryCode.toLowerCase()}-transport.json`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

console.log(`Wrote ${records.length} official World Bank records to ${outputPath}`);
