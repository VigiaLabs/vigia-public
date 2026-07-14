import type { DebugTraceEntry, EvidenceClaim, PendingAction, VigiaState } from './state';
import type { OfflineEvidenceState } from '@/types/evidence';
import roadCentroids from '@/data/road-centroids.json';

type CentroidEntry = { center?: { lat: number; lng: number }; start?: { lat: number; lng: number }; end?: { lat: number; lng: number }; label?: string; type?: string };
const centroids = roadCentroids as Record<string, CentroidEntry>;

/** Extract spatial markers from evidence findings by matching road numbers to centroids */
function extractSpatialMarkersFromEvidence(
  evidence: VigiaState['evidence'],
  telemetryMarkers?: Array<{ lat: number; lng: number; label: string; severity: string }>
) {
  const markers: Array<{ id: string; title: string; lat: number; lng: number; type: string; severity: string; summary: string; citations: string[]; roadNumber?: string; route?: { start: { lat: number; lng: number }; end: { lat: number; lng: number } } }> = [];
  const seen = new Set<string>();

  // Add telemetry markers
  if (telemetryMarkers) {
    for (const m of telemetryMarkers) {
      markers.push({ id: `tel-${m.lat}`, title: m.label, lat: m.lat, lng: m.lng, type: 'point', severity: m.severity, summary: m.label, citations: [] });
    }
  }

  // Scan admin evidence for road numbers and section names
  const adminEvidence = evidence.filter(e => e.agentId === 'admin' && e.status === 'completed');
  for (const ev of adminEvidence) {
    const allText = ev.findings.join(' ');

    // Try section-specific matches first (e.g., "Panipat-Jalandhar")
    for (const [key, entry] of Object.entries(centroids)) {
      if (!key.includes(':')) continue; // skip base road entries
      const sectionName = key.split(':')[1].replace(/-/g, '[ -]');
      if (new RegExp(sectionName, 'i').test(allText) && !seen.has(key)) {
        seen.add(key);
        const center = entry.center ?? entry.start;
        if (!center) continue;
        // Only include citations from findings that mention this section
        const relevantCitations = ev.citations
          .filter(c => c.label.toLowerCase().includes(key.split(':')[0].toLowerCase()))
          .map(c => c.label)
          .slice(0, 3);
        markers.push({
          id: key,
          title: entry.label ?? key,
          lat: center.lat,
          lng: center.lng,
          type: 'route',
          severity: allText.includes('degrad') || allText.includes('terminat') || allText.includes('critical') ? 'critical' : 'moderate',
          summary: ev.findings.find(f => new RegExp(sectionName, 'i').test(f))?.slice(0, 100) ?? ev.findings[0]?.slice(0, 100) ?? '',
          citations: relevantCitations,
          roadNumber: key.split(':')[0],
          route: entry.start && entry.end ? { start: entry.start, end: entry.end } : undefined,
        });
      }
    }

    // Match all road numbers mentioned (NH-44, NH-163, SH-15, etc.)
    const roadMatches = allText.match(/\b(NH[-\s]?\d+[A-Z]?|SH[-\s]?\d+)\b/gi) ?? [];
    for (const road of roadMatches) {
      const normalized = road.replace(/\s/g, '-').toUpperCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      const entry = centroids[normalized];
      const relevantCitations = ev.citations
        .filter(c => c.label.toLowerCase().includes(normalized.toLowerCase()) || c.label.includes('NHAI'))
        .map(c => c.label)
        .slice(0, 3);

      if (entry?.center) {
        // Known road in centroids
        markers.push({
          id: normalized,
          title: entry.label ?? normalized,
          lat: entry.center.lat,
          lng: entry.center.lng,
          type: 'route',
          severity: 'info',
          summary: ev.findings.find(f => f.includes(normalized) || f.includes(road))?.slice(0, 100) ?? '',
          citations: relevantCitations,
          roadNumber: normalized,
        });
      } else {
        // Unknown road — extract state from evidence to approximate location
        const stateCoords: Record<string, { lat: number; lng: number }> = {
          'Telangana': { lat: 17.9, lng: 79.5 }, 'Maharashtra': { lat: 19.7, lng: 75.7 },
          'Karnataka': { lat: 15.3, lng: 75.7 }, 'Tamil Nadu': { lat: 11.1, lng: 78.6 },
          'Kerala': { lat: 10.8, lng: 76.2 }, 'Andhra Pradesh': { lat: 15.9, lng: 79.7 },
          'Haryana': { lat: 29.0, lng: 76.1 }, 'Punjab': { lat: 31.1, lng: 75.3 },
          'Rajasthan': { lat: 27.0, lng: 74.2 }, 'Gujarat': { lat: 22.3, lng: 71.2 },
          'Madhya Pradesh': { lat: 22.9, lng: 78.6 }, 'Uttar Pradesh': { lat: 26.8, lng: 80.9 },
        };
        // Find state mentioned near this road number in the text
        let coords = { lat: 20.5, lng: 78.9 }; // default: center of India
        for (const [state, c] of Object.entries(stateCoords)) {
          if (allText.includes(state)) { coords = c; break; }
        }
        markers.push({
          id: normalized,
          title: normalized,
          lat: coords.lat,
          lng: coords.lng,
          type: 'point',
          severity: 'info',
          summary: ev.findings.find(f => f.includes(normalized) || f.includes(road))?.slice(0, 100) ?? `${normalized} mentioned in query`,
          citations: relevantCitations,
          roadNumber: normalized,
        });
      }
    }
  }

  return markers.length > 0 ? markers : undefined;
}

