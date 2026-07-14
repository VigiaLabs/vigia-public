import type { NormalizedEvidence } from './state';

export type CriticalClaimKind = 'construction-role' | 'spending' | 'physical-relaying' | 'present-safety';

export interface CriticalClaimAssessment {
  kind: CriticalClaimKind;
  supported: boolean;
  reason: string;
  forbiddenSubstitutions: string[];
}

function completedEvidence(evidence: NormalizedEvidence[]): NormalizedEvidence[] {
  return evidence.filter((item) => item.status === 'completed');
}

function hasVerifiedClaim(
  evidence: NormalizedEvidence[],
  predicate: (claim: NonNullable<NormalizedEvidence['claims']>[number]) => boolean,
): boolean {
  return completedEvidence(evidence).some((item) =>
    (item.claims ?? []).some((claim) => claim.status === 'verified' && predicate(claim)),
  );
}

function assessConstructionRole(query: string, evidence: NormalizedEvidence[]): CriticalClaimAssessment | null {
  if (!/\b(who built|built by|construction contractor|epc contractor|constructed by)\b/i.test(query)) return null;

  const supported = hasVerifiedClaim(
    evidence,
    (claim) => claim.category === 'contract-role' &&
      (claim.role === 'construction-contractor' || claim.role === 'epc-contractor'),
  );

  return {
    kind: 'construction-role',
    supported,
    reason: supported
      ? 'Construction/EPC contractor evidence is present.'
      : 'No verified construction or EPC contractor is present for the requested road section.',
    forbiddenSubstitutions: ['concessionaire', 'O&M operator', 'implementing authority'],
  };
}

function assessSpending(query: string, evidence: NormalizedEvidence[]): CriticalClaimAssessment | null {
  if (!/\b(amount spent|spent|expenditure|paid|payments?|disbursed|actual spend)\b/i.test(query)) return null;

  const supported = hasVerifiedClaim(
    evidence,
    (claim) => claim.category === 'financial' &&
      (claim.financialType === 'payment' || claim.financialType === 'expenditure'),
  );

  return {
    kind: 'spending',
    supported,
    reason: supported
      ? 'Payment or expenditure evidence is present.'
      : 'No verified payment or expenditure record is present for the requested project.',
    forbiddenSubstitutions: ['sanctioned amount', 'estimated cost', 'award value', 'concession value'],
  };
}

function assessPhysicalRelaying(query: string, evidence: NormalizedEvidence[]): CriticalClaimAssessment | null {
  if (!/\b(last relaid|last relayed|relaying date|resurfaced|resurfacing date|periodic renewal|overlay date)\b/i.test(query)) return null;

  const supported = hasVerifiedClaim(
    evidence,
    (claim) => claim.category === 'maintenance' &&
      ['physical-relaying', 'resurfacing', 'overlay', 'periodic-renewal'].includes(claim.maintenanceType ?? '') &&
      claim.dateKind === 'actual',
  );

  return {
    kind: 'physical-relaying',
    supported,
    reason: supported
      ? 'A verified physical renewal event with an actual date is present.'
      : 'No verified physical relaying, resurfacing, overlay, or periodic-renewal event with an actual date is present.',
    forbiddenSubstitutions: ['O&M commencement', 'inspection date', 'contract award date', 'general completion date'],
  };
}

function assessPresentSafety(query: string, evidence: NormalizedEvidence[]): CriticalClaimAssessment | null {
  if (!/\b(is it safe|is this road safe|safe today|safe to (?:drive|travel)|road safety now|current safety)\b/i.test(query)) return null;

  const supported = hasVerifiedClaim(
    evidence,
    (claim) => claim.category === 'condition' && Boolean(claim.observedAt),
  );

  return {
    kind: 'present-safety',
    supported,
    reason: supported
      ? 'Recent condition or telemetry evidence is present.'
      : 'No recent, segment-matched PCI, IRI, inspection, hazard, or telemetry evidence is present.',
    forbiddenSubstitutions: ['project completion', 'active O&M contract', 'road classification', 'historical condition without observation date'],
  };
}

export function assessCriticalClaimSupport(
  query: string,
  evidence: NormalizedEvidence[],
): CriticalClaimAssessment[] {
  return [
    assessConstructionRole(query, evidence),
    assessSpending(query, evidence),
    assessPhysicalRelaying(query, evidence),
    assessPresentSafety(query, evidence),
  ].filter((assessment): assessment is CriticalClaimAssessment => assessment !== null);
}

export function formatUnsupportedCriticalClaims(assessments: CriticalClaimAssessment[]): string[] {
  return assessments
    .filter((assessment) => !assessment.supported)
    .flatMap((assessment) => [
      `VIGIA cannot verify the requested ${assessment.kind}: ${assessment.reason}`,
      `Forbidden substitutes: ${assessment.forbiddenSubstitutions.join(', ')}.`,
    ]);
}
