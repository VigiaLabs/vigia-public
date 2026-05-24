/**
 * Unified semantic search across all data in pgvector.
 * Calls the retrieval proxy Lambda which embeds the query and searches.
 * Falls back to local FTS5 if Lambda is unreachable.
 */

export interface UnifiedResult {
  chunkText: string;
  similarity: number;
  sourceType: string;
  state: string | null;
  district: string | null;
  metadata: Record<string, unknown> | null;
  roadNumber: string | null;
  concessionaire: string | null;
  sourcePdfHash: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  nhai_contract: 'NHAI Awarded Projects PDF',
  pmgsy_road: 'PMGSY OMMAS Portal',
  pwd_contact: 'State PWD Official Directory',
  authority: 'Government Authority Matrix',
};

const TRUST_LEVELS: Record<string, 'legally-binding' | 'official-portal' | 'verified-spatial'> = {
  nhai_contract: 'legally-binding',
  pmgsy_road: 'official-portal',
  pwd_contact: 'official-portal',
  authority: 'official-portal',
};

export function getSourceLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? 'VIGIA Index';
}

export function getTrustLevel(sourceType: string): 'legally-binding' | 'official-portal' | 'verified-spatial' {
  return TRUST_LEVELS[sourceType] ?? 'official-portal';
}

export let lastSearchMode: 'pgvector' | 'fts5-fallback' | 'none' = 'none';

export async function searchUnified(query: string, limit: number = 5): Promise<UnifiedResult[]> {
  // Primary: pgvector semantic search (real similarity scores)
  const pgResults = await queryPgvectorUnified(query, limit);

  if (pgResults.length > 0) {
    lastSearchMode = 'pgvector';
    return pgResults;
  }

  // Fallback: local FTS5 keyword search (degraded mode)
  const ftsResults = await queryLocalFts5Unified(query, limit);
  lastSearchMode = ftsResults.length > 0 ? 'fts5-fallback' : 'none';
  return ftsResults;
}

async function queryPgvectorUnified(query: string, limit: number): Promise<UnifiedResult[]> {
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

    return chunks.map((r: any) => ({
      chunkText: r.chunkText ?? '',
      similarity: r.similarity ?? 0,
      sourceType: r.sourceType ?? 'nhai_contract',
      state: r.state ?? null,
      district: r.district ?? null,
      metadata: r.metadata ?? null,
      roadNumber: r.roadNumber ?? null,
      concessionaire: r.concessionaire ?? null,
      sourcePdfHash: r.sourcePdfHash ?? null,
    }));
  } catch {
    return [];
  }
}

