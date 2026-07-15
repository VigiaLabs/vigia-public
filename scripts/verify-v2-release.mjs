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

const [worldBank, emarg, renewal, offline, manifest, golden, nh44Sections, nhaiPiuContacts, chennaiSources] = await Promise.all([
  readJson('data/v2/world-bank-ke-transport.json'),
  readJson('data/v2/emarg-road-maintenance.json'),
  readJson('data/v2/periodic-renewal-documents.json'),
  readJson('data/v2/offline-pack-sources.json'),
  readJson('public/offline/manifest.json'),
  readJson('data/v2/golden-questions.json'),
  readJson('data/nh44-sections.json'),
  readJson('data/v2/nhai-piu-contacts.json'),
  readJson('data/v2/chennai-road-sources.json'),
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
const nh44TotRecords = nh44Sections.filter((record) => record.tot_concession_award_value_crore === 6661);
assert(nh44TotRecords.length === 2, 'NH-44 TOT records use a dedicated concession-award field');
assert(nh44TotRecords.every((record) => record.sanctioned_cost_crore == null && record.source_url.startsWith('https://www.pib.gov.in/')), 'NH-44 TOT value is not mislabeled as sanctioned cost and cites PIB');
const nh163gPiu = nhaiPiuContacts.records.find((record) => record.roadNumbers.includes('NH-163G'));
assert(nh163gPiu?.phone === '+91 8919631585' && nh163gPiu?.designation.includes('Project Director'), 'NH-163G contact preserves the official NHAI role and phone');
assert(nh163gPiu?.pageNumber === 43 && nh163gPiu?.sourcePdfSha256 === 'f66b82ec59f2bd08943c6f830c79c4b56cd3dc1a17b41a8c4a04ead1ed47b1f7', 'NH-163G contact retains verified page and PDF hash');
assert(!JSON.stringify(nh163gPiu).includes('9440818085'), 'NH-163G NHAI contact does not substitute the State R&B phone');
assert(chennaiSources.records.length === 9, 'Chennai registry contains nine curated source records');
assert(chennaiSources.records.every((record) => isHttps(record.metadata.source_url) && record.metadata.source_quote?.length > 20), 'Every Chennai record retains an HTTPS source and exact source quote');
const gccRoadContact = chennaiSources.records.find((record) => record.sourceId === 'gcc-bus-route-roads-contact-2026');
assert(gccRoadContact?.metadata.phone === '9445190735' && gccRoadContact?.metadata.email === 'sebrr@chennaicorporation.gov.in', 'Chennai complaint routing preserves the published GCC road contact');
assert(chennaiSources.records.filter((record) => record.sourceType === 'road_reference').every((record) => record.metadata.trust_level === 'reference-source'), 'Wikipedia records are labelled as secondary reference sources');

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
const citationStateCode = await readFile(resolve('lib/agents/state.ts'), 'utf8');
const retrievalCode = await readFile(resolve('lib/tools/search-unified.ts'), 'utf8');
const adminCode = await readFile(resolve('lib/agents/agents/admin.ts'), 'utf8');
const sourceCardCode = await readFile(resolve('components/chat/source-card.tsx'), 'utf8');
const plannerCode = await readFile(resolve('lib/agents/planner.ts'), 'utf8');
const federatedSearchCode = await readFile(resolve('lib/tools/search-federated.ts'), 'utf8');
const semanticCacheCode = await readFile(resolve('lib/cache/semantic-cache.ts'), 'utf8');
const chatRouteCode = await readFile(resolve('app/api/chat/route.ts'), 'utf8');
const sarvamSttCode = await readFile(resolve('lib/voice/sarvam-stt.ts'), 'utf8');
const standaloneServerCode = await readFile(resolve('server/index.ts'), 'utf8');
const complaintRoutingCode = await readFile(resolve('lib/complaints/authority-routing.ts'), 'utf8');
const complaintActionsCode = await readFile(resolve('components/chat/pending-action-card.tsx'), 'utf8');
const chatShellCode = await readFile(resolve('components/chat/chat-shell.tsx'), 'utf8');
assert(['construction-contractor', 'sanctioned amount', 'expenditure', 'physical-relaying', 'O&M commencement', 'present-safety'].every((token) => safetyCode.includes(token)), 'Claim gate encodes role, financial, maintenance, and safety distinctions');
assert(['Verified', 'Derived', 'Inferred', 'Unavailable', 'Conflicting evidence', 'Cached offline'].every((label) => uiCode.includes(label)), 'Web UI renders every V2 evidence state');
assert(queueCode.includes("status: 'pending'") && queueCode.includes("fetch('/api/evidence'"), 'Outbox persists pending submissions for evidence analysis');
assert(['excerpt', 'pageNumber', 'paragraphNumber', 'sectionTitle', 'chunkIndex'].every((field) => citationStateCode.includes(field)), 'Citation schema retains passage-level provenance');
assert(retrievalCode.includes('SELECT content, section_title, page_number FROM nhai_sections'), 'NHAI retrieval retains indexed page numbers');
assert(adminCode.includes('buildCitationProvenance(r)') && adminCode.includes("metadataString(metadata, 'excerpt') ?? result.chunkText"), 'Generic retrieval citations prefer exact source excerpts');
assert(adminCode.includes('hasExactRoadMatch') && adminCode.includes('Math.max(0.55, topSimilarity)'), 'Exact road identifiers clear semantic-score data-void thresholds');
assert(sourceCardCode.includes('passage.quote') && sourceCardCode.includes('Open source') && sourceCardCode.includes('sourceLocation'), 'Sources panel renders passage, locator, and document link');
assert(plannerCode.includes('official|responsible|authority') && plannerCode.includes("startsWith('NH-')"), 'Road personnel planner recognizes responsibility wording and protects NHAI jurisdiction');
assert(plannerCode.includes('nhai_exact_road') && plannerCode.includes('Exact national-highway lookup'), 'Explicit national-highway IDs use deterministic retrieval planning');
assert(federatedSearchCode.includes('prioritizeExactRoadMatches') && federatedSearchCode.includes('return exact;'), 'Federated retrieval requires exact suffixed road identifiers');
assert(semanticCacheCode.includes('v18-rich-scoped-road-answers'), 'Semantic cache invalidates stale sparse national-highway answers');
assert(adminCode.includes('pmgsy|emarg|rural road|gram sadak|roadDetailsId') && !adminCode.includes('rural road|maintenance expenditure|maintenance contractor'), 'eMARG retrieval requires an explicit rural-road anchor');
assert(chatRouteCode.includes("state.pipelineStatus === 'complete' && state.auditFinding") && chatRouteCode.includes('delta: deterministicText'), 'Terminal data-void responses bypass free-form generation');
assert(chatRouteCode.includes('personnelAnchorMissing') && chatRouteCode.includes('personnelDisclosure.findings.slice(0, 5)'), 'Missing NHAI officer disclosures bypass free-form jurisdiction substitution');
assert(chatRouteCode.includes('nh44TotDisclosure') && chatRouteCode.includes('Scoped TOT concession award/value'), 'NH-44 TOT answers distinguish concession value from construction budget');
assert(chatRouteCode.includes('nh44WholeTotalDisclosure') && chatRouteCode.includes('fabricated highway total'), 'NH-44 whole-road totals bypass contradictory free-form synthesis');
assert(adminCode.includes('No exact indexed project record was found') && adminCode.includes('roadDataFound: false'), 'Unknown national highways cannot inherit semantically adjacent project records');
assert(['saaras:v3', "language_code', 'unknown", "mode', 'transcribe", 'GetSecretValueCommand'].every((token) => sarvamSttCode.includes(token)), 'Web voice input uses Sarvam Saaras v3 auto-detection with server-side credentials');
assert(standaloneServerCode.includes("app.post('/sarvam-proxy/stt'") && standaloneServerCode.includes('languageInstruction(body.response_language)'), 'Android search service proxies Sarvam and enforces latest-turn response language');
assert(complaintRoutingCode.includes('buildCitizenComplaintDisclosure') && complaintRoutingCode.includes('sebrr@chennaicorporation.gov.in') && complaintRoutingCode.includes('ownershipCaveat'), 'Short complaint routing uses verified Chennai contacts with a jurisdiction caveat');
assert(complaintActionsCode.includes('Send alert to authority') && complaintActionsCode.includes('Contact authority') && complaintActionsCode.includes('mailto:'), 'Complaint UI provides explicit email and phone actions without auto-sending');
assert(chatShellCode.includes('currentAssistantHasText') && !chatShellCode.includes('lastAssistantHasText'), 'Live pipeline progress is not suppressed by an earlier assistant reply');

const nhaiDatabase = new Database(resolve('data/nhai_mock.db'), { readonly: true });
const nh163gRows = nhaiDatabase.prepare("SELECT count(*) AS count FROM nhai_sections WHERE upper(content) LIKE '%163G%'").get().count;
const nh44TotRows = nhaiDatabase.prepare("SELECT count(*) AS count FROM nh44_projects WHERE tot_concession_award_value_crore = 6661 AND sanctioned_cost_crore IS NULL AND source_url LIKE 'https://www.pib.gov.in/%'").get().count;
nhaiDatabase.close();
assert(nh163gRows > 0, 'Local NHAI index contains NH-163G project records');
assert(nh44TotRows === 2, 'Local NH-44 index preserves official TOT concession semantics');

if (process.argv.includes('--live')) {
  const urls = [...new Set([
    worldBank.sourceUrl,
    emarg.sourceUrl,
    ...renewal.records.map((record) => record.sourceUrl),
    ...offlineRecords.map((record) => record.sourceUrl),
    ...chennaiSources.records.map((record) => record.metadata.source_url),
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

const snapshotHash = createHash('sha256').update(JSON.stringify({ worldBank, emarg, renewal, offline, golden, chennaiSources })).digest('hex');
console.log(`V2 release checks: ${checks.length - failures.length}/${checks.length} passed`);
console.log(`Evidence snapshot SHA-256: ${snapshotHash}`);
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
