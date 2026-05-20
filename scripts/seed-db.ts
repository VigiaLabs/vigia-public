/**
 * Seeds data/nhai_mock.db with Golden Path contradiction data.
 * Run: npx tsx scripts/seed-db.ts
 */
import path from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = path.join(process.cwd(), 'data', 'nhai_mock.db');

const SECTIONS = [
  // Golden Path: compliance claim (triggers contradiction with vision)
  {
    content:
      'Contract L&T-44: SH-15 Ward 12 surface repairs. Status: Completed and compliant. Disbursement cleared. All quality parameters met as per IRC:SP:16. Final inspection certificate issued 2024-03-15.',
    section_title: 'Phase 1 Status',
    page_number: 4,
  },
  // Retry data: hidden amendment that confirms the contradiction
  {
    content:
      'Amendment 4: Ward 12 Phase 2 funding frozen due to technical evaluation. Repairs pending. Variation order submitted for additional scope. Original completion certificate under review.',
    section_title: 'Variation Orders',
    page_number: 12,
  },
  // Supporting context
  {
    content:
      'Budget allocation for SH-15 Ward 12: INR 42.5 Crore. Disbursed: INR 38.2 Crore (89.9%). Remaining funds earmarked for Phase 2 maintenance obligations.',
    section_title: 'Budget Summary',
    page_number: 8,
  },
  {
    content:
      'Penalty clause 9.1: Non-compliance with maintenance standards attracts 0.5% penalty per week. Three or more violations trigger contract termination review.',
    section_title: 'Penalty Provisions',
    page_number: 15,
  },
  {
    content:
      'Road specification: 4-lane divided carriageway, design life 20 years. Defect liability period: 5 years from completion date. Contractor responsible for all surface repairs during DLP.',
    section_title: 'Project Scope',
    page_number: 2,
  },
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
    for (const s of SECTIONS) {
      insert.run(s.content, s.section_title, s.page_number);
    }
  });

  tx();
  db.close();

  console.log(`Seeded ${DB_PATH} with ${SECTIONS.length} sections`);
  console.log('   Golden Path: "Phase 1 Status" claims compliant');
  console.log('   Retry Path:  "Variation Orders" reveals frozen funding');
}

main();
