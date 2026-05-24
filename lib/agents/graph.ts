import { StateGraph, START, END } from '@langchain/langgraph';
import { VigiaStateAnnotation } from './state';
import type { Payload, VigiaState } from './state';
import { routerNode } from './router';
import { ingestNode } from './ingest';
import { guardrailNode } from './guardrail';
import { uiHookNode } from './ui-hook';

// Re-export node functions for inline execution in the API route
export { routerNode, ingestNode, guardrailNode, uiHookNode };

/**
 * Conditional edge after router:
 * - If conversational (pipelineStatus already 'complete') → skip to end
 * - Otherwise → proceed to ingest
 */
function routeAfterRouter(
  state: typeof VigiaStateAnnotation.State
): '__end__' | 'ingest' {
  if (state.pipelineStatus === 'complete') return '__end__';
  return 'ingest';
}

/**
 * Conditional edge after guardrail:
 * - If retrying (contradiction OR data void) and retry not exhausted → loop back to ingest
 * - If authority fallback completed the pipeline → skip to end
 * - Otherwise → proceed to ui_hook
 */
function routeAfterGuardrail(
  state: typeof VigiaStateAnnotation.State
): 'ingest' | 'ui_hook' | '__end__' {
  // Data void fallback sets pipelineStatus = 'complete' directly
  if (state.pipelineStatus === 'complete') return '__end__';
  // Retry loop: contradiction or data void
  if (state.pipelineStatus === ('retrying' as string)) return 'ingest';
  if (
    state.contradictionDetected &&
    state.retryCount < 2 &&
    !state.contradictionVerified
  ) {
    return 'ingest';
  }
  return 'ui_hook';
}

// ─── Build the Graph ────────────────────────────────────────────────

const workflow = new StateGraph(VigiaStateAnnotation)
  .addNode('router', routerNode)
  .addNode('ingest', ingestNode)
  .addNode('guardrail', guardrailNode)
  .addNode('ui_hook', uiHookNode)
  .addEdge(START, 'router')
  .addConditionalEdges('router', routeAfterRouter, {
    __end__: END,
    ingest: 'ingest',
  })
  .addEdge('ingest', 'guardrail')
  .addConditionalEdges('guardrail', routeAfterGuardrail, {
    ingest: 'ingest',
    ui_hook: 'ui_hook',
    __end__: END,
  })
  .addEdge('ui_hook', END);

export const vigiaGraph = workflow.compile();

// ─── Execution Helper ───────────────────────────────────────────────

export async function runPipeline(payload: Payload): Promise<VigiaState> {
  const initialState = {
    traceId: crypto.randomUUID(),
    startedAt: Date.now(),
    payload,
    activeAgents: [] as VigiaState['activeAgents'],
    evidence: [],
    retryCount: 0,
    contradictionDetected: false,
    contradictionVerified: false,
    pipelineStatus: 'routing' as const,
    debugTrace: [],
  };

  const result = await vigiaGraph.invoke(initialState);
  return result as VigiaState;
}
