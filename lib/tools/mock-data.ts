'use server';

// Mock data provider for unavailable government data points
// These 4 data points have no public API in India:
// 1. Last relaying date
// 2. Current road condition
// 3. Historical road condition
// 4. Executive Engineer contact

export interface LastRelayingData {
  roadNumber: string;
  lastRelayedDate: string;
  relayedBy: string;
  conditionAtRelay: string;
  source: 'VIGIA-ESTIMATED' | 'MOCK';
  confidence: 'low' | 'medium' | 'high';
}

export interface RoadConditionData {
  roadNumber: string;
  conditionScore: number; // 1-10
  conditionLabel: 'poor' | 'fair' | 'good' | 'excellent';
  lastInspected: string;
  hazards: string[];
  source: 'VIGIA-NETWORK' | 'MOCK';
  confidence: 'low' | 'medium' | 'high';
}

export interface ExecutiveEngineerData {
  name: string;
  designation: string;
  division: string;
  phone: string | null;
  email: string | null;
  officeAddress: string;
  source: 'PWD-DIRECTORY' | 'MOCK';
}

export interface HistoricalConditionData {
  roadNumber: string;
  records: {
    date: string;
    conditionScore: number;
    reportedBy: string;
  }[];
  source: 'VIGIA-NETWORK' | 'MOCK';
}

// ---
// MOCK DATA — clearly labelled, used when real data unavailable
// Replace these with VIGIA network data as it becomes available
// ---

export async function getLastRelayingDate(
  roadNumber: string
): Promise<LastRelayingData> {
  return {
    roadNumber,
    lastRelayedDate: '2022-03-15',
    relayedBy: 'State PWD Division',
    conditionAtRelay: 'Resurfacing complete, no major defects',
    source: 'MOCK',
    confidence: 'low',
  };
}

export async function getCurrentRoadCondition(
  roadNumber: string
): Promise<RoadConditionData> {
  return {
    roadNumber,
    conditionScore: 6,
    conditionLabel: 'fair',
    lastInspected: '2024-11-01',
    hazards: ['Minor potholes reported near km 45', 'Edge drop at km 62'],
    source: 'MOCK',
    confidence: 'low',
  };
}

export async function getExecutiveEngineer(
  roadNumber: string,
  state: string
): Promise<ExecutiveEngineerData> {
  return {
    name: 'Data not publicly available',
    designation: 'Executive Engineer',
    division: `${state} PWD Division`,
    phone: null,
    email: null,
    officeAddress: `PWD Office, ${state}`,
    source: 'MOCK',
  };
}

export async function getHistoricalCondition(
  roadNumber: string
): Promise<HistoricalConditionData> {
  return {
    roadNumber,
    records: [
      { date: '2024-06-01', conditionScore: 7, reportedBy: 'MOCK' },
      { date: '2024-01-01', conditionScore: 8, reportedBy: 'MOCK' },
      { date: '2023-06-01', conditionScore: 9, reportedBy: 'MOCK' },
    ],
    source: 'MOCK',
  };
}