import { createAgent, tool } from 'langchain';
import { ChatGroq } from '@langchain/groq';
import { makeWebSearchTool } from '@/lib/webSearch';
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
  memory?: string;
};

const GROQ_TOOL_MODEL = 'openai/gpt-oss-120b';

type ToolLifecycleEvent =
  | { type: 'tool_start'; id: string; tool: string; label: string }
  | { type: 'tool_done'; id: string; tool: string; label: string; detail?: string; durationMs: number }
  | { type: 'tool_error'; id: string; tool: string; label: string; detail?: string; durationMs: number };
type ToolLifecycleSink = (event: ToolLifecycleEvent) => void;
let toolRunSeq = 0;

function cleanOwner(owner?: string | null) {
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

const optionalOwnerSchema = z.string().optional()
  .describe('Sui wallet address. Omit this field to use the connected wallet.');

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

function visibleDocs(docs: VaultDoc[]) {
  return docs.filter(d => !d.filename.startsWith('.'));
}

function docLabel(d: VaultDoc, index: number) {
  return `${index + 1}. ${d.filename}`;
}

function byType(docs: VaultDoc[]) {
  const out: Record<string, { files: number; sizeBytes: number; sizeHuman: string }> = {};
  for (const d of docs) {
    const key = d.fileType || 'unknown';
    const cur = out[key] ?? { files: 0, sizeBytes: 0, sizeHuman: '0 B' };
    cur.files += 1;
    cur.sizeBytes += d.sizeBytes || 0;
    cur.sizeHuman = formatBytes(cur.sizeBytes);
    out[key] = cur;
  }
  return out;
}

function duplicateGroups(docs: VaultDoc[]) {
  const groups: Array<{ reason: string; files: VaultDoc[]; totalSizeBytes: number; totalSizeHuman: string; reclaimableBytes: number; reclaimableHuman: string }> = [];
  const addGroups = (reason: string, keyFn: (d: VaultDoc) => string) => {
    const map = new Map<string, VaultDoc[]>();
    for (const d of docs) {
      const key = keyFn(d);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    for (const files of map.values()) {
      if (files.length < 2) continue;
      const totalSizeBytes = files.reduce((sum, d) => sum + (d.sizeBytes || 0), 0);
      const largest = Math.max(...files.map(d => d.sizeBytes || 0));
      const reclaimableBytes = Math.max(0, totalSizeBytes - largest);
      groups.push({
        reason,
        files,
        totalSizeBytes,
        totalSizeHuman: formatBytes(totalSizeBytes),
        reclaimableBytes,
        reclaimableHuman: formatBytes(reclaimableBytes),
      });
    }
  };
  addGroups('same Walrus blobId', d => d.blobId || '');
  addGroups('same filename and size', d => `${d.filename.toLowerCase()}::${d.sizeBytes || 0}`);
  const seen = new Set<string>();
  return groups.filter(group => {
    const sig = group.files.map(f => `${f.filename}:${f.blobId || f.sizeBytes || 0}`).sort().join('|');
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

function findDoc(docs: VaultDoc[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const asIndex = Number(q);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= docs.length) return docs[asIndex - 1];
  return docs.find(d => d.filename.toLowerCase() === q)
    || docs.find(d => d.filename.toLowerCase().includes(q) || q.includes(d.filename.toLowerCase()))
    || null;
}

function sharedTerms(left: string, right: string) {
  const tokenize = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g) || []).slice(0, 4000));
  const a = tokenize(left);
  const b = tokenize(right);
  const common = [...a].filter(t => b.has(t));
  const denom = Math.max(1, Math.min(a.size, b.size));
  return { overlap: common.length / denom, common: common.slice(0, 24) };
}

function memorySources(ctx: AgentContext, docs: VaultDoc[]) {
  const sources: Array<{ source: string; text: string; blobId?: string }> = [];
  if (ctx.memory?.trim()) sources.push({ source: 'explicit memory context', text: ctx.memory.trim() });
  for (const d of visibleDocs(docs).filter(doc => /memory|preference|profile|strategy|context|decision|roadmap/i.test(doc.filename))) {
    const text = [d.summary, d.content].filter(Boolean).join('\n').trim();
    if (text) sources.push({ source: d.filename, text, blobId: d.blobId });
  }
  return sources;
}

function topMemorySnippets(ctx: AgentContext, docs: VaultDoc[], query: string) {
  const terms = Array.from(new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) || [])));
  return memorySources(ctx, docs)
    .map(source => {
      const hay = source.text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (hay.includes(term) ? 2 : 0) + Math.min(hay.split(term).length - 1, 5), 0);
      return { ...source, score, preview: source.text.slice(0, 1800) };
    })
    .filter(item => item.score > 0 || !terms.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function inferActionPolicy(request: string) {
  const q = request.toLowerCase();
  const mutates =
    /\b(delete|remove|wipe|clear|buy|purchase|sell|list|delist|transfer|send|swap|claim|register|restore|decrypt|share|publish)\b/.test(q);
  const financial = /\b(buy|purchase|sell|list|delist|transfer|send|swap|price|marketplace)\b/.test(q);
  const destructive = /\b(delete|remove|wipe|clear|delist)\b/.test(q);
  const privacy = /\b(decrypt|share|publish|private|secret|chat history)\b/.test(q);
  if (!mutates) {
    return {
      decision: 'read_only_allowed',
      reason: 'The request can be answered with read-only vault, memory, web, or chain inspection tools.',
      requiredUserStep: '',
    };
  }
  return {
    decision: 'approval_required',
    reason: [
      financial ? 'market or wallet value is involved' : '',
      destructive ? 'the action changes or removes user data' : '',
      privacy ? 'private data access or sharing may be involved' : '',
    ].filter(Boolean).join('; ') || 'the action changes user-owned state',
    requiredUserStep: 'Explain the exact proposed action and wait for the user to confirm through app controls or an approval flow before anything is signed or changed.',
  };
}

function inferWorkPlan(goal: string, ctx: AgentContext, docs: VaultDoc[]) {
  const q = goal.toLowerCase();
  const tools: string[] = [];
  if (ctx.currentFile || /\b(open|current|selected|this file)\b/.test(q)) tools.push('read_current_file');
  if (/\b(size|count|how many|largest|storage|duplicate|cleanup|missing|audit|health)\b/.test(q)) tools.push('vault_stats');
  if (/\b(duplicate|same|copy|cleanup)\b/.test(q)) tools.push('find_duplicate_files');
  if (/\b(compare|difference|different|versus| vs )\b/.test(q)) tools.push('compare_files');
  if (/\b(search|find|where|which file|keyword|mentions)\b/.test(q)) tools.push('search_vault');
  if (/\b(on-chain|chain|restore|wallet|true|sui|walrus)\b/.test(q)) tools.push('list_onchain_vault');
  if (/\b(remember|preference|project direction|strategy|context|what do you know)\b/.test(q)) tools.push('search_memory');
  if (/\b(price|sui|btc|eth|market)\b/.test(q)) tools.push('crypto_price');
  const policy = inferActionPolicy(goal);
  return {
    inferredIntent: q.length > 180 ? 'multi-step vault request' : goal,
    availableContext: {
      loadedVisibleFiles: visibleDocs(docs).length,
      hasCurrentFile: Boolean(ctx.currentFile),
      hasMemoryContext: Boolean(ctx.memory?.trim()) || memorySources(ctx, docs).length > 0,
      connectedOwner: ctx.owner || null,
    },
    suggestedTools: Array.from(new Set(tools.length ? tools : ['inspect_loaded_vault'])),
    policy,
    responseStandard: 'Use tools for facts, cite exact vault filenames in square brackets, be concise, and ask for confirmation before any state-changing action.',
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

  const planVaultWork = createTool(
    lifecycle,
    'plan_vault_work',
    () => 'Planning the vault work',
    ({ goal }: { goal: string }) => JSON.stringify(inferWorkPlan(goal, ctx, docs), null, 2),
    {
      description:
        'Create a concise internal work plan for a multi-step ChainMind request: likely intent, useful tools, available context, and approval policy. Use for broad, ambiguous, or high-stakes requests before acting.',
      schema: z.object({ goal: z.string().describe('The user request or task to plan.') }),
    },
  );

  const assessActionPolicy = createTool(
    lifecycle,
    'assess_action_policy',
    () => 'Checking action policy',
    ({ requestedAction }: { requestedAction: string }) => JSON.stringify(inferActionPolicy(requestedAction), null, 2),
    {
      description:
        'Check whether a requested action is read-only or requires explicit user approval. Use before answering requests to delete, list, buy, sell, transfer, restore, decrypt, share, or otherwise change wallet/vault state.',
      schema: z.object({ requestedAction: z.string().describe('The action the user appears to be asking for.') }),
    },
  );

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

  const vaultStats = createTool(
    lifecycle,
    'vault_stats',
    () => 'Calculating vault stats',
    () => {
      const files = visibleDocs(docs);
      const totalSizeBytes = files.reduce((sum, d) => sum + (d.sizeBytes || 0), 0);
      const largestFiles = [...files]
        .sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))
        .slice(0, 8)
        .map((d, i) => ({
          rank: i + 1,
          filename: d.filename,
          sizeBytes: d.sizeBytes || 0,
          sizeHuman: formatBytes(d.sizeBytes || 0),
          fileType: d.fileType || 'unknown',
          blobId: d.blobId,
        }));
      const missingContent = files.filter(d => !d.content?.trim());
      const duplicates = duplicateGroups(files);
      return JSON.stringify({
        totalFiles: files.length,
        totalSizeBytes,
        totalSizeHuman: formatBytes(totalSizeBytes),
        byType: byType(files),
        largestFiles,
        missingContentCount: missingContent.length,
        duplicateGroupCount: duplicates.length,
        estimatedDuplicateReclaimableBytes: duplicates.reduce((sum, group) => sum + group.reclaimableBytes, 0),
        estimatedDuplicateReclaimableHuman: formatBytes(duplicates.reduce((sum, group) => sum + group.reclaimableBytes, 0)),
      }, null, 2);
    },
    {
      description:
        'Compute vault-level operational stats: total files, total size, size by type, largest files, missing-content count, and duplicate estimates. Use for questions about vault size, storage, cleanup, or what is taking space.',
      schema: z.object({}),
    },
  );

  const findDuplicates = createTool(
    lifecycle,
    'find_duplicate_files',
    () => 'Checking for duplicate files',
    () => {
      const groups = duplicateGroups(visibleDocs(docs));
      if (!groups.length) return 'No duplicate-looking files found by blobId or filename+size.';
      return JSON.stringify(groups.map(group => ({
        reason: group.reason,
        totalSizeBytes: group.totalSizeBytes,
        totalSizeHuman: group.totalSizeHuman,
        estimatedReclaimableBytes: group.reclaimableBytes,
        estimatedReclaimableHuman: group.reclaimableHuman,
        files: group.files.map((d, i) => ({
          label: docLabel(d, i),
          filename: d.filename,
          blobId: d.blobId,
          sizeBytes: d.sizeBytes || 0,
          sizeHuman: formatBytes(d.sizeBytes || 0),
          txDigest: d.txDigest,
        })),
      })), null, 2);
    },
    {
      description:
        'Find duplicate-looking files in the loaded vault using exact Walrus blobId matches and filename+size matches. Use for cleanup, delete recommendations, duplicate audits, and storage reduction.',
      schema: z.object({}),
    },
  );

  const findLargeFiles = createTool(
    lifecycle,
    'find_large_files',
    ({ minSizeBytes }: { minSizeBytes?: number | null }) => `Finding large files${minSizeBytes ? ` over ${formatBytes(minSizeBytes)}` : ''}`,
    ({ minSizeBytes }: { minSizeBytes?: number | null }) => {
      const files = [...visibleDocs(docs)]
        .filter(d => !minSizeBytes || (d.sizeBytes || 0) >= minSizeBytes)
        .sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))
        .slice(0, 15);
      if (!files.length) return 'No files matched that size threshold.';
      return JSON.stringify(files.map((d, i) => ({
        rank: i + 1,
        filename: d.filename,
        sizeBytes: d.sizeBytes || 0,
        sizeHuman: formatBytes(d.sizeBytes || 0),
        fileType: d.fileType || 'unknown',
        blobId: d.blobId,
        summary: d.summary,
      })), null, 2);
    },
    {
      description:
        'List the largest files in the loaded vault, optionally above a byte threshold. Use for storage cleanup, cost, and “what takes the most space” questions.',
      schema: z.object({ minSizeBytes: z.union([z.number(), z.null()]).optional().describe('Optional minimum file size in bytes.') }),
    },
  );

  const findMissingContent = createTool(
    lifecycle,
    'find_missing_content',
    () => 'Finding files missing extracted text',
    () => {
      const files = visibleDocs(docs)
        .filter(d => !d.content?.trim())
        .map((d, i) => ({
          n: i + 1,
          filename: d.filename,
          fileType: d.fileType || 'unknown',
          sizeBytes: d.sizeBytes || 0,
          sizeHuman: formatBytes(d.sizeBytes || 0),
          blobId: d.blobId,
          summaryAvailable: Boolean(d.summary?.trim()),
          suggestedFix: d.blobId ? 'Open/re-analyze this file or fetch its Walrus blob if the type is readable.' : 'Re-upload or restore this file so it has a blobId.',
        }));
      if (!files.length) return 'Every visible loaded file has extracted text available.';
      return JSON.stringify({ missingContentCount: files.length, files }, null, 2);
    },
    {
      description:
        'Find loaded vault files that do not have extracted text/content available to the agent. Use when answers seem shallow, files have only summaries, or the user asks what needs re-analysis.',
      schema: z.object({}),
    },
  );

  const compareFiles = createTool(
    lifecycle,
    'compare_files',
    ({ left, right }: { left: string; right: string }) => `Comparing ${left} and ${right}`,
    ({ left, right }: { left: string; right: string }) => {
      const files = visibleDocs(docs);
      const a = findDoc(files, left);
      const b = findDoc(files, right);
      if (!a || !b) {
        return JSON.stringify({
          error: 'Could not find both files.',
          foundLeft: a?.filename || null,
          foundRight: b?.filename || null,
          hint: 'Use exact filenames or 1-based file numbers from inspect_loaded_vault.',
        }, null, 2);
      }
      const overlap = sharedTerms(`${a.summary ?? ''}\n${a.content ?? ''}`, `${b.summary ?? ''}\n${b.content ?? ''}`);
      return JSON.stringify({
        left: { filename: a.filename, sizeBytes: a.sizeBytes || 0, sizeHuman: formatBytes(a.sizeBytes || 0), blobId: a.blobId, summary: a.summary },
        right: { filename: b.filename, sizeBytes: b.sizeBytes || 0, sizeHuman: formatBytes(b.sizeBytes || 0), blobId: b.blobId, summary: b.summary },
        sameBlob: Boolean(a.blobId && b.blobId && a.blobId === b.blobId),
        sameFilename: a.filename.toLowerCase() === b.filename.toLowerCase(),
        sameSize: (a.sizeBytes || 0) === (b.sizeBytes || 0),
        lexicalOverlapScore: Number(overlap.overlap.toFixed(3)),
        sharedKeywords: overlap.common,
      }, null, 2);
    },
    {
      description:
        'Compare two loaded vault files by filename or 1-based index: metadata, blob equality, size, summary, and lexical overlap. Use when the user asks how two files differ or whether they are duplicates.',
      schema: z.object({
        left: z.string().describe('Left file filename, partial filename, or 1-based index.'),
        right: z.string().describe('Right file filename, partial filename, or 1-based index.'),
      }),
    },
  );

  const inspectMemory = createTool(
    lifecycle,
    'inspect_memory_context',
    () => 'Inspecting saved memory context',
    () => {
      const memoryDocs = visibleDocs(docs).filter(d => /memory|preference|profile|strategy|context/i.test(d.filename));
      return JSON.stringify({
        explicitMemory: ctx.memory || '',
        memoryLikeFiles: memoryDocs.slice(0, 8).map(d => ({
          filename: d.filename,
          summary: d.summary,
          contentPreview: (d.content || '').slice(0, 1200),
          blobId: d.blobId,
        })),
        recommendation: ctx.memory || memoryDocs.length
          ? 'Use these facts as persistent context only when relevant to the user request.'
          : 'No dedicated memory file is loaded yet. If the user gives durable preferences or project facts, offer to store a concise memory note on-chain.',
      }, null, 2);
    },
    {
      description:
        'Inspect durable user/project memory if provided or infer memory-like files from the loaded vault. Use when the user asks about preferences, recurring goals, product direction, or what the agent should remember.',
      schema: z.object({}),
    },
  );

  const searchMemory = createTool(
    lifecycle,
    'search_memory',
    ({ query }: { query: string }) => `Searching saved memory for "${query}"`,
    ({ query }: { query: string }) => {
      const hits = topMemorySnippets(ctx, docs, query);
      if (!hits.length) return 'No relevant saved memory was found for that query.';
      return JSON.stringify({
        query,
        hits: hits.map(hit => ({
          source: hit.source,
          score: hit.score,
          blobId: hit.blobId,
          preview: hit.preview,
        })),
      }, null, 2);
    },
    {
      description:
        'Search durable memory context and memory-like vault files for relevant user preferences, project facts, decisions, or strategy notes. Use instead of stuffing all memory into every answer.',
      schema: z.object({ query: z.string().describe('What memory to look up.') }),
    },
  );

  const draftMemoryNote = createTool(
    lifecycle,
    'draft_memory_note',
    () => 'Drafting a memory note',
    ({ fact, reason }: { fact: string; reason?: string }) => {
      const cleanFact = fact.trim().replace(/\s+/g, ' ').slice(0, 900);
      const cleanReason = (reason || '').trim().replace(/\s+/g, ' ').slice(0, 260);
      const today = new Date().toISOString().slice(0, 10);
      const slug = cleanFact.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'memory';
      return JSON.stringify({
        filename: `memory-${today}-${slug}.md`,
        content: [
          '# ChainMind Memory',
          '',
          `- Date: ${today}`,
          `- Fact: ${cleanFact}`,
          cleanReason ? `- Why it matters: ${cleanReason}` : '',
          '- Scope: Use only when relevant to future ChainMind answers.',
        ].filter(Boolean).join('\n'),
        instruction: 'If the user wants this remembered, present this content and add a STORE marker so they can save it to Walrus + Sui.',
      }, null, 2);
    },
    {
      description:
        'Draft a concise memory artifact when the user asks ChainMind to remember a durable preference, project fact, or decision. This does not save automatically; it prepares content for a store offer.',
      schema: z.object({
        fact: z.string().describe('The durable fact or preference to remember.'),
        reason: z.string().optional().describe('Why this memory may help future answers.'),
      }),
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
    async ({ owner }: { owner?: string | null }) => {
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
    async ({ query, owner }: { query: string; owner?: string | null }) => {
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
    async ({ owner }: { owner?: string | null }) => {
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
  const firstPartyTools = [planVaultWork, assessActionPolicy, inspectLoadedVault, vaultStats, findDuplicates, findLargeFiles, findMissingContent, compareFiles, inspectMemory, searchMemory, draftMemoryNote, readCurrentFile, searchVault, listOnchainVault, searchOnchainVault, readWalrusBlob, auditVault, cryptoPrice];
  const tools = process.env.TAVILY_API_KEY
    ? [...firstPartyTools, makeWebSearchTool()]
    : firstPartyTools;

  return createAgent({
    model,
    tools,
    systemPrompt:
      "You are ChainMind's assistant, a useful working agent for a user-owned on-chain file vault. " +
      'Use tools for real work instead of pretending. ' +
      'For broad, ambiguous, multi-step, or high-stakes requests, call plan_vault_work first and then execute the useful read-only tools it suggests. ' +
      'When a question is about the currently open file, call read_current_file first. ' +
      'When a question is about files visible in the app, including total file count or vault size, call vault_stats or inspect_loaded_vault before answering. ' +
      'For cleanup, storage, duplicate, largest-file, missing-text, or comparison questions, choose the matching vault tool: vault_stats, find_duplicate_files, find_large_files, find_missing_content, or compare_files. ' +
      'When the user asks about remembered preferences, product direction, recurring goals, or what you know about them, call search_memory or inspect_memory_context. ' +
      'When the user asks you to remember a durable preference, project fact, or decision, call draft_memory_note, show the note content, and offer to store it on-chain with the STORE marker. ' +
      'When the user asks what is truly on-chain, wants a restore/check, or needs higher confidence, call list_onchain_vault or search_onchain_vault; these read Sui through Tatum and Walrus blobs directly. ' +
      'When the user asks to audit, check, improve, clean up, debug, or understand vault health, call audit_vault_health. ' +
      'Before answering a request that could delete, list, buy, sell, transfer, restore, decrypt, share, or change wallet/vault state, call assess_action_policy. Do not perform financial, marketplace, delete, or wallet actions autonomously; propose the action and wait for the user to use the app controls or confirm through an approval UI. ' +
      'If an answer needs exact contents and you have a blobId, call read_walrus_blob. ' +
      'When the user needs current or external information, use the web search tool when available, then cite what you found. ' +
      'For the live price of a crypto asset, use crypto_price. ' +
      'When the user asks you to create/write/generate something useful, produce the finished content as your answer, then on the VERY LAST line add a marker exactly like ' +
      '[[STORE:suggested-filename.ext|a short, specific one-line invitation to save THIS thing]] ' +
      'Pick a short filename with the right extension. Only add that marker when you actually created a file, document, code, data, or plan worth saving. ' +
      'When you generate the CONTENTS of a file (a document, README, script, config, HTML, etc.), put the full file content inside a fenced code block tagged with the correct language (```md, ```html, ```python, ```json, ...). That renders it in a file window the user can copy or download directly — and documents (md/html/txt) can be downloaded as Word (.docx). ' +
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
  | { type: 'error'; message: string }
  | { type: 'trace'; summary: AgentTraceSummary }
  | { type: 'offer'; kind: 'store'; filename: string; question: string; content: string; message?: string };

function stepLabel(toolName: string, args: Record<string, unknown>): string {
  const q = String(args.query ?? args.input ?? '');
  if (toolName === 'plan_vault_work') return 'Planning the vault work';
  if (toolName === 'assess_action_policy') return 'Checking action policy';
  if (toolName === 'inspect_loaded_vault') return 'Inspecting the loaded vault';
  if (toolName === 'vault_stats') return 'Calculating vault stats';
  if (toolName === 'find_duplicate_files') return 'Checking for duplicate files';
  if (toolName === 'find_large_files') return 'Finding large files';
  if (toolName === 'find_missing_content') return 'Finding files missing extracted text';
  if (toolName === 'compare_files') return `Comparing ${String(args.left ?? 'file')} and ${String(args.right ?? 'file')}`;
  if (toolName === 'inspect_memory_context') return 'Inspecting saved memory context';
  if (toolName === 'search_memory') return q ? `Searching saved memory for "${q}"` : 'Searching saved memory';
  if (toolName === 'draft_memory_note') return 'Drafting a memory note';
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

function normalizeCitationLabel(label: string) {
  return label
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function restoreExactVaultCitations(answer: string, docs: VaultDoc[], currentFile?: VaultDoc) {
  const exactByNormalized = new Map<string, string>();
  for (const doc of [...visibleDocs(docs), ...(currentFile ? [currentFile] : [])]) {
    if (doc?.filename) exactByNormalized.set(normalizeCitationLabel(doc.filename), doc.filename);
  }
  if (!exactByNormalized.size) return answer;
  let restored = answer.replace(/\[([^\]\n]{1,180})\]/g, (match, label: string) => {
    const normalized = normalizeCitationLabel(label);
    const exact = exactByNormalized.get(normalized);
    return exact ? `[${exact}]` : match;
  });
  for (const [normalized, exact] of exactByNormalized) {
    const pattern = [...normalized].map(ch => {
      if (ch === '-') return '[\\-\\u2010-\\u2015\\u2212]';
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    restored = restored.replace(new RegExp(pattern, 'gi'), exact);
  }
  return restored;
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

function messageContentToText(content: unknown) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') {
        const record = part as Record<string, unknown>;
        if (typeof record.text === 'string') return record.text;
        if (typeof record.content === 'string') return record.content;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

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

export async function* streamVaultAgentEvents(ctx: AgentContext, question: string, history: ChatTurn[] = [], options: { signal?: AbortSignal } = {}): AsyncGenerator<AgentEvent> {
  type Msg = {
    content?: unknown;
    tool_calls?: { id?: string; name: string; args: Record<string, unknown> }[];
    tool_call_id?: string;
    name?: string;
    _getType?: () => string;
    constructor?: { name?: string };
  };
  const trace = new AgentTraceRecorder();
  const queue = createEventQueue<AgentEvent>();
  const lifecycle: ToolLifecycleSink = event => {
    if (event.type === 'tool_start') trace.toolCall(event.tool, { label: event.label });
    queue.push(event);
  };
  trace.start({ question, owner: ctx.owner, currentFile: ctx.currentFile?.filename });

  const priorMsgs = (Array.isArray(history) ? history : [])
    .filter(m => m && (m.role === 'user' || m.role === 'ai') && m.text)
    .slice(-8)
    .map(m => ({ role: m.role === 'ai' ? ('assistant' as const) : ('user' as const), content: String(m.text) }));
  const inputMessages = [...priorMsgs, { role: 'user' as const, content: question }];

  const MAX_ATTEMPTS = 3;
  const produce = async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let answered = false;
      let finalText = '';
      // Token-streaming buffer: emit answer tokens live, holding back the tail so a
      // partial "[[STORE…]]" marker is never shown, and stopping once it appears.
      let streamAcc = '';
      let emitted = 0;
      let markerHit = false;
      const thirdPartyCalls = new Map<string, { id: string; tool: string; label: string; started: number }>();
      if (attempt > 1) queue.push({ type: 'reset' });
      try {
        const agent = buildVaultAgent(ctx, attempt === 1 ? 0 : 0.4, lifecycle);
        // 'messages' streams the LLM answer token-by-token (live typing); 'updates'
        // gives tool lifecycle + the clean final message. We filter tool messages
        // out of the token stream below so their JSON never leaks into the reply.
        const stream = await agent.stream({ messages: inputMessages }, { streamMode: ['updates', 'messages'], signal: options.signal });
        for await (const item of stream as AsyncIterable<[string, unknown]>) {
          if (options.signal?.aborted) throw new Error('Agent request was cancelled.');
          const [mode, data] = item;
          if (mode === 'updates') {
            // Tool lifecycle is emitted by the wrapped tool functions. We also
            // capture only final AI messages here so ToolMessage JSON never leaks
            // into the user-visible answer.
            for (const value of Object.values(data as Record<string, { messages?: Msg[] }>)) {
              for (const m of value?.messages ?? []) {
                for (const tc of m.tool_calls ?? []) {
                  if (tc.name.includes('tavily')) {
                    const id = `${tc.name}-${Date.now()}-${++toolRunSeq}`;
                    const callKey = String((tc as { id?: string }).id ?? tc.name);
                    const label = stepLabel(tc.name, tc.args);
                    thirdPartyCalls.set(callKey, { id, tool: tc.name, label, started: Date.now() });
                    thirdPartyCalls.set(tc.name, { id, tool: tc.name, label, started: Date.now() });
                    trace.toolCall(tc.name, tc.args);
                    queue.push({ type: 'tool_start', id, tool: tc.name, label });
                  }
                }
                const type = m._getType?.() ?? m.constructor?.name ?? '';
                const isToolMessage = Boolean(m.tool_call_id) || type.toLowerCase().includes('tool');
                if (m.tool_call_id) {
                  const pending = thirdPartyCalls.get(String(m.tool_call_id)) || thirdPartyCalls.get(String(m.name ?? '')) || thirdPartyCalls.get(type);
                  if (pending) {
                    const content = messageContentToText(m.content) || JSON.stringify(m.content ?? '');
                    queue.push({
                      type: 'tool_done',
                      id: pending.id,
                      tool: pending.tool,
                      label: pending.label,
                      detail: `${resultDetail(content)} in ${Date.now() - pending.started}ms`,
                      durationMs: Date.now() - pending.started,
                    });
                    thirdPartyCalls.delete(String(m.tool_call_id));
                    thirdPartyCalls.delete(String(m.name ?? ''));
                    thirdPartyCalls.delete(pending.tool);
                  }
                }
                const isToolRequest = Boolean(m.tool_calls?.length);
                const contentText = messageContentToText(m.content);
                if (!isToolMessage && !isToolRequest && contentText.trim()) {
                  finalText = contentText;
                  answered = true;
                }
              }
            }
          } else if (mode === 'messages') {
            // Stream ONLY the LLM's answer tokens. Skip tool-result messages —
            // their JSON content leaking in is exactly why this was removed before.
            const md = data as [{ content?: unknown; tool_call_id?: string; _getType?: () => string }, { langgraph_node?: string }];
            const chunk = md?.[0];
            const meta = md?.[1];
            const isTool = Boolean(chunk?.tool_call_id) || meta?.langgraph_node === 'tools' || String(chunk?._getType?.() ?? '').toLowerCase().includes('tool');
            const piece = typeof chunk?.content === 'string' ? chunk.content : '';
            if (!isTool && piece && !markerHit) {
              streamAcc += piece;
              const markerIndex = streamAcc.indexOf('[[STORE');
              const safeEnd = markerIndex >= 0 ? markerIndex : Math.max(emitted, streamAcc.length - 24);
              if (markerIndex >= 0) markerHit = true;
              if (safeEnd > emitted) {
                queue.push({ type: 'token', text: streamAcc.slice(emitted, safeEnd) });
                emitted = safeEnd;
              }
            }
          }
        }
        for (const pending of new Map([...thirdPartyCalls.values()].map(call => [call.id, call])).values()) {
          queue.push({
            type: 'tool_done',
            id: pending.id,
            tool: pending.tool,
            label: pending.label,
            detail: `Completed in ${Date.now() - pending.started}ms`,
            durationMs: Date.now() - pending.started,
          });
        }
        const parsed = parseStoreMarker(restoreExactVaultCitations(finalText, ctx.docs ?? [], ctx.currentFile));
        if (!parsed.text.trim()) {
          trace.error('Agent returned no final answer.');
          trace.finish();
          queue.push({ type: 'trace', summary: trace.summary() });
          queue.push({ type: 'error', message: 'The agent did real work, but did not return a final answer. Please retry.' });
          queue.close();
          return;
        }
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
