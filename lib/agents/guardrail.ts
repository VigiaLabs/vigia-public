import type { NormalizedEvidence, DebugTraceEntry, VigiaState } from './state';

/**
 * Hardened contradiction detection.
 * Both agents must be completed with high confidence before triggering.
 */
function detectContradiction(evidence: NormalizedEvidence[]): boolean {
  const admin = evidence.find((e) => e.agentId === 'admin');
  const vision = evidence.find((e) => e.agentId === 'vision');

  if (!admin || !vision) return false;
  if (admin.status !== 'completed' || vision.status !== 'completed') return false;
  if (vision.confidence < 0.7) return false;

  const adminClaimsCompliant = admin.findings.some((f) =>
    /compliant|completed|satisfactor/i.test(f)
  );
  const visionShowsDamage =
    vision.severity === 'severe' || vision.severity === 'critical';

  return adminClaimsCompliant && visionShowsDamage;
}

/**
 * Node 3: Guardrail
 *
 * Pure TypeScript — zero LLM tokens.
 * Detects contradictions between admin (paper) and vision (ground truth).
 * Controls the 1-retry loop via retryCount.
 */
export function guardrailNode(
  state: VigiaState
): Partial<VigiaState> {
  const contradiction = detectContradiction(state.evidence);

  // No contradiction — proceed to synthesis
  if (!contradiction) {
    const trace: DebugTraceEntry = {
      node: 'guardrail',
      timestamp: Date.now(),
      decision: 'No contradiction detected — proceeding to synthesis',
    };
    return {
      contradictionDetected: false,
      pipelineStatus: 'synthesizing',
      debugTrace: [trace],
    };
  }

  // Contradiction on first pass — trigger retry
  if (state.retryCount === 0) {
    const trace: DebugTraceEntry = {
      node: 'guardrail',
      timestamp: Date.now(),
      decision: 'Contradiction detected: paper claims compliant but vision shows severe damage. Retrying admin with amendment query.',
    };
    return {
      contradictionDetected: true,
      retryCount: 1,
      retryQuery: 'amendment clauses OR variation orders OR phase 2',
      pipelineStatus: 'retrying',
      debugTrace: [trace],
    };
  }

  // Contradiction persists after retry — verify and proceed
  const trace: DebugTraceEntry = {
    node: 'guardrail',
    timestamp: Date.now(),
    decision: 'Contradiction persists after retry — flagging as verified discrepancy.',
  };
  return {
    contradictionDetected: true,
    contradictionVerified: true,
    pipelineStatus: 'synthesizing',
    debugTrace: [trace],
  };
}
