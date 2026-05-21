'use server';

// Hybrid tender search — FTS5 (local SQLite) + pgvector (RDS) with Reciprocal Rank Fusion
// Replaces the mock-only FTS5 search with a dual-index approach

import { existsSync } from 'fs';
import { join } from 'path';

export interface TenderResult {
  roadNumber: string;
  projectName: string;
  concessionaire: string;
  mode: string;
  totalLengthKm: number | null;
  startDate: string | null;
  state: string;
  source: string;
  sourceUrl: string;
  budgetCrore: number | null;
  score: number;
}

const ROAD_ID_REGEX = /\b(NH[-\s]?\d+[A-Z]?|SH[-\s]?\d+|MDR[-\s]?\d+)\b/i;
const RRF_K = 60;

// Map ingested PDF S3 keys back to their original public URLs
const SOURCE_PDF_URLS: Record<string, string> = {
  'nhai-awarded-22-23': 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf',
  'nhai-bids': 'https://nhai.gov.in/nhai/sites/default/files/mix_file/Status_of_Projects_where_Bids.pdf',
  'nhai-awarded-23-24': 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_23_24.pdf',
  'morth-annual-report': 'https://morth.nic.in/sites/default/files/Annual_Report_2023_24_English.pdf',
  'morth-road-statistics': 'https://morth.nic.in/sites/default/files/Basic_Road_Statistics_of_India.pdf',
};

function resolveSourceUrl(pdfHash: string | null): string {
  if (!pdfHash) return 'https://nhai.gov.in';
  const prefix = pdfHash.split('/')[0];
  return SOURCE_PDF_URLS[prefix] ?? 'https://nhai.gov.in';
}

function resolveSourceLabel(pdfHash: string | null): string {
  if (!pdfHash) return 'NHAI Public Records';
  const prefix = pdfHash.split('/')[0];
  if (prefix.startsWith('nhai-awarded')) return 'NHAI Awarded Projects PDF';
  if (prefix.startsWith('nhai-bids')) return 'NHAI Projects Under Bidding PDF';
  if (prefix.startsWith('morth')) return 'MoRTH Annual Report PDF';
  return 'NHAI Public Records';
}

export async function searchTenderByRoadNumber(roadNumber: string): Promise<TenderResult[]> {
  const query = roadNumber;
  const hasRoadId = ROAD_ID_REGEX.test(query);

  let fts5Results: TenderResult[] = [];
  let vectorResults: TenderResult[] = [];

  // FTS5 first for road-ID queries, vector first for semantic
  if (hasRoadId) {
    fts5Results = await queryFts5(query);
    if (fts5Results.length < 5) {
      vectorResults = await queryPgvector(query, 5);
    }
  } else {
    vectorResults = await queryPgvector(query, 5);
    if (vectorResults.length < 5) {
      fts5Results = await queryFts5(query);
    }
  }

  const fused = reciprocalRankFusion(fts5Results, vectorResults);
  if (fused.length === 0) return getFallbackTenderData(roadNumber);
  return fused.slice(0, 10);
}

function reciprocalRankFusion(listA: TenderResult[], listB: TenderResult[]): TenderResult[] {
  const scoreMap = new Map<string, { result: TenderResult; score: number }>();

  listA.forEach((result, i) => {
    const key = `${result.roadNumber}|${result.projectName?.slice(0, 50)}`;
    const s = 1 / (RRF_K + i + 1);
    const existing = scoreMap.get(key);
    if (existing) existing.score += s;
    else scoreMap.set(key, { result, score: s });
  });

  listB.forEach((result, i) => {
    const key = `${result.roadNumber}|${result.projectName?.slice(0, 50)}`;
    const s = 1 / (RRF_K + i + 1);
    const existing = scoreMap.get(key);
    if (existing) existing.score += s;
    else scoreMap.set(key, { result, score: s });
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ result, score }) => ({ ...result, score }));
}

