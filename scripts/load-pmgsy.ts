/**
 * scripts/load-pmgsy.ts
 * Loads PMGSY road data from data/pmgsy_roads.jsonl into FTS5 table.
 * Run: npx tsx scripts/load-pmgsy.ts
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'data', 'nhai_mock.db');
const JSONL_PATH = join(process.cwd(), 'data', 'pmgsy_roads.jsonl');

function load() {
  const db = new Database(DB_PATH);

  db.exec(`DROP TABLE IF EXISTS pmgsy_contracts`);
  db.exec(`CREATE VIRTUAL TABLE pmgsy_contracts USING fts5(
    road_name, state, district, block, contractor,
    cost_lakhs UNINDEXED, length_km UNINDEXED,
    status, scheme, source_url UNINDEXED,
    tokenize='porter'
  )`);

  const lines = readFileSync(JSONL_PATH, 'utf-8').split('\n').filter(Boolean);
  const insert = db.prepare(
    `INSERT INTO pmgsy_contracts (road_name, state, district, block, contractor, cost_lakhs, length_km, status, scheme, source_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const line of lines) {
      const r = JSON.parse(line);
      insert.run(
        r.road_name, r.state, r.district, r.block ?? '',
        r.contractor, r.cost_lakhs, r.length_km, r.status, r.scheme, r.source_url
      );
    }
  });

  tx();
  console.log(`✓ Loaded ${lines.length} PMGSY records into pmgsy_contracts`);
  db.close();
}

load();
