/**
 * scripts/embed-unified.ts
 * 
 * Embeds PWD contacts, PMGSY roads, and authority matrix into pgvector
 * alongside existing NHAI contract chunks. Uses Bedrock Titan Embed v2.
 *
 * Run: npx tsx scripts/embed-unified.ts
 * Requires: AWS credentials + PG_HOST configured in .env.local
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { readFileSync } from 'fs';
import { join } from 'path';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

interface Chunk {
  text: string;
  sourceType: string;
  state: string | null;
  district: string | null;
  metadata: Record<string, unknown>;
}

// ─── Format PWD Contacts into Natural Language Chunks ────────────────

function loadPwdChunks(): Chunk[] {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(join(process.cwd(), 'data', 'nhai_mock.db'), { readonly: true });
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='pwd_contacts'`).get();
    if (!exists) { db.close(); return []; }

    const rows = db.prepare(`SELECT name, designation, division, state, phone, email, office_address, source_url FROM pwd_contacts`).all() as any[];
    db.close();

    return rows.map(r => ({
      text: [
        `${r.designation}, ${r.division}, ${r.state}.`,
        r.phone ? `Phone: ${r.phone}.` : null,
        r.email ? `Email: ${r.email}.` : null,
        r.office_address ? `Office: ${r.office_address}.` : null,
        `Jurisdiction: State highways and district roads in ${r.division.replace('R&B Division, ', '').replace('P.W. ', '').replace('Division, ', '')} district, ${r.state}.`,
        `Source: ${r.state} R&B Official Directory (${r.source_url}).`,
      ].filter(Boolean).join(' '),
      sourceType: 'pwd_contact',
      state: r.state,
      district: r.division,
      metadata: { phone: r.phone, email: r.email, source_url: r.source_url, name: r.name },
    }));
  } catch { return []; }
}

// ─── Format PMGSY Roads into Natural Language Chunks ─────────────────

function loadPmgsyChunks(): Chunk[] {
  try {
    const lines = readFileSync(join(process.cwd(), 'data', 'pmgsy_roads.jsonl'), 'utf-8').split('\n').filter(Boolean);
    return lines.map(line => {
      const r = JSON.parse(line);
      return {
        text: [
          `${r.road_name}.`,
          `District: ${r.district}, ${r.state}.`,
          r.cost_lakhs ? `Sanctioned cost: ₹${(r.cost_lakhs / 100).toFixed(1)} Crore.` : null,
          r.length_km ? `Road length: ${r.length_km} km.` : null,
          `Contractor: ${r.contractor}.`,
          `Status: ${r.status}. Scheme: ${r.scheme}.`,
          `This is a rural road connectivity project under the Pradhan Mantri Gram Sadak Yojana in ${r.district} district, ${r.state}.`,
          `Source: PMGSY OMMAS Portal (${r.source_url}).`,
        ].filter(Boolean).join(' '),
        sourceType: 'pmgsy_road',
        state: r.state,
        district: r.district,
        metadata: { cost_lakhs: r.cost_lakhs, length_km: r.length_km, source_url: r.source_url, status: r.status },
      };
    });
  } catch { return []; }
}

// ─── Format Authority Matrix into Natural Language Chunks ────────────

function loadAuthorityChunks(): Chunk[] {
  try {
    const data = JSON.parse(readFileSync(join(process.cwd(), 'data', 'authority-matrix.json'), 'utf-8'));
    const chunks: Chunk[] = [];
    const authorities = data.authorities?.IN;
    if (!authorities) return [];

    for (const [roadType, config] of Object.entries(authorities) as any[]) {
      if (roadType === 'SH') {
        // Handle SH with state overrides
        const defaultConfig = config.default;
        if (defaultConfig) {
          chunks.push(formatAuthorityChunk(roadType, 'default', defaultConfig));
        }
        for (const [stateCode, stateConfig] of Object.entries(config) as any[]) {
          if (stateCode === 'default') continue;
          chunks.push(formatAuthorityChunk(roadType, stateCode, stateConfig));
        }
      } else {
        chunks.push(formatAuthorityChunk(roadType, null, config));
      }
    }
    return chunks;
  } catch { return []; }
}

function formatAuthorityChunk(roadType: string, stateCode: string | null, config: any): Chunk {
  const complaint = config.complaint;
  const rti = config.rti;
  const stateLabel = stateCode && stateCode !== 'default' ? ` in ${stateCode}` : '';
  const roadLabel = roadType === 'NH' ? 'National Highway' : roadType === 'SH' ? 'State Highway' : roadType === 'MDR' ? 'Major District Road' : 'PMGSY rural road';

  const parts = [
    `For ${roadLabel} (${roadType}) roads${stateLabel}:`,
  ];

  if (complaint) {
    parts.push(`To file a complaint, contact: ${complaint.primary}. Portal: ${complaint.portal}. Phone: ${complaint.phone}. Escalation: ${complaint.escalation}. Legal basis: ${complaint.legalBasis}.`);
  }
  if (rti) {
    parts.push(`For RTI requests: ${rti.officer} (${rti.designation}). Filing URL: ${rti.filingUrl}. Fee: ${rti.fee}. Response within ${rti.responseDays} days. Legal basis: ${rti.legalBasis}.`);
  }

  return {
    text: parts.join(' '),
    sourceType: 'authority',
    state: stateCode !== 'default' ? stateCode : null,
    district: null,
    metadata: {
      road_type: roadType,
      portal: complaint?.portal,
      phone: complaint?.phone,
      source_url: rti?.filingUrl ?? complaint?.portal,
    },
  };
}

// ─── Bedrock Embedding ───────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
  const truncated = text.slice(0, 8000);
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: 'amazon.titan-embed-text-v2:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: truncated, dimensions: 1024, normalize: true }),
  }));
  const body = JSON.parse(new TextDecoder().decode(res.body));
  return body.embedding;
}

// ─── pgvector Upsert via Lambda ───────────────────────────────────────

async function storeInPgvector(chunks: Array<Chunk & { embedding: number[] }>): Promise<void> {
  // Use the retrieval proxy Lambda to write (it has VPC access to pgvector)
  const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
  const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

  // First, ensure schema is updated (add columns if missing)
  const initPayload = {
    body: JSON.stringify({
      action: 'init-unified',
    }),
  };

  try {
    await lambda.send(new InvokeCommand({
      FunctionName: 'vigia-retrieval-proxy',
      Payload: Buffer.from(JSON.stringify(initPayload)),
    }));
  } catch (e) {
    console.log('  Schema init skipped (may already exist)');
  }

  // Write chunks in batches of 5
  let stored = 0;
  for (let i = 0; i < chunks.length; i += 5) {
    const batch = chunks.slice(i, i + 5);
    const payload = {
      body: JSON.stringify({
        action: 'store',
        chunks: batch.map(c => ({
          chunkText: c.text,
          embedding: c.embedding,
          sourceType: c.sourceType,
          state: c.state,
          district: c.district,
          metadata: c.metadata,
        })),
      }),
    };

    const res = await lambda.send(new InvokeCommand({
      FunctionName: 'vigia-retrieval-proxy',
      Payload: Buffer.from(JSON.stringify(payload)),
    }));

    const result = JSON.parse(new TextDecoder().decode(res.Payload));
    if (result.statusCode === 200) {
      stored += batch.length;
      process.stdout.write(`  Stored ${stored}/${chunks.length}\r`);
    } else {
      console.error(`  Batch failed:`, JSON.parse(result.body ?? '{}'));
    }
  }

  console.log(`\n✓ Stored ${stored} embeddings in pgvector via Lambda`);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('VIGIA Unified Embedder');
  console.log('='.repeat(50));

  // Load all real data sources
  const pwdChunks = loadPwdChunks();
  console.log(`PWD contacts: ${pwdChunks.length} chunks`);

  const pmgsyChunks = loadPmgsyChunks();
  console.log(`PMGSY roads: ${pmgsyChunks.length} chunks`);

  const authorityChunks = loadAuthorityChunks();
  console.log(`Authority matrix: ${authorityChunks.length} chunks`);

  const allChunks = [...pwdChunks, ...pmgsyChunks, ...authorityChunks];
  console.log(`\nTotal: ${allChunks.length} chunks to embed`);

  if (allChunks.length === 0) {
    console.error('No data to embed. Run seed scripts first.');
    process.exit(1);
  }

  // Embed in batches of 5
  console.log('\nEmbedding via Bedrock Titan Embed v2...');
  const embedded: Array<Chunk & { embedding: number[] }> = [];

  for (let i = 0; i < allChunks.length; i += 5) {
    const batch = allChunks.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (chunk) => ({
        ...chunk,
        embedding: await embedText(chunk.text),
      }))
    );
    embedded.push(...results);
    process.stdout.write(`  ${embedded.length}/${allChunks.length}\r`);
  }

  console.log(`\n✓ Embedded ${embedded.length} chunks`);

  // Store in pgvector
  await storeInPgvector(embedded);
  console.log('\nDone.');
}

main().catch(console.error);
