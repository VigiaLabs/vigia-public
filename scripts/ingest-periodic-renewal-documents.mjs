import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pdf from 'pdf-parse';

const manifest = JSON.parse(await readFile(resolve('data/v2/periodic-renewal-sources.json'), 'utf8'));
const allowedDomains = new Set(['www.arunachalplan.gov.in']);

const records = [];
for (const document of manifest.documents) {
  const source = new URL(document.sourceUrl);
  if (source.protocol !== 'https:' || !allowedDomains.has(source.hostname)) {
    throw new Error(`Unapproved periodic-renewal source: ${document.sourceUrl}`);
  }

  const response = await fetch(source, {
    headers: { Accept: 'application/pdf', 'User-Agent': 'VIGIA/2.0 source-ingestion' },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`${document.publisher} returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const parsed = await pdf(bytes);
  const normalizedText = parsed.text.replace(/\s+/g, ' ').trim();
  const phraseIndex = normalizedText.toLowerCase().indexOf(document.expectedPhrase.toLowerCase());
  if (phraseIndex < 0) throw new Error(`Expected phrase not found in ${document.sourceUrl}.`);
  const excerptStart = Math.max(0, phraseIndex - 180);
  const excerptEnd = Math.min(normalizedText.length, phraseIndex + document.expectedPhrase.length + 320);

  records.push({
    ...document,
    retrievedAt: new Date().toISOString(),
    contentType: response.headers.get('content-type'),
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pageCount: parsed.numpages,
    sourceExcerpt: normalizedText.slice(excerptStart, excerptEnd),
    dateKind: 'planned-or-published',
    actualCompletionProven: false,
  });
}

const output = {
  schemaVersion: 'vigia-periodic-renewal-documents-v2',
  fetchedAt: new Date().toISOString(),
  recordCount: records.length,
  warning: 'These official documents prove a published plan, tender, or budget entry only. They do not prove that physical relaying occurred.',
  records,
};

await writeFile(resolve('data/v2/periodic-renewal-documents.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Verified ${records.length} official periodic-renewal documents.`);
