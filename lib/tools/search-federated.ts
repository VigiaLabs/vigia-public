/**
 * Federated search tools — source-specific pgvector queries.
 * Each tool filters by sourceType at the DB level for targeted retrieval.
 */

import type { UnifiedResult } from './search-unified';

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

export async function searchPWD(query: string, limit = 8): Promise<UnifiedResult[]> {
  return queryPgvectorFiltered(query, limit, 'pwd_contact');
}

export async function searchPMGSY(query: string, limit = 8): Promise<UnifiedResult[]> {
  return queryPgvectorFiltered(query, limit, 'pmgsy_road');
}

export async function searchAll(query: string, limit = 8): Promise<UnifiedResult[]> {
  return queryPgvectorFiltered(query, limit, null);
}