async function queryFts5(query: string): Promise<TenderResult[]> {
  try {
    const Database = (await import('better-sqlite3') as any).default ?? (await import('better-sqlite3'));

    const dbPath = join(process.cwd(), 'data', 'nhai_mock.db');
    if (!existsSync(dbPath)) return [];

    const db = new Database(dbPath, { readonly: true });
    const roadMatch = query.match(ROAD_ID_REGEX);
    const ftsQuery = roadMatch ? `"${roadMatch[1]}"` : query.split(/\s+/).join(' OR ');

    const rows = db.prepare(
      `SELECT content, section_title, page_number FROM nhai_sections WHERE nhai_sections MATCH ? ORDER BY rank LIMIT 10`
    ).all(ftsQuery) as { content: string; section_title: string; page_number: number }[];

    db.close();

    return rows.map((row, i) => ({
      roadNumber: roadMatch?.[1] ?? query,
      projectName: row.section_title || `Project on ${query}`,
      concessionaire: extractConcessionaire(row.content),
      mode: extractMode(row.content),
      totalLengthKm: extractLength(row.content),
      startDate: extractDate(row.content),
      state: extractState(row.content),
      budgetCrore: null,
      source: 'NHAI Awarded Projects PDF',
      sourceUrl: resolveSourceUrl('nhai-awarded-22-23'),
      score: 1 / (i + 1),
    }));
  } catch (err) {
    console.error('FTS5 query error:', err);
    return [];
  }
}

async function queryPgvector(query: string, limit: number = 5): Promise<TenderResult[]> {
  // Invoke the retrieval proxy Lambda directly (secure VPC bridge)
  try {
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const lambda = new LambdaClient({ region: 'us-east-1' });

    const res = await lambda.send(new InvokeCommand({
      FunctionName: 'vigia-retrieval-proxy',
      Payload: Buffer.from(JSON.stringify({ body: JSON.stringify({ query, limit }) })),
    }));

    const payload = JSON.parse(new TextDecoder().decode(res.Payload));
    if (payload.statusCode !== 200) return [];

    const { chunks } = JSON.parse(payload.body);
    if (!chunks?.length) return [];

    return chunks.map((r: any, i: number) => ({
      roadNumber: r.roadNumber ?? 'Unknown',
      projectName: r.chunkText?.slice(0, 120) ?? '',
      concessionaire: extractConcessionaire(r.chunkText ?? ''),
      mode: extractMode(r.chunkText ?? ''),
      totalLengthKm: extractLength(r.chunkText ?? ''),
      startDate: extractDate(r.chunkText ?? ''),
      state: extractState(r.chunkText ?? ''),
      budgetCrore: null,
      source: resolveSourceLabel(r.sourcePdfHash),
      sourceUrl: resolveSourceUrl(r.sourcePdfHash),
      score: r.similarity ?? 0,
    }));
  } catch (err) {
    console.error('pgvector proxy error:', err);
    return [];
  }
}

// --- Helpers ---

function extractConcessionaire(text: string): string {
  const match = text.match(/([A-Z][a-zA-Z\s]+(?:Pvt\.?\s*Ltd\.?|Limited|JV|LLP))/);
  return match ? match[1].trim() : 'Not available in public records';
}

function extractMode(text: string): string {
  if (/\bHAM\b/.test(text)) return 'HAM';
  if (/\bEPC\b/.test(text)) return 'EPC';
  if (/\bBOT\b/.test(text)) return 'BOT';
  if (/\bDBFOT\b/.test(text)) return 'DBFOT';
  return 'Unknown';
}

function extractLength(text: string): number | null {
  const match = text.match(/(\d+\.?\d*)\s*[Kk][Mm]/);
  return match ? parseFloat(match[1]) : null;
}

function extractDate(text: string): string | null {
  const match = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function extractState(text: string): string {
  const states = [
    'Kerala', 'Karnataka', 'Tamil Nadu', 'Maharashtra', 'Rajasthan',
    'Uttar Pradesh', 'Bihar', 'West Bengal', 'Gujarat', 'Haryana',
    'Punjab', 'Andhra Pradesh', 'Telangana', 'Odisha', 'Madhya Pradesh',
  ];
  for (const s of states) if (text.includes(s)) return s;
  return 'Unknown';
}

function getFallbackTenderData(roadNumber: string): TenderResult[] {
  return [{
    roadNumber,
    projectName: `${roadNumber} — no records found in indexed data`,
    concessionaire: 'Not available',
    mode: 'Unknown',
    totalLengthKm: null,
    startDate: null,
    state: 'Unknown',
    budgetCrore: null,
    source: 'NHAI Public Data (no match)',
    sourceUrl: 'https://nhai.gov.in',
    score: 0,
  }];
}
