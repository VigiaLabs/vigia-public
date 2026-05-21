/**
 * Lambda: fts5-loader
 * Track B, Step 2 — Rebuilds the SQLite FTS5 database from normalized JSONL
 * files in S3. Uploads the rebuilt .db to S3 for application consumption.
 *
 * Runtime: Node.js 22.x | Memory: 512 MB | Timeout: 5 min
 * Trigger: Invoked after api-etl completes (Step Functions or direct invoke)
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config } from '../shared/config';
import type { NormalizedProjectRecord } from '../shared/types';

const s3 = new S3Client({});

export async function handler(): Promise<{ recordsLoaded: number; dbSizeBytes: number }> {
  // 1. List all JSONL files in structured bucket
  const records = await loadAllRecords();
  console.log(`Loaded ${records.length} total records from S3`);

  if (records.length === 0) {
    return { recordsLoaded: 0, dbSizeBytes: 0 };
  }

  // 2. Build SQLite FTS5 database in /tmp
  const dbPath = '/tmp/nhai_production.db';
  const dbSize = await buildFts5Database(records, dbPath);

  // 3. Upload rebuilt DB to S3
  const { readFileSync } = await import('fs');
  const dbBuffer = readFileSync(dbPath);

  await s3.send(new PutObjectCommand({
    Bucket: config.fts5Bucket,
    Key: 'nhai_production.db',
    Body: dbBuffer,
    ContentType: 'application/x-sqlite3',
    Metadata: {
      recordCount: String(records.length),
      builtAt: new Date().toISOString(),
    },
  }));

  // Also upload a dated backup
  const date = new Date().toISOString().split('T')[0];
  await s3.send(new PutObjectCommand({
    Bucket: config.fts5Bucket,
    Key: `backups/${date}/nhai_production.db`,
    Body: dbBuffer,
    ContentType: 'application/x-sqlite3',
  }));

  console.log(`Uploaded nhai_production.db (${dbSize} bytes, ${records.length} records)`);
  return { recordsLoaded: records.length, dbSizeBytes: dbSize };
}

/** Load all JSONL files from the structured data bucket */
async function loadAllRecords(): Promise<NormalizedProjectRecord[]> {
  const records: NormalizedProjectRecord[] = [];

  // List all .jsonl files across all sources
  let continuationToken: string | undefined;
  do {
    const listing = await s3.send(new ListObjectsV2Command({
      Bucket: config.structuredBucket,
      ContinuationToken: continuationToken,
    }));

    for (const obj of listing.Contents ?? []) {
      if (!obj.Key?.endsWith('.jsonl')) continue;

      try {
        const res = await s3.send(new GetObjectCommand({
          Bucket: config.structuredBucket,
          Key: obj.Key,
        }));
        const text = await res.Body?.transformToString();
        if (!text) continue;

        const lines = text.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            records.push(JSON.parse(line) as NormalizedProjectRecord);
          } catch { /* skip malformed lines */ }
        }
      } catch (err) {
        console.warn(`Failed to read ${obj.Key}:`, err);
      }
    }

    continuationToken = listing.NextContinuationToken;
  } while (continuationToken);

  return records;
}

/** Build SQLite FTS5 database from normalized records */
async function buildFts5Database(
  records: NormalizedProjectRecord[],
  dbPath: string
): Promise<number> {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath);

  // Enable WAL mode for better write performance
  db.pragma('journal_mode = WAL');

  // Create FTS5 virtual table
  db.exec(`
    DROP TABLE IF EXISTS projects;
    CREATE VIRTUAL TABLE projects USING fts5(
      road_number,
      project_name,
      concessionaire,
      contract_mode,
      state,
      content,
      tokenize='porter unicode61'
    );
  `);

  // Create metadata table with idempotency constraint
  db.exec(`
    DROP TABLE IF EXISTS project_metadata;
    CREATE TABLE project_metadata (
      id INTEGER PRIMARY KEY,
      road_number TEXT NOT NULL,
      project_name TEXT,
      concessionaire TEXT,
      contract_mode TEXT,
      sanctioned_amount_crore REAL,
      expenditure_amount_crore REAL,
      award_date TEXT,
      completion_date TEXT,
      length_km REAL,
      state TEXT,
      districts TEXT,
      source_url TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      UNIQUE(road_number, source_url)
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_meta_road ON project_metadata(road_number);
    CREATE INDEX IF NOT EXISTS idx_meta_state ON project_metadata(state);
  `);

  // Insert records
  const insertFts = db.prepare(`
    INSERT INTO projects (road_number, project_name, concessionaire, contract_mode, state, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMeta = db.prepare(`
    INSERT OR REPLACE INTO project_metadata
    (road_number, project_name, concessionaire, contract_mode,
     sanctioned_amount_crore, expenditure_amount_crore, award_date,
     completion_date, length_km, state, districts, source_url, ingested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const r of records) {
      // Full-text content combines all searchable fields
      const content = [
        r.roadNumber, r.projectName, r.concessionaire,
        r.contractMode, r.state, r.districtsCovered.join(', '),
      ].join(' | ');

      insertFts.run(
        r.roadNumber, r.projectName, r.concessionaire,
        r.contractMode, r.state, content
      );

      insertMeta.run(
        r.roadNumber, r.projectName, r.concessionaire, r.contractMode,
        r.sanctionedAmountCrore, r.expenditureAmountCrore,
        r.awardDate, r.completionDate, r.lengthKm,
        r.state, JSON.stringify(r.districtsCovered),
        r.sourceUrl, r.ingestedAt
      );
    }
  });

  tx();

  const { statSync } = await import('fs');
  const size = statSync(dbPath).size;

  db.close();
  return size;
}
