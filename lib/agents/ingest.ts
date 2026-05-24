import type { NormalizedEvidence, DebugTraceEntry, VigiaState } from './state';
import { NormalizedEvidenceSchema } from './state';
import { runAdminAgent } from './agents/admin';
import { runVisionAgent } from './agents/vision';
import { runTelemetryAgent } from './agents/telemetry';
import { dispatchWithFallback, type NetworkMode } from '../edge/failover';

const AGENT_TIMEOUT_MS = 6000;

type AgentId = 'vision' | 'admin' | 'telemetry';

function makeErrorEvidence(agentId: AgentId, reason: string, latencyMs: number): NormalizedEvidence {
  return {
    agentId,
    status: 'error',
    confidence: 0,
    findings: [],
    citations: [],
    errorReason: reason,
    latencyMs,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Agent timed out after ${ms}ms`));
    }, ms);

    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    });

    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function dispatchAgent(
  agentId: AgentId,
  payload: VigiaState['payload'],
  retryQuery: string | undefined,
  signal: AbortSignal,
  intent?: VigiaState['intent']
): Promise<NormalizedEvidence> {
  let task: Promise<NormalizedEvidence>;

  switch (agentId) {
    case 'vision':
      task = runVisionAgent(payload);
      break;
    case 'admin':
      task = runAdminAgent(payload, retryQuery, intent);
      break;
    case 'telemetry':
      task = runTelemetryAgent(payload);
      break;
  }

  return withTimeout(task, AGENT_TIMEOUT_MS, signal);
}

/**
 * Node 2: Parallel Ingestion
 *
 * Dispatches specialist agents concurrently via Promise.allSettled.
 * On retry (retryCount > 0): only dispatches Admin Agent with retryQuery.
 * Multi-hop queries are decomposed into sub-queries for targeted retrieval.
 * Each agent gets its own AbortController with 4s timeout.
 */
export async function ingestNode(
  state: VigiaState
): Promise<Partial<VigiaState>> {
  const start = Date.now();

  // On retry: only re-run admin with the appended retryQuery
  const agentsToRun: AgentId[] =
    state.retryCount > 0 ? ['admin'] : [...state.activeAgents];

  const retryQuery = state.retryCount > 0 ? state.retryQuery : undefined;

  // Determine network mode (server-side: assume online unless explicitly set)
  const networkMode: NetworkMode = (state as any).networkMode ?? 'online';

  // Dispatch all agents in parallel with individual abort controllers
  const settled = await Promise.allSettled(
    agentsToRun.map((agentId) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

      return dispatchWithFallback(
        agentId,
        state.payload,
        networkMode,
        () => dispatchAgent(agentId, state.payload, retryQuery, controller.signal, state.intent)
      )
        .finally(() => clearTimeout(timeout))
        .then((result) => ({ agentId, result }));
    })
  );

  // Validate and collect evidence
  const evidence: NormalizedEvidence[] = [];

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const { agentId, result } = outcome.value;
      const parsed = NormalizedEvidenceSchema.safeParse(result);

      if (parsed.success) {
        evidence.push(parsed.data);
      } else {
        evidence.push(
          makeErrorEvidence(agentId, `Schema validation failed: ${parsed.error.message}`, Date.now() - start)
        );
      }
    } else {
      // Promise rejected (timeout or agent crash)
      // Extract agentId from the error context — fallback to 'admin'
      const reason = outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error';
      evidence.push(makeErrorEvidence('admin', reason, Date.now() - start));
    }
  }

  const trace: DebugTraceEntry = {
    node: 'ingest',
    timestamp: Date.now(),
    decision: state.retryCount > 0
      ? `Retry pass: admin only (query: "${retryQuery}") — ${evidence.length} result(s) in ${Date.now() - start}ms`
      : `Dispatched [${agentsToRun.join(', ')}] — ${evidence.length} result(s) in ${Date.now() - start}ms`,
  };

  return {
    evidence,
    pipelineStatus: 'guardrail',
    debugTrace: [trace],
  };
}
