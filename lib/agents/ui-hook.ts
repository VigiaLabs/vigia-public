import type { DebugTraceEntry, PendingAction, VigiaState } from './state';

export interface UIPayload {
  auditFinding: string;
  sources: Array<{
    id: string;
    label: string;
    trustLevel: string;
    url?: string;
  }>;
  budgetData?: {
    allocated: number;
    disbursed: number;
    currency: string;
    percentDisbursed: number;
  };
  spatialMarkers?: Array<{
    lat: number;
    lng: number;
    label: string;
    severity: string;
  }>;
  evidenceImages?: Array<{
    url: string;
    severity: string;
    label: string;
  }>;
  pendingAction?: PendingAction;
  contradictionVerified: boolean;
  debugTrace: VigiaState['debugTrace'];
  totalLatencyMs: number;
}

/**
 * Node 5: UI Hook
 *
 * Maps final pipeline state into the payload expected by
 * Vercel AI SDK streamUI / the frontend Generative UI components.
 * Zero LLM tokens — pure data transformation.
 */
export function uiHookNode(
  state: VigiaState
): Partial<VigiaState> {
  const trace: DebugTraceEntry = {
    node: 'ui_hook',
    timestamp: Date.now(),
    decision: `Mapped state to UI payload — ${state.evidence.length} evidence items`,
  };

  // This node doesn't mutate meaningful state — it exists as the terminal
  // graph node. The actual UI payload is extracted from the final state
  // by the API route using `extractUIPayload()`.
  return {
    debugTrace: [trace],
  };
}

/**
 * Extracts the UI-ready payload from the final graph state.
 * Called by the API route after graph execution completes.
 */
export function extractUIPayload(state: VigiaState): UIPayload {
  // Collect all unique citations across evidence
  const sources = state.evidence
    .flatMap((e) => e.citations)
    .map((c) => ({
      id: c.sourceId,
      label: c.label,
      trustLevel: c.trustLevel,
      url: c.url,
    }));

  // Extract budget data from admin metadata if present
  const adminEvidence = state.evidence.find(
    (e) => e.agentId === 'admin' && e.metadata
  );
  const budgetData = adminEvidence?.metadata?.['budgetAllocated']
    ? {
        allocated: adminEvidence.metadata['budgetAllocated'] as number,
        disbursed: adminEvidence.metadata['budgetDisbursed'] as number,
        currency: 'INR',
        percentDisbursed: adminEvidence.metadata['percentDisbursed'] as number,
      }
    : undefined;

  // Extract spatial markers from telemetry
  const telemetryEvidence = state.evidence.find(
    (e) => e.agentId === 'telemetry' && e.status === 'completed'
  );
  const spatialMarkers = telemetryEvidence?.metadata?.['lat']
    ? [
        {
          lat: telemetryEvidence.metadata['lat'] as number,
          lng: telemetryEvidence.metadata['lng'] as number,
          label: telemetryEvidence.findings[0] ?? 'Anomaly detected',
          severity: telemetryEvidence.severity ?? 'moderate',
        },
      ]
    : undefined;

  // Extract vision images
  const visionEvidence = state.evidence.find(
    (e) => e.agentId === 'vision' && e.status === 'completed'
  );
  const evidenceImages = visionEvidence?.metadata?.['imageUrl']
    ? [
        {
          url: visionEvidence.metadata['imageUrl'] as string,
          severity: visionEvidence.severity ?? 'moderate',
          label: visionEvidence.findings[0] ?? 'Visual evidence',
        },
      ]
    : undefined;

  return {
    auditFinding: state.auditFinding ?? '',
    sources,
    budgetData,
    spatialMarkers,
    evidenceImages,
    pendingAction: state.pendingAction,
    contradictionVerified: state.contradictionVerified,
    debugTrace: state.debugTrace,
    totalLatencyMs: state.totalLatencyMs ?? Date.now() - state.startedAt,
  };
}
