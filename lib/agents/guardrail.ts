import type { NormalizedEvidence, DebugTraceEntry, VigiaState } from './state';
import { rewriteQuery } from './rewriter';
import authorityMatrix from '../../data/authority-matrix.json';

const DATA_VOID_CONFIDENCE_THRESHOLD = 0.5;
const DATA_VOID_MARKERS = ['No relevant data found', 'does not currently contain'];

// ─── Helpers ────────────────────────────────────────────────────────

function isCitizenClaim(evidence: NormalizedEvidence[]): boolean {
  const vision = evidence.findLast((e) => e.agentId === 'vision');
  if (!vision) return false;
  return vision.citations.some((c) => c.trustLevel === 'citizen-claim');
}

function isDataVoid(evidence: NormalizedEvidence[]): boolean {
  const admin = evidence.findLast((e) => e.agentId === 'admin');
  if (!admin || admin.status === 'error' || admin.status === 'skipped') return true;
  if (admin.confidence < DATA_VOID_CONFIDENCE_THRESHOLD) return true;
  if (admin.findings.length === 0) return true;
  return admin.findings.some((f) =>
    DATA_VOID_MARKERS.some((marker) => f.includes(marker))
  );
}

function detectContradiction(evidence: NormalizedEvidence[]): boolean {
  const admin = evidence.findLast((e) => e.agentId === 'admin');
  const vision = evidence.findLast((e) => e.agentId === 'vision');

  if (!admin || !vision) return false;
  if (admin.status !== 'completed' || vision.status !== 'completed') return false;
  if (vision.confidence < 0.7) return false;
  if (vision.citations.some((c) => c.trustLevel === 'citizen-claim')) return false;

  const adminClaimsCompliant = admin.findings.some((f) =>
    /compliant|completed|satisfactor/i.test(f)
  );
  const visionShowsDamage =
    vision.severity === 'severe' || vision.severity === 'critical';

  return adminClaimsCompliant && visionShowsDamage;
}

function extractRoadType(evidence: NormalizedEvidence[]): string {
  const admin = evidence.findLast((e) => e.agentId === 'admin');
  const roadNumber = admin?.metadata?.['roadNumber'] as string | undefined;
  if (roadNumber?.startsWith('NH')) return 'NH';
  if (roadNumber?.startsWith('SH')) return 'SH';
  return 'NH';
}

/**
 * 5.1 Temporal Coherence Check
 * Detects findings that reference future dates as completed events.
 */
function checkTemporalCoherence(findings: string[]): string[] {
  const now = new Date();
  const warnings: string[] = [];
  for (const f of findings) {
    const dateMatches = f.match(/\b(20\d{2}[-/]\d{2}[-/]\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})\b/g);
    if (dateMatches) {
      for (const d of dateMatches) {
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime()) && parsed > now && /completed|finished|done/i.test(f)) {
          warnings.push(`⚠️ TEMPORAL INCONSISTENCY: "${f.slice(0, 100)}" references a future date as completed.`);
        }
      }
    }
  }
  return warnings;
}

/**
 * 5.2 Cross-Agent Consistency Validation
 * Verifies admin and telemetry are discussing the same road/project.
 */
function validateCrossAgentConsistency(evidence: NormalizedEvidence[]): string | null {
  const admin = evidence.findLast(e => e.agentId === 'admin' && e.status === 'completed');
  const telemetry = evidence.findLast(e => e.agentId === 'telemetry' && e.status === 'completed');
  if (!admin || !telemetry) return null;

  const adminRoad = admin.metadata?.['roadNumber'] as string | undefined;
  const telemetryRoad = telemetry.metadata?.['roadNumber'] as string | undefined;

  if (adminRoad && telemetryRoad && adminRoad !== telemetryRoad) {
    return `⚠️ CROSS-AGENT MISMATCH: Admin references ${adminRoad} but telemetry detected ${telemetryRoad}. Results may be about different roads.`;
  }
  return null;
}

