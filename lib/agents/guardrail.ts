import type { NormalizedEvidence, DebugTraceEntry, VigiaState } from './state';

/**
 * Check if vision evidence is a citizen claim (zero-trust model).
 */
function isCitizenClaim(evidence: NormalizedEvidence[]): boolean {
  const vision = evidence.find((e) => e.agentId === 'vision');
  if (!vision) return false;
  return vision.citations.some((c) => c.trustLevel === 'citizen-claim');
}

/**
 * Hardened contradiction detection.
 * Both agents must be completed with high confidence before triggering.
 * Citizen claims are excluded — they cannot trigger contradictions.
 */
function detectContradiction(evidence: NormalizedEvidence[]): boolean {
  const admin = evidence.find((e) => e.agentId === 'admin');
  const vision = evidence.find((e) => e.agentId === 'vision');

  if (!admin || !vision) return false;
  if (admin.status !== 'completed' || vision.status !== 'completed') return false;
  if (vision.confidence < 0.7) return false;

  // Citizen claims cannot override official records
  if (vision.citations.some((c) => c.trustLevel === 'citizen-claim')) return false;

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
  // Citizen claim: set pending action for user follow-up, skip contradiction
  if (isCitizenClaim(state.evidence)) {
    const vision = state.evidence.find((e) => e.agentId === 'vision')!;
    const trace: DebugTraceEntry = {
      node: 'guardrail',
      timestamp: Date.now(),
      decision: 'Citizen claim detected — setting pending action for user review, no contradiction triggered',
    };
    return {
      contradictionDetected: false,
      pendingAction: {
        type: 'flag-for-review',
        coordinates: state.payload.gps,
        visionFindings: vision.findings,
        suggestedActions: [
          'Flag this coordinate for official PWD review',
          'Verify against DePIN telemetry data',
        ],
      },
      pipelineStatus: 'synthesizing',
      debugTrace: [trace],
    };
  }

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
