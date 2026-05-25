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
  'nhai-awarded-24-25': 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_24_25.pdf',
  'nhai-financial-progress': 'https://nhai.gov.in/nhai/sites/default/files/mix_file/Project_Financial_Progress.pdf',
  'nhai-om-contracts': 'https://nhai.gov.in/nhai/sites/default/files/mix_file/OM_Awarded_Contracts.pdf',
  'nhai-periodic-renewal': 'https://nhai.gov.in/nhai/sites/default/files/mix_file/Periodic_Renewal_Sanctions.pdf',
  'nhai-tot-status': 'https://nhai.gov.in/nhai/sites/default/files/mix_file/TOT_Bundle_Status.pdf',
  'morth-annual-report': 'https://morth.nic.in/sites/default/files/Annual_Report_2023_24_English.pdf',
  'morth-annual-report-24-25': 'https://morth.nic.in/sites/default/files/Annual_Report_2024_25_English.pdf',
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
  if (prefix.startsWith('nhai-financial')) return 'NHAI Financial Progress Report';
  if (prefix.startsWith('nhai-om')) return 'NHAI O&M Contracts PDF';
  if (prefix.startsWith('nhai-periodic')) return 'NHAI Periodic Renewal Sanctions';
  if (prefix.startsWith('nhai-tot')) return 'NHAI TOT Bundle Status';
  if (prefix.startsWith('morth')) return 'MoRTH Annual Report PDF';
  return 'NHAI Public Records';
}

export async function searchTenderByRoadNumber(roadNumber: string): Promise<TenderResult[]> {
  const query = roadNumber;
  const hasRoadId = ROAD_ID_REGEX.test(query);

  let fts5Results: TenderResult[] = [];
  let vectorResults: TenderResult[] = [];

  // Also query PMGSY rural roads if relevant keywords detected
  if (PMGSY_TRIGGER.test(query)) {
    const pmgsyResults = await queryPmgsyContracts(query);
    fts5Results = [...fts5Results, ...pmgsyResults];
  }

  // FTS5 first for road-ID queries, vector first for semantic
  if (hasRoadId) {
    fts5Results = [...fts5Results, ...(await queryFts5(query))];
    if (fts5Results.length < 5) {
      vectorResults = await queryPgvector(query, 5);
    }
  } else {
    vectorResults = await queryPgvector(query, 5);
    if (vectorResults.length < 5) {
      fts5Results = [...fts5Results, ...(await queryFts5(query))];
    }
  }

  const fused = reciprocalRankFusion(fts5Results, vectorResults);
  if (fused.length === 0) return getFallbackTenderData(roadNumber);

  // Stage 2: Cross-encoder reranking (if available)
  if (fused.length > 5 && process.env.COHERE_API_KEY) {
    const { rerankChunks } = await import('./reranker');
    const docs = fused.slice(0, 20).map(r => `${r.roadNumber} ${r.projectName} ${r.concessionaire} ${r.mode} ${r.state}`);
    const reranked = await rerankChunks(query, docs, 5);
    return reranked.map(r => ({ ...fused[r.index], score: r.relevanceScore }));
  }

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
      budgetCrore: extractBudget(row.content),
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
  // Normalize newlines for matching
  const normalized = text.replace(/\n/g, ' ');
  const match = normalized.match(/([A-Z][a-zA-Z\s]+(?:Pvt\.?\s*Ltd\.?|Limited|JV|LLP|Corp|Nigam))/);
  if (!match) return 'Not available in public records';
  // Clean up: remove leading mode keywords that get captured
  return match[1].replace(/^(?:G\s+)?(?:EPC|HAM|BOT|DBFOT|Item Rate)\s+/i, '').trim();
}

function extractMode(text: string): string {
  if (/\bHAM\b/.test(text)) return 'HAM';
  if (/\bEPC\b/.test(text)) return 'EPC';
  if (/\bBOT\b/.test(text)) return 'BOT';
  if (/\bDBFOT\b/.test(text)) return 'DBFOT';
  if (/\bItem Rate\b/i.test(text)) return 'Item Rate';
  return 'Unknown';
}

function extractLength(text: string): number | null {
  // Match patterns like "39.41Telangana" (length immediately before state) or "39.41 km"
  const normalized = text.replace(/\n/g, ' ');
  // Try explicit km pattern first
  const kmMatch = normalized.match(/(\d+\.?\d*)\s*[Kk][Mm]\b/);
  if (kmMatch && parseFloat(kmMatch[1]) < 500) return parseFloat(kmMatch[1]);
  // Try the NHAI table format: length before state name
  const tableMatch = normalized.match(/(\d{1,3}\.\d{1,2})\s*(?:Telangana|Maharashtra|Karnataka|Kerala|Tamil Nadu|Andhra Pradesh|Rajasthan|Uttar Pradesh|Bihar|Gujarat|Haryana|Punjab|Madhya Pradesh|Odisha|West Bengal)/);
  if (tableMatch) return parseFloat(tableMatch[1]);
  return null;
}

function extractDate(text: string): string | null {
  const match = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function extractBudget(text: string): number | null {
  // Match "847.87  31/03/2023" pattern (budget before date in NHAI tables)
  const match = text.match(/(\d{2,5}\.\d{1,2})\s+\d{2}\/\d{2}\/\d{4}/);
  return match ? parseFloat(match[1]) : null;
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

// ─── PMGSY Rural Roads Query ────────────────────────────────────────

const PMGSY_TRIGGER = /\b(village|pmgsy|rural|gram sadak|habitation|RCPLWEA|Khammam|Warangal|Pune|Nagpur)\b/i;

export async function queryPmgsyContracts(query: string): Promise<TenderResult[]> {
  try {
    const Database = (await import('better-sqlite3') as any).default ?? (await import('better-sqlite3'));
    const dbPath = join(process.cwd(), 'data', 'nhai_mock.db');
    if (!existsSync(dbPath)) return [];

    const db = new Database(dbPath, { readonly: true });

    const exists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='pmgsy_contracts'`
    ).get();
    if (!exists) { db.close(); return []; }

    const ftsQuery = query.split(/\s+/).filter(w => w.length > 2).join(' OR ');
    const rows = db.prepare(
      `SELECT road_name, state, district, contractor, cost_lakhs, length_km, status, scheme, source_url
       FROM pmgsy_contracts WHERE pmgsy_contracts MATCH ? ORDER BY rank LIMIT 5`
    ).all(ftsQuery) as any[];

    db.close();

    return rows.map((r, i) => ({
      roadNumber: `PMGSY-${r.district}`,
      projectName: r.road_name,
      concessionaire: r.contractor ?? 'SRRDA',
      mode: r.scheme ?? 'PMGSY',
      totalLengthKm: r.length_km ? parseFloat(r.length_km) : null,
      startDate: null,
      state: r.state,
      budgetCrore: r.cost_lakhs ? parseFloat(r.cost_lakhs) / 100 : null,
      source: 'PMGSY OMMAS Portal',
      sourceUrl: r.source_url || 'https://omms.nic.in',
      score: 1 / (i + 1),
    }));
  } catch {
    return [];
  }
}
