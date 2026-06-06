#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentSmokeCases } from '../evals/agent-smoke-cases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_AGENT_URL = 'https://chainmind-seven.vercel.app/api/agent';

function parseArgs(argv) {
  const args = {
    url: process.env.CHAINMIND_AGENT_EVAL_URL || DEFAULT_AGENT_URL,
    local: false,
    port: Number(process.env.CHAINMIND_AGENT_EVAL_PORT || 3147),
    timeoutMs: Number(process.env.CHAINMIND_AGENT_EVAL_TIMEOUT_MS || 90000),
    caseName: '',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--url') args.url = argv[++i] || '';
    else if (arg === '--local') args.local = true;
    else if (arg === '--port') args.port = Number(argv[++i] || args.port);
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i] || args.timeoutMs);
    else if (arg === '--case') args.caseName = argv[++i] || '';
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number');
  }
  return args;
}

function printHelp() {
  console.log(`ChainMind agent smoke evals

Usage:
  node scripts/run-agent-evals.mjs
  node scripts/run-agent-evals.mjs --url https://chainmind-seven.vercel.app/api/agent

Options:
  --case <name>        Run one case from evals/agent-smoke-cases.mjs
  --local              Start a temporary local Next server instead of using production
  --port <number>      Preferred port for the temporary Next server
  --timeout-ms <ms>    Per-request and server-start timeout
  --help              Show this help
`);
}

function loadEnvFile(filename) {
  const file = path.join(repoRoot, filename);
  if (!existsSync(file)) return;

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (!key || process.env[key]) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function hasUsableEnv(name) {
  const value = process.env[name];
  if (!value) return false;
  const lower = value.toLowerCase();
  return !lower.includes('your_') && !lower.includes('<') && !lower.includes('replace_me');
}

function missingEnv(names = []) {
  return names.filter((name) => !hasUsableEnv(name));
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(preferred) {
  for (let port = preferred; port < preferred + 40; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`Could not find a free local port starting at ${preferred}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(baseUrl, timeoutMs, child) {
  const healthUrl = new URL('/api/version', baseUrl).toString();
  const startedAt = Date.now();
  let lastError = '';

  while (Date.now() - startedAt < timeoutMs) {
    if (child?.exitCode !== null) {
      throw new Error(`Next dev server exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetchWithTimeout(healthUrl, { method: 'GET' }, 3000);
      if (res.status < 500) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err?.name === 'AbortError' ? 'request timed out' : String(err?.message || err);
    }
    await sleep(750);
  }

  throw new Error(`Timed out waiting for ${healthUrl}${lastError ? ` (${lastError})` : ''}`);
}

async function startNextServer(preferredPort, timeoutMs) {
  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!existsSync(nextBin)) {
    return {
      blocked: `Local Next CLI not found at ${path.relative(repoRoot, nextBin)}. Run npm install first.`,
    };
  }

  const port = await findFreePort(preferredPort);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '-p', String(port)], {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const logs = [];
  const remember = (chunk) => {
    const text = String(chunk);
    logs.push(text);
    while (logs.join('').length > 3000) logs.shift();
  };
  child.stdout.on('data', remember);
  child.stderr.on('data', remember);

  try {
    await waitForServer(baseUrl, timeoutMs, child);
    return {
      baseUrl,
      agentUrl: `${baseUrl}/api/agent`,
      stop: async () => {
        child.kill();
        await sleep(500);
        if (child.exitCode === null) child.kill('SIGKILL');
      },
    };
  } catch (err) {
    child.kill();
    return {
      blocked: `${String(err?.message || err)}\nRecent server output:\n${logs.join('').trim() || '(none)'}`,
    };
  }
}

function summarizeEvents(events) {
  const answer = [...events].reverse().find((event) => event.type === 'answer')?.text || '';
  const error = [...events].reverse().find((event) => event.type === 'error')?.message || '';
  const offers = events.filter((event) => event.type === 'offer');
  const tools = [...new Set(events
    .filter((event) => (event.type === 'tool_start' || event.type === 'tool_done' || event.type === 'tool_error') && event.tool)
    .map((event) => event.tool))];
  const lifecycleErrors = [];
  const running = new Map();
  for (const event of events) {
    if (event.type === 'tool_start' && event.id) running.set(event.id, event.tool || event.label || event.id);
    if ((event.type === 'tool_done' || event.type === 'tool_error') && event.id) running.delete(event.id);
  }
  for (const [id, tool] of running) lifecycleErrors.push(`${tool}:${id}`);
  return { answer, error, tools, lifecycleErrors, offers };
}

async function postAgentJson(agentUrl, body, timeoutMs) {
  return fetchWithTimeout(
    agentUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
}

async function runHttpJsonCase(testCase, agentUrl, timeoutMs) {
  const res = await postAgentJson(agentUrl, testCase.request.body, timeoutMs);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return { status: 'FAIL', detail: `Response was not JSON: ${text.slice(0, 200)}` };
  }

  const expectedStatus = testCase.expect.status;
  if (res.status !== expectedStatus) {
    return { status: 'FAIL', detail: `Expected HTTP ${expectedStatus}, got ${res.status}` };
  }

  for (const [key, value] of Object.entries(testCase.expect.jsonIncludes || {})) {
    if (json?.[key] !== value) {
      return { status: 'FAIL', detail: `Expected JSON field ${key}=${JSON.stringify(value)}, got ${JSON.stringify(json?.[key])}` };
    }
  }
  for (const [key, values] of Object.entries(testCase.expect.jsonFieldOneOf || {})) {
    if (!values.includes(json?.[key])) {
      return { status: 'FAIL', detail: `Expected JSON field ${key} to be one of ${JSON.stringify(values)}, got ${JSON.stringify(json?.[key])}` };
    }
  }

  return { status: 'PASS', detail: `HTTP ${res.status}` };
}

