import { createAgent, tool } from 'langchain';
import { ChatGroq } from '@langchain/groq';
import { TavilySearch } from '@langchain/tavily';
import { getExchangeRate } from '@/lib/tatum';
import { fetchBlobText, listVaultEntries } from '@/lib/onchain';
import { AgentTraceRecorder, type AgentTraceSummary } from '@/lib/agentTrace';
import * as z from 'zod';

export type VaultDoc = {
  filename: string;
  summary?: string;
  content?: string;
  blobId?: string;
  fileType?: string;
  sizeBytes?: number;
  owner?: string;
  txDigest?: string;
};

export type AgentContext = {
  docs: VaultDoc[];
  owner?: string;
  currentFile?: VaultDoc;
};

const GROQ_TOOL_MODEL = 'openai/gpt-oss-120b';

type ToolLifecycleEvent =
  | { type: 'tool_start'; id: string; tool: string; label: string }
  | { type: 'tool_done'; id: string; tool: string; label: string; detail?: string; durationMs: number }
  | { type: 'tool_error'; id: string; tool: string; label: string; detail?: string; durationMs: number };
type ToolLifecycleSink = (event: ToolLifecycleEvent) => void;
let toolRunSeq = 0;

function cleanOwner(owner?: string) {
  return typeof owner === 'string' && owner.startsWith('0x') ? owner : '';
}

function scoreText(query: string, text: string) {
  const terms = Array.from(new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) || [])));
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of terms) {
    const count = hay.split(t).length - 1;
    score += count;
  }
  return score;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const optionalOwnerSchema = z.preprocess(
  value => (value == null ? undefined : value),
  z.string().optional(),
).describe('Sui wallet address. Omit to use the connected wallet.');

function inspectDocs(docs: VaultDoc[]) {
  const visibleDocs = docs.filter(d => !d.filename.startsWith('.'));
  const totalSizeBytes = visibleDocs.reduce((sum, d) => sum + (d.sizeBytes || 0), 0);
  return {
    totalFiles: visibleDocs.length,
    totalSizeBytes,
    totalSizeHuman: formatBytes(totalSizeBytes),
    files: visibleDocs.map((d, i) => ({
      n: i + 1,
      filename: d.filename,
      blobId: d.blobId,
      fileType: d.fileType,
      sizeBytes: d.sizeBytes,
      summary: d.summary,
      contentPreview: (d.content ?? '').slice(0, 900),
    })),
  };
}

function resultDetail(result: unknown) {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  if (!text) return 'Completed';
  return `Returned ${text.length.toLocaleString()} chars`;
}

function errorDetail(err: unknown) {
  return String(err).slice(0, 180);
}

function createTool<TInput>(
  sink: ToolLifecycleSink | undefined,
  name: string,
  label: (input: TInput) => string,
  run: (input: TInput) => Promise<string> | string,
  config: { description: string; schema: z.ZodType<TInput> },
) {
  return tool(
    async (input: TInput) => {
      const started = Date.now();
      const humanLabel = label(input);
      const id = `${name}-${Date.now()}-${++toolRunSeq}`;
      sink?.({ type: 'tool_start', id, tool: name, label: humanLabel });
      try {
        const result = await run(input);
        sink?.({
          type: 'tool_done',
          id,
          tool: name,
          label: humanLabel,
          detail: `${resultDetail(result)} in ${Date.now() - started}ms`,
          durationMs: Date.now() - started,
        });
        return result;
      } catch (err) {
        sink?.({
          type: 'tool_error',
          id,
          tool: name,
          label: humanLabel,
          detail: errorDetail(err),
          durationMs: Date.now() - started,
        });
        throw err;
      }
    },
    { name, description: config.description, schema: config.schema },
  );
}

