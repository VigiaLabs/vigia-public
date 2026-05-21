/**
 * Hybrid Query Router — FTS5 + pgvector with Reciprocal Rank Fusion (RRF).
 * Determines query strategy based on content, merges results from both indexes.
 *
 * Used by the Admin Agent to replace the current mock-only tender-search.
 */

import type { NormalizedProjectRecord } from '../shared/types';
import { config } from '../shared/config';

export interface QueryResult {
  roadNumber: string;
  projectName: string;
  concessionaire: string;
  contractMode: string;
  state: string;
  sanctionedAmountCrore: number | null;
  completionDate: string | null;
  score: number;
  source: 'fts5' | 'pgvector' | 'fused';
  sourceUrl: string;
}

interface RankedResult {
  result: QueryResult;
  rank: number;
}

const ROAD_ID_REGEX = /\b(NH[-\s]?\d+[A-Z]?|SH[-\s]?\d+|MDR[-\s]?\d+)\b/i;
const RRF_K = 60; // RRF constant — standard value from literature

/**
 * Main entry point: routes query to appropriate index(es) and fuses results.
 */
export async function hybridQuery(
  query: string,
  topK: number = 10
): Promise<QueryResult[]> {
  const hasRoadId = ROAD_ID_REGEX.test(query);

  let fts5Results: QueryResult[] = [];
  let vectorResults: QueryResult[] = [];

  if (hasRoadId) {
    // Road identifier present → FTS5 primary, vector secondary
    fts5Results = await queryFts5(query);
    if (fts5Results.length < topK) {
      vectorResults = await queryPgvector(query, topK - fts5Results.length);
    }
  } else {
    // Purely semantic query → vector primary, FTS5 fallback
    vectorResults = await queryPgvector(query, topK);
    if (vectorResults.length < topK) {
      fts5Results = await queryFts5(query);
    }
  }

  // Reciprocal Rank Fusion
  const fused = reciprocalRankFusion(fts5Results, vectorResults);
  return fused.slice(0, topK);
}

/**
 * Reciprocal Rank Fusion (RRF) — merges two ranked lists.
 * Score = Σ 1/(k + rank_i) for each list where the document appears.
 */
function reciprocalRankFusion(
  listA: QueryResult[],
  listB: QueryResult[]
): QueryResult[] {
  const scoreMap = new Map<string, { result: QueryResult; score: number }>();

  // Score list A
  listA.forEach((result, index) => {
    const key = `${result.roadNumber}|${result.sourceUrl}`;
    const rrfScore = 1 / (RRF_K + index + 1);
    const existing = scoreMap.get(key);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(key, { result: { ...result, source: 'fused' }, score: rrfScore });
    }
  });

  // Score list B
  listB.forEach((result, index) => {
    const key = `${result.roadNumber}|${result.sourceUrl}`;
    const rrfScore = 1 / (RRF_K + index + 1);
    const existing = scoreMap.get(key);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(key, { result: { ...result, source: 'fused' }, score: rrfScore });
    }
  });

  // Sort by fused score descending
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ result, score }) => ({ ...result, score }));
}