export interface UIPayload {
  auditFinding: string;
  sources: Array<{
    id: string;
    label: string;
    trustLevel: string;
    url?: string;
  }>;
  claims: EvidenceClaim[];
  offline?: OfflineEvidenceState;
  budgetData?: {
    allocated: number;
    disbursed: number;
    currency: string;
    percentDisbursed: number;
  };
  spatialMarkers?: Array<{
    id: string;
    title: string;
    lat: number;
    lng: number;
    type: string;
    severity: string;
    summary: string;
    citations: string[];
    roadNumber?: string;
    route?: { start: { lat: number; lng: number }; end: { lat: number; lng: number } };
  }>;
  evidenceImages?: Array<{
    url: string;
    severity: string;
    label: string;
  }>;
  pendingAction?: PendingAction;
  contradictionVerified: boolean;
  debugTrace: VigiaState['debugTrace'];
  totalLatencyMs: number;
}

/**
 * Node 5: UI Hook
 *
 * Maps final pipeline state into the payload expected by
 * Vercel AI SDK streamUI / the frontend Generative UI components.
 * Zero LLM tokens — pure data transformation.
 */
export function uiHookNode(
  state: VigiaState
): Partial<VigiaState> {
  const trace: DebugTraceEntry = {
    node: 'ui_hook',
    timestamp: Date.now(),
    decision: `Mapped state to UI payload — ${state.evidence.length} evidence items`,
  };

  // This node doesn't mutate meaningful state — it exists as the terminal
  // graph node. The actual UI payload is extracted from the final state
  // by the API route using `extractUIPayload()`.
  return {
    debugTrace: [trace],
  };
}

/**
 * Extracts the UI-ready payload from the final graph state.
 * Called by the API route after graph execution completes.
 */
export function extractUIPayload(state: VigiaState): UIPayload {
  // Collect all unique citations across evidence
  const sources = state.evidence
    .flatMap((e) => e.citations)
    .map((c) => ({
      id: c.sourceId,
      label: c.label,
      trustLevel: c.trustLevel,
      url: c.url,
    }));
  const claimKeys = new Set<string>();
  const claims = state.evidence.flatMap((evidence) => evidence.claims ?? []).filter((claim) => {
    const key = `${claim.sourceId}|${claim.subject}|${claim.predicate}|${String(claim.value)}`;
    if (claimKeys.has(key)) return false;
    claimKeys.add(key);
    return true;
  });

  const offlineEvidence = state.evidence.find((evidence) => evidence.metadata?.networkMode === 'offline');
  const offline = offlineEvidence ? {
    mode: 'offline' as const,
    lastSyncAt: typeof offlineEvidence.metadata?.lastSyncAt === 'number' ? offlineEvidence.metadata.lastSyncAt : undefined,
    cacheAgeHours: typeof offlineEvidence.metadata?.cacheAgeHours === 'number' ? offlineEvidence.metadata.cacheAgeHours : undefined,
    packVersion: typeof offlineEvidence.metadata?.packVersion === 'string' ? offlineEvidence.metadata.packVersion : undefined,
    stale: offlineEvidence.metadata?.stale === true,
  } : undefined;

  // Extract budget data from admin metadata if present
  const adminEvidence = state.evidence.find(
    (e) => e.agentId === 'admin' && e.metadata
  );
  const budgetData = adminEvidence?.metadata?.['budgetAllocated']
    ? {
        allocated: adminEvidence.metadata['budgetAllocated'] as number,
        disbursed: adminEvidence.metadata['budgetDisbursed'] as number,
        currency: 'INR',
        percentDisbursed: adminEvidence.metadata['percentDisbursed'] as number,
      }
    : undefined;

  // Extract spatial markers from telemetry
  const telemetryEvidence = state.evidence.find(
    (e) => e.agentId === 'telemetry' && e.status === 'completed'
  );
  const telemetryMarkers = telemetryEvidence?.metadata?.['lat']
    ? [
        {
          lat: telemetryEvidence.metadata['lat'] as number,
          lng: telemetryEvidence.metadata['lng'] as number,
          label: telemetryEvidence.findings[0] ?? 'Anomaly detected',
          severity: telemetryEvidence.severity ?? 'moderate',
        },
      ]
    : undefined;

  // Extract spatial markers from admin evidence (road sections mentioned)
  const spatialMarkers = extractSpatialMarkersFromEvidence(state.evidence, telemetryMarkers);

  // Extract vision images
  const visionEvidence = state.evidence.find(
    (e) => e.agentId === 'vision' && e.status === 'completed'
  );
  const evidenceImages = visionEvidence?.metadata?.['imageUrl']
    ? [
        {
          url: visionEvidence.metadata['imageUrl'] as string,
          severity: visionEvidence.severity ?? 'moderate',
          label: visionEvidence.findings[0] ?? 'Visual evidence',
        },
      ]
    : undefined;

  return {
    auditFinding: state.auditFinding ?? '',
    sources,
    claims,
    offline,
    budgetData,
    spatialMarkers,
    evidenceImages,
    pendingAction: state.pendingAction,
    contradictionVerified: state.contradictionVerified,
    debugTrace: state.debugTrace,
    totalLatencyMs: state.totalLatencyMs ?? Date.now() - state.startedAt,
  };
}
