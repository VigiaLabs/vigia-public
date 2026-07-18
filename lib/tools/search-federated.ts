/**
 * Federated search tools — source-specific pgvector queries.
 * Each tool filters by sourceType at the DB level for targeted retrieval.
 */

import { filterResultsForQuery, type UnifiedResult } from './search-unified';
import { extractIndiaGeo, type IndiaGeo } from './geo-resolve';

export function extractCanonicalRoadId(query: string): string | null {
  const match = query.match(/\b(NH|SH|MDR)[-\s]?(\d+[A-Z]?)\b/i);
  return match ? `${match[1].toUpperCase()}-${match[2].toUpperCase()}` : null;
}

export function prioritizeExactRoadMatches(query: string, results: UnifiedResult[]): UnifiedResult[] {
  const roadId = extractCanonicalRoadId(query);
  if (!roadId) return results;
  const [prefix, number] = roadId.split('-');
  const roadPattern = new RegExp(`\\b${prefix}[-\\s]?${number}\\b`, 'i');
  const exact = results.filter((result) => {
    const resultRoadId = result.roadNumber
      ? extractCanonicalRoadId(result.roadNumber)
      : null;
    return resultRoadId === roadId || roadPattern.test(result.chunkText);
  });
  return exact;
}

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
  } catch (error) {
    console.error(`Filtered pgvector retrieval failed for ${sourceType ?? 'all sources'}:`, error);
    return [];
  }
}

export async function searchNHAI(query: string, limit = 8): Promise<UnifiedResult[]> {
  const results = filterResultsForQuery(query, await queryPgvectorFiltered(query, limit, 'nhai_contract'));
  const exactResults = prioritizeExactRoadMatches(query, results);
  if (exactResults.length > 0) return exactResults;
  if (extractCanonicalRoadId(query)) return [];
  const { searchUnified } = await import('./search-unified');
  const fallback = (await searchUnified(query, limit * 2))
    .filter((item) => item.sourceType === 'nhai_contract')
    .slice(0, limit);
  return prioritizeExactRoadMatches(query, fallback);
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
  let raw = await queryPgvectorFiltered(query, Math.max(limit * 3, 15), 'pwd_contact');
  if (raw.length === 0) {
    const { searchUnified } = await import('./search-unified');
    raw = (await searchUnified(query, Math.max(limit * 3, 15)))
      .filter((item) => item.sourceType === 'pwd_contact');
  }
  if (raw.length === 0) return [];

  const norm = (s?: string | null) => (s ?? '').toLowerCase().trim();
  const inText = (r: UnifiedResult, needle: string) =>
    norm(r.district).includes(needle) ||
    norm(r.state).includes(needle) ||
    r.chunkText.toLowerCase().includes(needle);
  const withOfficialContactExcerpt = (result: UnifiedResult): UnifiedResult => {
    const name = typeof result.metadata?.name === 'string' ? result.metadata.name : null;
    const phone = typeof result.metadata?.phone === 'string' ? result.metadata.phone : null;
    const email = typeof result.metadata?.email === 'string' ? result.metadata.email : null;
    if (!name || !phone) return result;
    return {
      ...result,
      metadata: {
        ...result.metadata,
        excerpt: [name, `Mobile: ${phone}`, email ? `Email: ${email}` : null].filter(Boolean).join(' | '),
        source_locator: 'Roads & Buildings Department Office — R & B Contacts List',
      },
    };
  };

  // District is the strongest constraint. If we have one, keep only officers that match it.
  if (anchor.district) {
    const d = norm(anchor.district);
    const districtMatches = raw.filter((r) => inText(r, d));
    if (districtMatches.length > 0) return districtMatches.slice(0, limit).map(withOfficialContactExcerpt);
    // District anchor but no officer in that district → fall through to state, else empty.
  }

  if (anchor.state) {
    const s = norm(anchor.state);
    const stateMatches = raw.filter((r) => inText(r, s));
    if (stateMatches.length > 0) return stateMatches.slice(0, limit).map(withOfficialContactExcerpt);
  }

  // Anchor present but nothing verifiably matches it → refuse rather than guess.
  return [];
}

export async function searchPMGSY(query: string, limit = 8): Promise<UnifiedResult[]> {
  const results = await queryPgvectorFiltered(query, limit, 'pmgsy_road');
  if (results.length > 0) return results;
  const { searchUnified } = await import('./search-unified');
  return (await searchUnified(query, limit * 2))
    .filter((item) => item.sourceType === 'pmgsy_road')
    .slice(0, limit);
}

export async function searchRoadReferences(query: string, limit = 8): Promise<UnifiedResult[]> {
  const [roadReferences, pmgsyReferences] = await Promise.all([
    queryPgvectorFiltered(query, limit, 'road_reference'),
    queryPgvectorFiltered(query, limit, 'pmgsy_reference'),
  ]);
  return [...roadReferences, ...pmgsyReferences]
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);
}

export async function searchAll(query: string, limit = 8): Promise<UnifiedResult[]> {
  return queryPgvectorFiltered(query, limit, null);
}
