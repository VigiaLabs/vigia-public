import type { NormalizedEvidence, Payload } from '../state';
import { getRoadInfoByCoordinates } from '../../tools/gati-shakti';

/**
 * Telemetry Agent — GPS road identification + IMU anomaly data.
 * Uses OpenStreetMap (via gati-shakti tool) for road info.
 * IMU data is currently mocked.
 */
export async function runTelemetryAgent(
  payload: Payload
): Promise<NormalizedEvidence> {
  const start = Date.now();

  let lat = payload.gps?.lat;
  let lng = payload.gps?.lng;

  if (lat === undefined || lng === undefined) {
    if (payload.text) {
      const match = payload.text.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
      if (match) { lat = parseFloat(match[1]); lng = parseFloat(match[2]); }
    }
  }

  if (lat === undefined || lng === undefined) {
    return { agentId: 'telemetry', status: 'skipped', confidence: 0, findings: [], citations: [], latencyMs: Date.now() - start };
  }

  try {
    const roadInfo = await getRoadInfoByCoordinates(lat, lng);

    const findings = [
      roadInfo.roadType !== 'unknown'
        ? `Location: ${roadInfo.roadName || 'Unnamed Road'} (${roadInfo.roadType}${roadInfo.roadNumber ? ` ${roadInfo.roadNumber}` : ''})${roadInfo.state ? `, ${roadInfo.state}` : ''}`
        : `Location: coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)} (road type unidentified)`,
      `IMU anomaly cluster detected at (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      'Vertical acceleration spike: 2.4g (threshold: 1.5g)',
      '14 anomaly events recorded in 200m segment over last 30 days',
    ];

    return {
      agentId: 'telemetry',
      status: 'completed',
      confidence: 0.92,
      severity: 'severe',
      findings,
      citations: [
        { sourceId: `telemetry-${lat.toFixed(4)}-${lng.toFixed(4)}`, label: 'IMU Telemetry Data', trustLevel: 'verified-spatial' },
        ...(roadInfo.roadType !== 'unknown' ? [{ sourceId: `osm-${lat.toFixed(4)}-${lng.toFixed(4)}`, label: 'OpenStreetMap', url: roadInfo.sourceUrl, trustLevel: 'verified-spatial' as const }] : []),
      ],
      metadata: { lat, lng, roadInfo, anomalyCount: 14, maxAcceleration: 2.4, segmentLengthM: 200 },
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      agentId: 'telemetry',
      status: 'error',
      confidence: 0,
      findings: [],
      citations: [],
      errorReason: err instanceof Error ? err.message : 'Telemetry agent failed',
      latencyMs: Date.now() - start,
    };
  }
}
