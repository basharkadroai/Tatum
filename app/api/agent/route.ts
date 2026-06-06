import { NextRequest, NextResponse } from 'next/server';
import { streamVaultAgentEvents, AgentContext, VaultDoc } from '@/lib/agent';

// ChainMind agent (step 1: read-only). Streams the agent's activity chain as
// NDJSON — one JSON event per line: {type:'step',...} for each action, then
// {type:'answer',text} at the end. The UI renders the chain + final answer live.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    console.warn('[agent-route]', JSON.stringify({ type: 'bad_json', error: String(err).slice(0, 200) }));
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { docs, question, history, owner, currentFile, memory } = body as Record<string, unknown>;
  if (!question || typeof question !== 'string') {
    console.warn('[agent-route]', JSON.stringify({ type: 'bad_request', reason: 'missing_question' }));
    return NextResponse.json({ error: 'Missing question' }, { status: 400 });
  }
  const safeDocs = Array.isArray(docs) ? docs as VaultDoc[] : [];
  const turns = Array.isArray(history) ? history : [];
  const ctx: AgentContext = {
    docs: safeDocs,
    owner: typeof owner === 'string' ? owner : undefined,
    currentFile: currentFile && typeof currentFile === 'object' ? currentFile as VaultDoc : undefined,
    memory: typeof memory === 'string' ? memory.slice(0, 8000) : undefined,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamVaultAgentEvents(ctx, question, turns)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: String(err).slice(0, 200) }) + '\n'));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
