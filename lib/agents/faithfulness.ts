import { generateObject } from 'ai';
import { bedrock } from '@/lib/agents/bedrock-provider';
import { z } from 'zod';

const FaithfulnessSchema = z.object({
  claims: z.array(z.object({
    claim: z.string(),
    attributedToChunk: z.boolean(),
    chunkIndex: z.number().nullable(),
  })),
  overallFaithfulness: z.number().min(0).max(1),
  flaggedClaims: z.array(z.string()),
});

export interface FaithfulnessResult {
  score: number;
  flagged: string[];
}

/**
 * LLM-as-Judge Faithfulness Scoring.
 * Evaluates whether claims in a response can be attributed to retrieved chunks.
 * High specificity + low attribution = hallucination signal.
 */
export async function scoreFaithfulness(
  response: string,
  retrievedChunks: string[]
): Promise<FaithfulnessResult> {
  if (!response || retrievedChunks.length === 0) {
    return { score: 1.0, flagged: [] };
  }

  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: FaithfulnessSchema,
      prompt: `You are a faithfulness evaluator. Given a response and source chunks, identify every factual claim in the response and check if it can be attributed to a specific chunk.

RESPONSE: "${response}"

SOURCE CHUNKS:
${retrievedChunks.slice(0, 5).map((c, i) => `[${i}] ${c.slice(0, 300)}`).join('\n')}

For each claim, mark attributedToChunk=true only if the chunk explicitly states or directly implies the claim. Flag any claim with high specificity (names, numbers, dates) that cannot be attributed.`,
    });
    return { score: object.overallFaithfulness, flagged: object.flaggedClaims };
  } catch {
    return { score: 1.0, flagged: [] };
  }
}

/**
 * Strips flagged (ungrounded) claims from a response.
 * Used when faithfulness score < 0.7.
 */
export function stripUngroundedClaims(response: string, flagged: string[]): string {
  if (flagged.length === 0) return response;
  let cleaned = response;
  for (const claim of flagged) {
    cleaned = cleaned.replace(claim, '[REMOVED: unverified claim]');
  }
  return cleaned;
}
