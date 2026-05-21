'use server';

/**
 * Server-side edge DB queries.
 * Uses a local SQLite file (synced from S3/CDN) for offline fallback on the server.
 * Falls back to empty results if no local DB is available.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { EmergencyContact, PwdHelpdesk, RoadSegment } from './schema';

function encodeGeohash(lat: number, lng: number, precision: number = 4): string {
  const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
  let hash = '';
  let isLng = true;
  let bit = 0;
  let ch = 0;

  while (hash.length < precision) {
    if (isLng) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) { ch |= (1 << (4 - bit)); minLng = mid; }
      else { maxLng = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { ch |= (1 << (4 - bit)); minLat = mid; }
      else { maxLat = mid; }
    }
    isLng = !isLng;
    if (bit < 4) { bit++; }
    else { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

function getEdgeDbPath(): string | null {
  const dbPath = join(process.cwd(), 'data', 'vigia_edge.db');
  return existsSync(dbPath) ? dbPath : null;
}

export async function queryEmergencyContacts(lat: number, lng: number, limit: number = 5): Promise<EmergencyContact[]> {
  const dbPath = getEdgeDbPath();
  if (!dbPath) return [];

  try {
    const Database = (await import('better-sqlite3') as any).default ?? (await import('better-sqlite3'));
    const db = new Database(dbPath, { readonly: true });
    const geohash = encodeGeohash(lat, lng, 4);
    const prefix = geohash.slice(0, 3) + '%';

    const rows = db.prepare(
      'SELECT id, name, type, lat, lng, phone, address, open_24h, geohash FROM emergency_contacts WHERE geohash LIKE ? LIMIT ?'
    ).all(prefix, limit) as any[];

    db.close();
    return rows.map(r => ({
      id: r.id, name: r.name, type: r.type, lat: r.lat, lng: r.lng,
      phone: r.phone, address: r.address, open24h: !!r.open_24h, geohash: r.geohash,
    }));
  } catch { return []; }
}

export async function queryPwdHelpdesks(lat: number, lng: number, limit: number = 3): Promise<PwdHelpdesk[]> {
  const dbPath = getEdgeDbPath();
  if (!dbPath) return [];

  try {
    const Database = (await import('better-sqlite3') as any).default ?? (await import('better-sqlite3'));
    const db = new Database(dbPath, { readonly: true });
    const geohash = encodeGeohash(lat, lng, 4);
    const prefix = geohash.slice(0, 3) + '%';

    const rows = db.prepare(
      'SELECT id, state, division, designation, name, phone, office_address, jurisdiction_roads, geohash FROM pwd_helpdesks WHERE geohash LIKE ? LIMIT ?'
    ).all(prefix, limit) as any[];

    db.close();
    return rows.map(r => ({
      id: r.id, state: r.state, division: r.division, designation: r.designation,
      name: r.name, phone: r.phone, officeAddress: r.office_address,
      jurisdictionRoads: JSON.parse(r.jurisdiction_roads ?? '[]'), geohash: r.geohash,
    }));
  } catch { return []; }
}

export async function queryRoadSegments(lat: number, lng: number, limit: number = 5): Promise<RoadSegment[]> {
  const dbPath = getEdgeDbPath();
  if (!dbPath) return [];

  try {
    const Database = (await import('better-sqlite3') as any).default ?? (await import('better-sqlite3'));
    const db = new Database(dbPath, { readonly: true });
    const geohash = encodeGeohash(lat, lng, 4);
    const prefix = geohash.slice(0, 3) + '%';

    const rows = db.prepare(
      'SELECT id, road_number, road_name, road_type, state, start_lat, start_lng, end_lat, end_lng, geohash, complaint_authority, complaint_phone FROM road_segments WHERE geohash LIKE ? LIMIT ?'
    ).all(prefix, limit) as any[];

    db.close();
    return rows.map(r => ({
      id: r.id, roadNumber: r.road_number, roadName: r.road_name, roadType: r.road_type,
      state: r.state, startLat: r.start_lat, startLng: r.start_lng, endLat: r.end_lat,
      endLng: r.end_lng, geohash: r.geohash, complaintAuthority: r.complaint_authority,
      complaintPhone: r.complaint_phone,
    }));
  } catch { return []; }
}

export async function getLastSyncTime(): Promise<number> {
  const dbPath = getEdgeDbPath();
  if (!dbPath) return 0;

  try {
    const Database = (await import('better-sqlite3') as any).default ?? (await import('better-sqlite3'));
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM sync_metadata WHERE key = 'last_sync_at'").get() as any;
    db.close();
    return row ? parseInt(row.value) : 0;
  } catch { return 0; }
}
