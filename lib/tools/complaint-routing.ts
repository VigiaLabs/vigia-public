'use server';

// Complaint routing tool — reads from data/authority-matrix.json
// Deterministic lookup based on road type + state code

import { readFileSync } from 'fs';
import { join } from 'path';

export interface ComplaintAuthority {
  name: string;
  jurisdiction: string;
  complaintPortal: string;
  phone: string | null;
  email: string | null;
  escalationAuthority: string;
  source: string;
  sourceUrl: string;
  legalBasis: string;
}

interface AuthorityMatrix {
  version: string;
  lastVerified: string;
  authorities: {
    IN: Record<string, any>;
  };
}

let cachedMatrix: AuthorityMatrix | null = null;

function loadMatrix(): AuthorityMatrix {
  if (cachedMatrix) return cachedMatrix;
  const raw = readFileSync(join(process.cwd(), 'data', 'authority-matrix.json'), 'utf-8');
  cachedMatrix = JSON.parse(raw);
  return cachedMatrix!;
}

// Map state names to ISO codes used in authority-matrix.json
const STATE_CODES: Record<string, string> = {
  'Maharashtra': 'MH', 'Kerala': 'KL', 'Karnataka': 'KA', 'Tamil Nadu': 'TN',
  'Andhra Pradesh': 'AP', 'Telangana': 'TS', 'Gujarat': 'GJ', 'Rajasthan': 'RJ',
  'Uttar Pradesh': 'UP', 'Bihar': 'BR', 'West Bengal': 'WB', 'Odisha': 'OD',
  'Madhya Pradesh': 'MP', 'Punjab': 'PB', 'Haryana': 'HR', 'Assam': 'AS',
};

export async function getComplaintAuthority(
  roadType: 'NH' | 'SH' | 'MDR' | 'rural' | 'unknown',
  state: string | null
): Promise<ComplaintAuthority> {
  const matrix = loadMatrix();
  const key = roadType === 'unknown' || roadType === 'rural' ? 'MDR' : roadType;
  const stateCode = state ? STATE_CODES[state] ?? null : null;

  // Try state-specific override for SH
  let entry: any = null;
  if (key === 'SH' && stateCode) {
    entry = matrix.authorities.IN?.SH?.[stateCode]?.complaint;
  }
  // Fallback to default for road type
  if (!entry) {
    const section = matrix.authorities.IN?.[key];
    entry = section?.complaint ?? section?.default?.complaint;
  }

  if (!entry) {
    // Ultimate fallback
    return {
      name: 'Public Grievance Portal',
      jurisdiction: `${key} Roads`,
      complaintPortal: 'https://pgportal.gov.in',
      phone: null,
      email: null,
      escalationAuthority: 'Ministry of Road Transport and Highways',
      source: 'authority-matrix.json',
      sourceUrl: 'https://pgportal.gov.in',
      legalBasis: 'Unknown',
    };
  }

  return {
    name: entry.primary,
    jurisdiction: `${key} Roads${state ? ` — ${state}` : ''}`,
    complaintPortal: entry.portal,
    phone: entry.phone ?? null,
    email: null,
    escalationAuthority: entry.escalation,
    source: `authority-matrix.json v${matrix.version} (verified ${matrix.lastVerified})`,
    sourceUrl: entry.portal,
    legalBasis: entry.legalBasis ?? '',
  };
}
