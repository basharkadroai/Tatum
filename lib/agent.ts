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

// Groq model that supports tool calling (same default as lib/ai.ts).
const GROQ_TOOL_MODEL = 'llama-3.3-70b-versatile';

export function buildVaultAgent(docs: VaultDoc[]) {
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

  const model = new ChatGroq({ model: GROQ_TOOL_MODEL, temperature: 0.3 });

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
