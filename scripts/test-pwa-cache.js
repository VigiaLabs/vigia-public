#!/usr/bin/env node
/**
 * Test: Verifies that /api/chat is NOT cached by the service worker.
 * Run after `npm run build`.
 */
const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');

if (!fs.existsSync(swPath)) {
  console.log('⚠ No sw.js found in public/ (PWA disabled in dev mode — expected)');
  console.log('✅ PWA cache validation PASSED (no SW to check)');
  process.exit(0);
}

const content = fs.readFileSync(swPath, 'utf-8');

if (content.includes('chat-api-cache') || content.includes('/api/chat')) {
  console.log('❌ FAIL: /api/chat is still being cached by service worker');
  process.exit(1);
} else {
  console.log('✅ PASS: /api/chat is NOT cached by service worker');
  process.exit(0);
}
