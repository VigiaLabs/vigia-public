'use server';

// RTI (Right to Information) lookup tool — reads from data/authority-matrix.json
// Deterministic lookup based on road type + state

import { readFileSync } from 'fs';
import { join } from 'path';

export interface RTIAuthority {
  name: string;
  designation: string;
  organization: string;
  roadTypes: string[];
  filingUrl: string;
  state: string | null;
  source: string;
}

export interface RTIResponse {
  authority: RTIAuthority;
  suggestedQuestions: string[];
  filingInstructions: string;
  expectedResponseDays: number;
  fee: string;
  legalBasis: string;
  source: string;
  sourceUrl: string;
}

interface AuthorityMatrix {
  version: string;
  lastVerified: string;
  authorities: { IN: Record<string, any> };
}

let cachedMatrix: AuthorityMatrix | null = null;

function loadMatrix(): AuthorityMatrix {
  if (cachedMatrix) return cachedMatrix;
  const raw = readFileSync(join(process.cwd(), 'data', 'authority-matrix.json'), 'utf-8');
  cachedMatrix = JSON.parse(raw);
  return cachedMatrix!;
}

const STATE_CODES: Record<string, string> = {
  'Maharashtra': 'MH', 'Kerala': 'KL', 'Karnataka': 'KA', 'Tamil Nadu': 'TN',
  'Andhra Pradesh': 'AP', 'Telangana': 'TS', 'Gujarat': 'GJ', 'Rajasthan': 'RJ',
  'Uttar Pradesh': 'UP', 'Bihar': 'BR', 'West Bengal': 'WB', 'Odisha': 'OD',
  'Madhya Pradesh': 'MP', 'Punjab': 'PB', 'Haryana': 'HR', 'Assam': 'AS',
};

const RTI_QUESTIONS: Record<string, string[]> = {
  NH: [
    'Name of concessionaire/contractor for NH section from km X to km Y',
    'Total budget sanctioned and amount spent to date',
    'Date of last resurfacing/relaying on this section',
    'Number of complaints received and action taken in last 12 months',
    'Scheduled maintenance dates for current financial year',
  ],
  SH: [
    'Name of contractor responsible for maintenance of SH section',
    'Budget allocated and utilised for road maintenance this financial year',
    'Date of last inspection by Executive Engineer',
    'Pending repair works and estimated completion date',
  ],
  MDR: [
    'Contractor details and contract period for MDR maintenance',
    'District road fund allocation and expenditure',
    'Number of potholes reported and repaired in last 6 months',
  ],
};

export async function getRTIAuthority(
  roadType: 'NH' | 'SH' | 'MDR' | 'rural' | 'unknown',
  state: string | null
): Promise<RTIResponse> {
  const matrix = loadMatrix();
  const key = roadType === 'rural' ? 'MDR' : roadType === 'unknown' ? 'NH' : roadType;
  const stateCode = state ? STATE_CODES[state] ?? null : null;

  // Try state-specific override for SH
  let entry: any = null;
  if (key === 'SH' && stateCode) {
    entry = matrix.authorities.IN?.SH?.[stateCode]?.rti;
  }
  if (!entry) {
    const section = matrix.authorities.IN?.[key];
    entry = section?.rti ?? section?.default?.rti;
  }

  const officer = entry?.officer ?? 'Central Public Information Officer';
  const designation = entry?.designation ?? 'CPIO';
  const filingUrl = entry?.filingUrl ?? 'https://rtionline.gov.in';
  const fee = entry?.fee ?? '₹10';
  const responseDays = entry?.responseDays ?? 30;
  const legalBasis = entry?.legalBasis ?? 'RTI Act 2005, Section 6';

  return {
    authority: {
      name: officer,
      designation,
      organization: key === 'NH' ? 'NHAI' : key === 'SH' ? `${state ?? 'State'} PWD` : 'District Administration',
      roadTypes: [key],
      filingUrl,
      state,
      source: `authority-matrix.json v${matrix.version}`,
    },
    suggestedQuestions: RTI_QUESTIONS[key] ?? RTI_QUESTIONS['NH'],
    filingInstructions:
      `File online at ${filingUrl}. Select the appropriate ministry/department. ` +
      `Attach location details and road number. Fee: ${fee} (BPL applicants exempt). ` +
      `Response expected within ${responseDays} days under ${legalBasis}.`,
    expectedResponseDays: responseDays,
    fee,
    legalBasis,
    source: `authority-matrix.json v${matrix.version} (verified ${matrix.lastVerified})`,
    sourceUrl: filingUrl,
  };
}
