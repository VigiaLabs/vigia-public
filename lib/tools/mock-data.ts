'use server';

// This file previously contained mock data for unavailable government data points.
// All mocks have been removed as part of the Data Integrity Phase.
// Functions below return explicit "not available" responses instead of fake data.

export interface ExecutiveEngineerData {
  name: string;
  designation: string;
  division: string;
  phone: string | null;
  email: string | null;
  officeAddress: string;
  source: 'PWD-DIRECTORY' | 'NOT-INDEXED';
}

export async function getExecutiveEngineer(
  _roadNumber: string,
  state: string
): Promise<ExecutiveEngineerData> {
  return {
    name: `Personnel directory for ${state} has not yet been ingested into the VIGIA index`,
    designation: 'Executive Engineer',
    division: `${state} PWD Division`,
    phone: null,
    email: null,
    officeAddress: `PWD Office, ${state}`,
    source: 'NOT-INDEXED',
  };
}
