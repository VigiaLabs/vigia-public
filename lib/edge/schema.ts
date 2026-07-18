/**
 * Edge Database — Types & Schema
 * Offline-capable SQLite DB (<2MB compressed) for life-safety data.
 * Stored in IndexedDB via sql.js WASM.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface EmergencyContact {
  id: number;
  name: string;
  type: 'trauma_center' | 'police' | 'fire' | 'ambulance' | 'integrated_emergency' | 'national_highway_incident';
  lat: number | null;
  lng: number | null;
  phone: string;
  address: string | null;
  open24h: boolean;
  geohash: string;
  scope: string;
  sourceUrl: string;
  sourceQuote: string;
  verifiedAt: string;
}

export interface PwdHelpdesk {
  id: number;
  state: string;
  division: string;
  designation: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  officeAddress: string | null;
  jurisdictionRoads: string[];
  geohash: string;
  scope: string;
  sourceUrl: string;
  sourceQuote: string;
  verifiedAt: string;
}

export interface RoadSegment {
  id: number;
  roadNumber: string;
  roadName: string | null;
  roadType: 'NH' | 'SH' | 'MDR';
  state: string;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  geohash: string;
  complaintAuthority: string;
  complaintPhone: string | null;
}

export interface SyncMetadata {
  lastSyncAt: number;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  version: string;
}

// ─── Schema SQL ─────────────────────────────────────────────────────

export const EDGE_DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  lat REAL,
  lng REAL,
  phone TEXT NOT NULL,
  address TEXT,
  open_24h INTEGER DEFAULT 1,
  geohash TEXT NOT NULL,
  scope TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_quote TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pwd_helpdesks (
  id INTEGER PRIMARY KEY,
  state TEXT NOT NULL,
  division TEXT NOT NULL,
  designation TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  office_address TEXT,
  jurisdiction_roads TEXT NOT NULL,
  geohash TEXT NOT NULL,
  scope TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_quote TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS road_segments (
  id INTEGER PRIMARY KEY,
  road_number TEXT NOT NULL,
  road_name TEXT,
  road_type TEXT NOT NULL,
  state TEXT NOT NULL,
  start_lat REAL,
  start_lng REAL,
  end_lat REAL,
  end_lng REAL,
  geohash TEXT NOT NULL,
  complaint_authority TEXT NOT NULL,
  complaint_phone TEXT
);

CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emergency_geohash ON emergency_contacts(geohash);
CREATE INDEX IF NOT EXISTS idx_helpdesk_geohash ON pwd_helpdesks(geohash);
CREATE INDEX IF NOT EXISTS idx_road_geohash ON road_segments(geohash);
`;
