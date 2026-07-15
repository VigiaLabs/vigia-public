import type { NormalizedEvidence } from './state';

function formatEmargDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

export function buildEmargRecordDisclosure(query: string, evidence: NormalizedEvidence[]): string | null {
  const idMatch = query.match(/\broadDetailsId\s*[:#-]?\s*(\d+)\b/i);
  if (!idMatch) return null;
  const roadDetailsId = idMatch[1];
  const asksForRole = /\b(?:construction|maintenance) contractor\b/i.test(query);
  const asksForMultipleFields = [
    /\bmaintenance start date\b/i,
    /\bsanctioned amount\b/i,
    /\bmaintenance expenditure\b/i,
    /\b(?:last physical relaying|last relaid|relaying date)\b/i,
  ].filter((pattern) => pattern.test(query)).length >= 2;
  if (!asksForRole || !asksForMultipleFields) return null;

  const completed = evidence.filter((item) => item.status === 'completed');
  const claims = completed.flatMap((item) => item.claims ?? [])
    .filter((claim) => claim.status === 'verified' && claim.subject === roadDetailsId);
  const source = completed.flatMap((item) => item.citations)
    .find((citation) => citation.sourceId === `emarg-road-${roadDetailsId}`);
  if (!source?.url || claims.length === 0) return null;

  const claim = (predicate: string) => claims.find((item) => item.predicate === predicate);
  const constructionContractor = claims.find((item) =>
    item.category === 'contract-role' &&
    (item.role === 'construction-contractor' || item.role === 'epc-contractor'));
  const maintenanceContractor = claim('maintenance-contractor');
  const maintenanceStart = claim('maintenance-contract-start');
  const maintenanceExpenditure = claim('maintenance-expenditure');
  const sanctionedAmount = claims.find((item) =>
    item.category === 'financial' && item.financialType === 'sanction');
  const physicalRelaying = claims.find((item) =>
    item.category === 'maintenance' &&
    ['physical-relaying', 'resurfacing', 'overlay', 'periodic-renewal'].includes(item.maintenanceType ?? '') &&
    item.dateKind === 'actual');
  const cite = (locator?: string) => `([source](${source.url}), field: \`${locator ?? 'not published'}\`)`;

  const lines = [`**eMARG roadDetailsId ${roadDetailsId}**`];
  if (constructionContractor) {
    lines.push(`- **Construction contractor:** **${constructionContractor.value}** ${cite(constructionContractor.sourceLocator)}`);
  } else if (maintenanceContractor) {
    lines.push(`- **Contractor role:** The record identifies **${maintenanceContractor.value}** as the **maintenance contractor**, not as a construction or EPC contractor. ${cite(maintenanceContractor.sourceLocator)}`);
  } else {
    lines.push(`- **Construction contractor:** Not published in this indexed eMARG record. ${cite()}`);
  }
  lines.push(maintenanceStart
    ? `- **Maintenance start date:** **${formatEmargDate(maintenanceStart.value)}** ${cite(maintenanceStart.sourceLocator)}`
    : `- **Maintenance start date:** Not published in this indexed eMARG record. ${cite()}`);
  lines.push(sanctionedAmount
    ? `- **Sanctioned amount:** **${sanctionedAmount.value} ${sanctionedAmount.unit ?? ''}** ${cite(sanctionedAmount.sourceLocator)}`
    : `- **Sanctioned amount:** Not published in this indexed eMARG record; maintenance expenditure is not substituted for sanction. ${cite()}`);
  lines.push(maintenanceExpenditure
    ? `- **Maintenance expenditure:** **₹${Number(maintenanceExpenditure.value).toLocaleString('en-IN')}** (eMARG consolidated gross expenditure). ${cite(maintenanceExpenditure.sourceLocator)}`
    : `- **Maintenance expenditure:** Not published in this indexed eMARG record. ${cite()}`);
  lines.push(physicalRelaying
    ? `- **Last physical relaying date:** **${formatEmargDate(physicalRelaying.value)}** ${cite(physicalRelaying.sourceLocator)}`
    : `- **Last physical relaying date:** Not published in this indexed eMARG record; the maintenance start date is not a physical relaying date. ${cite()}`);
  lines.push(`- **Document:** [${source.label}](${source.url})`);
  return lines.join('\n');
}
