import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

const registry = JSON.parse(await readFile(resolve('data/v2/offline-pack-sources.json'), 'utf8'));
const dbPath = resolve('data/vigia_edge.db');
const publicDirectory = resolve('public/offline');
await mkdir(publicDirectory, { recursive: true });

const db = new Database(dbPath);
db.exec(`
DROP TABLE IF EXISTS emergency_contacts;
DROP TABLE IF EXISTS pwd_helpdesks;
DROP TABLE IF EXISTS road_segments;
DROP TABLE IF EXISTS sync_metadata;
CREATE TABLE emergency_contacts (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, lat REAL, lng REAL,
  phone TEXT NOT NULL, address TEXT, open_24h INTEGER DEFAULT 1, geohash TEXT NOT NULL,
  scope TEXT NOT NULL, source_url TEXT NOT NULL, source_quote TEXT NOT NULL, verified_at TEXT NOT NULL
);
CREATE TABLE pwd_helpdesks (
  id INTEGER PRIMARY KEY, state TEXT NOT NULL, division TEXT NOT NULL,
  designation TEXT NOT NULL, name TEXT, phone TEXT, email TEXT, office_address TEXT,
  jurisdiction_roads TEXT NOT NULL, geohash TEXT NOT NULL, scope TEXT NOT NULL,
  source_url TEXT NOT NULL, source_quote TEXT NOT NULL, verified_at TEXT NOT NULL
);
CREATE TABLE road_segments (
  id INTEGER PRIMARY KEY, road_number TEXT NOT NULL, road_name TEXT, road_type TEXT NOT NULL,
  state TEXT NOT NULL, start_lat REAL, start_lng REAL, end_lat REAL, end_lng REAL,
  geohash TEXT NOT NULL, complaint_authority TEXT NOT NULL, complaint_phone TEXT
);
CREATE TABLE sync_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX idx_emergency_geohash ON emergency_contacts(geohash);
CREATE INDEX idx_helpdesk_geohash ON pwd_helpdesks(geohash);
CREATE INDEX idx_road_geohash ON road_segments(geohash);
`);

const insertEmergency = db.prepare(`
  INSERT INTO emergency_contacts
  (name, type, lat, lng, phone, address, open_24h, geohash, scope, source_url, source_quote, verified_at)
  VALUES (@name, @type, NULL, NULL, @phone, NULL, 1, '', @scope, @sourceUrl, @sourceQuote, @verifiedAt)
`);
const insertAuthority = db.prepare(`
  INSERT INTO pwd_helpdesks
  (state, division, designation, name, phone, email, office_address, jurisdiction_roads, geohash, scope, source_url, source_quote, verified_at)
  VALUES (@state, @division, @designation, @name, @phone, @email, NULL, '[]', '', @scope, @sourceUrl, @sourceQuote, @verifiedAt)
`);

db.transaction(() => {
  for (const contact of registry.emergencyContacts) insertEmergency.run({ ...contact, verifiedAt: registry.verifiedAt });
  for (const contact of registry.authorityContacts) insertAuthority.run({ ...contact, verifiedAt: registry.verifiedAt });
  const metadata = db.prepare('INSERT INTO sync_metadata (key, value) VALUES (?, ?)');
  metadata.run('last_sync_at', String(Date.now()));
  metadata.run('version', registry.version);
  metadata.run('verified_at', registry.verifiedAt);
  metadata.run('source_registry', 'data/v2/offline-pack-sources.json');
})();
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

const bytes = await readFile(dbPath);
const compressed = gzipSync(bytes, { level: 9 });
await writeFile(resolve(publicDirectory, 'vigia-edge-national.db.gz'), compressed);
await writeFile(resolve(publicDirectory, 'manifest.json'), `${JSON.stringify({
  version: registry.version,
  verifiedAt: registry.verifiedAt,
  databaseBytes: bytes.length,
  compressedBytes: compressed.length,
  emergencyContactCount: registry.emergencyContacts.length,
  authorityContactCount: registry.authorityContacts.length,
  sourceRegistry: '/data/v2/offline-pack-sources.json',
}, null, 2)}\n`);
console.log(`Built offline pack ${registry.version}: ${compressed.length} compressed bytes.`);
