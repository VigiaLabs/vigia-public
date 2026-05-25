import Database from 'better-sqlite3';
import assert from 'node:assert';
import { join } from 'path';

const dbPath = join(__dirname, '..', 'data', 'nhai_mock.db');

try {
  const db = new Database(dbPath, { readonly: true });

  // 1. Verify nh44_projects table exists and has rows
  const projects = db.prepare('SELECT * FROM nh44_projects').all() as any[];
  assert(projects.length > 0, 'nh44_projects should have rows');
  console.log(`✓ nh44_projects has ${projects.length} rows`);

  // 2. Query for NH-44 and verify road_type_classification
  const nh44Row = db.prepare("SELECT road_type_classification FROM nh44_projects WHERE road_number = 'NH-44' LIMIT 1").get() as any;
  assert(nh44Row, 'Should find NH-44 row');
  assert(nh44Row.road_type_classification, 'road_type_classification should be present');
  console.log(`✓ NH-44 road_type_classification: ${nh44Row.road_type_classification}`);

  // 3. Query FTS5 nhai_sections for NH-44
  const ftsResults = db.prepare(`SELECT content FROM nhai_sections WHERE nhai_sections MATCH '"NH-44"'`).all() as any[];
  assert(ftsResults.length > 0, 'FTS5 should return results for NH-44');
  const hasLaneInfo = ftsResults.some((r: any) => r.content.includes('Lanes:'));
  assert(hasLaneInfo, 'FTS5 results should contain lane info');
  console.log(`✓ FTS5 returned ${ftsResults.length} results with lane info`);

  // 4. Verify maintenance dates exist for TOT sections (newly scraped data)
  const withMaintenance = db.prepare("SELECT section_name, last_maintenance_date FROM nh44_projects WHERE last_maintenance_date IS NOT NULL").all() as any[];
  assert(withMaintenance.length > 0, 'Should have maintenance dates for TOT/O&M sections');
  console.log(`✓ ${withMaintenance.length} sections have maintenance dates (TOT/O&M contracts)`);

  // 5. Verify expenditure data exists for arbitration section
  const withExpenditure = db.prepare("SELECT section_name, expenditure_cost_crore FROM nh44_projects WHERE expenditure_cost_crore IS NOT NULL").all() as any[];
  assert(withExpenditure.length > 0, 'Should have expenditure data from arbitration records');
  console.log(`✓ ${withExpenditure.length} sections have expenditure data (₹${(withExpenditure[0] as any).expenditure_cost_crore} Cr)`);

  // 6. Verify sections WITHOUT maintenance dates are documented (RTI still needed for EPC roads)
  const withoutMaintenance = db.prepare("SELECT section_name FROM nh44_projects WHERE last_maintenance_date IS NULL AND status NOT LIKE '%O&M%' AND status NOT LIKE '%TOT%'").all() as any[];
  assert(withoutMaintenance.length > 0, 'EPC/under-construction sections should still lack maintenance dates (RTI required)');
  console.log(`✓ ${withoutMaintenance.length} sections still need RTI for maintenance dates (EPC/under-construction)`);

  db.close();
  console.log('\n✅ All NH-44 data tests passed');
} catch (err) {
  console.error('❌ Test failed:', err);
  process.exit(1);
}
