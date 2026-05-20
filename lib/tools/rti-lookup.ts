'use server';

// RTI (Right to Information) lookup tool
// Helps citizens find the correct RTI filing authority for road infrastructure
// and links to publicly available RTI responses about road projects

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
  source: string;
  sourceUrl: string;
}

// Static authority mapping — based on MoRTH guidelines
// NH = NHAI, SH = State PWD, MDR/rural = District Collector
const RTI_AUTHORITIES: Record<string, Omit<RTIAuthority, 'state'>> = {
  NH: {
    name: 'Central Public Information Officer',
    designation: 'CPIO',
    organization: 'National Highways Authority of India',
    roadTypes: ['NH'],
    filingUrl: 'https://rtionline.gov.in',
    source: 'MoRTH RTI Guidelines',
  },
  SH: {
    name: 'State Public Information Officer',
    designation: 'SPIO',
    organization: 'State Public Works Department',
    roadTypes: ['SH'],
    filingUrl: 'https://rtionline.gov.in',
    source: 'State PWD RTI Cell',
  },
  MDR: {
    name: 'District Public Information Officer',
    designation: 'DPIO',
    organization: 'District Collector Office',
    roadTypes: ['MDR', 'rural'],
    filingUrl: 'https://rtionline.gov.in',
    source: 'District Administration',
  },
};

// Suggested RTI questions per road type
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
  const key = roadType === 'rural' ? 'MDR' : roadType === 'unknown' ? 'NH' : roadType;
  const authority = RTI_AUTHORITIES[key];

  return {
    authority: {
      ...authority,
      state,
    },
    suggestedQuestions: RTI_QUESTIONS[key] || RTI_QUESTIONS['NH'],
    filingInstructions:
      'File online at rtionline.gov.in. Select the appropriate ministry/department. ' +
      'Attach location details and road number. Fee: ₹10 (BPL applicants exempt). ' +
      'Response expected within 30 days under RTI Act 2005.',
    expectedResponseDays: 30,
    source: 'RTI Act 2005 + MoRTH Guidelines',
    sourceUrl: 'https://rtionline.gov.in',
  };
}