/** Query SQLite FTS5 index for exact road identifier matches */
async function queryFts5(query: string): Promise<QueryResult[]> {
  try {
    const Database = (await import('better-sqlite3')).default;
    const path = (await import('path')).default;

    // Use production DB if available, fall back to mock
    const dbPath = path.join(process.cwd(), 'data', 'nhai_production.db');
    const fallbackPath = path.join(process.cwd(), 'data', 'nhai_mock.db');

    const { existsSync } = await import('fs');
    const actualPath = existsSync(dbPath) ? dbPath : fallbackPath;
    const db = new Database(actualPath, { readonly: true });

    // Extract road number for targeted FTS5 MATCH
    const roadMatch = query.match(ROAD_ID_REGEX);
    const ftsQuery = roadMatch ? `"${roadMatch[1]}"` : query.split(/\s+/).join(' OR ');

    // Try the production schema first (has project_metadata table)
    let rows: QueryResult[];
    try {
      const results = db.prepare(`
        SELECT p.road_number, p.project_name, p.concessionaire, p.contract_mode, p.state,
               m.sanctioned_amount_crore, m.completion_date, m.source_url,
               rank
        FROM projects p
        LEFT JOIN project_metadata m ON p.road_number = m.road_number
        WHERE projects MATCH ?
        ORDER BY rank
        LIMIT 10
      `).all(ftsQuery) as any[];

      rows = results.map((r, i) => ({
        roadNumber: r.road_number,
        projectName: r.project_name,
        concessionaire: r.concessionaire,
        contractMode: r.contract_mode,
        state: r.state,
        sanctionedAmountCrore: r.sanctioned_amount_crore ?? null,
        completionDate: r.completion_date ?? null,
        score: 1 / (i + 1),
        source: 'fts5' as const,
        sourceUrl: r.source_url ?? 'https://nhai.gov.in',
      }));
    } catch {
      // Fall back to legacy schema (nhai_sections)
      const results = db.prepare(`
        SELECT content, section_title, page_number
        FROM nhai_sections
        WHERE nhai_sections MATCH ?
        LIMIT 10
      `).all(ftsQuery) as any[];

      rows = results.map((r, i) => ({
        roadNumber: roadMatch?.[1] ?? 'Unknown',
        projectName: r.section_title,
        concessionaire: extractField(r.content, /([A-Z][a-zA-Z\s]+(?:Ltd|JV|LLP))/),
        contractMode: extractField(r.content, /\b(HAM|EPC|BOT|DBFOT)\b/) ?? 'Unknown',
        state: 'Unknown',
        sanctionedAmountCrore: null,
        completionDate: null,
        score: 1 / (i + 1),
        source: 'fts5' as const,
        sourceUrl: 'https://nhai.gov.in',
      }));
    }

    db.close();
    return rows;
  } catch (err) {
    console.error('FTS5 query failed:', err);
    return [];
  }
}

/** Query pgvector for semantic similarity search */
async function queryPgvector(query: string, limit: number = 10): Promise<QueryResult[]> {
  if (!config.pgHost) {
    // pgvector not configured — return empty (graceful degradation)
    return [];
  }

  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const bedrock = new BedrockRuntimeClient({});

    // Generate query embedding
    const embedRes = await bedrock.send(new InvokeModelCommand({
      modelId: config.embedModel,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: query.slice(0, 8000),
        dimensions: config.embedDimensions,
        normalize: true,
      }),
    }));

    const embedBody = JSON.parse(new TextDecoder().decode(embedRes.body));
    const queryEmbedding = embedBody.embedding as number[];

    // Query pgvector
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: config.pgHost,
      port: config.pgPort,
      database: config.pgDatabase,
      user: config.pgUser,
      ssl: { rejectUnauthorized: false },
    });

    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT road_number, concessionaire, chunk_text, source_pdf_hash,
                1 - (embedding <=> $1::vector) AS similarity
         FROM contract_embeddings
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [`[${queryEmbedding.join(',')}]`, limit]
      );

      return result.rows.map((r, i) => ({
        roadNumber: r.road_number ?? 'Unknown',
        projectName: r.chunk_text?.slice(0, 100) ?? '',
        concessionaire: r.concessionaire ?? 'Unknown',
        contractMode: 'Unknown',
        state: 'Unknown',
        sanctionedAmountCrore: null,
        completionDate: null,
        score: r.similarity,
        source: 'pgvector' as const,
        sourceUrl: r.source_pdf_hash ?? '',
      }));
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err) {
    console.error('pgvector query failed:', err);
    return [];
  }
}

function extractField(text: string, regex: RegExp): string {
  const match = text.match(regex);
  return match ? match[1].trim() : 'Unknown';
}
