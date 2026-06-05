// ── ChainMind agent (LangChain 1.0 + Groq) ──
// A thin LangChain `createAgent` loop powered by the free Groq key. Step 1 ships
// ONE read-only tool (search_vault) — no on-chain writes, nothing irreversible.
// Future tools (generate, seal-encrypt, mint, list) get added here one at a time,
// each behind a user-confirmation gate before any wallet/on-chain action.
import { createAgent, tool } from 'langchain';
import { ChatGroq } from '@langchain/groq';
import { TavilySearch } from '@langchain/tavily';
import * as z from 'zod';

// Matches the doc shape the client already sends to /api/ask-vault.
export type VaultDoc = { filename: string; summary?: string; content?: string };

// Groq model for the agent. We benchmarked tool-call reliability: llama-3.3-70b
// intermittently emits a malformed call (400 tool_use_failed), while gpt-oss-120b
// returned clean tool calls 4/4. It's free on Groq and a capable reasoner.
const GROQ_TOOL_MODEL = 'openai/gpt-oss-120b';

export function buildVaultAgent(docs: VaultDoc[], temperature = 0) {
  const searchVault = tool(
    ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      const hits = docs.filter(
        d =>
          d.filename.toLowerCase().includes(q) ||
          (d.summary ?? '').toLowerCase().includes(q) ||
          (d.content ?? '').toLowerCase().includes(q),
      );
      if (hits.length === 0) return 'No matching files found in the vault.';
      return hits
        .slice(0, 5)
        .map(d => `# ${d.filename}\n${d.summary ?? d.content?.slice(0, 500) ?? '(no summary)'}`)
        .join('\n\n');
    },
    {
      name: 'search_vault',
      description:
        "Search the user's on-chain file vault by keyword. Returns matching filenames and their summaries. Use this before answering questions about the user's files.",
      schema: z.object({ query: z.string().describe('Keyword or phrase to search the vault for') }),
    },
  );

  const model = new ChatGroq({ model: GROQ_TOOL_MODEL, temperature });

  // Web search via Tavily (real-time, LLM-optimized). Only enabled when a key is
  // set (TAVILY_API_KEY) — free tier is plenty for prompts.
  const tools = process.env.TAVILY_API_KEY
    ? [searchVault, new TavilySearch({ maxResults: 5 })]
    : [searchVault];

  return createAgent({
    model,
    tools,
    systemPrompt:
      "You are ChainMind's assistant. The user owns files stored on-chain. " +
      'When a question is about their files, ALWAYS call search_vault first, then answer ' +
      'using only the tool results. Trust the tool output. ' +
      'When the user needs current or external information, use the web search (tavily) tool, ' +
      'then cite what you found. ' +
      'When the user asks you to create/write/generate something (a document, plan, code, etc.), ' +
      'produce the finished content as your answer, then on the VERY LAST line add a marker exactly like ' +
      '[[STORE:suggested-filename.ext|a short, specific one-line invitation to save THIS thing]] — ' +
      'pick a short filename with the right extension (.md, .py, .json, .html, …) and write the message so it ' +
      'fits what you made (e.g. "Save this Fibonacci script to your vault?" or "Keep this market report on-chain?"). ' +
      'Only add that marker when you actually created a file/document/code worth saving; never add it for plain answers or questions. ' +
      'Be concise. ' +
      'Whenever you mention a file from the vault, write its exact name in SQUARE BRACKETS, ' +
      'e.g. [Day 0-4 Lessons.txt], so it renders as a clickable link. ' +
      'Never wrap file names in asterisks or quotes.',
  });
}

// Run the agent and return its final text answer.
export async function runVaultAgent(docs: VaultDoc[], question: string): Promise<string> {
  const agent = buildVaultAgent(docs);
  const result = await agent.invoke({ messages: [{ role: 'user', content: question }] });
  const messages = result.messages;
  const last = messages[messages.length - 1];
  return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
}

// An event in the agent's activity chain — what the agent is doing, step by step.
export type AgentEvent =
  | { type: 'step'; tool: string; label: string }
  | { type: 'token'; text: string }            // live answer token (streamed)
  | { type: 'reset' }                          // clear streamed answer (on retry)
  | { type: 'answer'; text: string }           // final, cleaned answer (replaces streamed)
  // After generating content, offer to store it on-chain (the client handles the
  // choice — "Store" runs the existing Walrus+Sui upload pipeline). `content` is
  // the exact artifact to store; `message` is a short, context-aware line.
  | { type: 'offer'; kind: 'store'; filename: string; question: string; content: string; message?: string };

// Friendly, human-readable label for a tool call shown in the chain.
function stepLabel(tool: string, args: Record<string, unknown>): string {
  const q = String(args.query ?? '');
  if (tool === 'search_vault') return `Searching your vault for “${q}”`;
  if (tool.includes('tavily') || tool.includes('search')) return `Searching the web for “${q}”`;
  return `Running ${tool}`;
}

