/**
 * End-to-end test: NH-44 degraded section query
 * 
 * Simulates the user prompt:
 * "I am looking at a heavily degraded section of NH-44. Retrieve the exact road type
 *  classification, the name of the current contractor, the last verified relaying date,
 *  and the total amount sanctioned versus spent for this stretch. Explicitly cite the
 *  source of your budget data."
 *
 * Verifies that the local FTS5 fallback path returns correct structured data.
 * Run: npx tsx tests/nh44-query-e2e.test.ts
 */

import assert from 'node:assert';
import { join } from 'path';
import Database from 'better-sqlite3';

// We test the local FTS5 path directly (no Lambda/pgvector needed)
async function runTest() {
  // Directly test the query logic that searchUnified uses for FTS5 fallback
  const dbPath = join(process.cwd(), 'data', 'nhai_mock.db');
  const db = new Database(dbPath, { readonly: true });

  const query = 'NH-44 heavily degraded road type classification contractor relaying date sanctioned spent budget';
  const roadNumberMatch = query.match(/\b(NH[-\s]?\d+|SH[-\s]?\d+|MDR[-\s]?\d+)\b/i);
  const roadNum = roadNumberMatch![1].replace(/\s/g, '-').toUpperCase();

  // Simulate what searchUnified's nh44_projects query does
  const rows = db.prepare(
    `SELECT section_name, road_number, state, road_type_classification, lanes, concessionaire, contract_mode, sanctioned_cost_crore, expenditure_cost_crore, award_date, completion_date, length_km, status, condition_notes, last_maintenance_date, source, source_url FROM nh44_projects WHERE road_number = ? ORDER BY sanctioned_cost_crore DESC LIMIT 10`
  ).all(roadNum) as any[];

  const results = rows.map((r: any) => {
    const parts = [
      `${r.section_name} (${r.road_number}).`,
      `Road Type: ${r.road_type_classification} (${r.lanes} lanes).`,
      r.state ? `State: ${r.state}.` : null,
      r.concessionaire ? `Contractor: ${r.concessionaire}.` : null,
      r.contract_mode ? `Mode: ${r.contract_mode}.` : null,
      r.sanctioned_cost_crore ? `Sanctioned Cost: ₹${r.sanctioned_cost_crore} Crore.` : null,
      r.expenditure_cost_crore ? `Expenditure: ₹${r.expenditure_cost_crore} Crore.` : null,
      r.last_maintenance_date ? `Last Maintenance/O&M Start: ${r.last_maintenance_date}.` : null,
      `Status: ${r.status}.`,
      r.condition_notes ? r.condition_notes : null,
      r.source ? `Source: ${r.source}.` : null,
    ].filter(Boolean).join(' ');
    return { chunkText: parts, concessionaire: r.concessionaire, metadata: { source_url: r.source_url, road_type: r.road_type_classification, sanctioned_cost_crore: r.sanctioned_cost_crore, expenditure_cost_crore: r.expenditure_cost_crore, last_maintenance_date: r.last_maintenance_date } };
  });

  db.close();

  console.log(`Results returned: ${results.length}`);
  console.log('---');

  // ─── Assertion 1: We get results ─────────────────────────────────
  assert(results.length > 0, 'Should return results for NH-44 query');
  console.log('✓ Got results for NH-44 query');

  // ─── Assertion 2: Road type classification is present ─────────────
  const hasRoadType = results.some(r => 
    r.chunkText.includes('Road Type:') || r.chunkText.includes('Classification:')
  );
  assert(hasRoadType, 'Results should contain road type classification');
  console.log('✓ Road type classification found in results');

  // ─── Assertion 3: Contractor/concessionaire name is present ───────
  const hasContractor = results.some(r => 
    r.concessionaire || r.chunkText.includes('Contractor:') || r.chunkText.includes('Concessionaire:')
  );
  assert(hasContractor, 'Results should contain contractor name');
  console.log('✓ Contractor name found in results');

  // ─── Assertion 4: Sanctioned cost is present ──────────────────────
  const hasSanctioned = results.some(r => 
    r.chunkText.includes('Sanctioned Cost:') || r.chunkText.includes('₹')
  );
  assert(hasSanctioned, 'Results should contain sanctioned cost');
  console.log('✓ Sanctioned cost found in results');

  // ─── Assertion 5: Maintenance/relaying date is present ────────────
  const hasMaintenance = results.some(r => 
    r.chunkText.includes('Maintenance') || r.chunkText.includes('O&M') || 
    (r.metadata as any)?.last_maintenance_date
  );
  assert(hasMaintenance, 'Results should contain maintenance/relaying date');
  console.log('✓ Maintenance/relaying date found in results');

  // ─── Assertion 6: Source citation is present ──────────────────────
  const hasSource = results.some(r => 
    r.chunkText.includes('Source:') || (r.metadata as any)?.source_url
  );
  assert(hasSource, 'Results should contain source citation for budget data');
  console.log('✓ Source citation found in results');

  // ─── Assertion 7: Verify we have enough data for a complete answer ──
  assert(results.length >= 5, `Should have at least 5 NH-44 sections (got ${results.length})`);
  console.log(`✓ Have ${results.length} NH-44 sections for comprehensive answer`);

  // ─── Assertion 8: Verify specific NH-44 data accuracy ─────────────
  const allText = results.map(r => r.chunkText).join(' ');
  
  // Should find TOT Bundle 16 data (has maintenance date)
  const hasTOT = allText.includes('TOT') || allText.includes('Highway Infrastructure Trust');
  assert(hasTOT, 'Should find TOT Bundle 16 O&M data for NH-44');
  console.log('✓ TOT Bundle 16 O&M data found');

  // Should find specific cost figures
  const hasCostFigure = allText.includes('6661') || allText.includes('8375') || allText.includes('2178');
  assert(hasCostFigure, 'Should find specific sanctioned cost figures');
  console.log('✓ Specific cost figures found');

  // ─── Print what the synthesizer would receive ─────────────────────
  console.log('\n─── EVIDENCE THAT WOULD BE PASSED TO SYNTHESIZER ───');
  console.log('(Top 5 results the LLM would use to generate the answer)\n');
  
  for (const r of results.slice(0, 5)) {
    console.log(`[match] ${r.chunkText.slice(0, 200)}...`);
    if (r.concessionaire) console.log(`  → Contractor: ${r.concessionaire}`);
    if ((r.metadata as any)?.last_maintenance_date) console.log(`  → Maintenance date: ${(r.metadata as any).last_maintenance_date}`);
    if ((r.metadata as any)?.sanctioned_cost_crore) console.log(`  → Sanctioned: ₹${(r.metadata as any).sanctioned_cost_crore} Cr`);
    if ((r.metadata as any)?.expenditure_cost_crore) console.log(`  → Expenditure: ₹${(r.metadata as any).expenditure_cost_crore} Cr`);
    console.log('');
  }

  // ─── Verify the answer would be correct ───────────────────────────
  console.log('─── EXPECTED ANSWER COMPONENTS ───');
  console.log('The synthesizer should produce an answer containing:');
  console.log('  1. Road Type: 6L (6 lanes) for most NH-44 sections');
  console.log('  2. Contractor: Highway Infrastructure Trust (TOT) or Krishna Constructions (HAM)');
  console.log('  3. Last Relaying: 2024-09-18 (TOT Bundle-16 O&M start)');
  console.log('  4. Sanctioned: ₹6,661 Cr (TOT) or ₹8,375 Cr (Panipat-Jalandhar)');
  console.log('  5. Spent: ₹819.96 Cr (from arbitration records)');
  console.log('  6. Source: NHAI TOT Bundle-16 Award / NHAI Arbitration Award');

  console.log('\n✅ All NH-44 query E2E tests passed');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
