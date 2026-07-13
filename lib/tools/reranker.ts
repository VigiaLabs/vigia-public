'use server';

export interface RerankResult {
  index: number;
  relevanceScore: number;
}

/**
 * Cross-encoder reranking via Cohere Rerank v3.
 * Falls back to passthrough (no reranking) if COHERE_API_KEY is not set.
 */
export async function rerankChunks(
  query: string,
  documents: string[],
  topK: number = 5
): Promise<RerankResult[]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey || documents.length <= topK) {
    // Passthrough: return original order
    return documents.slice(0, topK).map((_, i) => ({ index: i, relevanceScore: 1 - i * 0.1 }));
  }

  try {
    const res = await fetch('https://api.cohere.ai/v1/rerank', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'rerank-english-v3.0',
        query,
        documents,
        top_n: topK,
        return_documents: false,
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return documents.slice(0, topK).map((_, i) => ({ index: i, relevanceScore: 1 }));

    const data = await res.json() as any;
    return (data.results as Array<{ index: number; relevance_score: number }>).map(r => ({
      index: r.index,
      relevanceScore: r.relevance_score,
    }));
  } catch {
    // Timeout or network error — fall back to original order
    return documents.slice(0, topK).map((_, i) => ({ index: i, relevanceScore: 1 }));
  }
}
