import snapshot from '@/data/v2/emarg-road-maintenance.json';

export interface EmargRoadRecord {
  roadDetailsId: number;
  roadId: number | null;
  connectionCode: string | null;
  roadName: string;
  stateName: string;
  districtName: string;
  blockName: string;
  maintenancePhase: string | null;
  packageNumber: string | null;
  contractorName: string | null;
  maintenanceStartDateRaw: string | null;
  stipulatedMaintenanceEndDateRaw: string | null;
  actualMaintenanceCompletionDateRaw: string | null;
  consolidatedGrossExpenditureInr: number | null;
  actualLengthKm: number | null;
  sourceUrl: string;
  sourceDetailEndpoint: string;
}

const records = snapshot.records as EmargRoadRecord[];
const STOP_WORDS = new Set(['about', 'amount', 'emarg', 'how', 'maintenance', 'much', 'pmgsy', 'road', 'rural', 'show', 'spent', 'what']);

function tokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((token) => !STOP_WORDS.has(token));
}

export function parseEmargDate(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`;
}

export async function queryEmargRoads(query: string, limit = 5): Promise<EmargRoadRecord[]> {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];
  const requestedRoadDetailsId = query.match(/\broad\s*details\s*(?:id)?\s*[:#-]?\s*(\d+)\b/i)?.[1]
    ?? query.match(/\b(\d{4,})\b/)?.[1];

  return records
    .map((record) => {
      const haystack = `${record.roadDetailsId} ${record.roadId ?? ''} ${record.connectionCode ?? ''} ${record.roadName} ${record.stateName} ${record.districtName} ${record.blockName} ${record.packageNumber ?? ''}`.toLowerCase();
      const exactIdentifierScore = requestedRoadDetailsId === String(record.roadDetailsId) ? 100 : 0;
      const score = exactIdentifierScore + queryTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { record, score };
    })
    .filter(({ record, score }) => score > 0 && (!requestedRoadDetailsId || String(record.roadDetailsId) === requestedRoadDetailsId))
    .sort((left, right) => right.score - left.score || left.record.roadName.localeCompare(right.record.roadName))
    .slice(0, limit)
    .map(({ record }) => record);
}

export function getEmargSnapshotMetadata() {
  return {
    sourcePublisher: snapshot.sourcePublisher,
    sourceUrl: snapshot.sourceUrl,
    fetchedAt: snapshot.fetchedAt,
    recordCount: snapshot.recordCount,
    schemaVersion: snapshot.schemaVersion,
  };
}
