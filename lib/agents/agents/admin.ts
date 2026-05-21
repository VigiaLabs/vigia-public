import { generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';
import type { NormalizedEvidence, Payload } from '../state';
import { callVigiaTool } from '../../mcp/client';

const AdminExtractionSchema = z.object({
  roadNumber: z.string().describe("The road number mentioned, e.g., 'NH-44', 'SH-15'. Null if none found.").nullable(),
});

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
    // 1. Extract road number from user query
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: AdminExtractionSchema,
      prompt: `Extract the road number (like NH-44, SH-12) from the following query:\n\n"${searchTerm}"`,
    });

    if (!object.roadNumber) {
      return {
        agentId: 'admin',
        status: 'completed',
        confidence: 0.3,
        findings: ['No specific road number identified in the query to look up contracts.'],
        citations: [],
        latencyMs: Date.now() - start,
      };
    }

    // 2. Call MCP Server
    const result = await callVigiaTool('search_tenders', { roadNumber: object.roadNumber });
    
    let tenders: any[] = [];
    if (result && result.content && result.content[0] && result.content[0].text) {
      tenders = JSON.parse(result.content[0].text);
    }

    if (!tenders.length || tenders[0].projectName.includes('not found')) {
      return {
        agentId: 'admin',
        status: 'completed',
        confidence: 0.8,
        findings: [`No matching contract records found for ${object.roadNumber}.`],
        citations: [],
        latencyMs: Date.now() - start,
      };
    }

    // Format findings
    const findings = tenders.map(
      (t) => `Contract for ${t.roadNumber}: Project '${t.projectName}', Concessionaire: ${t.concessionaire}, Mode: ${t.mode}, State: ${t.state}.`
    );

    const citations = tenders.map((t, i) => ({
      sourceId: `nhai-${t.roadNumber}-${i}`,
      label: `NHAI Public Data (${t.roadNumber})`,
      trustLevel: 'legally-binding' as const,
    }));

    return {
      agentId: 'admin',
      status: 'completed',
      confidence: 0.9,
      severity: 'none',
      findings,
      citations,
      metadata: { roadNumber: object.roadNumber, resultCount: tenders.length },
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const reason =
      err instanceof Error ? err.message : 'Unknown MCP error';
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