export function buildVaultAgent(ctx: AgentContext, temperature = 0, lifecycle?: ToolLifecycleSink) {
  const docs = ctx.docs ?? [];
  const defaultOwner = cleanOwner(ctx.owner);

  const inspectLoadedVault = createTool(
    lifecycle,
    'inspect_loaded_vault',
    () => 'Inspecting the loaded vault',
    () => JSON.stringify(inspectDocs(docs), null, 2),
    {
      description:
        'Inspect the files currently loaded in ChainMind, including summaries, previews, and blob IDs. Use for broad context before answering about the visible vault.',
      schema: z.object({}),
    },
  );

  const readCurrentFile = createTool(
    lifecycle,
    'read_current_file',
    () => 'Reading the open file',
    () => {
      const file = ctx.currentFile;
      if (!file) return 'No single file is currently open.';
      return [
        `filename: ${file.filename}`,
        file.blobId ? `blobId: ${file.blobId}` : '',
        file.fileType ? `fileType: ${file.fileType}` : '',
        file.summary ? `summary: ${file.summary}` : '',
        `content:\n${(file.content ?? '').slice(0, 12000) || '(No extracted text is loaded for this file. Use read_walrus_blob if a blobId exists.)'}`,
      ].filter(Boolean).join('\n');
    },
    {
      description:
        'Read the currently open file and its extracted text. Use this first for questions about the selected file.',
      schema: z.object({}),
    },
  );

  const searchVault = createTool(
    lifecycle,
    'search_vault',
    ({ query }: { query: string }) => `Searching loaded files for "${query}"`,
    ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      const hits = docs
        .map(d => {
          const hay = `${d.filename}\n${d.summary ?? ''}\n${d.content ?? ''}`;
          return { d, score: scoreText(query, hay) + (d.filename.toLowerCase().includes(q) ? 5 : 0) };
        })
        .filter(h => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 7);

      if (hits.length === 0) return 'No matching files found in the loaded vault.';
      return hits.map(({ d }) => [
        `# ${d.filename}`,
        d.blobId ? `blobId: ${d.blobId}` : '',
        d.summary ? `summary: ${d.summary}` : '',
        `snippet:\n${(d.content ?? '').slice(0, 1800) || '(No extracted text loaded.)'}`,
      ].filter(Boolean).join('\n')).join('\n\n');
    },
    {
      description:
        "Search files already loaded in the user's ChainMind vault by keyword. Use before answering questions about visible/local vault files.",
      schema: z.object({ query: z.string().describe('Keyword or phrase to search for') }),
    },
  );

  const listOnchainVault = createTool(
    lifecycle,
    'list_onchain_vault',
    () => 'Reading your on-chain vault through Tatum',
    async ({ owner }: { owner?: string }) => {
      const address = cleanOwner(owner) || defaultOwner;
      if (!address) return 'No wallet address is available. Connect a wallet or provide an owner address.';
      const entries = (await listVaultEntries(address))
        .filter(e => !e.filename.startsWith('.chat'))
        .slice(0, 30);
      if (!entries.length) return `No ChainMind VaultEntry objects found for ${address}.`;
      return JSON.stringify(entries.map(e => ({
        filename: e.filename,
        blobId: e.blobId,
        fileType: e.fileType,
        sizeBytes: e.sizeBytes,
        txDigest: e.txDigest,
        entryId: e.entryId,
      })), null, 2);
    },
    {
      description:
        "Read a wallet's ChainMind VaultEntry objects from Sui through Tatum RPC. Use when the user asks what is truly on-chain, wants a restore/check, or local state may be stale.",
      schema: z.object({ owner: optionalOwnerSchema }),
    },
  );

  const readWalrusBlob = createTool(
    lifecycle,
    'read_walrus_blob',
    ({ blobId }: { blobId: string }) => `Fetching Walrus blob ${blobId.slice(0, 14)}...`,
    async ({ blobId }: { blobId: string }) => {
      if (!blobId) return 'blobId is required.';
      const text = await fetchBlobText(blobId);
      return text ? text.slice(0, 12000) : 'No readable text was available, or the Walrus aggregator was unavailable.';
    },
    {
      description:
        'Fetch readable text from a Walrus blob through the aggregator. Use when you have a blobId and need exact file contents.',
      schema: z.object({ blobId: z.string().describe('Walrus blobId to retrieve') }),
    },
  );

  const searchOnchainVault = createTool(
    lifecycle,
    'search_onchain_vault',
    ({ query }: { query: string }) => `Searching Sui + Walrus for "${query}"`,
    async ({ query, owner }: { query: string; owner?: string }) => {
      const address = cleanOwner(owner) || defaultOwner;
      if (!address) return 'No wallet address is available. Connect a wallet or provide an owner address.';
      const entries = (await listVaultEntries(address))
        .filter(e => !e.filename.startsWith('.chat'))
        .slice(0, 20);
      if (!entries.length) return `No ChainMind VaultEntry objects found for ${address}.`;

      const hydrated = await Promise.all(entries.map(async e => {
        const text = await fetchBlobText(e.blobId);
        const hay = `${e.filename}\n${e.fileType}\n${text.slice(0, 12000)}`;
        return { entry: e, text, score: scoreText(query, hay) + scoreText(query, e.filename) * 3 };
      }));

      const hits = hydrated
        .filter(h => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (!hits.length) return `No on-chain vault files matched "${query}".`;

      return hits.map(h => [
        `# ${h.entry.filename}`,
        `blobId: ${h.entry.blobId}`,
        h.entry.txDigest ? `txDigest: ${h.entry.txDigest}` : '',
        `snippet:\n${(h.text || '(No readable text returned from Walrus.)').slice(0, 1800)}`,
      ].filter(Boolean).join('\n')).join('\n\n');
    },
    {
      description:
        "Search the connected wallet's real on-chain vault by listing Sui VaultEntry objects through Tatum and reading Walrus blobs. Use for high-confidence answers about owned files.",
      schema: z.object({
        query: z.string().describe('Keyword or phrase to search for'),
        owner: optionalOwnerSchema,
      }),
    },
  );

  const auditVault = createTool(
    lifecycle,
    'audit_vault_health',
    () => 'Auditing vault health',
    async ({ owner }: { owner?: string }) => {
      const address = cleanOwner(owner) || defaultOwner;
      const visibleFiles = docs.filter(d => !d.filename.startsWith('.'));
      const localIssues = visibleFiles.flatMap(d => {
        const issues: string[] = [];
        if (!d.blobId) issues.push('missing blobId');
        if (!d.content?.trim()) issues.push('no extracted text loaded');
        if (!d.txDigest) issues.push('no txDigest in loaded metadata');
        if (!d.owner && address) issues.push('loaded metadata does not show wallet owner');
        return issues.length ? [{ filename: d.filename, issues }] : [];
      });

      let onchain: Awaited<ReturnType<typeof listVaultEntries>> = [];
      let onchainError = '';
      if (address) {
        try {
          onchain = (await listVaultEntries(address)).filter(e => !e.filename.startsWith('.'));
        } catch (err) {
          onchainError = String(err).slice(0, 240);
        }
      }

      const loadedBlobIds = new Set(visibleFiles.map(d => d.blobId).filter(Boolean));
      const chainBlobIds = new Set(onchain.map(e => e.blobId));
      const notLoaded = onchain.filter(e => !loadedBlobIds.has(e.blobId)).map(e => ({ filename: e.filename, blobId: e.blobId }));
      const notOnchain = visibleFiles.filter(d => d.blobId && !chainBlobIds.has(d.blobId)).map(d => ({ filename: d.filename, blobId: d.blobId }));

      return JSON.stringify({
        connectedOwner: address || null,
        loadedVisibleFiles: visibleFiles.length,
        onchainVisibleFiles: onchain.length,
        localIssues,
        onchainEntriesNotLoaded: notLoaded.slice(0, 10),
        loadedFilesNotFoundOnchainForOwner: address ? notOnchain.slice(0, 10) : [],
        onchainError,
        recommendedActions: [
          notLoaded.length ? 'Restore vault from chain to pull missing on-chain files into this browser.' : '',
          localIssues.some(i => i.issues.includes('no extracted text loaded')) ? 'Open or re-analyze files with missing extracted text so the agent can search them better.' : '',
          notOnchain.length ? 'For loaded files not found under this owner, verify they were registered to this wallet or claim/register them.' : '',
        ].filter(Boolean),
      }, null, 2);
    },
    {
      description:
        'Audit the current ChainMind vault for useful issues: missing extracted text, missing blob IDs, missing transaction metadata, and differences between loaded files and wallet-owned on-chain VaultEntry objects. Read-only.',
      schema: z.object({ owner: optionalOwnerSchema }),
    },
  );

  const cryptoPrice = createTool(
    lifecycle,
    'crypto_price',
    ({ symbol }: { symbol: string }) => `Checking ${symbol.toUpperCase()} price via Tatum`,
    async ({ symbol }: { symbol: string }) => {
      const r = await getExchangeRate(symbol, 'USD');
      if (!r) return `Couldn't fetch a price for ${symbol.toUpperCase()} via Tatum.`;
      const v = Number(r.value);
      return `${symbol.toUpperCase()} is about $${v.toLocaleString(undefined, { maximumFractionDigits: 6 })} USD via Tatum Data API${r.source ? `, source ${r.source}` : ''}.`;
    },
    {
      description: "Get the live USD price of a crypto asset, such as SUI, BTC, or ETH, via Tatum's Data API.",
      schema: z.object({ symbol: z.string().describe('Ticker symbol, e.g. SUI, BTC, ETH') }),
    },
  );

  const model = new ChatGroq({ model: GROQ_TOOL_MODEL, temperature });
  const tools = process.env.TAVILY_API_KEY
    ? [inspectLoadedVault, readCurrentFile, searchVault, listOnchainVault, searchOnchainVault, readWalrusBlob, auditVault, cryptoPrice, new TavilySearch({ maxResults: 5 })]
    : [inspectLoadedVault, readCurrentFile, searchVault, listOnchainVault, searchOnchainVault, readWalrusBlob, auditVault, cryptoPrice];

  return createAgent({
    model,
    tools,
    systemPrompt:
      "You are ChainMind's assistant, a useful working agent for a user-owned on-chain file vault. " +
      'Use tools for real work instead of pretending. ' +
      'When a question is about the currently open file, call read_current_file first. ' +
      'When a question is about files visible in the app, including total file count or vault size, call inspect_loaded_vault or search_vault before answering. ' +
      'When the user asks what is truly on-chain, wants a restore/check, or needs higher confidence, call list_onchain_vault or search_onchain_vault; these read Sui through Tatum and Walrus blobs directly. ' +
      'When the user asks to audit, check, improve, clean up, debug, or understand vault health, call audit_vault_health. ' +
      'If an answer needs exact contents and you have a blobId, call read_walrus_blob. ' +
      'When the user needs current or external information, use the web search tool when available, then cite what you found. ' +
      'For the live price of a crypto asset, use crypto_price. ' +
      'When the user asks you to create/write/generate something useful, produce the finished content as your answer, then on the VERY LAST line add a marker exactly like ' +
      '[[STORE:suggested-filename.ext|a short, specific one-line invitation to save THIS thing]] ' +
      'Pick a short filename with the right extension. Only add that marker when you actually created a file, document, code, data, or plan worth saving. ' +
      'Be concise, practical, and specific. ' +
      'Whenever you mention a file from the vault, write its exact name in SQUARE BRACKETS, e.g. [Project Notes.md], so it renders as a clickable link. ' +
      'Never wrap file names in asterisks or quotes.',
  });
}

