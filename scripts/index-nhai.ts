/**
 * Build-time script: generates data/nhai_mock.db with FTS5 table.
 * Run: npx tsx scripts/index-nhai.ts
 */
import path from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = path.join(process.cwd(), 'data', 'nhai_mock.db');

const MOCK_SECTIONS = [
  { section_title: 'Contract Clause 4.2 — Road Maintenance Standards', page_number: 12, content: 'The contractor shall maintain all road surfaces to IRC:SP:16 standards. Any pothole exceeding 40mm depth must be repaired within 72 hours of detection. Failure to comply results in penalty as per Clause 9.1.' },
  { section_title: 'Contract Clause 5.1 — Completion Certificate', page_number: 18, content: 'Work declared completed and satisfactory as per inspection dated 2024-03-15. All road segments meet the specified quality parameters. Compliance certificate issued by Project Director.' },
  { section_title: 'Contract Clause 7.3 — Budget Allocation', page_number: 24, content: 'Total project budget allocated: INR 142.5 Crore. Disbursed to date: INR 128.7 Crore (90.3%). Remaining allocation reserved for maintenance period obligations under Clause 4.2.' },
  { section_title: 'Contract Clause 9.1 — Penalty Provisions', page_number: 31, content: 'Non-compliance with maintenance standards attracts penalty of 0.5% of contract value per week of delay. Repeated non-compliance (3+ instances) triggers contract termination review.' },
  { section_title: 'Amendment A1 — Variation Order 2024-07', page_number: 35, content: 'Scope variation approved for additional 2.3km segment. Amendment clauses extend maintenance obligation by 18 months. Variation order value: INR 12.8 Crore. No change to quality standards.' },
  { section_title: 'Contract Clause 3.1 — Project Scope', page_number: 5, content: 'Construction and maintenance of NH-48 bypass road, total length 14.7km. Four-lane divided carriageway with service roads. Design life: 20 years. Defect liability period: 5 years.' },
  { section_title: 'Inspection Report — Q4 2024', page_number: 40, content: 'Quarterly inspection reveals 23 potholes exceeding threshold in Km 4.2-6.8 segment. Contractor notified. Repair deadline: 2024-12-30. Current road condition: 62% satisfactory.' },
  { section_title: 'Contract Clause 6.1 — Quality Assurance', page_number: 22, content: 'Independent quality audit required every 6 months. Audit reports submitted to NHAI regional office. Non-compliant sections must be rectified within 30 days of audit report.' },
];

function main() {
  const db = new Database(DB_PATH);

  db.exec('DROP TABLE IF EXISTS nhai_sections');
  db.exec(`
    CREATE VIRTUAL TABLE nhai_sections USING fts5(
      content,
      section_title,
      page_number UNINDEXED
    )
  `);

  const insert = db.prepare(
    'INSERT INTO nhai_sections (content, section_title, page_number) VALUES (?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const s of MOCK_SECTIONS) {
      insert.run(s.content, s.section_title, s.page_number);
    }
  });

  tx();
  db.close();

  console.log(`Created ${DB_PATH} with ${MOCK_SECTIONS.length} sections`);
}

main();
