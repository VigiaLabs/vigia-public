import type { EvidenceClaim, NormalizedEvidence, PendingAction } from '@/lib/agents/state';

type Gps = { lat: number; lng: number };

type ComplaintSource = {
  id: string;
  label: string;
  trustLevel: 'official-portal';
  url: string;
  documentTitle: string;
  excerpt: string;
  sourceLocator: string;
};

type ComplaintAuthority = {
  id: string;
  locationLabel: string;
  authority: string;
  designation: string;
  officerName?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  portal?: string;
  address?: string;
  ownershipCaveat: string;
  source: ComplaintSource;
  filingSource?: ComplaintSource;
};

export type ComplaintDisclosure = {
  text: string;
  sources: ComplaintSource[];
  claims: EvidenceClaim[];
  pendingAction: PendingAction;
};

const CHENNAI_ROADS: ComplaintAuthority = {
  id: 'gcc-bus-route-roads',
  locationLabel: 'Chennai, Tamil Nadu',
  authority: 'Greater Chennai Corporation — Bus Route Roads Department',
  designation: 'Superintending Engineer (Bus Route Roads)',
  officerName: 'N. Thirumurugan',
  phone: '9445190735',
  alternatePhone: '044-25619290',
  email: 'sebrr@chennaicorporation.gov.in',
  portal: 'https://erp.chennaicorporation.gov.in/pgr/indexpgr.jsp',
  address: 'Greater Chennai Corporation, Ripon Building, Chennai-600003',
  ownershipCaveat: 'This is the verified Chennai municipal road contact. A photo or GPS point alone does not prove that the affected road is a GCC Bus Route Road rather than an NHAI, Tamil Nadu Highways, private, or other agency road.',
  source: {
    id: 'gcc-bus-route-roads-department',
    label: 'Greater Chennai Corporation — Roads Department',
    trustLevel: 'official-portal',
    url: 'https://chennaicorporation.gov.in/gcc/department/road/',
    documentTitle: 'Greater Chennai Corporation Roads Department',
    excerpt: 'N.Thirumurugan Superintending Engineer (Bus Route Roads) Greater Chennai Corporation Ripon Building,Chennai-600003 9445190735/ 25619290 sebrr@chennaicorporation.gov.in',
    sourceLocator: 'Department Head — Bus Route Roads',
  },
  filingSource: {
    id: 'gcc-public-grievance-system',
    label: 'Greater Chennai Corporation — Public Grievance System',
    trustLevel: 'official-portal',
    url: 'https://erp.chennaicorporation.gov.in/pgr/indexpgr.jsp',
    documentTitle: 'Greater Chennai Corporation Public Grievance and Redressal System',
    excerpt: 'Call 1913 to register your complaint. Send your Grievance to The Commissioner, Greater Chennai Corporation, Ripon Building, EVR Salai, Chennai-600003.',
    sourceLocator: 'Register Complaint via Phone / Internet',
  },
};

const KHAMMAM_RB: ComplaintAuthority = {
  id: 'telangana-rb-khammam',
  locationLabel: 'Khammam district, Telangana',
  authority: 'Telangana Roads & Buildings Department — Khammam Division',
  designation: 'Executive Engineer, R&B Division, Khammam',
  phone: '9440818085',
  email: 'eerb_kmm@yahoo.co.in',
  address: 'R&B Division Office, Khammam',
  ownershipCaveat: 'This is the verified district R&B coordination contact. It does not by itself prove that the photographed road is maintained by Telangana R&B or that this officer is responsible for a National Highway.',
  source: {
    id: 'telangana-rb-contacts-khammam',
    label: 'Telangana Roads & Buildings Department Contacts',
    trustLevel: 'official-portal',
    url: 'https://tg-roadcutting.cgg.gov.in/ContactUs',
    documentTitle: 'Roads & Buildings Department Office — R & B Contacts List',
    excerpt: 'Executive Engineer, Khammam | 9440818085 | eerb_kmm@yahoo.co.in',
    sourceLocator: 'Khammam R&B Division contact row',
  },
};

