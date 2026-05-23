import { generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';
import type { NormalizedEvidence, Payload } from '../state';

const VisionOutputSchema = z.object({
  severity: z.enum(['critical', 'severe', 'moderate', 'minor', 'none']),
  confidence: z.number().min(0).max(1),
  findings: z.array(z.string()),
  irapStarRating: z.number().min(1).max(5),
});

/**
 * Vision Agent — Amazon Bedrock Nova Lite multimodal road damage assessment.
 *
 * Passes the image URL to Nova Lite VLM for iRAP-standard evaluation.
 * Returns NormalizedEvidence with severity and findings.
 */
export async function runVisionAgent(
  payload: Payload
): Promise<NormalizedEvidence> {
  const start = Date.now();

  if (!payload.imageUrl) {
    return {
      agentId: 'vision',
      status: 'skipped',
      confidence: 0,
      findings: [],
      citations: [],
      latencyMs: Date.now() - start,
    };
  }

  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: VisionOutputSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an infrastructure damage assessor using iRAP (International Road Assessment Programme) standards.

Analyze this road image and provide:
1. severity: Rate the damage level (critical/severe/moderate/minor/none)
2. confidence: Your confidence in the assessment (0.0-1.0)
3. findings: List 2-4 specific observations about the road condition
4. irapStarRating: Estimated iRAP star rating (1=worst, 5=best)

Focus on: potholes, surface cracks, aggregate exposure, drainage issues, lane markings, and structural failures.`,
            },
            {
              type: 'image',
              image: payload.imageUrl,
            },
          ],
        },
      ],
    });

    return {
      agentId: 'vision',
      status: 'completed',
      confidence: object.confidence,
      severity: object.severity,
      findings: [
        `[CITIZEN CLAIM] ${object.findings[0]}`,
        ...object.findings.slice(1),
        'Note: This is an unverified citizen submission. Official condition data may differ.',
      ],
      citations: [
        {
          sourceId: 'vision-citizen-claim',
          label: 'Citizen Photo Assessment',
          url: payload.imageUrl,
          trustLevel: 'citizen-claim',
        },
      ],
      metadata: {
        imageUrl: payload.imageUrl,
        model: 'amazon.nova-lite-v1:0',
        irapStarRating: object.irapStarRating,
      },
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : 'Vision inference failed';
    return {
      agentId: 'vision',
      status: 'error',
      confidence: 0,
      findings: [],
      citations: [],
      errorReason: reason,
      latencyMs: Date.now() - start,
    };
  }
}
