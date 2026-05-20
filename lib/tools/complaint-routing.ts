'use server';

// Complaint routing tool
// Maps road type + state to correct authority for filing complaints
// Based on MoRTH jurisdiction guidelines

export interface ComplaintAuthority {
  name: string;
  jurisdiction: string;
  complaintPortal: string;
  phone: string | null;
  email: string | null;
  escalationAuthority: string;
  source: string;
  sourceUrl: string;
}

const COMPLAINT_ROUTING: Record<string, ComplaintAuthority> = {
  NH: {
    name: 'NHAI Project Implementation Unit (PIU)',
    jurisdiction: 'National Highways',
    complaintPortal: 'https://pgportal.gov.in',
    phone: '1033',
    email: 'feedback@nhai.org',
    escalationAuthority: 'Ministry of Road Transport and Highways',
    source: 'NHAI Grievance Redressal',
    sourceUrl: 'https://nhai.gov.in/grievance-redressal',
  },
  SH: {
    name: 'State Public Works Department (PWD)',
    jurisdiction: 'State Highways',
    complaintPortal: 'https://pgportal.gov.in',
    phone: null,
    email: null,
    escalationAuthority: 'State Chief Engineer (Roads)',
    source: 'State PWD Grievance Cell',
    sourceUrl: 'https://pgportal.gov.in',
  },
  MDR: {
    name: 'District Collector Office',
    jurisdiction: 'Major District Roads and Rural Roads',
    complaintPortal: 'https://pgportal.gov.in',
    phone: null,
    email: null,
    escalationAuthority: 'Divisional Commissioner',
    source: 'District Administration',
    sourceUrl: 'https://pgportal.gov.in',
  },
  rural: {
    name: 'Gram Panchayat / Block Development Officer',
    jurisdiction: 'Village and Rural Roads',
    complaintPortal: 'https://pgportal.gov.in',
    phone: null,
    email: null,
    escalationAuthority: 'District Collector',
    source: 'PMGSY Grievance Mechanism',
    sourceUrl: 'https://pmgsy.nic.in',
  },
};

// State-specific overrides for complaint portals
const STATE_PORTALS: Record<string, string> = {
  Kerala: 'https://grievance.kerala.gov.in',
  Karnataka: 'https://pgportal.karnataka.gov.in',
  'Tamil Nadu': 'https://www.tncm.tn.gov.in',
  Maharashtra: 'https://grievances.maharashtra.gov.in',
  'Andhra Pradesh': 'https://spandana.ap.gov.in',
  Telangana: 'https://pgportal.telangana.gov.in',
};

export async function getComplaintAuthority(
  roadType: 'NH' | 'SH' | 'MDR' | 'rural' | 'unknown',
  state: string | null
): Promise<ComplaintAuthority> {
  const key = roadType === 'unknown' ? 'NH' : roadType;
  const authority = { ...COMPLAINT_ROUTING[key] };

  // Override portal with state-specific one for SH/MDR
  if (state && STATE_PORTALS[state] && roadType !== 'NH') {
    authority.complaintPortal = STATE_PORTALS[state];
    authority.sourceUrl = STATE_PORTALS[state];
  }

  return authority;
}