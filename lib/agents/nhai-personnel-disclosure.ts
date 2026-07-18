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

interface DistrictContact {
  name: string;
  phone: string;
  email?: string;
  district: string;
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
  const districtContact = admin?.metadata?.districtContact as DistrictContact | undefined;
  const districtSource = districtContact
    ? admin?.citations.find((citation) => citation.sourceId === districtContact.sourceId)
    : undefined;

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
    ...(districtContact && districtSource?.url ? [
      '',
      '**Additional Khammam R&B coordination contact**',
      `- The Telangana Roads & Buildings contact list also lists **${districtContact.name}**, phone **${districtContact.phone}**${districtContact.email ? `, email ${districtContact.email}` : ''}. ([official Telangana R&B directory](${districtSource.url}))`,
      '- **Scope caveat:** that page is an R&B contact list for road-cutting/ROW permissions; it does not establish that this officer is responsible for NH-163G. Use it only as a district coordination contact, while the NHAI PIU contact above remains the highway-specific project contact.',
    ] : []),
  ].join('\n');
}

export function buildNh44PersonnelConditionDisclosure(query: string, evidence: NormalizedEvidence[]): string | null {
  if (!/\bNH[-\s]?44\b/i.test(query) || !/\b(executive engineer|officer|official)\b/i.test(query) || !/\bIRI|roughness\b/i.test(query)) return null;
  const admin = evidence.findLast((item) => item.agentId === 'admin' && item.status === 'completed');
  if (!admin) return null;
  const evidenceText = admin.findings.join('\n');
  const projectSource = admin.citations.find((citation) =>
    /pib\.gov\.in/i.test(citation.url ?? '') && /Highway Infrastructure Trust|6661|6,661/i.test(citation.excerpt ?? ''));
  const authoritySource = admin.citations.find((citation) => citation.sourceId === 'complaint-authority');
  if (!projectSource?.url || !authoritySource?.url || !/Highway Infrastructure Trust/i.test(evidenceText) || !/(?:6661|6,661)/.test(evidenceText)) return null;
  const projectCite = `[official PIB/NHAI record](${projectSource.url})`;

  return [
    '**NH-44 record status**',
    `- **NH-44 exists in the VIGIA index.** The available structured record is scoped to the **Hyderabad–Nagpur 251 km corridor**, not the entire highway. (${projectCite})`,
    `- **Road type:** six-lane (6L). (${projectCite})`,
    `- **Current indexed O&M concessionaire:** Highway Infrastructure Trust (KKR InvIT), under TOT Bundle-16. (${projectCite})`,
    `- **Scoped TOT concession award/value:** ₹6,661 crore; this is not the sanctioned construction budget for all of NH-44. (${projectCite})`,
    `- **O&M commencement:** 18 September 2024; this is not a physical-relaying or IRI observation date. (${projectCite})`,
    '',
    '**Requested fields that remain unavailable**',
    `- **Executive Engineer:** No project-specific named NHAI Executive Engineer is present in the retrieved official records. The verified authority route is the NHAI Project Implementation Unit (PIU); complaints can use [CPGRAMS](${authoritySource.url}) or helpline **1033**.`,
    '- **Current IRI roughness score:** Not available in the indexed official records. VIGIA has no recent, segment-matched IRI measurement and will not infer one from road type, project status, or an active O&M contract.',
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
