import type { NormalizedEvidence, VigiaState } from './state';
import { rewriteQuery } from './rewriter';
import authorityMatrix from '../../data/authority-matrix.json';
import { describeIndexedCoverage, isContactOrRedressQuery } from '../data-coverage';
import { assessCriticalClaimSupport, formatUnsupportedCriticalClaims } from './claim-safety';

const DATA_VOID_CONFIDENCE_THRESHOLD = 0.5;
const DATA_VOID_MARKERS = ['No relevant data found', 'does not currently contain'];

interface AuthorityFallbackEntry {
  primary?: string;
  officer?: string;
  designation?: string;
  portal?: string;
  filingUrl?: string;
  phone?: string;
  escalation?: string;
  legalBasis: string;
}

interface AuthorityMatrixShape {
  authorities: {
    IN: Record<string, Record<string, AuthorityFallbackEntry | Record<string, AuthorityFallbackEntry>>>;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function isCitizenClaim(evidence: NormalizedEvidence[]): boolean {
  const vision = evidence.findLast((e) => e.agentId === 'vision');
  if (!vision) return false;
  return vision.citations.some((c) => c.trustLevel === 'citizen-claim');
}

/**
 * Extract a canonical highway number (e.g. "NH 77" → "77", "SH-15" → "15")
 * from free text. Returns null when no explicit road number is present.
 */
function extractRoadNumber(text: string): string | null {
  // Match NH/SH/MDR optionally followed by separators, then digits + optional suffix (e.g. 340C, 205A)
  const m = text.match(/\b(?:NH|SH|MDR)[\s-]*0*(\d+[A-Z]?)\b/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Relevance gate: when the user asks about a specific road number, the
 * retrieved evidence must actually mention that road. pgvector similarity
 * happily returns "nearby" roads (NH 340C for an NH 77 query), and the
 * admin agent can over-score them (cross-ref boost → 0.85). Without this
 * check the synthesizer reports unrelated personnel as the answer.
 */
function isRoadMismatch(queryText: string, admin: NormalizedEvidence): boolean {
  const queried = extractRoadNumber(queryText);
  if (!queried) return false; // no specific road asked — nothing to verify

  // Does any finding reference the queried road number?
  const haystack = admin.findings.join(' ');
  const found = new Set<string>();
  for (const m of haystack.matchAll(/\b(?:NH|SH|MDR)[\s-]*0*(\d+[A-Z]?)\b/gi)) {
    found.add(m[1].toUpperCase());
  }

  // If the evidence mentions road numbers but none match the query → mismatch.
  // If the evidence mentions NO road numbers at all (e.g. pure authority data),
  // don't treat it as a mismatch — let other checks decide.
  if (found.size === 0) return false;
  return !found.has(queried);
}

function getDataVoidReason(evidence: NormalizedEvidence[], queryText: string): string | null {
  const admin = evidence.findLast((e) => e.agentId === 'admin');
  if (!admin || admin.status === 'error' || admin.status === 'skipped') return 'admin evidence missing or unavailable';
  if (admin.confidence < DATA_VOID_CONFIDENCE_THRESHOLD) return `admin confidence ${admin.confidence.toFixed(2)} below ${DATA_VOID_CONFIDENCE_THRESHOLD.toFixed(2)}`;
  if (admin.findings.length === 0) return 'admin findings are empty';
  if (isRoadMismatch(queryText, admin)) return 'retrieved road identifier does not match the requested road';
  const asksForSanctionedCost = /\b(sanctioned|approved)\b.*\b(cost|budget|amount)\b|\b(cost|budget|amount)\b.*\b(sanctioned|approved)\b/i.test(queryText);
  const onlyArbitrationFigures = admin.findings.length > 0 && admin.findings.every((finding) =>
    /\barbitration\b/i.test(finding) || /not the sanctioned/i.test(finding)
  );
  if (asksForSanctionedCost && onlyArbitrationFigures) return 'only arbitration figures were retrieved for a sanctioned-cost query';
  if (admin.findings.some((f) =>
    DATA_VOID_MARKERS.some((marker) => f.includes(marker))
  )) return 'retrieval returned an explicit no-data marker';
  return null;
}

function isDataVoid(evidence: NormalizedEvidence[], queryText: string): boolean {
  return getDataVoidReason(evidence, queryText) !== null;
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

  const matrix = authorityMatrix as unknown as AuthorityMatrixShape;
  const roadAuthorities = matrix.authorities.IN[roadType];
  const authorities = roadAuthorities?.default && !('primary' in roadAuthorities.default)
    ? roadAuthorities.default as Record<string, AuthorityFallbackEntry>
    : roadAuthorities as Record<string, AuthorityFallbackEntry> | undefined;
  const data = authorities?.[intent] ?? authorities?.complaint;

  const queryText = state.payload.text ?? '';
  const coverage = describeIndexedCoverage(queryText);
  const shouldRouteToAuthority = isContactOrRedressQuery(state.intent, queryText);
  const criticalClaimFailures = formatUnsupportedCriticalClaims(
    assessCriticalClaimSupport(queryText, state.evidence),
  );
  const findings = !shouldRouteToAuthority
    ? [
        'This specific data is not available in the VIGIA index.',
        coverage,
        ...criticalClaimFailures,
        'VIGIA will not substitute an arbitration figure, a neighbouring jurisdiction, or an unrelated project for missing data.',
      ]
    : data
    ? [
        `VIGIA could not find specific data for your query in our indexed databases.`,
        coverage,
        ...criticalClaimFailures,
        `For ${intent} matters on ${roadType} roads:`,
        `→ Primary Authority: ${data.primary ?? data.officer}`,
        `→ Portal: ${data.portal ?? data.filingUrl}`,
        ...(data.phone ? [`→ Helpline: ${data.phone}`] : []),
        `→ Escalation: ${data.escalation ?? data.designation ?? 'Not published in the authority matrix'}`,
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
          state.payload.gps
            ? 'Find the responsible road authority for this location'
            : 'Attach location to identify the responsible authority',
          'Draft a complaint email using this photo',
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
  if (isDataVoid(state.evidence, state.payload.text ?? '')) {
    const dataVoidReason = getDataVoidReason(state.evidence, state.payload.text ?? '') ?? 'unknown reason';
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
          decision: `Data void detected (${dataVoidReason}) — rewritten query: "${rewritten}"`,
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

    const unsupportedClaimWarnings = formatUnsupportedCriticalClaims(
      assessCriticalClaimSupport(state.payload.text ?? '', state.evidence),
    );
    const warnings = [
      ...temporalWarnings,
      ...(consistencyWarning ? [consistencyWarning] : []),
      ...unsupportedClaimWarnings,
    ];

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
