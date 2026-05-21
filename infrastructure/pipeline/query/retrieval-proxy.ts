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
}

export async function handler(event: { body?: string }): Promise<{ statusCode: number; body: string }> {
  try {
    const { query, limit = 10 } = JSON.parse(event.body ?? '{}') as ProxyRequest;
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
                1 - (embedding <=> $1::vector) AS similarity
         FROM contract_embeddings
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [`[${embedding.join(',')}]`, limit]
      );

      const chunks: ChunkResult[] = result.rows.map(r => ({
        roadNumber: r.road_number,
        concessionaire: r.concessionaire,
        chunkText: r.chunk_text?.slice(0, 500),
        similarity: parseFloat(r.similarity),
        sourcePdfHash: r.source_pdf_hash,
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