export function isCitizenComplaintQuery(query: string): boolean {
  const isExplicitLookup = /\b(?:NH|SH|MDR)\s*-?\s*\d+[A-Z]*\b|\broadDetailsId\b|\bwhere should I file\b/i.test(query);
  const isFirstPersonReport = /\b(?:help me|I (?:found|saw|have)|there(?:'s| is)|near me|my location|this (?:pothole|road damage|road hazard)|report this)\b/i.test(query);

  if (isExplicitLookup && !isFirstPersonReport) return false;

  return /\b(?:pothole|road damage|damaged road|broken road|road hazard|file (?:a )?complaint|report (?:this|a)|help me)\b/i.test(query);
}

function gpsLooksLikeChennai(gps?: Gps): boolean {
  if (!gps) return false;
  return gps.lat >= 12.85 && gps.lat <= 13.30 && gps.lng >= 80.05 && gps.lng <= 80.40;
}

function resolveAuthority(query: string, gps?: Gps): { authority?: ComplaintAuthority; locationBasis: string } {
  if (/\b(chennai|madras)\b/i.test(query)) {
    return { authority: CHENNAI_ROADS, locationBasis: 'the location stated in your message' };
  }
  if (/\bkhammam\b/i.test(query)) {
    return { authority: KHAMMAM_RB, locationBasis: 'the district stated in your message' };
  }
  if (gpsLooksLikeChennai(gps)) {
    return { authority: CHENNAI_ROADS, locationBasis: 'the shared GPS point, which falls inside VIGIA’s conservative Chennai routing area' };
  }
  return {
    locationBasis: gps
      ? 'the shared GPS point; VIGIA does not yet have a verified local authority mapping for this coordinate'
      : 'no usable location was provided',
  };
}

function cleanVisionFindings(vision?: NormalizedEvidence): string[] {
  return (vision?.findings ?? [])
    .filter((finding) => !finding.startsWith('Note:'))
    .map((finding) => finding.replace(/^\[CITIZEN CLAIM\]\s*/i, ''))
    .slice(0, 4);
}

function buildDraft(authority: ComplaintAuthority, gps: Gps | undefined, findings: string[]): { subject: string; body: string } {
  const location = gps
    ? `${authority.locationLabel} (GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`
    : authority.locationLabel;
  const observation = findings.length > 0
    ? findings.map((finding) => `- ${finding}`).join('\n')
    : '- A citizen reports a large pothole/road-surface hazard. Please verify the condition on site.';
  return {
    subject: `Road hazard inspection request — ${authority.locationLabel}`,
    body: [
      `To: ${authority.designation}`,
      '',
      'I am reporting a road-surface hazard that may endanger road users.',
      '',
      `Location: ${location}`,
      'Observed condition:',
      observation,
      '',
      'Please inspect the location, confirm road ownership, and arrange the appropriate safety or repair action. A citizen photograph is attached where available.',
      '',
      'This draft was prepared by VIGIA and has not been sent automatically.',
    ].join('\n'),
  };
}

export function buildCitizenComplaintDisclosure(
  query: string,
  gps?: Gps,
  vision?: NormalizedEvidence,
): ComplaintDisclosure | null {
  if (!isCitizenComplaintQuery(query) && !vision) return null;

  const findings = cleanVisionFindings(vision);
  const { authority, locationBasis } = resolveAuthority(query, gps);

  if (!authority) {
    const visible = findings.length > 0
      ? ['**What I can see in the photo**', ...findings.map((finding) => `- ${finding}`), '']
      : [];
    return {
      text: [
        ...visible,
        '**I need the location to route this safely**',
        `VIGIA received ${locationBasis}. Enable location sharing or tell me the city/district and road name. I will not guess an officer from a nearby jurisdiction.`,
      ].join('\n'),
      sources: [],
      claims: [],
      pendingAction: {
        type: 'contact-authority',
        coordinates: gps,
        visionFindings: findings,
        suggestedActions: ['Use my current location', 'I will provide the city, district, and road name'],
      },
    };
  }

  const draft = buildDraft(authority, gps, findings);
  const sources = [authority.source, ...(authority.filingSource ? [authority.filingSource] : [])];
  const visible = findings.length > 0
    ? [
        '**What I can see in the photo**',
        `- Citizen-photo assessment: ${vision?.severity ?? 'unclassified'} (${Math.round((vision?.confidence ?? 0) * 100)}% model confidence).`,
        ...findings.map((finding) => `- ${finding}`),
        '- This remains an unverified citizen submission until an authority inspects the site.',
        '',
      ]
    : [
        '**Report understood**',
        '- You reported a large pothole/road-surface hazard. No visual condition claim is made because no photo assessment is available.',
        '',
      ];

  const phoneText = [authority.phone, authority.alternatePhone].filter(Boolean).join(' / ');
  const answer = [
    ...visible,
    '**Recommended complaint route**',
    `- Location basis: ${locationBasis}.`,
    `- Authority contact: **${authority.designation}**, ${authority.authority}.`,
    ...(authority.officerName ? [`- Published department head: **${authority.officerName}**.`] : []),
    ...(phoneText ? [`- Phone: **${phoneText}**${authority.id === 'gcc-bus-route-roads' ? '; GCC complaint number: **1913**' : ''}.`] : []),
    ...(authority.email ? [`- Email: **${authority.email}**.`] : []),
    ...(authority.portal ? [`- Official complaint portal: ${authority.portal}`] : []),
    `- Jurisdiction caveat: ${authority.ownershipCaveat}`,
    '',
    '**Draft complaint email**',
    `**Subject:** ${draft.subject}`,
    '',
    draft.body,
  ].join('\n');

  const claims: EvidenceClaim[] = [
    {
      category: 'authority-contact',
      status: 'verified',
      subject: authority.designation,
      predicate: 'contact-phone',
      value: authority.phone,
      sourceId: authority.source.id,
      sourceQuote: authority.source.excerpt,
      sourceLocator: authority.source.sourceLocator,
      retrievedAt: new Date().toISOString(),
    },
    ...(authority.email ? [{
      category: 'authority-contact' as const,
      status: 'verified' as const,
      subject: authority.designation,
      predicate: 'contact-email',
      value: authority.email,
      sourceId: authority.source.id,
      sourceQuote: authority.source.excerpt,
      sourceLocator: authority.source.sourceLocator,
      retrievedAt: new Date().toISOString(),
    }] : []),
  ];

  return {
    text: answer,
    sources,
    claims,
    pendingAction: {
      type: 'contact-authority',
      coordinates: gps,
      visionFindings: findings,
      suggestedActions: ['Verify whether this road is maintained by this authority'],
      authority: {
        name: authority.authority,
        designation: authority.designation,
        officerName: authority.officerName,
        phone: authority.phone,
        email: authority.email,
        portal: authority.portal,
        sourceUrl: authority.source.url,
        jurisdictionNote: authority.ownershipCaveat,
      },
      complaintDraft: draft,
    },
  };
}
