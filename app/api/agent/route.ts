import { NextRequest, NextResponse } from 'next/server';
import { streamVaultAgentEvents, AgentContext, VaultDoc } from '@/lib/agent';

const MAX_DOCS = 60;
const MAX_TEXT = 12000;
const MAX_SUMMARY = 2500;
const MAX_META = 500;

function cleanString(value: unknown, max = MAX_META) {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

function cleanNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function cleanDoc(value: unknown): VaultDoc | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const filename = cleanString(record.filename, 260);
  if (!filename) return null;
  return {
    filename,
    summary: cleanString(record.summary, MAX_SUMMARY),
    content: cleanString(record.content, MAX_TEXT),
    blobId: cleanString(record.blobId),
    fileType: cleanString(record.fileType, 120),
    sizeBytes: cleanNumber(record.sizeBytes),
    owner: cleanString(record.owner),
    txDigest: cleanString(record.txDigest),
  };
}

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
  const safeDocs = Array.isArray(docs) ? docs.slice(0, MAX_DOCS).map(cleanDoc).filter((doc): doc is VaultDoc => Boolean(doc)) : [];
  const turns = Array.isArray(history) ? history : [];
  const ctx: AgentContext = {
    docs: safeDocs,
    owner: typeof owner === 'string' ? owner : undefined,
    currentFile: cleanDoc(currentFile) ?? undefined,
    memory: typeof memory === 'string' ? memory.slice(0, 8000) : undefined,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamVaultAgentEvents(ctx, question, turns, { signal: req.signal })) {
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
