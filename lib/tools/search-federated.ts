/**
 * Federated search tools — source-specific pgvector queries.
 * Each tool filters by sourceType at the DB level for targeted retrieval.
 */

import type { UnifiedResult } from './search-unified';
import { extractIndiaGeo, type IndiaGeo } from './geo-resolve';

async function queryPgvectorFiltered(
  query: string,
  limit: number,
  sourceType: string | null
): Promise<UnifiedResult[]> {
  try {
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const lambda = new LambdaClient({ region: 'us-east-1' });

    const body: Record<string, unknown> = { query, limit };
    if (sourceType) body.sourceType = sourceType;

    const res = await lambda.send(new InvokeCommand({
      FunctionName: 'vigia-retrieval-proxy',
      Payload: Buffer.from(JSON.stringify({ body: JSON.stringify(body) })),
    }));

    const payload = JSON.parse(new TextDecoder().decode(res.Payload));
    if (payload.statusCode !== 200) return [];

    const { chunks } = JSON.parse(payload.body);
    if (!chunks?.length) return [];

    return chunks.map((r: any) => ({
      chunkText: r.chunkText ?? '',
      similarity: r.similarity ?? 0,
      sourceType: r.sourceType ?? sourceType ?? 'nhai_contract',
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

export async function searchNHAI(query: string, limit = 8): Promise<UnifiedResult[]> {
  return queryPgvectorFiltered(query, limit, 'nhai_contract');
}

/**
 * Personnel (PWD) retrieval — jurisdiction-constrained and self-verifying.
 *
 * The most dangerous failure in a personnel directory is returning a real officer from the
 * WRONG district (the "Khammam → Nirmal" bug). Raw pgvector similarity does not guarantee
 * the top hit shares the queried jurisdiction, so we:
 *   1. Resolve a geographic anchor from the caller's structured `geo` (injected from an
 *      NHAI district lookup in the multi-hop plan) OR from the query text itself.
 *   2. Refuse to answer with NO anchor at all — returning [] so the guardrail routes to the
 *      Authority Matrix fallback instead of surfacing a semi-random officer.
 *   3. Over-fetch, then keep only officers whose district (preferred) or state matches the
 *      anchor. A district anchor with zero matching officers returns [] rather than drifting
 *      to a neighbouring district.
 */
export async function searchPWD(
  query: string,
  limit = 8,
  geo?: IndiaGeo,
): Promise<UnifiedResult[]> {
  const textGeo = extractIndiaGeo(query);
  const anchor: IndiaGeo = {
    district: geo?.district ?? textGeo.district,
    state: geo?.state ?? textGeo.state,
  };

  // No geographic anchor anywhere → do not surface officers. Prevents wrong-jurisdiction
  // and random-officer answers; the caller's guardrail handles the empty result as a void.
  if (!anchor.district && !anchor.state) return [];

  // Over-fetch so post-filtering has candidates to choose from.
  const raw = await queryPgvectorFiltered(query, Math.max(limit * 3, 15), 'pwd_contact');
  if (raw.length === 0) return [];

  const norm = (s?: string | null) => (s ?? '').toLowerCase().trim();
  const inText = (r: UnifiedResult, needle: string) =>
    norm(r.district).includes(needle) ||
    norm(r.state).includes(needle) ||
    r.chunkText.toLowerCase().includes(needle);

  // District is the strongest constraint. If we have one, keep only officers that match it.
  if (anchor.district) {
    const d = norm(anchor.district);
    const districtMatches = raw.filter((r) => inText(r, d));
    if (districtMatches.length > 0) return districtMatches.slice(0, limit);
    // District anchor but no officer in that district → fall through to state, else empty.
  }

  if (anchor.state) {
    const s = norm(anchor.state);
    const stateMatches = raw.filter((r) => inText(r, s));
    if (stateMatches.length > 0) return stateMatches.slice(0, limit);
  }

  // Anchor present but nothing verifiably matches it → refuse rather than guess.
  return [];
}

export async function searchPMGSY(query: string, limit = 8): Promise<UnifiedResult[]> {
  return queryPgvectorFiltered(query, limit, 'pmgsy_road');
}

export async function searchAll(query: string, limit = 8): Promise<UnifiedResult[]> {
  return queryPgvectorFiltered(query, limit, null);
}
