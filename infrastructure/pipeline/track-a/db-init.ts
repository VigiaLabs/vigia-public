/**
 * Lambda: db-init
 * One-time setup: enables pgvector extension and creates contract_embeddings table.
 * Invoke manually after RDS is provisioned.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

const sm = new SecretsManagerClient({});

export async function handler(): Promise<{ success: boolean; message: string }> {
  const secretArn = process.env.PG_SECRET_ARN;
  if (!secretArn) return { success: false, message: 'PG_SECRET_ARN not set' };

  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const { password } = JSON.parse(res.SecretString ?? '{}');

  const pool = new Pool({
    host: process.env.PG_HOST,
    port: 5432,
    database: process.env.PG_DATABASE ?? 'vigia',
    user: process.env.PG_USER ?? 'vigia_pipeline',
    password,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS contract_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        road_number TEXT,
        concessionaire TEXT,
        sanctioned_crore NUMERIC(12,2),
        expenditure_crore NUMERIC(12,2),
        award_date DATE,
        completion_date DATE,
        source_pdf_hash TEXT NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(1024) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_embed
      ON contract_embeddings USING hnsw (embedding vector_cosine_ops)
      WITH (m=16, ef_construction=64);
    `);
    return { success: true, message: 'pgvector extension enabled, contract_embeddings table created with HNSW index' };
  } finally {
    client.release();
    await pool.end();
  }
}
