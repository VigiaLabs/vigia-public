'use server';

// Gati Shakti spatial data tool
// Uses OpenStreetMap Overpass API to get road type by GPS coordinate
// Falls back to PMGSY data for rural roads

export interface RoadInfo {
  roadType: 'NH' | 'SH' | 'MDR' | 'rural' | 'unknown';
  roadNumber: string | null;
  roadName: string | null;
  state: string | null;
  source: string;
  sourceUrl: string;
}

export async function getRoadInfoByCoordinates(
  lat: number,
  lon: number
): Promise<RoadInfo> {
  try {
    // Query OSM Overpass for the nearest road
    const query = `[out:json][timeout:10];way(around:100,${lat},${lon})["highway"];out tags;`;

    const params = new URLSearchParams({ data: query });

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'VIGIA-Public-Tool/0.1.0',
      },
      body: params.toString(),
    });

    const data = await response.json() as any;

    if (!data.elements || data.elements.length === 0) {
      return {
        roadType: 'unknown',
        roadNumber: null,
        roadName: null,
        state: null,
        source: 'OpenStreetMap',
        sourceUrl: `https://www.openstreetmap.org/#map=17/${lat}/${lon}`,
      };
    }

    // Rank roads by importance — NH > SH > MDR > rural > unknown
    const rankRoad = (tags: Record<string, string>): number => {
      const ref: string = tags.ref || '';
      if (ref.startsWith('NH') || ref.startsWith('IN:NH')) return 4;
      if (ref.startsWith('SH') || ref.startsWith('IN:SH')) return 3;
      if (ref.startsWith('MDR')) return 2;
      if (tags.highway === 'secondary' || tags.highway === 'tertiary') return 1;
      return 0;
    };

    // Sort by rank descending, pick the best
    const sorted = data.elements
      .filter((e: any) => e.tags)
      .sort((a: any, b: any) => 
        rankRoad(b.tags as Record<string, string>) - 
        rankRoad(a.tags as Record<string, string>)
      );

    const road = sorted[0] || {};
    const tags = road.tags || {};

    const ref: string = tags.ref || '';
    const name: string = tags.name || tags['name:en'] || null;

    let roadType: RoadInfo['roadType'] = 'unknown';
    let roadNumber: string | null = null;

    if (ref.startsWith('NH') || ref.startsWith('IN:NH')) {
      roadType = 'NH';
      roadNumber = ref.replace('IN:', '');
    } else if (ref.startsWith('SH') || ref.startsWith('IN:SH')) {
      roadType = 'SH';
      roadNumber = ref.replace('IN:', '');
    } else if (ref.startsWith('MDR') || tags.highway === 'secondary') {
      roadType = 'MDR';
      roadNumber = ref || null;
    } else if (tags.highway === 'tertiary' || tags.highway === 'unclassified') {
      roadType = 'rural';
    }

    return {
      roadType,
      roadNumber,
      roadName: name,
      state: tags['addr:state'] || null,
      source: 'OpenStreetMap',
      sourceUrl: `https://www.openstreetmap.org/#map=17/${lat}/${lon}`,
    };
  } catch (error) {
    console.error('Overpass API error:', error);
    return {
      roadType: 'unknown',
      roadNumber: null,
      roadName: null,
      state: null,
      source: 'OpenStreetMap',
      sourceUrl: `https://www.openstreetmap.org/#map=17/${lat}/${lon}`,
    };
  }
}

/**
 * Verify which states a road passes through using OpenStreetMap Overpass API.
 * Used for cross-validation: prevents associating a road with the wrong state.
 */
export async function getStatesForRoad(roadNumber: string): Promise<string[]> {
  try {
    // Normalize: "NH-66" → "NH 66", also try "NH66"
    const normalized = roadNumber.replace(/[-\s]+/g, ' ').toUpperCase();
    const compact = roadNumber.replace(/[-\s]+/g, '');

    const query = `[out:json][timeout:15];
      relation["ref"~"^(${normalized}|${compact})$"]["route"="road"];
      out tags;
      way["ref"~"^(${normalized}|${compact})$"]["highway"];
      out tags;`;

    const params = new URLSearchParams({ data: query });
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'VIGIA-Public-Tool/0.1.0' },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json() as any;
    if (!data.elements?.length) return [];

    const states = new Set<string>();
    for (const el of data.elements) {
      const tags = el.tags ?? {};
      if (tags['addr:state']) states.add(tags['addr:state']);
      if (tags['is_in:state']) states.add(tags['is_in:state']);
      // Extract from name patterns like "NH 66 (Goa)"
      const name = tags.name ?? '';
      const stateMatch = name.match(/\(([A-Za-z\s]+)\)/);
      if (stateMatch) states.add(stateMatch[1]);
    }

    return Array.from(states).filter(s => s.length > 1);
  } catch {
    return []; // Timeout or error — skip validation
  }
}