async function runAgentNdjsonCase(testCase, agentUrl, timeoutMs) {
  const res = await postAgentJson(agentUrl, testCase.request, timeoutMs);
  const text = await res.text();
  if (!res.ok) return { status: 'BLOCKED', detail: `HTTP ${res.status}: ${text.slice(0, 400)}` };

  const lines = text.split(/\r?\n/).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      return { status: 'FAIL', detail: `Malformed NDJSON line: ${line.slice(0, 200)}` };
    }
  }

  const { answer, error, tools, lifecycleErrors, offers } = summarizeEvents(events);
  if (error) return { status: 'BLOCKED', detail: `Agent emitted error: ${error}` };
  if (!answer) return { status: 'FAIL', detail: 'No final answer event was emitted.' };
  if (lifecycleErrors.length) {
    return { status: 'FAIL', detail: `Unclosed tool lifecycle events: ${lifecycleErrors.join(', ')}` };
  }
  const normalizedAnswer = answer.toLowerCase().replace(/\s+/g, ' ');

  const missing = (testCase.expect.answerIncludes || []).filter(
    (needle) => !normalizedAnswer.includes(String(needle).toLowerCase().replace(/\s+/g, ' ')),
  );
  if (missing.length) {
    return {
      status: 'FAIL',
      detail: `Answer did not include ${missing.join(', ')}. Answer: ${answer.slice(0, 500)}`,
    };
  }
  const missingGroups = (testCase.expect.answerIncludesOneOf || []).filter(
    (needles) => !needles.some((needle) => normalizedAnswer.includes(String(needle).toLowerCase().replace(/\s+/g, ' '))),
  );
  if (missingGroups.length) {
    return {
      status: 'FAIL',
      detail: `Answer did not include one of ${missingGroups.map(g => `[${g.join(', ')}]`).join(', ')}. Answer: ${answer.slice(0, 500)}`,
    };
  }
  const excluded = (testCase.expect.answerExcludes || []).filter(
    (needle) => normalizedAnswer.includes(String(needle).toLowerCase().replace(/\s+/g, ' ')),
  );
  if (excluded.length) {
    return {
      status: 'FAIL',
      detail: `Answer leaked forbidden text ${excluded.join(', ')}. Answer: ${answer.slice(0, 500)}`,
    };
  }
  if (testCase.expect.toolsIncludeOneOf?.length && !testCase.expect.toolsIncludeOneOf.some((tool) => tools.includes(tool))) {
    return {
      status: 'FAIL',
      detail: `Expected a real lifecycle event from one of [${testCase.expect.toolsIncludeOneOf.join(', ')}], saw [${tools.join(', ') || 'none'}]`,
    };
  }
  if (testCase.expect.offerKind && !offers.some((offer) => offer.kind === testCase.expect.offerKind)) {
    return {
      status: 'FAIL',
      detail: `Expected offer kind ${testCase.expect.offerKind}, saw [${offers.map((offer) => offer.kind).join(', ') || 'none'}]`,
    };
  }

  const warning =
    testCase.warnIfNoToolFrom?.length && !testCase.warnIfNoToolFrom.some((tool) => tools.includes(tool))
      ? `warning: expected one of [${testCase.warnIfNoToolFrom.join(', ')}], saw [${tools.join(', ') || 'none'}]`
      : '';

  return {
    status: 'PASS',
    detail: warning || `answer matched; tools: ${tools.join(', ') || 'none'}`,
  };
}

async function runCase(testCase, agentUrl, timeoutMs, requireLocalEnv) {
  const missing = requireLocalEnv ? missingEnv(testCase.requiresEnv) : [];
  if (missing.length) {
    return { status: 'SKIP', detail: `missing ${missing.join(', ')}` };
  }

  try {
    if (testCase.kind === 'http-json') return await runHttpJsonCase(testCase, agentUrl, timeoutMs);
    if (testCase.kind === 'agent-ndjson') return await runAgentNdjsonCase(testCase, agentUrl, timeoutMs);
    return { status: 'BLOCKED', detail: `Unknown case kind: ${testCase.kind}` };
  } catch (err) {
    const detail = err?.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : String(err?.message || err);
    return { status: 'BLOCKED', detail };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }

  loadEnvFile('.env.local');
  loadEnvFile('.env');

  const selected = args.caseName
    ? agentSmokeCases.filter((testCase) => testCase.name === args.caseName)
    : agentSmokeCases;
  if (!selected.length) throw new Error(`No eval case named "${args.caseName}"`);

  let server = null;
  let agentUrl = args.url;
  if (args.local) {
    console.log(`Starting temporary ChainMind server near port ${args.port}...`);
    server = await startNextServer(args.port, args.timeoutMs);
    if (server.blocked) {
      console.log(`[BLOCKED] server-start\n${server.blocked}`);
      return 2;
    }
    agentUrl = server.agentUrl;
  }

  console.log(`Agent eval target: ${agentUrl}`);
  const results = [];
  try {
    for (const testCase of selected) {
      const result = await runCase(testCase, agentUrl, args.timeoutMs, args.local);
      results.push({ name: testCase.name, ...result });
      console.log(`[${result.status}] ${testCase.name} - ${result.detail}`);
    }
  } finally {
    if (server?.stop) await server.stop();
  }

  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  console.log(
    `Summary: PASS ${counts.PASS || 0}, FAIL ${counts.FAIL || 0}, SKIP ${counts.SKIP || 0}, BLOCKED ${counts.BLOCKED || 0}`,
  );

  return results.some((result) => result.status === 'FAIL' || result.status === 'BLOCKED') ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`[BLOCKED] ${String(err?.message || err)}`);
    process.exitCode = 2;
  });
