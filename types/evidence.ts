export type EvidenceClaimStatus = 'verified' | 'derived' | 'inferred' | 'unavailable' | 'conflicted';

export interface EvidenceClaimView {
  category: string;
  status: EvidenceClaimStatus;
  subject: string;
  predicate: string;
  value?: string | number | boolean;
  unit?: string;
  role?: string;
  financialType?: string;
  maintenanceType?: string;
  dateKind?: string;
  observedAt?: string;
  sourceId: string;
  sourceQuote: string;
  sourceLocator?: string;
  retrievedAt: string;
}

export interface OfflineEvidenceState {
  mode: 'online' | 'degraded' | 'offline';
  lastSyncAt?: number;
  cacheAgeHours?: number;
  packVersion?: string;
  stale: boolean;
}

export interface VigiaEvidenceMetadata {
  type: 'vigia-evidence';
  sources: Array<{ id: string; label: string; trustLevel: string; url?: string }>;
  claims?: EvidenceClaimView[];
  offline?: OfflineEvidenceState;
  debugTrace?: unknown[];
  totalLatencyMs?: number;
  contradictionVerified?: boolean;
  spatialMarkers?: unknown[];
  pendingAction?: unknown;
  [key: string]: unknown;
}

export function isVigiaEvidenceMetadata(value: unknown): value is VigiaEvidenceMetadata {
  return typeof value === 'object' && value !== null &&
    'type' in value && (value as { type?: unknown }).type === 'vigia-evidence';
}
