'use server';

/**
 * Offline Failover — dispatchWithFallback
 * Wraps agent dispatch with network-aware fallback to edge DB.
 * Used by the ingest pipeline when network is degraded or offline.
 */

import type { NormalizedEvidence, VigiaState } from '../agents/state';
import { getEdgePackMetadata, queryEmergencyContacts, queryPwdHelpdesks, queryRoadSegments } from './sync-server';

export type NetworkMode = 'online' | 'degraded' | 'offline';

type AgentId = 'vision' | 'admin' | 'telemetry';

/**
 * Dispatch with automatic failover to edge DB when offline/degraded.
 */
export async function dispatchWithFallback(
  agentId: AgentId,
  payload: VigiaState['payload'],
  networkMode: NetworkMode,
  dispatchFn: () => Promise<NormalizedEvidence>
): Promise<NormalizedEvidence> {
  if (networkMode === 'offline') {
    return queryEdgeDatabase(agentId, payload);
  }

  if (networkMode === 'degraded') {
    try {
      return await withTimeout(dispatchFn(), 3000);
    } catch {
      return queryEdgeDatabase(agentId, payload);
    }
  }

  // Online — normal dispatch
  return dispatchFn();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

async function queryEdgeDatabase(
  agentId: AgentId,
  payload: VigiaState['payload']
): Promise<NormalizedEvidence> {
  const lat = payload.gps?.lat;
  const lng = payload.gps?.lng;

  const queryLat = lat ?? 0;
  const queryLng = lng ?? 0;

  const [emergencyContacts, helpdesks, roads] = await Promise.all([
    queryEmergencyContacts(queryLat, queryLng),
    queryPwdHelpdesks(queryLat, queryLng),
    lat != null && lng != null ? queryRoadSegments(lat, lng) : Promise.resolve([]),
  ]);

  const pack = await getEdgePackMetadata();
  const cacheAgeHours = pack.lastSyncAt ? Math.round((Date.now() - pack.lastSyncAt) / 3600000) : null;

  const findings: string[] = [
    `⚠️ OFFLINE MODE — showing cached, source-linked data${cacheAgeHours != null ? ` (${cacheAgeHours}h old)` : ''}`,
  ];

  if (emergencyContacts.length > 0) {
    findings.push('── Emergency Contacts ──');
    for (const e of emergencyContacts) {
      findings.push(`${e.type}: ${e.name} — ${e.phone}`);
    }
  }

  if (helpdesks.length > 0) {
    findings.push('── PWD Helpdesks ──');
    for (const h of helpdesks) {
      findings.push(`${h.designation}, ${h.division}: ${h.phone ?? 'No phone listed'}`);
    }
  }

  if (roads.length > 0) {
    findings.push('── Nearby Roads ──');
    for (const r of roads) {
      findings.push(`${r.roadNumber} (${r.roadType}) — Complaint: ${r.complaintAuthority}${r.complaintPhone ? ` (${r.complaintPhone})` : ''}`);
    }
  }

  if (emergencyContacts.length === 0 && helpdesks.length === 0 && roads.length === 0) {
    findings.push('No cached data available for this location. Sync required when online.');
  }

  return {
    agentId,
    status: 'completed',
    confidence: 0.6,
    findings,
    citations: Array.from(new Map(
      [...emergencyContacts, ...helpdesks]
        .map((record) => [record.sourceUrl, {
          sourceId: record.sourceUrl,
          label: new URL(record.sourceUrl).hostname,
          url: record.sourceUrl,
          trustLevel: 'official-portal' as const,
        }])
    ).values()),
    metadata: {
      networkMode: 'offline',
      cacheAgeHours,
      recordCount: emergencyContacts.length + helpdesks.length + roads.length,
      packVersion: pack.version,
      verifiedAt: pack.verifiedAt,
      gpsAvailable: lat != null && lng != null,
    },
    latencyMs: 5,
  };
}
