/**
 * Lambda: pgvector-retrieval-proxy
 * Secure bridge into the VPC — accepts a search query, generates embedding,
 * queries pgvector, returns matching chunks with citations.
 *
 * Exposed via Function URL (no API Gateway needed).
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Pool } from 'pg';

const sm = new SecretsManagerClient({});
const bedrock = new BedrockRuntimeClient({});

let cachedPool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (cachedPool) return cachedPool;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.PG_SECRET_ARN }));
  const { password } = JSON.parse(res.SecretString ?? '{}');
  cachedPool = new Pool({
    host: process.env.PG_HOST,
    port: 5432,
    database: process.env.PG_DATABASE ?? 'vigia',
    user: process.env.PG_USER ?? 'vigia_pipeline',
    password,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  return cachedPool;
}

interface ProxyRequest {
  query: string;
  limit?: number;
}

interface ChunkResult {
  roadNumber: string | null;
  concessionaire: string | null;
  chunkText: string;
  similarity: number;
  sourcePdfHash: string;
  sourceType: string;
  state: string | null;
  district: string | null;
  metadata: Record<string, unknown> | null;
}

export async function handler(event: { body?: string }): Promise<{ statusCode: number; body: string }> {
  try {
    const parsed = JSON.parse(event.body ?? '{}') as any;

    // Route by action
    if (parsed.action === 'init-unified') {
      return handleInitUnified();
    }
    if (parsed.action === 'store') {
      return handleStore(parsed.chunks);
    }

    // Default: search
    const { query, limit = 10 } = parsed as ProxyRequest;
    if (!query) return { statusCode: 400, body: JSON.stringify({ error: 'query is required' }) };

    // Generate embedding via Bedrock Titan
    const embedRes = await bedrock.send(new InvokeModelCommand({
      modelId: 'amazon.titan-embed-text-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({ inputText: query.slice(0, 8000), dimensions: 1024, normalize: true }),
    }));
    const { embedding } = JSON.parse(new TextDecoder().decode(embedRes.body));

    // Query pgvector
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT road_number, concessionaire, chunk_text, source_pdf_hash,
                COALESCE(source_type, 'nhai_contract') as source_type,
                state, district, metadata,
                road_type_classification, sanctioned_amount_crore,
                expenditure_amount_crore, last_maintenance_date, condition_status,
                1 - (embedding <=> $1::vector) AS similarity
         FROM contract_embeddings
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [`[${embedding.join(',')}]`, limit]
      );

      const chunks: ChunkResult[] = result.rows.map(r => ({
        roadNumber: r.road_number,
        concessionaire: r.concessionaire,
        chunkText: r.chunk_text?.slice(0, 2000),
        similarity: parseFloat(r.similarity),
        sourcePdfHash: r.source_pdf_hash,
        sourceType: r.source_type ?? 'nhai_contract',
        state: r.state ?? null,
        district: r.district ?? null,
        metadata: {
          ...(r.metadata ?? {}),
          road_type: r.road_type_classification ?? null,
          sanctioned_cost_crore: r.sanctioned_amount_crore ? parseFloat(r.sanctioned_amount_crore) : null,
          expenditure_cost_crore: r.expenditure_amount_crore ? parseFloat(r.expenditure_amount_crore) : null,
          last_maintenance_date: r.last_maintenance_date ?? null,
          condition_status: r.condition_status ?? null,
        },
      }));

      return { statusCode: 200, body: JSON.stringify({ chunks, count: chunks.length }) };
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Proxy error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }) };
  }
}

// ─── Write Handlers (for unified embedder) ──────────────────────────

async function handleInitUnified(): Promise<{ statusCode: number; body: string }> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'nhai_contract'`);
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS state VARCHAR(50)`);
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS district VARCHAR(50)`);
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`);
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS road_type_classification VARCHAR(10)`);
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS sanctioned_amount_crore DECIMAL`);
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS expenditure_amount_crore DECIMAL`);
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS last_maintenance_date DATE`);
    await client.query(`ALTER TABLE contract_embeddings ADD COLUMN IF NOT EXISTS condition_status VARCHAR(50)`);
    await client.query(`DELETE FROM contract_embeddings WHERE source_type != 'nhai_contract'`);
    return { statusCode: 200, body: JSON.stringify({ message: 'Schema initialized, non-NHAI entries cleared' }) };
  } finally {
    client.release();
  }
}

async function handleStore(chunks: any[]): Promise<{ statusCode: number; body: string }> {
  if (!chunks?.length) return { statusCode: 400, body: JSON.stringify({ error: 'chunks array required' }) };

  const pool = await getPool();
  const client = await pool.connect();
  try {
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO contract_embeddings (chunk_text, embedding, source_type, state, district, road_number, concessionaire, source_pdf_hash, metadata)
         VALUES ($1, $2::vector, $3, $4, $5, NULL, NULL, $6, $7)`,
        [
          chunk.chunkText,
          `[${chunk.embedding.join(',')}]`,
          chunk.sourceType,
          chunk.state ?? null,
          chunk.district ?? null,
          chunk.sourceType,
          JSON.stringify(chunk.metadata ?? {}),
        ]
      );
    }
    return { statusCode: 200, body: JSON.stringify({ stored: chunks.length }) };
  } finally {
    client.release();
  }
}
