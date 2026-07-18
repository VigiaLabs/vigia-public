import { generateObject } from 'ai';
import { bedrock } from '@/lib/agents/bedrock-provider';
import { z } from 'zod';

const RewriteSchema = z.object({
  rewrittenQuery: z.string(),
});

const DecomposeSchema = z.object({
  subQueries: z.array(z.string()).max(3),
});

/**
 * CRAG-style dynamic query rewriter.
 * Generates a broader, synonym-rich search query when retrieval fails.
 */
export async function rewriteQuery(
  originalQuery: string,
  intent: string | undefined,
  failureReason: 'data-void' | 'contradiction'
): Promise<string> {
  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: RewriteSchema,
      prompt: `You are a search query rewriter for an Indian infrastructure database (NHAI contracts, PMGSY roads, PWD directories).

ORIGINAL QUERY: "${originalQuery}"
INTENT: ${intent ?? 'unknown'}
FAILURE: ${failureReason === 'data-void' ? 'No relevant documents retrieved. Query may be too specific.' : 'Retrieved documents contradict visual evidence. Need amendment/variation documents.'}

Rewrite the query to be BROADER. Add synonyms, relax constraints. Under 80 words. Do NOT invent road numbers or locations not in the original.${failureReason === 'contradiction' ? ' Include terms: amendment, variation order, revised, addendum.' : ''}`,
    });
    return object.rewrittenQuery;
  } catch {
    return failureReason === 'contradiction'
      ? `${originalQuery} amendment variation order revised addendum`
      : originalQuery;
  }
}

/**
 * Query Decomposition for multi-hop queries.
 * Breaks complex queries into 1-3 independent sub-queries.
 */
export async function decomposeQuery(query: string): Promise<string[]> {
  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: DecomposeSchema,
      prompt: `Break this infrastructure query into 1-3 independent sub-queries that can each be answered by a single database lookup:\n"${query}"\nIf the query is already simple, return it unchanged as a single-element array.`,
    });
    return object.subQueries.length > 0 ? object.subQueries : [query];
  } catch {
    return [query];
  }
}