export async function runVaultAgent(docs: VaultDoc[], question: string): Promise<string> {
  const agent = buildVaultAgent({ docs });
  const result = await agent.invoke({ messages: [{ role: 'user', content: question }] });
  const messages = result.messages;
  const last = messages[messages.length - 1];
  return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
}

export type AgentEvent =
  | { type: 'step'; tool: string; label: string }
  | ToolLifecycleEvent
  | { type: 'token'; text: string }
  | { type: 'reset' }
  | { type: 'answer'; text: string }
  | { type: 'trace'; summary: AgentTraceSummary }
  | { type: 'offer'; kind: 'store'; filename: string; question: string; content: string; message?: string };

function stepLabel(toolName: string, args: Record<string, unknown>): string {
  const q = String(args.query ?? args.input ?? '');
  if (toolName === 'inspect_loaded_vault') return 'Inspecting the loaded vault';
  if (toolName === 'read_current_file') return 'Reading the open file';
  if (toolName === 'search_vault') return `Searching loaded files for "${q}"`;
  if (toolName === 'list_onchain_vault') return 'Reading your on-chain vault through Tatum';
  if (toolName === 'search_onchain_vault') return `Searching Sui + Walrus for "${q}"`;
  if (toolName === 'read_walrus_blob') return `Fetching Walrus blob ${String(args.blobId ?? '').slice(0, 14)}...`;
  if (toolName === 'audit_vault_health') return 'Auditing vault health';
  if (toolName === 'crypto_price') return `Checking ${String(args.symbol ?? '').toUpperCase()} price via Tatum`;
  if (toolName.includes('tavily') || toolName.includes('search')) return q ? `Searching the web for "${q}"` : 'Searching the web';
  if (toolName === 'retry') return 'Reformatting the request and retrying';
  return `Running ${toolName}`;
}