// Clean the model's [[STORE:filename|message]] marker → suggested filename,
// optional context message, and the answer with the marker removed.
function parseStoreMarker(answer: string): { filename: string | null; message?: string; text: string } {
  const m = answer.match(/\[\[STORE:\s*([^\]|]+?)\s*(?:\|\s*([^\]]*?))?\s*\]\]\s*$/i);
  if (!m) return { filename: null, text: answer };
  return { filename: m[1].trim(), message: m[2]?.trim() || undefined, text: answer.slice(0, m.index).trimEnd() };
}
// Pick a sensible extension for the generated content (any text/code type).
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
// Store the specific artifact: if the answer is mostly one fenced code block,
// store just that code; otherwise store the whole answer.
function extractArtifact(answer: string): string {
  const blocks = [...answer.matchAll(/```[a-z0-9]*\n([\s\S]*?)```/gi)].map(b => b[1]);
  if (blocks.length === 1 && blocks[0].length > answer.length * 0.5) return blocks[0].trim();
  return answer.trim();
}

// Groq Llama occasionally emits a malformed tool call → 400 "tool_use_failed".
// It's intermittent, so retrying the run usually succeeds.
function isToolFormatError(err: unknown): boolean {
  const s = String(err);
  return s.includes('tool_use_failed') || s.includes('Failed to call a function');
}

// Stream the agent loop as a sequence of chain events (steps, then the answer).
// Retries the whole run a couple of times if Groq rejects a malformed tool call,
// surfacing a "retrying" step so the chain stays honest about what happened.
export type ChatTurn = { role?: string; text?: string };
export async function* streamVaultAgentEvents(docs: VaultDoc[], question: string, history: ChatTurn[] = []): AsyncGenerator<AgentEvent> {
  type Msg = { content?: unknown; tool_calls?: { name: string; args: Record<string, unknown> }[] };
  // Short-term memory: replay recent turns so the agent has context within the chat.
  const priorMsgs = (Array.isArray(history) ? history : [])
    .filter(m => m && (m.role === 'user' || m.role === 'ai') && m.text)
    .slice(-8)
    .map(m => ({ role: m.role === 'ai' ? ('assistant' as const) : ('user' as const), content: String(m.text) }));
  const inputMessages = [...priorMsgs, { role: 'user' as const, content: question }];

  const MAX_ATTEMPTS = 3;
  const TAIL = 8; // hold back enough chars to detect a split "[[STORE:" marker
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let answered = false;
    let acc = '';        // full answer text accumulated from streamed tokens
    let emitted = 0;     // chars already streamed to the client
    let markerHit = false;
    if (attempt > 1) yield { type: 'reset' }; // clear any partial from the failed attempt
    try {
      // First attempt deterministic (temp 0); retries add a little heat so a
      // rare malformed tool call isn't reproduced identically.
      const agent = buildVaultAgent(docs, attempt === 1 ? 0 : 0.4);
      // 'updates' → tool steps for the chain; 'messages' → live answer tokens.
      const stream = await agent.stream({ messages: inputMessages }, { streamMode: ['updates', 'messages'] });
      for await (const item of stream as AsyncIterable<[string, unknown]>) {
        const [mode, data] = item;
        if (mode === 'updates') {
          for (const value of Object.values(data as Record<string, { messages?: Msg[] }>)) {
            for (const m of value?.messages ?? []) {
              for (const tc of m.tool_calls ?? []) yield { type: 'step', tool: tc.name, label: stepLabel(tc.name, tc.args) };
            }
          }
        } else if (mode === 'messages') {
          const chunk = (data as [{ content?: unknown }, unknown])[0];
          const piece = typeof chunk?.content === 'string' ? chunk.content : '';
          if (!piece) continue;
          answered = true;
          acc += piece;
          if (markerHit) continue;
          // Stream everything that's safe to show — up to the store marker if it
          // has started, else hold back a small tail so a partial marker never flashes.
          const mi = acc.indexOf('[[STORE');
          const safeEnd = mi >= 0 ? mi : Math.max(emitted, acc.length - TAIL);
          if (mi >= 0) markerHit = true;
          if (safeEnd > emitted) { yield { type: 'token', text: acc.slice(emitted, safeEnd) }; emitted = safeEnd; }
        }
      }
      // Finalize: send the cleaned full answer (replaces streamed text + removes marker).
      const parsed = parseStoreMarker(acc);
      yield { type: 'answer', text: parsed.text };
      if (parsed.filename && parsed.text.trim().length > 0) {
        yield { type: 'offer', kind: 'store', filename: sanitizeFilename(parsed.filename, parsed.text), message: parsed.message, content: extractArtifact(parsed.text), question: 'Want to store this on-chain (Walrus + Sui)?' };
      }
      return; // run completed
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && !answered && isToolFormatError(err)) {
        yield { type: 'step', tool: 'retry', label: 'Reformatting the request and retrying…' };
        continue;
      }
      throw err; // give up — the route turns this into a clean error event
    }
  }
}
