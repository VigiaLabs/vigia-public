import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

const readJson = async (path) => JSON.parse(await readFile(resolve(path), 'utf8'));
const failures = [];
const checks = [];
const assert = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};
const isHttps = (value) => typeof value === 'string' && value.startsWith('https://');

const [worldBank, emarg, renewal, offline, manifest, golden] = await Promise.all([
  readJson('data/v2/world-bank-ke-transport.json'),
  readJson('data/v2/emarg-road-maintenance.json'),
  readJson('data/v2/periodic-renewal-documents.json'),
  readJson('data/v2/offline-pack-sources.json'),
  readJson('public/offline/manifest.json'),
  readJson('data/v2/golden-questions.json'),
]);

assert(worldBank.sourcePublisher === 'World Bank', 'World Bank publisher is explicit');
assert(worldBank.countryCode === 'KE' && worldBank.records.length > 0, 'World Bank Kenya snapshot contains records');
assert(worldBank.records.every((record) => isHttps(record.sourceProjectUrl)), 'World Bank records retain HTTPS project sources');

assert(emarg.sourceUrl === 'https://emarg.gov.in/knowUrRoad.htm' && emarg.records.length >= 500, 'eMARG snapshot contains a substantial public result set');
assert(emarg.records.every((record) => record.sourceDetailEndpoint === 'https://emarg.gov.in/public/getRoadDetailsByEncRoadDetailsId.do'), 'eMARG records retain the official detail endpoint');
assert(emarg.records.every((record) => record.consolidatedGrossExpenditureInr == null || (Number.isFinite(record.consolidatedGrossExpenditureInr) && record.consolidatedGrossExpenditureInr >= 0)), 'eMARG expenditure fields are numeric or unavailable');
assert(emarg.records.every((record) => !('sanctionedAmount' in record) && !('lastRelayingDate' in record)), 'eMARG ingestion does not invent sanction or relaying fields');
const emargGoldenRecord = emarg.records.find((record) => record.roadDetailsId === 64984);
assert(emargGoldenRecord?.consolidatedGrossExpenditureInr === 994923, 'Golden eMARG road 64984 retains its published expenditure exactly');

assert(renewal.records.length > 0, 'Periodic-renewal registry contains an official document');
assert(renewal.records.every((record) => isHttps(record.sourceUrl) && record.sha256?.length === 64), 'Periodic-renewal documents retain HTTPS sources and SHA-256');
assert(renewal.records.every((record) => record.actualCompletionProven === false && record.claimPolicy === 'budget-only'), 'Budget documents cannot prove physical completion');

const offlineRecords = [...offline.emergencyContacts, ...offline.authorityContacts];
assert(offlineRecords.every((record) => isHttps(record.sourceUrl) && record.sourceQuote?.length > 0), 'Offline records have HTTPS provenance and exact source fields');
assert(manifest.version === offline.version && manifest.emergencyContactCount === offline.emergencyContacts.length, 'Offline manifest matches source registry');

const requiredCategories = ['contractor-role', 'financial-semantics', 'maintenance-date', 'current-safety', 'nonexistent-road', 'international', 'offline', 'offline-queue'];
assert(requiredCategories.every((category) => golden.questions.some((question) => question.category === category)), 'Golden questions cover every critical V2 failure class');
assert(golden.questions.every((question) => question.requiredBehavior && question.forbiddenClaims.length > 0), 'Every golden question defines required and forbidden behavior');

const database = new Database(resolve('data/vigia_edge.db'), { readonly: true });
const metadata = Object.fromEntries(database.prepare('SELECT key, value FROM sync_metadata').all().map((row) => [row.key, row.value]));
const missingEmergencyProvenance = database.prepare("SELECT count(*) AS count FROM emergency_contacts WHERE source_url NOT LIKE 'https://%' OR source_quote = ''").get().count;
const missingAuthorityProvenance = database.prepare("SELECT count(*) AS count FROM pwd_helpdesks WHERE source_url NOT LIKE 'https://%' OR source_quote = ''").get().count;
database.close();
assert(metadata.version === offline.version, 'SQLite pack version matches registry');
assert(missingEmergencyProvenance === 0 && missingAuthorityProvenance === 0, 'SQLite pack contains no unprovenanced contacts');

const safetyCode = await readFile(resolve('lib/agents/claim-safety.ts'), 'utf8');
const uiCode = await readFile(resolve('components/chat/evidence-state-panel.tsx'), 'utf8');
const queueCode = await readFile(resolve('lib/db.ts'), 'utf8');
assert(['construction-contractor', 'sanctioned amount', 'expenditure', 'physical-relaying', 'O&M commencement', 'present-safety'].every((token) => safetyCode.includes(token)), 'Claim gate encodes role, financial, maintenance, and safety distinctions');
assert(['Verified', 'Derived', 'Inferred', 'Unavailable', 'Conflicting evidence', 'Cached offline'].every((label) => uiCode.includes(label)), 'Web UI renders every V2 evidence state');
assert(queueCode.includes("status: 'pending'") && queueCode.includes("fetch('/api/evidence'"), 'Outbox persists pending submissions for evidence analysis');

if (process.argv.includes('--live')) {
  const urls = [...new Set([
    worldBank.sourceUrl,
    emarg.sourceUrl,
    ...renewal.records.map((record) => record.sourceUrl),
    ...offlineRecords.map((record) => record.sourceUrl),
  ])];
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
      assert(response.ok, `Live source reachable: ${url}`);
    } catch {
      assert(false, `Live source reachable: ${url}`);
    }
  }
}

const snapshotHash = createHash('sha256').update(JSON.stringify({ worldBank, emarg, renewal, offline, golden })).digest('hex');
console.log(`V2 release checks: ${checks.length - failures.length}/${checks.length} passed`);
console.log(`Evidence snapshot SHA-256: ${snapshotHash}`);
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