function parseStoreMarker(answer: string): { filename: string | null; message?: string; text: string } {
  const m = answer.match(/\[\[STORE:\s*([^\]|]+?)\s*(?:\|\s*([^\]]*?))?\s*\]\]\s*$/i);
  if (!m) return { filename: null, text: answer };
  return { filename: m[1].trim(), message: m[2]?.trim() || undefined, text: answer.slice(0, m.index).trimEnd() };
}

function detectExt(question: string, answer: string): string {
  const inQ = question.match(/\.([a-z0-9]{1,5})\b/i);
  if (inQ) return inQ[1].toLowerCase();
  const kw: Record<string, string> = { python: 'py', javascript: 'js', typescript: 'ts', html: 'html', css: 'css', json: 'json', csv: 'csv', sql: 'sql', yaml: 'yml', markdown: 'md', readme: 'md', text: 'txt' };
  const hay = (question + ' ' + answer.slice(0, 200)).toLowerCase();
  for (const k of Object.keys(kw)) if (new RegExp(`\\b${k}\\b`).test(hay)) return kw[k];
  const fence = answer.match(/```([a-z0-9]+)/i);
  if (fence) {
    const fm: Record<string, string> = { py: 'py', python: 'py', js: 'js', javascript: 'js', ts: 'ts', typescript: 'ts', tsx: 'tsx', jsx: 'jsx', html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', sql: 'sql', yaml: 'yml', yml: 'yml', go: 'go', rust: 'rs', markdown: 'md', md: 'md' };
    const l = fence[1].toLowerCase();
    if (fm[l]) return fm[l];
  }
  return 'md';
}

function sanitizeFilename(name: string, answer: string): string {
  let n = name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!/\.[a-z0-9]{1,6}$/i.test(n)) n += '.' + detectExt(n, answer);
  return n || 'chainmind-note.md';
}

function extractArtifact(answer: string): string {
  const blocks = [...answer.matchAll(/```[a-z0-9]*\n([\s\S]*?)```/gi)].map(b => b[1]);
  if (blocks.length === 1 && blocks[0].length > answer.length * 0.5) return blocks[0].trim();
  return answer.trim();
}

function isToolFormatError(err: unknown): boolean {
  const s = String(err);
  return s.includes('tool_use_failed') || s.includes('Failed to call a function');
}

export type ChatTurn = { role?: string; text?: string };

function createEventQueue<T>() {
  const items: T[] = [];
  const waiters: Array<(value: T | null) => void> = [];
  let closed = false;
  return {
    push(item: T) {
      if (closed) return;
      const waiter = waiters.shift();
      if (waiter) waiter(item);
      else items.push(item);
    },
    close() {
      closed = true;
      while (waiters.length) waiters.shift()?.(null);
    },
    next(): Promise<T | null> {
      const item = items.shift();
      if (item) return Promise.resolve(item);
      if (closed) return Promise.resolve(null);
      return new Promise(resolve => waiters.push(resolve));
    },
  };
}

export async function* streamVaultAgentEvents(ctx: AgentContext, question: string, history: ChatTurn[] = []): AsyncGenerator<AgentEvent> {
  type Msg = { content?: unknown; tool_calls?: { name: string; args: Record<string, unknown> }[] };
  const trace = new AgentTraceRecorder();
  const queue = createEventQueue<AgentEvent>();
  const lifecycle: ToolLifecycleSink = event => {
    if (event.type === 'tool_start') trace.toolCall(event.tool, { label: event.label });
    queue.push(event);
  };
  trace.start({ question, owner: ctx.owner, currentFile: ctx.currentFile?.filename });
  queue.push({ type: 'tool_done', id: `run-${trace.runId}`, tool: 'agent_trace', label: `Started agent run ${trace.runId.slice(0, 8)}`, detail: 'Run trace is active', durationMs: 0 });

  const priorMsgs = (Array.isArray(history) ? history : [])
    .filter(m => m && (m.role === 'user' || m.role === 'ai') && m.text)
    .slice(-8)
    .map(m => ({ role: m.role === 'ai' ? ('assistant' as const) : ('user' as const), content: String(m.text) }));
  const inputMessages = [...priorMsgs, { role: 'user' as const, content: question }];

  const MAX_ATTEMPTS = 3;
  const TAIL = 8;
  const produce = async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let answered = false;
      let acc = '';
      let emitted = 0;
      let markerHit = false;
      if (attempt > 1) queue.push({ type: 'reset' });
      try {
        const agent = buildVaultAgent(ctx, attempt === 1 ? 0 : 0.4, lifecycle);
        const stream = await agent.stream({ messages: inputMessages }, { streamMode: ['updates', 'messages'] });
        for await (const item of stream as AsyncIterable<[string, unknown]>) {
          const [mode, data] = item;
          if (mode === 'updates') {
            // Tool lifecycle is emitted by the wrapped tool functions. We only keep
            // this branch for future non-wrapped tools and diagnostics.
            for (const value of Object.values(data as Record<string, { messages?: Msg[] }>)) {
              for (const m of value?.messages ?? []) {
                for (const tc of m.tool_calls ?? []) {
                  if (tc.name.includes('tavily')) {
                    trace.toolCall(tc.name, tc.args);
                    queue.push({ type: 'step', tool: tc.name, label: stepLabel(tc.name, tc.args) });
                  }
                }
              }
            }
          } else if (mode === 'messages') {
            const chunk = (data as [{ content?: unknown }, unknown])[0];
            const piece = typeof chunk?.content === 'string' ? chunk.content : '';
            if (!piece) continue;
            answered = true;
            acc += piece;
            if (markerHit) continue;
            const markerIndex = acc.indexOf('[[STORE');
            const safeEnd = markerIndex >= 0 ? markerIndex : Math.max(emitted, acc.length - TAIL);
            if (markerIndex >= 0) markerHit = true;
            if (safeEnd > emitted) {
              queue.push({ type: 'token', text: acc.slice(emitted, safeEnd) });
              emitted = safeEnd;
            }
          }
        }
        const parsed = parseStoreMarker(acc);
        trace.answer(parsed.text.length, Boolean(parsed.filename));
        queue.push({ type: 'answer', text: parsed.text });
        if (parsed.filename && parsed.text.trim().length > 0) {
          queue.push({
            type: 'offer',
            kind: 'store',
            filename: sanitizeFilename(parsed.filename, parsed.text),
            message: parsed.message,
            content: extractArtifact(parsed.text),
            question: 'Want to store this on-chain (Walrus + Sui)?',
          });
        }
        trace.finish();
        queue.push({ type: 'trace', summary: trace.summary() });
        queue.close();
        return;
      } catch (err) {
        if (attempt < MAX_ATTEMPTS && !answered && isToolFormatError(err)) {
          trace.retry(attempt + 1, String(err));
          queue.push({ type: 'step', tool: 'retry', label: stepLabel('retry', {}) });
          continue;
        }
        trace.error(err);
        trace.finish();
        queue.push({ type: 'trace', summary: trace.summary() });
        queue.push({ type: 'step', tool: 'agent_error', label: `Agent failed: ${String(err).slice(0, 120)}` });
        queue.close();
        throw err;
      }
    }
    queue.close();
  };

  const producer = produce();
  while (true) {
    const event = await queue.next();
    if (!event) break;
    yield event;
  }
  await producer;
}
