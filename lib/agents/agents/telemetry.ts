import type { NormalizedEvidence, Payload } from '../state';
import { callVigiaTool } from '../../mcp/client';

/**
 * Telemetry Agent — IMU anomaly lookup by GPS coordinates.
 *
 * Currently mocked for IMU, but uses MCP OpenStreetMap tool for road info.
 */
export async function runTelemetryAgent(
  payload: Payload
): Promise<NormalizedEvidence> {
  const start = Date.now();

  let lat = payload.gps?.lat;
  let lng = payload.gps?.lng;

  // Fallback to extracting from text if gps object is missing
  if (lat === undefined || lng === undefined) {
    if (payload.text) {
      const match = payload.text.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
      }
    }
  }

  if (lat === undefined || lng === undefined) {
    return {
      agentId: 'telemetry',
      status: 'skipped',
      confidence: 0,
      findings: [],
      citations: [],
      latencyMs: Date.now() - start,
    };
  }

  try {
    // Call MCP Server for real road info based on GPS
    const mcpResult = await callVigiaTool('get_road_info', { lat, lng });
    let roadInfo: any = null;
    if (mcpResult && mcpResult.content && mcpResult.content[0] && mcpResult.content[0].text) {
      roadInfo = JSON.parse(mcpResult.content[0].text);
    }

    // Simulate local DB lookup for IMU anomaly (~50ms)
    await new Promise((r) => setTimeout(r, 50));

    const findings = [
      `IMU anomaly cluster detected at (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      'Vertical acceleration spike: 2.4g (threshold: 1.5g)',
      '14 anomaly events recorded in 200m segment over last 30 days',
    ];

    if (roadInfo && roadInfo.roadType !== 'unknown') {
      findings.unshift(`Location identified via OSM: ${roadInfo.roadName || 'Unnamed Road'} (${roadInfo.roadType}${roadInfo.roadNumber ? ` ${roadInfo.roadNumber}` : ''}) in ${roadInfo.state || 'Unknown State'}.`);
    } else {
      findings.unshift(`Location identified: Unknown Road at coordinates ${lat}, ${lng}.`);
    }

    return {
      agentId: 'telemetry',
      status: 'completed',
      confidence: 0.92,
      severity: 'severe',
      findings,
      citations: [
        {
          sourceId: `telemetry-${lat.toFixed(4)}-${lng.toFixed(4)}`,
          label: 'IMU Telemetry Data',
          trustLevel: 'verified-spatial',
        },
        ...(roadInfo && roadInfo.roadType !== 'unknown' ? [{
          sourceId: `osm-${lat.toFixed(4)}-${lng.toFixed(4)}`,
          label: 'OpenStreetMap Data',
          trustLevel: 'verified-spatial' as const,
        }] : [])
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
  } catch (err: unknown) {
     const reason = err instanceof Error ? err.message : 'Unknown MCP/Telemetry error';
     return {
       agentId: 'telemetry',
       status: 'error',
       confidence: 0,
       findings: [],
       citations: [],
       errorReason: reason,
       latencyMs: Date.now() - start,
     };
  }
}
