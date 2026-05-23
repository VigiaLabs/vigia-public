import { generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';
import type { VigiaState, DebugTraceEntry } from './state';

const OrchestratorOutputSchema = z.object({
  intent: z.enum(['conversational', 'complaint', 'rti', 'condition', 'personnel', 'tender_search']),
  activeAgents: z.array(z.enum(['vision', 'admin', 'telemetry'])).optional(),
  conversationalReply: z.string().optional(),
});

function formatHistory(history?: Array<{ role: string; content: string }>): string {
  if (!history?.length) return 'None';
  return history.slice(-6).map((m) => `${m.role}: ${m.content}`).join('\n');
}

export async function routerNode(state: VigiaState): Promise<Partial<VigiaState>> {
  const { payload } = state;
  const hasImage = !!payload.imageUrl;
  const hasGps = !!payload.gps;

  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: OrchestratorOutputSchema,
      prompt: `You are a routing classifier for VIGIA, an infrastructure auditing system. Classify the user's intent into one of these categories and select agents.

CONVERSATION HISTORY:
${formatHistory(payload.history)}

CURRENT USER INPUT: "${payload.text ?? ''}"
IMAGE ATTACHED: ${hasImage}
GPS COORDINATES ATTACHED: ${hasGps}

INTENT CATEGORIES (pick exactly one):
- "complaint" → user wants to file a complaint, report a pothole, ask who to call about road damage
- "rti" → user mentions RTI, Right to Information, wants to file an information request
- "condition" → user asks about CURRENT road condition, damage assessment, how bad it is NOW
- "personnel" → user asks about executive engineer, who is in charge, contact details
- "tender_search" → user asks about contractor, budget, tender, cost, project details, concessionaire, OR asks about maintenance timelines, last relaying date, project completion, defect liability period, when road was built/resurfaced
- "conversational" → greetings, small talk, asking what the system does

CRITICAL ROUTING RULE:
Questions about "last relaying," "maintenance date," "when was it resurfaced," "completion date," "DLP," or "defect liability" MUST be routed to "tender_search" — NOT "condition." These dates are found in contract PDFs, not condition monitoring systems.

AGENT SELECTION RULES (only for non-conversational intents):
- Add "vision" ONLY if IMAGE ATTACHED is true
- Add "telemetry" ONLY if GPS COORDINATES ATTACHED is true
- Add "admin" for complaint, rti, condition, personnel, or tender_search intents
- If intent is "condition" and IMAGE ATTACHED, include both "vision" and "admin"

For "conversational": provide a short helpful conversationalReply (under 50 words).`,
    });

    if (object.intent === 'conversational') {
      const trace: DebugTraceEntry = {
        node: 'router',
        timestamp: Date.now(),
        decision: 'Orchestrator: conversational intent',
      };
      return {
        activeAgents: [],
        intent: 'conversational',
        pipelineStatus: 'complete',
        auditFinding: object.conversationalReply ?? "Hello! I'm VIGIA. I can help you file complaints, look up RTI authorities, check road conditions, or search tender data. What would you like to do?",
        debugTrace: [trace],
      };
    }

    const agents = object.activeAgents?.length ? object.activeAgents : ['admin' as const];
    const trace: DebugTraceEntry = {
      node: 'router',
      timestamp: Date.now(),
      decision: `Orchestrator: intent="${object.intent}" → agents=[${agents.join(', ')}]`,
    };
    return {
      activeAgents: agents,
      intent: object.intent,
      pipelineStatus: 'ingesting',
      debugTrace: [trace],
    };
  } catch {
    // Fallback: default to tender_search with admin
    const agents: VigiaState['activeAgents'] = ['admin'];
    if (hasImage) agents.unshift('vision');
    if (hasGps) agents.push('telemetry');

    const trace: DebugTraceEntry = {
      node: 'router',
      timestamp: Date.now(),
      decision: `Orchestrator fallback (LLM failed) → intent="tender_search", agents=[${agents.join(', ')}]`,
    };
    return {
      activeAgents: agents,
      intent: 'tender_search',
      pipelineStatus: 'ingesting',
      debugTrace: [trace],
    };
  }
}
