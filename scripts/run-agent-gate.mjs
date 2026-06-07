#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const gateCases = [
  'missing-question-contract',
  'vault-stats-count-size',
  'policy-gates-market-action',
  'metadata-survives-agent-boundary',
  'remember-offers-store',
  'plan-broad-vault-audit',
];

function parseArgs(argv) {
  const passthrough = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url' || arg === '--timeout-ms' || arg === '--port') {
      passthrough.push(arg, argv[++i] || '');
    } else if (arg === '--local') {
      passthrough.push(arg);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`ChainMind agent gate

Usage:
  node scripts/run-agent-gate.mjs
  node scripts/run-agent-gate.mjs --url https://chainmind-seven.vercel.app/api/agent
  node scripts/run-agent-gate.mjs --local

Runs focused agent cases that should pass before production deploy.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return passthrough;
}

const passthrough = parseArgs(process.argv.slice(2));
let failed = false;

for (const caseName of gateCases) {
  const res = spawnSync(
    process.execPath,
    ['scripts/run-agent-evals.mjs', ...passthrough, '--case', caseName],
    { cwd: repoRoot, stdio: 'inherit', windowsHide: true },
  );
  if (res.status !== 0) failed = true;
}

if (failed) {
  console.error('[GATE] Agent gate failed.');
  process.exitCode = 1;
} else {
  console.log('[GATE] Agent gate passed.');
}