function buildAuthorityFallback(state: VigiaState): Partial<VigiaState> {
  const intent = state.intent === 'rti' ? 'rti' : 'complaint';
  const roadType = extractRoadType(state.evidence);

  const matrix = authorityMatrix as any;
  const authorities = matrix?.authorities?.IN?.[roadType];
  const data = authorities?.[intent] ?? authorities?.complaint;

  const findings = data
    ? [
        `VIGIA could not find specific data for your query in our indexed databases.`,
        `For ${intent} matters on ${roadType} roads:`,
        `→ Primary Authority: ${data.primary}`,
        `→ Portal: ${data.portal}`,
        ...(data.phone ? [`→ Helpline: ${data.phone}`] : []),
        `→ Escalation: ${data.escalation}`,
        `→ Legal Basis: ${data.legalBasis}`,
      ]
    : [
        `VIGIA could not find specific data for your query.`,
        `National Helpline: 1033 (NHAI) | Portal: https://pgportal.gov.in`,
      ];

  return {
    auditFinding: findings.join('\n'),
    contradictionDetected: false,
    pipelineStatus: 'complete',
    debugTrace: [{
      node: 'guardrail',
      timestamp: Date.now(),
      decision: `Data void persists after retry — Authority Matrix fallback (intent="${intent}", roadType="${roadType}")`,
    }],
  };
}

// ─── Main Node ──────────────────────────────────────────────────────

/**
 * Node 3: Guardrail (Self-Reflective RAG)
 *
 * Implements CRAG pattern: retrieval grading → query rewrite → retry.
 * Uses .findLast() to always evaluate most recent evidence after retries.
 */
export async function guardrailNode(
  state: VigiaState
): Promise<Partial<VigiaState>> {
  // 1. Citizen claim — skip all checks
  if (isCitizenClaim(state.evidence)) {
    const vision = state.evidence.findLast((e) => e.agentId === 'vision')!;
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
      debugTrace: [{
        node: 'guardrail',
        timestamp: Date.now(),
        decision: 'Citizen claim detected — pending action for user review',
      }],
    };
  }

  // 2. Data Void detection
  if (isDataVoid(state.evidence)) {
    if (state.retryCount === 0) {
      const rewritten = await rewriteQuery(
        state.payload.text ?? '',
        state.intent,
        'data-void'
      );
      return {
        contradictionDetected: false,
        retryCount: 1,
        retryQuery: rewritten,
        pipelineStatus: 'retrying',
        debugTrace: [{
          node: 'guardrail',
          timestamp: Date.now(),
          decision: `Data void detected (low confidence) — rewritten query: "${rewritten}"`,
        }],
      };
    }
    return buildAuthorityFallback(state);
  }

  // 3. Contradiction detection
  const contradiction = detectContradiction(state.evidence);

  if (!contradiction) {
    // 5.1 Temporal coherence check
    const admin = state.evidence.findLast(e => e.agentId === 'admin');
    const temporalWarnings = admin ? checkTemporalCoherence(admin.findings) : [];

    // 5.2 Cross-agent consistency
    const consistencyWarning = validateCrossAgentConsistency(state.evidence);

    const warnings = [...temporalWarnings, ...(consistencyWarning ? [consistencyWarning] : [])];

    return {
      contradictionDetected: false,
      pipelineStatus: 'synthesizing',
      ...(warnings.length > 0 && {
        auditFinding: warnings.join('\n'),
      }),
      debugTrace: [{
        node: 'guardrail',
        timestamp: Date.now(),
        decision: warnings.length > 0
          ? `No contradiction — but ${warnings.length} coherence warning(s) appended`
          : 'No contradiction detected — proceeding to synthesis',
      }],
    };
  }

  // Contradiction on first pass — rewrite and retry
  if (state.retryCount === 0) {
    const rewritten = await rewriteQuery(
      state.payload.text ?? '',
      state.intent,
      'contradiction'
    );
    return {
      contradictionDetected: true,
      retryCount: 1,
      retryQuery: rewritten,
      pipelineStatus: 'retrying',
      debugTrace: [{
        node: 'guardrail',
        timestamp: Date.now(),
        decision: `Contradiction detected — rewritten query: "${rewritten}"`,
      }],
    };
  }

  // Contradiction persists after retry
  return {
    contradictionDetected: true,
    contradictionVerified: true,
    pipelineStatus: 'synthesizing',
    debugTrace: [{
      node: 'guardrail',
      timestamp: Date.now(),
      decision: 'Contradiction persists after retry — flagging as verified discrepancy.',
    }],
  };
}
