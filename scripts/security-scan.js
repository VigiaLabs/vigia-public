#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.gz',
  '.mp3', '.mp4', '.mov', '.avi', '.webm', '.sqlite', '.db',
]);

const SKIP_FILES = [
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
];

const PATTERNS = [
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret Access Key', regex: /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+]{40}['"]?/gi },
  { name: 'OpenAI-style API Key', regex: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Private Key Block', regex: /-----BEGIN (RSA|EC|OPENSSH|DSA)? ?PRIVATE KEY-----/g },
  { name: 'Generic Token Assignment', regex: /(api[_-]?key|token|secret|password)\s*[=:]\s*['"][^'"\n]{12,}['"]/gi },
];

function isLikelyText(content) {
  const sample = content.slice(0, 2000);
  let nullBytes = 0;
  for (let i = 0; i < sample.length; i += 1) {
    if (sample.charCodeAt(i) === 0) nullBytes += 1;
  }
  return nullBytes === 0;
}

function shouldSkipFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('node_modules/') || rel.startsWith('.next/') || rel.startsWith('.git/')) {
    return true;
  }

  const baseName = path.basename(rel);
  if (SKIP_FILES.some((re) => re.test(baseName))) return true;
  if (rel.startsWith('.env')) return true;

  const ext = path.extname(rel).toLowerCase();
  return SKIP_EXTENSIONS.has(ext);
}

function getTrackedFiles() {
  const output = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  return output
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => path.join(ROOT, f));
}

function scanFile(filePath) {
  if (shouldSkipFile(filePath) || !fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath);
  const content = raw.toString('utf8');
  if (!isLikelyText(content)) return [];

  const findings = [];
  const rel = path.relative(ROOT, filePath);
  const lines = content.split('\n');

  for (const { name, regex } of PATTERNS) {
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
      const line = lines[lineNumber];
      if (regex.test(line)) {
        findings.push({
          file: rel,
          line: lineNumber + 1,
          name,
        });
      }
      regex.lastIndex = 0;
    }
  }

  return findings;
}

function main() {
  const trackedFiles = getTrackedFiles();
  const findings = [];

  for (const filePath of trackedFiles) {
    findings.push(...scanFile(filePath));
  }

  if (!findings.length) {
    console.log('No potential secrets detected in tracked files.');
    process.exit(0);
  }

  console.error('Potential secrets detected:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.name})`);
  }
  process.exit(1);
}

main();
