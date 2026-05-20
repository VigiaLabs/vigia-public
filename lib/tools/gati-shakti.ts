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
    const query = `
      [out:json][timeout:10];
      way(around:50,${lat},${lon})["highway"];
      out tags;
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });

    const data = await response.json();

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

    // Pick the first result
    const road = data.elements[0];
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