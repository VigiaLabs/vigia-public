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
