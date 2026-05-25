import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const dbPath = join(__dirname, '..', 'data', 'nhai_mock.db');
const dataPath = join(__dirname, '..', 'data', 'nh44-sections.json');

const sections = JSON.parse(readFileSync(dataPath, 'utf-8'));
const db = new Database(dbPath);

// Create structured table
db.exec(`
  CREATE TABLE IF NOT EXISTS nh44_projects (
    id INTEGER PRIMARY KEY,
    section_name TEXT,
    road_number TEXT,
    state TEXT,
    road_type_classification TEXT,
    lanes INTEGER,
    concessionaire TEXT,
    contract_mode TEXT,
    sanctioned_cost_crore REAL,
    expenditure_cost_crore REAL,
    award_date TEXT,
    completion_date TEXT,
    length_km REAL,
    status TEXT,
    condition_notes TEXT,
    last_maintenance_date TEXT,
    source TEXT,
    source_url TEXT,
    ingested_at TEXT
  )
`);

const insertProject = db.prepare(`
  INSERT INTO nh44_projects (section_name, road_number, state, road_type_classification, lanes, concessionaire, contract_mode, sanctioned_cost_crore, expenditure_cost_crore, award_date, completion_date, length_km, status, condition_notes, last_maintenance_date, source, source_url, ingested_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertFTS = db.prepare(`
  INSERT INTO nhai_sections (content, section_title, page_number)
  VALUES (?, ?, ?)
`);

const now = new Date().toISOString();

const ingest = db.transaction(() => {
  for (const s of sections) {
    // Insert into structured table
    insertProject.run(
      s.section_name, s.road_number, s.state, s.road_type_classification, s.lanes,
      s.concessionaire, s.contract_mode, s.sanctioned_cost_crore ?? null, s.expenditure_cost_crore ?? null,
      s.award_date, s.completion_date, s.length_km, s.status, s.condition_notes,
      s.last_maintenance_date, s.source, s.source_url, now
    );

    // Insert into FTS5 with rich content
    const parts = [
      `NH-44 ${s.section_name}`,
      `Road: ${s.road_number}, Classification: ${s.road_type_classification}, Lanes: ${s.lanes}`,
      s.concessionaire ? `Concessionaire: ${s.concessionaire}` : null,
      s.sanctioned_cost_crore ? `Cost: ₹${s.sanctioned_cost_crore} Cr` : null,
      `Status: ${s.status}`,
      s.state ? `State: ${s.state}` : null,
      s.condition_notes,
    ].filter(Boolean).join('. ');

    insertFTS.run(parts, s.section_name, 1);
  }
});

ingest();
console.log(`Ingested ${sections.length} NH-44 sections into nhai_mock.db`);
db.close();
