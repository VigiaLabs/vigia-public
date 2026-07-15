import { generateObject } from 'ai';
import { bedrock } from '@/lib/agents/bedrock-provider';
import { z } from 'zod';
import type { DebugTraceEntry, VigiaState } from './state';

const SynthesisOutputSchema = z.object({
  auditFinding: z.string(),
  citations: z.array(
    z.object({
      number: z.number(),
      label: z.string(),
      sourceId: z.string(),
    })
  ),
});

function buildPrompt(state: VigiaState): string {
  const historySection = state.payload.history?.length
    ? `CONVERSATION HISTORY:\n${state.payload.history.slice(-6).map((m) => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : '';

  const evidenceSummary = state.evidence
    .filter((e) => e.status === 'completed' || e.status === 'partial')
    .map((e) => {
      const lines = [
        `[${e.agentId.toUpperCase()}] Status: ${e.status} | Confidence: ${e.confidence} | Severity: ${e.severity ?? 'N/A'}`,
        ...e.findings.map((f) => `  • ${f}`),
        ...e.citations.map((c) => `  📎 ${c.label} (${c.sourceId})`),
      ];
      return lines.join('\n');
    })
    .join('\n\n');

  const contradictionNote = state.contradictionVerified
    ? `\n\nCRITICAL: A verified contradiction exists between official documents (claiming compliance) and visual/telemetry evidence (showing severe damage). You MUST highlight this discrepancy prominently in your finding.`
    : '';

  return `You are VIGIA, a calm road-safety and civic-infrastructure expert. Give a natural, concise, cited answer based only on the following evidence.

${historySection}CURRENT QUERY: "${state.payload.text ?? ''}"

EVIDENCE:
${evidenceSummary}
${contradictionNote}

INSTRUCTIONS:
- Answer the user's question directly in the first sentence, then explain the supporting road-safety or infrastructure facts in 2-4 short paragraphs.
- If conversation history exists, ensure your response is contextually relevant to the ongoing discussion.
- Reference evidence by sourceId in your citations array.
- Sound like an experienced road-safety adviser speaking to a citizen: calm, practical, and easy to understand. Do not expose internal pipeline steps such as intent classification, retrieval, planning, or tool names.
- If the request is genuinely ambiguous or appears misheard, ask one short clarifying question instead of guessing.
- Clearly separate verified records from general safety guidance, and never claim current road safety without current evidence.
- If a contradiction is flagged, lead with the discrepancy.
- Number citations sequentially starting from 1.

CONTEXT EXPANSION DIRECTIVE:
1. Answer the primary question directly and concisely first.
2. If the retrieved evidence contains ANY of the following metadata about the project or road—Sanctioned Budget, Project Mode (EPC/HAM/BOT), Timeline/Completion Date, Kilometer stretch, Concessionaire, or Implementing Agency—you MUST include a "Project Overview" section using markdown bullet points summarizing all available details.
3. Format the expanded metadata as:
   **Project Overview**
   - **Mode:** EPC / HAM / BOT (if available)
   - **Sanctioned Cost:** ₹X Cr (if available)
   - **Stretch:** km X to km Y (if available)
   - **Completion Date:** date (if available)
   - **Implementing Agency:** name (if available)
4. STRICT: Only include metadata that is explicitly present in the EVIDENCE above. Do NOT hallucinate or infer values not found in the retrieved chunks.`;
}

export async function synthesizerNode(state: VigiaState): Promise<Partial<VigiaState>> {
  const start = Date.now();

  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: SynthesisOutputSchema,
      prompt: buildPrompt(state),
    });

    const trace: DebugTraceEntry = {
      node: 'synthesizer',
      timestamp: Date.now(),
      decision: `Generated audit finding (${object.auditFinding.length} chars, ${object.citations.length} citations) in ${Date.now() - start}ms`,
    };

    return {
      auditFinding: object.auditFinding,
      synthesizedCitations: object.citations,
      pipelineStatus: 'complete',
      totalLatencyMs: Date.now() - state.startedAt,
      debugTrace: [trace],
    };
  } catch (err: unknown) {
    const fallback = state.evidence
      .filter((e) => e.status === 'completed')
      .flatMap((e) => e.findings)
      .map((f, i) => `${i + 1}. ${f}`)
      .join('\n');

    const reason = err instanceof Error ? err.message : 'LLM call failed';

    const trace: DebugTraceEntry = {
      node: 'synthesizer',
      timestamp: Date.now(),
      decision: `LLM failed (${reason}) — returning raw evidence fallback`,
    };

    return {
      auditFinding: fallback || 'Unable to generate audit finding.',
      synthesizedCitations: [],
      pipelineStatus: 'complete',
      errorMessage: reason,
      totalLatencyMs: Date.now() - state.startedAt,
      debugTrace: [trace],
    };
  }
}
