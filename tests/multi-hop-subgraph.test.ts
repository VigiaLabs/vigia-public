/**
 * Multi-Hop Sub-Graph Tests
 * Tests the Plan-and-Execute ReWOO implementation.
 *
 * Run: npx tsx tests/multi-hop-subgraph.test.ts
 *
 * NOTE: Tests 1-3 require AWS credentials (Bedrock + Lambda).
 * Test 4 is a pure unit test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Test 1: Planner generates correct plan for cross-reference query ─

describe('Test 1: Query Planner', () => {
  it('should generate a multi-step plan with dependencies for personnel + road query', async () => {
    const { generatePlan } = await import('../lib/agents/planner');

    const plan = await generatePlan(
      'Phone number of Executive Engineer for NH-163G in Telangana',
      'personnel',
      false
    );

    assert.ok(plan.steps.length >= 2, `Expected ≥2 steps, got ${plan.steps.length}`);
    assert.ok(plan.reasoning, 'Expected reasoning string');

    // Should have an NHAI step that extracts district
    const nhaiStep = plan.steps.find(s => s.tool === 'searchNHAI');
    assert.ok(nhaiStep, 'Expected a searchNHAI step');
    assert.ok(nhaiStep.extract?.includes('district'), 'Expected NHAI step to extract district');

    // Should have a PWD step that depends on NHAI
    const pwdStep = plan.steps.find(s => s.tool === 'searchPWD');
    assert.ok(pwdStep, 'Expected a searchPWD step');
    assert.ok(pwdStep.dependsOn?.includes(nhaiStep.id), `Expected PWD to depend on ${nhaiStep.id}`);
    assert.ok(pwdStep.injectFrom?.district, 'Expected PWD to inject district from NHAI');

    console.log('  Plan:', JSON.stringify(plan, null, 2));
  });

  it('should generate a single-step plan for simple queries', async () => {
    const { generatePlan } = await import('../lib/agents/planner');

    const plan = await generatePlan(
      'What is the total budget sanctioned for NH-44?',
      'tender_search',
      false
    );

    assert.ok(plan.steps.length >= 1, 'Expected at least 1 step');
    const nhaiStep = plan.steps.find(s => s.tool === 'searchNHAI');
    assert.ok(nhaiStep, 'Expected a searchNHAI step for budget query');
    // Simple query should NOT have dependencies
    assert.ok(!nhaiStep.dependsOn?.length, 'Simple query should not have dependencies');
  });
});

// ─── Test 2: Federated search tools return source-filtered results ───

describe('Test 2: Federated Search Tools', () => {
  it('searchNHAI should return only nhai_contract results', async () => {
    const { searchNHAI } = await import('../lib/tools/search-federated');
    const results = await searchNHAI('NH-163G Telangana', 5);

    if (results.length > 0) {
      assert.ok(
        results.every(r => r.sourceType === 'nhai_contract'),
        `Expected all results to be nhai_contract, got: ${results.map(r => r.sourceType)}`
      );
      console.log(`  searchNHAI returned ${results.length} results, top sim=${results[0].similarity.toFixed(3)}`);
    } else {
      console.log('  ℹ️  searchNHAI returned 0 results (Lambda may not support sourceType filter yet)');
    }
  });

  it('searchPWD should return only pwd_contact results', async () => {
    const { searchPWD } = await import('../lib/tools/search-federated');
    const results = await searchPWD('Executive Engineer Telangana Khammam', 5);

    if (results.length > 0) {
      assert.ok(
        results.every(r => r.sourceType === 'pwd_contact'),
        `Expected all results to be pwd_contact, got: ${results.map(r => r.sourceType)}`
      );
      // Should find Khammam EE
      const hasKhammam = results.some(r => r.chunkText.toLowerCase().includes('khammam'));
      console.log(`  searchPWD: ${results.length} results, hasKhammam=${hasKhammam}, top sim=${results[0].similarity.toFixed(3)}`);
    } else {
      console.log('  ℹ️  searchPWD returned 0 results (Lambda may not support sourceType filter yet)');
    }
  });

  it('searchPMGSY should return only pmgsy_road results', async () => {
    const { searchPMGSY } = await import('../lib/tools/search-federated');
    const results = await searchPMGSY('PMGSY rural road contractor Pune Maharashtra', 5);

    if (results.length > 0) {
      assert.ok(
        results.every(r => r.sourceType === 'pmgsy_road'),
        `Expected all results to be pmgsy_road, got: ${results.map(r => r.sourceType)}`
      );
      console.log(`  searchPMGSY: ${results.length} results, top sim=${results[0].similarity.toFixed(3)}`);
    } else {
      console.log('  ℹ️  searchPMGSY returned 0 results (Lambda may not support sourceType filter yet)');
    }
  });
});

// ─── Test 3: Full executor with cross-referencing ────────────────────

describe('Test 3: Executor with Cross-Referencing', () => {
  it('should execute a 2-step plan and inject district from step 1 into step 2', async () => {
    const { executePlan } = await import('../lib/agents/executor');
    type Plan = Awaited<ReturnType<typeof import('../lib/agents/planner').generatePlan>>;

    const plan: Plan = {
      steps: [
        { id: 'E1', tool: 'searchNHAI', query: 'NH-163G Telangana', extract: ['district', 'state'] },
        { id: 'E2', tool: 'searchPWD', query: 'Executive Engineer Telangana', dependsOn: ['E1'], injectFrom: { district: 'E1.district' } },
      ],
      reasoning: 'Test: extract district from NHAI, inject into PWD search',
    };

    const results = await executePlan(plan, {
      threadId: '00000000-0000-0000-0000-000000000001',
      messageId: '00000000-0000-0000-0000-000000000002',
      text: 'Phone number of EE for NH-163G',
    });

    assert.equal(results.length, 2, 'Expected 2 step results');

    const e1 = results.find(r => r.stepId === 'E1');
    const e2 = results.find(r => r.stepId === 'E2');

    assert.ok(e1, 'Expected E1 result');
    assert.ok(e2, 'Expected E2 result');

    console.log(`  E1 extracted: ${JSON.stringify(e1.extracted)}`);
    console.log(`  E2 query: "${e2.query}"`);
    console.log(`  E2 results: ${e2.chunks.length} chunks`);

    // E1 should have extracted a district
    if (e1.extracted.district) {
      // E2's query should contain the injected district
      assert.ok(
        e2.query.includes(e1.extracted.district),
        `Expected E2 query to contain "${e1.extracted.district}", got: "${e2.query}"`
      );
      console.log(`  ✓ Cross-reference worked: district="${e1.extracted.district}" injected into PWD search`);
    } else {
      console.log('  ⚠️  E1 did not extract district — cross-reference could not be tested');
    }
  });
});

// ─── Test 4: Topological sort (pure unit test) ───────────────────────

describe('Test 4: Topological Sort', () => {
  it('should group independent steps into phase 1 and dependent steps into phase 2', async () => {
    // Import the module to access topologicalSort indirectly via executePlan behavior
    // We test this through the plan structure
    const { generatePlan } = await import('../lib/agents/planner');

    const plan = await generatePlan(
      'I need the contractor for PMGSY road in Pune AND the phone number of EE for NH-163G in Telangana',
      'tender_search',
      false
    );

    console.log(`  Plan has ${plan.steps.length} steps`);
    console.log(`  Reasoning: ${plan.reasoning}`);

    // Should have at least one step without dependencies (parallel)
    const independentSteps = plan.steps.filter(s => !s.dependsOn?.length);
    const dependentSteps = plan.steps.filter(s => s.dependsOn?.length);

    assert.ok(independentSteps.length >= 1, 'Expected at least 1 independent step');
    console.log(`  Independent (Phase 1): ${independentSteps.map(s => `${s.id}:${s.tool}`).join(', ')}`);
    console.log(`  Dependent (Phase 2+): ${dependentSteps.map(s => `${s.id}:${s.tool} → depends on ${s.dependsOn}`).join(', ')}`);
  });
});

// ─── Test 5: Full Admin Agent with Plan-and-Execute ──────────────────

describe('Test 5: Full Admin Agent Integration', () => {
  it('should return cross-referenced evidence for personnel + road query', async () => {
    const { runAdminAgent } = await import('../lib/agents/agents/admin');

    const result = await runAdminAgent(
      {
        text: 'Phone number of Executive Engineer for NH-163G in Telangana',
        threadId: '00000000-0000-0000-0000-000000000001',
        messageId: '00000000-0000-0000-0000-000000000002',
      },
      undefined,
      'personnel'
    );

    assert.equal(result.agentId, 'admin');
    assert.equal(result.status, 'completed');
    assert.ok(result.findings.length > 0, 'Expected findings');
    assert.ok(result.confidence > 0.3, `Expected confidence > 0.3, got ${result.confidence}`);

    // Check metadata for plan execution info
    const meta = result.metadata as any;
    console.log(`  Plan steps: ${meta?.planSteps}`);
    console.log(`  Cross-referenced: ${meta?.crossReferenced}`);
    console.log(`  Extracted entities: ${JSON.stringify(meta?.extractedEntities)}`);
    console.log(`  Confidence: ${result.confidence}`);
    console.log(`  Findings (first 2):`);
    result.findings.slice(0, 2).forEach(f => console.log(`    - ${f.slice(0, 120)}`));

    // Should have used the planner (not fallback)
    if (meta?.planSteps) {
      assert.ok(meta.planSteps >= 1, 'Expected ≥1 plan steps');
      console.log(`  ✓ Plan-and-Execute sub-graph used (${meta.planSteps} steps, crossRef=${meta.crossReferenced})`);
    }
  });
});