async function queryLocalFts5Unified(query: string, limit: number): Promise<UnifiedResult[]> {
  try {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const Database = (await import('better-sqlite3') as any).default ?? (await import('better-sqlite3'));

    const dbPath = join(process.cwd(), 'data', 'nhai_mock.db');
    if (!existsSync(dbPath)) return [];

    const db = new Database(dbPath, { readonly: true });
    const results: UnifiedResult[] = [];
    const words = query.split(/\s+/).filter(w => w.length > 2);

    // Boost road numbers in FTS5 query by putting them first (FTS5 ranks by term proximity)
    const roadNumberMatch = query.match(/\b(NH[-\s]?\d+|SH[-\s]?\d+|MDR[-\s]?\d+)\b/i);
    let ftsQuery: string;
    if (roadNumberMatch) {
      const raw = roadNumberMatch[1];
      const numOnly = raw.replace(/[A-Za-z\-\s]/g, '');
      const prefix = raw.replace(/[\d\-\s]/g, '').toUpperCase();
      const otherWords = words.filter(w => !w.match(/^(NH|SH|MDR)[-\s]?\d+$/i) && w.length > 3);
      // Put road number components first for better ranking
      ftsQuery = [numOnly, prefix, ...otherWords.slice(0, 5)].join(' OR ');
    } else {
      ftsQuery = words.slice(0, 8).join(' OR ');
    }

    // Determine query type to prioritize the right table
    const isPmgsyQuery = /\b(pmgsy|rural|village|gram sadak|habitation)\b/i.test(query);
    const isPersonnelQuery = /\b(engineer|officer|contact|phone|who is|personnel)\b/i.test(query);

    // Search pmgsy_contracts (prioritize for rural queries)
    try {
      const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='pmgsy_contracts'`).get();
      if (exists) {
        const rows = db.prepare(
          `SELECT road_name, state, district, contractor, cost_lakhs, length_km, status, scheme, source_url FROM pmgsy_contracts WHERE pmgsy_contracts MATCH ? ORDER BY rank LIMIT ?`
        ).all(ftsQuery, isPmgsyQuery ? limit : 2) as any[];
        for (const r of rows) {
          results.push({
            chunkText: `${r.road_name}. District: ${r.district}, ${r.state}. Cost: ₹${r.cost_lakhs ? (r.cost_lakhs/100).toFixed(1) : '?'} Cr. Length: ${r.length_km ?? 'N/A'} km. Contractor: ${r.contractor}. Status: ${r.status}. Scheme: ${r.scheme}.`,
            similarity: isPmgsyQuery ? 0.85 : 0.6,
            sourceType: 'pmgsy_road',
            state: r.state, district: r.district,
            metadata: { source_url: r.source_url, cost_lakhs: r.cost_lakhs },
            roadNumber: null, concessionaire: r.contractor, sourcePdfHash: null,
          });
        }
      }
    } catch {}

    // Search pwd_contacts (prioritize for personnel queries)
    // GEOGRAPHIC ENFORCEMENT: Require state/location match to prevent random results
    try {
      const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='pwd_contacts'`).get();
      if (exists) {
        const statePattern = /\b(telangana|maharashtra|kerala|tamil nadu|karnataka|andhra pradesh|rajasthan|gujarat|madhya pradesh|uttar pradesh|bihar|odisha|punjab|haryana|west bengal|assam|jharkhand|chhattisgarh|goa|himachal|uttarakhand|delhi)\b/i;
        const stateMatch = query.match(statePattern);

        if (isPersonnelQuery && !stateMatch) {
          // No geographic context — return empty to prevent hallucination
          // (admin.ts GPS gate should have caught this, but defense-in-depth)
        } else {
          const rows = stateMatch
            ? db.prepare(
                `SELECT name, designation, division, state, phone, email, office_address, source_url FROM pwd_contacts WHERE pwd_contacts MATCH ? AND state LIKE ? ORDER BY rank LIMIT ?`
              ).all(ftsQuery, `%${stateMatch[1]}%`, isPersonnelQuery ? limit : 2) as any[]
            : db.prepare(
                `SELECT name, designation, division, state, phone, email, office_address, source_url FROM pwd_contacts WHERE pwd_contacts MATCH ? ORDER BY rank LIMIT ?`
              ).all(ftsQuery, isPersonnelQuery ? limit : 2) as any[];
          for (const r of rows) {
            results.push({
              chunkText: `${r.designation}, ${r.division}, ${r.state}. Phone: ${r.phone || 'N/A'}. Email: ${r.email || 'N/A'}. Office: ${r.office_address || 'N/A'}.`,
              similarity: isPersonnelQuery ? 0.85 : 0.6,
              sourceType: 'pwd_contact',
              state: r.state, district: r.division,
              metadata: { source_url: r.source_url, phone: r.phone, email: r.email },
              roadNumber: null, concessionaire: null, sourcePdfHash: null,
            });
          }
        }
      }
    } catch {}

    // Search nhai_sections
    try {
      const rows = db.prepare(
        `SELECT content, section_title FROM nhai_sections WHERE nhai_sections MATCH ? ORDER BY rank LIMIT ?`
      ).all(ftsQuery, (!isPmgsyQuery && !isPersonnelQuery) ? limit : 2) as any[];
      for (const r of rows) {
        results.push({
          chunkText: r.content?.slice(0, 500) ?? '',
          similarity: (!isPmgsyQuery && !isPersonnelQuery) ? 0.75 : 0.5,
          sourceType: 'nhai_contract',
          state: null, district: null,
          metadata: { source_url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf' },
          roadNumber: null, concessionaire: null, sourcePdfHash: 'nhai-awarded-22-23',
        });
      }
    } catch {}

    db.close();

    // Sort by similarity (prioritized tables get higher scores)
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  } catch {
    return [];
  }
}
