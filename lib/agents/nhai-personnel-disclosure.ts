import type { NormalizedEvidence } from './state';

interface PersonnelRoute {
  roadNumber: string;
  district: string;
  authority: string;
  name: string;
  designation: string;
  phone: string;
  email: string;
  documentDate: string;
  sourceId: string;
}

export function buildNhaiPersonnelDisclosure(query: string, evidence: NormalizedEvidence[]): string | null {
  if (!/\bNH[-\s]?163G\b/i.test(query) || !/\b(phone|contact|executive engineer|officer)\b/i.test(query)) return null;
  const admin = evidence.findLast((item) => item.agentId === 'admin' && item.status === 'completed');
  const route = admin?.metadata?.personnelRoute as PersonnelRoute | undefined;
  if (!route || route.roadNumber !== 'NH-163G') return null;
  const source = admin?.citations.find((citation) => citation.sourceId === route.sourceId);
  if (!source?.url) return null;
  const cite = `[official NHAI source, p. ${source.pageNumber ?? 43}](${source.url})`;

  return [
    '**Verified road-to-authority routing**',
    `1. **Road:** ${route.roadNumber} — the NHAI project document covers the Warangal–Khammam section. (${cite})`,
    `2. **District:** ${route.district}, ${admin?.metadata?.extractedEntities && (admin.metadata.extractedEntities as Record<string, string>).state ? (admin.metadata.extractedEntities as Record<string, string>).state : 'Telangana'}. (${cite})`,
    `3. **NH authority:** ${route.authority}. This is an NHAI project contact, not the Telangana R&B district-road directory. (${cite})`,
    '',
    '**Official project contact in the indexed document**',
    `- **Name:** ${route.name} (${cite})`,
    `- **Designation:** ${route.designation} (${cite})`,
    `- **Phone:** **${route.phone}** (${cite})`,
    `- **Email:** ${route.email} (${cite})`,
    '',
    `The source calls this official the **Project Director**, not an Executive Engineer. The contact comes from a ${route.documentDate} NHAI project RFP, so it should be revalidated if a current office-holder is required.`,
  ].join('\n');
}

export function buildNhaiComplaintDisclosure(query: string, evidence: NormalizedEvidence[]): string | null {
  if (!/\bNH[-\s]?163G\b/i.test(query) || !/\b(complaint|pothole|report)\b/i.test(query)) return null;
  const admin = evidence.findLast((item) => item.agentId === 'admin' && item.status === 'completed');
  if (!admin) return null;
  const findings = admin.findings.join('\n');
  const authority = findings.match(/Complaint authority:\s*(.+)/i)?.[1]?.trim();
  const portal = findings.match(/Portal:\s*(https:\/\/\S+)/i)?.[1]?.replace(/[.,;]+$/, '');
  const helpline = findings.match(/Helpline:\s*([^\n]+)/i)?.[1]?.replace(/[.,;]+$/, '').trim();
  const authoritySource = admin.citations.find((citation) => citation.sourceId === 'complaint-authority');
  const roadSource = admin.citations.find((citation) => citation.sourceId.startsWith('nhai_contract-'));
  if (!authority || !portal || !helpline || !authoritySource?.url || !roadSource?.url) return null;

  return [
    '**Verified NH-163G complaint route**',
    `- VIGIA found exact indexed project records for **NH-163G**. ([NHAI project source](${roadSource.url}))`,
    `- **Responsible authority:** ${authority}. ([official authority source](${authoritySource.url}))`,
    `- **Complaint portal:** [${portal}](${portal})`,
    `- **Official helpline:** **${helpline}**`,
    '- Project evidence and complaint-routing evidence are kept separate; no State PWD officer is substituted as the NHAI project authority.',
  ].join('\n');
}
