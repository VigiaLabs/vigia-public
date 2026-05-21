import { generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';
import type { VigiaState, DebugTraceEntry } from './state';

const OrchestratorOutputSchema = z.object({
  intent: z.enum(['conversational', 'audit']),
  activeAgents: z.array(z.enum(['vision', 'admin', 'telemetry'])).optional(),
  conversationalReply: z.string().optional(),
});

function formatHistory(history?: Array<{ role: string; content: string }>): string {
  if (!history?.length) return 'None';
  return history
    .slice(-6) // last 6 messages for context window efficiency
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
}

export async function routerNode(state: VigiaState): Promise<Partial<VigiaState>> {
  const { payload } = state;
  const hasImage = !!payload.imageUrl;
  // Detect GPS coordinates in payload.gps or embedded in text (e.g. "13.1994, 77.4282")
  const hasGps = !!payload.gps || (payload.text ? !!payload.text.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/) : false);
  const historyContext = formatHistory(payload.history);

  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: OrchestratorOutputSchema,
      prompt: `You are a routing classifier for VIGIA, an infrastructure auditing system. Classify the user's intent and select which specialist agents to activate.

CONVERSATION HISTORY:
${historyContext}

CURRENT USER INPUT: "${payload.text ?? ''}"
IMAGE ATTACHED: ${hasImage}
GPS COORDINATES ATTACHED: ${hasGps}

RULES:
- Consider the conversation history to understand follow-up questions (e.g., "Who was the contractor?" refers to the previously discussed project).
- If the user is greeting, asking what you do, or making small talk → intent: "conversational", provide a short helpful conversationalReply.
- If the user wants to analyze infrastructure, check road status, budgets, contracts, or provided evidence → intent: "audit".
- If it's a follow-up question about a previous audit topic → intent: "audit", select "admin".
- For "audit" intent, select activeAgents strictly:
  • "vision" ONLY if IMAGE ATTACHED is true
  • "telemetry" ONLY if GPS COORDINATES ATTACHED is true
  • "admin" if the text asks about status, budget, contractors, tenders, roads, or is a follow-up question
  • If none apply but intent is audit, default to ["admin"]
- Keep conversationalReply under 50 words.`,
    });

    if (object.intent === 'conversational') {
      const trace: DebugTraceEntry = {
        node: 'router',
        timestamp: Date.now(),
        decision: 'Orchestrator: conversational intent',
      };
      return {
        activeAgents: [],
        pipelineStatus: 'complete',
        auditFinding: object.conversationalReply ?? "Hello! I'm VIGIA, your infrastructure auditing assistant. Upload road images or ask about budgets and tenders.",
        debugTrace: [trace],
      };
    }

    const agents = object.activeAgents?.length ? object.activeAgents : ['admin' as const];
    const trace: DebugTraceEntry = {
      node: 'router',
      timestamp: Date.now(),
      decision: `Orchestrator: audit intent → [${agents.join(', ')}]`,
    };
    return {
      activeAgents: agents,
      pipelineStatus: 'ingesting',
      debugTrace: [trace],
    };
  } catch {
    const agents: VigiaState['activeAgents'] = ['admin'];
    if (hasImage) agents.unshift('vision');
    if (hasGps) agents.push('telemetry');

    const trace: DebugTraceEntry = {
      node: 'router',
      timestamp: Date.now(),
      decision: `Orchestrator fallback (LLM failed) → [${agents.join(', ')}]`,
    };
    return {
      activeAgents: agents,
      pipelineStatus: 'ingesting',
      debugTrace: [trace],
    };
  }
}
