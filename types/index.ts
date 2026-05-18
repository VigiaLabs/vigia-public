export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface Source {
  id: string;
  domain: string;
  title: string;
  url: string;
  trustBadge: 'verified-spatial' | 'legally-binding' | 'official-portal';
}

export interface Citation {
  number: number;
  label: string;
  sourceId: string;
}

export interface BudgetData {
  allocated: number;
  disbursed: number;
  currency: string;
  fiscalYear: string;
  percentDisbursed: number;
}

export interface SpatialData {
  polylineId: string;
  roadName: string;
  lengthKm: number;
  conditionPercent: number;
  ward: string;
}

export interface EvidenceImage {
  id: string;
  thumbnailUrl: string;
  severity?: string;
  label?: string;
}