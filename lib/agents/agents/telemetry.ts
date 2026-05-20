import type { NormalizedEvidence, Payload } from '../state';

/**
 * Telemetry Agent — IMU anomaly lookup by GPS coordinates.
 *
 * Currently mocked: returns anomaly data if GPS is present.
 * Production: will query SQLite telemetry table by lat/lng bounding box.
 */
export async function runTelemetryAgent(
  payload: Payload
): Promise<NormalizedEvidence> {
  const start = Date.now();

  if (!payload.gps) {
    return {
      agentId: 'telemetry',
      status: 'skipped',
      confidence: 0,
      findings: [],
      citations: [],
      latencyMs: Date.now() - start,
    };
  }

  // Simulate local DB lookup (~50ms)
  await new Promise((r) => setTimeout(r, 50));

  const { lat, lng } = payload.gps;

  return {
    agentId: 'telemetry',
    status: 'completed',
    confidence: 0.92,
    severity: 'severe',
    findings: [
      `IMU anomaly cluster detected at (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      'Vertical acceleration spike: 2.4g (threshold: 1.5g)',
      '14 anomaly events recorded in 200m segment over last 30 days',
    ],
    citations: [
      {
        sourceId: `telemetry-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        label: 'IMU Telemetry Data',
        trustLevel: 'verified-spatial',
      },
    ],
    metadata: {
      lat,
      lng,
      anomalyCount: 14,
      maxAcceleration: 2.4,
      segmentLengthM: 200,
    },
    latencyMs: Date.now() - start,
  };
}
