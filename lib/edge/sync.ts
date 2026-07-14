'use client';

/**
 * Edge DB Sync & Offline Query
 * Geofenced sync from CDN, local IndexedDB storage via sql.js WASM.
 */

import type { EmergencyContact, PwdHelpdesk, RoadSegment } from './schema';
import { EDGE_DB_SCHEMA } from './schema';

// Geohash encoding (precision 4 = ~40km tiles)
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

// ─── IndexedDB Storage ──────────────────────────────────────────────

const DB_NAME = 'vigia_edge';
const STORE_NAME = 'sqlite_db';

async function storeDbBytes(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => {
      const tx = req.result.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(bytes, 'db');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function loadDbBytes(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => {
      const tx = req.result.transaction(STORE_NAME, 'readonly');
      const getReq = tx.objectStore(STORE_NAME).get('db');
      getReq.onsuccess = () => resolve(getReq.result ?? null);
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── sql.js WASM Interface ──────────────────────────────────────────

let sqlPromise: Promise<any> | null = null;

async function getSqlJs() {
  if (!sqlPromise) {
    sqlPromise = import('sql.js').then(SQL => SQL.default({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    }));
  }
  return sqlPromise;
}

async function openEdgeDb() {
  const SQL = await getSqlJs();
  const bytes = await loadDbBytes();
  return bytes ? new SQL.Database(bytes) : new SQL.Database();
}

// ─── Sync Strategy ──────────────────────────────────────────────────

const EDGE_CDN_BASE = process.env.NEXT_PUBLIC_EDGE_CDN ?? 'https://edge.vigia.app/db';
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BUNDLED_PACK_URL = '/offline/vigia-edge-national.db.gz';
const REQUIRED_PACK_VERSION = '2026.07.15';

async function fetchCompressedPack(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const compressed = await response.arrayBuffer();
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    await writer.write(new Uint8Array(compressed));
    await writer.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  } catch {
    return null;
  }
}

function readMetadata(db: { exec: (sql: string) => Array<{ values: unknown[][] }> }, key: string): string | null {
  const escapedKey = key.replaceAll("'", "''");
  const result = db.exec(`SELECT value FROM sync_metadata WHERE key = '${escapedKey}'`);
  const value = result[0]?.values[0]?.[0];
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

export async function syncEdgeDatabase(lat: number, lng: number): Promise<boolean> {
  try {
    const db = await openEdgeDb();
    db.run(EDGE_DB_SCHEMA);

    // Check freshness
    const lastSync = Number(readMetadata(db, 'last_sync_at') ?? 0);
    const currentVersion = readMetadata(db, 'version');

    if (currentVersion === REQUIRED_PACK_VERSION && Date.now() - lastSync < SYNC_INTERVAL_MS) {
      db.close();
      return true; // Still fresh
    }

    // Fetch geofenced edge DB from CDN
    const geohash = encodeGeohash(lat, lng, 4);
    const url = `${EDGE_CDN_BASE}/${geohash}.db.gz`;

    const dbBytes = await fetchCompressedPack(url) ?? await fetchCompressedPack(BUNDLED_PACK_URL);
    if (!dbBytes) {
      db.close();
      return false;
    }

    // Store in IndexedDB
    await storeDbBytes(dbBytes);

    db.close();
    return true;
  } catch {
    return false;
  }
}

// ─── Offline Queries ────────────────────────────────────────────────

export async function queryEmergencyContacts(lat: number, lng: number, limit: number = 5): Promise<EmergencyContact[]> {
  try {
    const db = await openEdgeDb();
    const geohash = encodeGeohash(lat, lng, 4);
    const prefix = geohash.slice(0, 3);

    const result = db.exec(
      `SELECT id, name, type, lat, lng, phone, address, open_24h, geohash, scope, source_url, source_quote, verified_at
       FROM emergency_contacts
       WHERE scope IN ('national', 'national-highways') OR geohash LIKE '${prefix}%'
       LIMIT ${limit}`
    );
    db.close();

    if (!result.length) return [];
    return result[0].values.map((row: any[]) => ({
      id: row[0], name: row[1], type: row[2], lat: row[3], lng: row[4],
      phone: row[5], address: row[6], open24h: !!row[7], geohash: row[8],
      scope: row[9], sourceUrl: row[10], sourceQuote: row[11], verifiedAt: row[12],
    }));
  } catch { return []; }
}

export async function queryPwdHelpdesks(lat: number, lng: number, limit: number = 3): Promise<PwdHelpdesk[]> {
  try {
    const db = await openEdgeDb();
    const geohash = encodeGeohash(lat, lng, 4);
    const prefix = geohash.slice(0, 3);

    const result = db.exec(
      `SELECT id, state, division, designation, name, phone, email, office_address, jurisdiction_roads, geohash, scope, source_url, source_quote, verified_at
       FROM pwd_helpdesks WHERE scope = 'national' OR geohash LIKE '${prefix}%' LIMIT ${limit}`
    );
    db.close();

    if (!result.length) return [];
    return result[0].values.map((row: any[]) => ({
      id: row[0], state: row[1], division: row[2], designation: row[3],
      name: row[4], phone: row[5], email: row[6], officeAddress: row[7],
      jurisdictionRoads: JSON.parse(row[8] ?? '[]'), geohash: row[9],
      scope: row[10], sourceUrl: row[11], sourceQuote: row[12], verifiedAt: row[13],
    }));
  } catch { return []; }
}

export async function queryRoadSegments(lat: number, lng: number, limit: number = 5): Promise<RoadSegment[]> {
  try {
    const db = await openEdgeDb();
    const geohash = encodeGeohash(lat, lng, 4);
    const prefix = geohash.slice(0, 3);

    const result = db.exec(
      `SELECT id, road_number, road_name, road_type, state, start_lat, start_lng, end_lat, end_lng, geohash, complaint_authority, complaint_phone
       FROM road_segments WHERE geohash LIKE '${prefix}%' LIMIT ${limit}`
    );
    db.close();

    if (!result.length) return [];
    return result[0].values.map((row: any[]) => ({
      id: row[0], roadNumber: row[1], roadName: row[2], roadType: row[3],
      state: row[4], startLat: row[5], startLng: row[6], endLat: row[7],
      endLng: row[8], geohash: row[9], complaintAuthority: row[10], complaintPhone: row[11],
    }));
  } catch { return []; }
}

export async function getLastSyncTime(): Promise<number> {
  try {
    const db = await openEdgeDb();
    const result = db.exec("SELECT value FROM sync_metadata WHERE key = 'last_sync_at'");
    db.close();
    return result.length > 0 ? parseInt(result[0].values[0][0] as string) : 0;
  } catch { return 0; }
}

export async function getEdgePackMetadata(): Promise<{ lastSyncAt: number; version: string | null; verifiedAt: string | null }> {
  try {
    const db = await openEdgeDb();
    const metadata = {
      lastSyncAt: Number(readMetadata(db, 'last_sync_at') ?? 0),
      version: readMetadata(db, 'version'),
      verifiedAt: readMetadata(db, 'verified_at'),
    };
    db.close();
    return metadata;
  } catch {
    return { lastSyncAt: 0, version: null, verifiedAt: null };
  }
}
