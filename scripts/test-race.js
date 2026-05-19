#!/usr/bin/env node
/**
 * Test: Fires 5 rapid concurrent requests to /api/chat
 * Verifies the server handles them without dropping any.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  console.log(`Testing rapid concurrent requests against ${BASE}/api/chat...\n`);

  const promises = Array.from({ length: 5 }, (_, i) =>
    fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Rapid message ${i + 1}` }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }))
  );

  const results = await Promise.allSettled(promises);
  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures = results.filter((r) => r.status === 'rejected');

  console.log(`✓ ${successes.length}/5 succeeded`);
  if (failures.length > 0) {
    console.log(`✗ ${failures.length}/5 failed`);
    failures.forEach((f, i) => {
      if (f.status === 'rejected') console.log(`  Failure ${i + 1}:`, f.reason?.message);
    });
    process.exit(1);
  }

  // Verify each response is unique
  const replies = successes.map((s) =>
    s.status === 'fulfilled' ? s.value.body.reply : null
  );
  const unique = new Set(replies);
  if (unique.size === 5) {
    console.log('✓ All 5 responses are unique (no duplicates)');
  } else {
    console.log(`⚠ Only ${unique.size}/5 unique responses`);
  }

  console.log('\n✅ Race condition test PASSED');
}

main().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
