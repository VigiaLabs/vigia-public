import path from 'node:path';
import Database from 'better-sqlite3';
import type { NormalizedEvidence, Payload } from '../state';

const DB_PATH = path.join(process.cwd(), 'data', 'nhai_mock.db');

interface FTSRow {
  content: string;
  section_title: string;
  page_number: number;
}

function getDb(): Database.Database {
  return new Database(DB_PATH, { readonly: true, fileMustExist: true });
}

export async function runAdminAgent(
  payload: Payload,
  retryQuery?: string
): Promise<NormalizedEvidence> {
  const start = Date.now();

  const searchTerm = retryQuery
    ? `${payload.text ?? ''} ${retryQuery}`.trim()
    : (payload.text ?? '').trim();

  if (!searchTerm) {
    return {
      agentId: 'admin',
      status: 'skipped',
      confidence: 0,
      findings: [],
      citations: [],
      latencyMs: Date.now() - start,
    };
  }

  try {
    const db = getDb();

    // FTS5 query — tokenize search term for MATCH syntax
    const matchQuery = searchTerm
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `"${w}"`)
      .join(' OR ');

    const rows = db
      .prepare(
        `SELECT content, section_title, page_number
         FROM nhai_sections
         WHERE nhai_sections MATCH ?
         ORDER BY rank
         LIMIT 5`
      )
      .all(matchQuery) as FTSRow[];

    db.close();

    if (!rows.length) {
      return {
        agentId: 'admin',
        status: 'completed',
        confidence: 0.3,
        findings: ['No matching contract sections found for query.'],
        citations: [],
        latencyMs: Date.now() - start,
      };
    }

    const findings = rows.map(
      (r) => `[p.${r.page_number}] ${r.section_title}: ${r.content.slice(0, 200)}`
    );

    const citations = rows.map((r, i) => ({
      sourceId: `nhai-p${r.page_number}-${i}`,
      label: r.section_title,
      trustLevel: 'legally-binding' as const,
    }));

    // Heuristic: confidence based on number of results
    const confidence = Math.min(0.5 + rows.length * 0.1, 1);

    // Check if findings suggest compliance
    const hasComplianceLanguage = findings.some((f) =>
      /compliant|completed|satisfactor/i.test(f)
    );

    return {
      agentId: 'admin',
      status: 'completed',
      confidence,
      severity: hasComplianceLanguage ? 'none' : 'moderate',
      findings,
      citations,
      metadata: { matchQuery, resultCount: rows.length, retryQuery },
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const reason =
      err instanceof Error ? err.message : 'Unknown SQLite error';
    return {
      agentId: 'admin',
      status: 'error',
      confidence: 0,
      findings: [],
      citations: [],
      errorReason: reason,
      latencyMs: Date.now() - start,
    };
  }
}
