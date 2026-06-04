import { NextRequest, NextResponse } from 'next/server';
import { streamVaultAgentEvents, VaultDoc } from '@/lib/agent';

// ChainMind agent (step 1: read-only). Streams the agent's activity chain as
// NDJSON — one JSON event per line: {type:'step',...} for each action, then
// {type:'answer',text} at the end. The UI renders the chain + final answer live.
export async function POST(req: NextRequest) {
  const { docs, question, history } = await req.json();
  if (!Array.isArray(docs) || !question || typeof question !== 'string') {
    return NextResponse.json({ error: 'Missing docs or question' }, { status: 400 });
  }
  const turns = Array.isArray(history) ? history : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamVaultAgentEvents(docs as VaultDoc[], question, turns)) {
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
