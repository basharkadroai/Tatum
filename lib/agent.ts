// ── ChainMind agent (LangChain 1.0 + Groq) ──
// A thin LangChain `createAgent` loop powered by the free Groq key. Step 1 ships
// ONE read-only tool (search_vault) — no on-chain writes, nothing irreversible.
// Future tools (generate, seal-encrypt, mint, list) get added here one at a time,
// each behind a user-confirmation gate before any wallet/on-chain action.
import { createAgent, tool } from 'langchain';
import { ChatGroq } from '@langchain/groq';
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

  return createAgent({
    model,
    tools: [searchVault],
    systemPrompt:
      "You are ChainMind's assistant. The user owns files stored on-chain. " +
      'When a question is about their files, ALWAYS call search_vault first, then answer ' +
      'using only the tool results. Trust the tool output. Be concise.',
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
  | { type: 'answer'; text: string };

// Friendly, human-readable label for a tool call shown in the chain.
function stepLabel(tool: string, args: Record<string, unknown>): string {
  if (tool === 'search_vault') return `Searching your vault for “${String(args.query ?? '')}”`;
  return `Running ${tool}`;
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
export async function* streamVaultAgentEvents(docs: VaultDoc[], question: string): AsyncGenerator<AgentEvent> {
  type Msg = { content?: unknown; tool_calls?: { name: string; args: Record<string, unknown> }[] };
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let answered = false;
    try {
      // First attempt deterministic (temp 0); retries add a little heat so a
      // rare malformed tool call isn't reproduced identically.
      const agent = buildVaultAgent(docs, attempt === 1 ? 0 : 0.4);
      const stream = await agent.stream({ messages: [{ role: 'user', content: question }] }, { streamMode: 'updates' });
      for await (const chunk of stream) {
        for (const [node, value] of Object.entries(chunk) as [string, { messages?: Msg[] }][]) {
          for (const m of value?.messages ?? []) {
            for (const tc of m.tool_calls ?? []) {
              yield { type: 'step', tool: tc.name, label: stepLabel(tc.name, tc.args) };
            }
            // Only the MODEL node produces answers. The 'tools' node carries tool
            // results (also string content, no tool_calls) — never treat those as the answer.
            if (node !== 'tools' && (!m.tool_calls || m.tool_calls.length === 0) && typeof m.content === 'string' && m.content.trim()) {
              answered = true;
              yield { type: 'answer', text: m.content };
            }
          }
        }
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
