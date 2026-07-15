import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SourceRecord = {
  sourceId: string;
  sourceType: string;
  state: string | null;
  district: string | null;
  text: string;
  metadata: Record<string, unknown>;
};

type Registry = {
  version: string;
  retrievedAt: string;
  records: SourceRecord[];
};

function loadLocalEnv() {
  try {
    const lines = readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {}
}

loadLocalEnv();
const configuredRegion = process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
const region = /^([a-z]{2}(?:-gov)?-[a-z]+-\d)$/.test(configuredRegion) ? configuredRegion : 'us-east-1';
const bedrock = new BedrockRuntimeClient({ region });
const lambda = new LambdaClient({ region });
const dryRun = process.argv.includes('--dry-run');

async function verifySource(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'user-agent': 'VIGIA-source-verifier/1.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Source verification failed (${response.status}): ${url}`);
  await response.body?.cancel();
}

async function embed(text: string): Promise<number[]> {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: 'amazon.titan-embed-text-v2:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: text.slice(0, 8000), dimensions: 1024, normalize: true }),
  }));
  return JSON.parse(new TextDecoder().decode(response.body)).embedding;
}

async function store(records: Array<SourceRecord & { embedding: number[] }>) {
  for (let index = 0; index < records.length; index += 4) {
    const batch = records.slice(index, index + 4);
    const result = await lambda.send(new InvokeCommand({
      FunctionName: 'vigia-retrieval-proxy',
      Payload: Buffer.from(JSON.stringify({
        body: JSON.stringify({
          action: 'store',
          chunks: batch.map((record) => ({
            chunkText: record.text,
            embedding: record.embedding,
            sourceType: record.sourceType,
            state: record.state,
            district: record.district,
            metadata: record.metadata,
          })),
        }),
      })),
    }));
    const payload = JSON.parse(new TextDecoder().decode(result.Payload));
    if (payload.statusCode !== 200) throw new Error(`pgvector store failed: ${payload.body ?? 'unknown error'}`);
    console.log(`Stored ${Math.min(index + batch.length, records.length)}/${records.length}`);
  }
}

async function main() {
  const registry = JSON.parse(readFileSync(resolve('data/v2/chennai-road-sources.json'), 'utf8')) as Registry;
  const sourceUrls = [...new Set(registry.records.map((record) => String(record.metadata.source_url)))];
  console.log(`Verifying ${sourceUrls.length} source URLs...`);
  await Promise.all(sourceUrls.map(verifySource));
  console.log(`Verified ${registry.records.length} curated records from ${sourceUrls.length} live sources.`);

  if (dryRun) return;

  const embedded = [];
  for (const record of registry.records) {
    embedded.push({
      ...record,
      metadata: {
        ...record.metadata,
        source_id: record.sourceId,
        ingestion_version: registry.version,
        retrieved_at: registry.retrievedAt,
      },
      embedding: await embed(record.text),
    });
    console.log(`Embedded ${embedded.length}/${registry.records.length}: ${record.sourceId}`);
  }
  await store(embedded);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
