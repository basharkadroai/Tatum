import { NextRequest, NextResponse } from 'next/server';
import { streamVaultAgentEvents, AgentContext, VaultDoc } from '@/lib/agent';

const MAX_DOCS = 60;
const MAX_TEXT = 12000;
const MAX_SUMMARY = 2500;
const MAX_META = 500;
const MAX_QUESTION = 4000;
const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_TEXT = 4000;
const MAX_TOTAL_DOC_TEXT = 36000;

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
    entryId: cleanString(record.entryId),
    listingId: cleanString(record.listingId),
    priceMist: cleanString(record.priceMist),
    listed: record.listed === true,
    purchased: record.purchased === true,
    encrypted: record.encrypted === true,
    sealId: cleanString(record.sealId),
    sealPolicyId: cleanString(record.sealPolicyId),
    ciphertextSizeBytes: cleanNumber(record.ciphertextSizeBytes),
    decryptedAt: cleanString(record.decryptedAt, 80),
  };
}

function trimDocBudget(docs: VaultDoc[]) {
  let remaining = MAX_TOTAL_DOC_TEXT;
  return docs.map(doc => {
    const content = doc.content || '';
    const summary = doc.summary || '';
    const contentBudget = Math.max(0, remaining - summary.length);
    const next = { ...doc, summary: summary.slice(0, MAX_SUMMARY), content: content.slice(0, contentBudget) };
    remaining -= (next.summary?.length || 0) + (next.content?.length || 0);
    return next;
  });
}

function cleanHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_HISTORY_TURNS)
    .map(turn => {
      if (!turn || typeof turn !== 'object') return null;
      const record = turn as Record<string, unknown>;
      const role = record.role === 'ai' ? 'ai' : record.role === 'user' ? 'user' : '';
      const text = cleanString(record.text, MAX_HISTORY_TEXT);
      return role && text ? { role, text } : null;
    })
    .filter((turn): turn is { role: 'user' | 'ai'; text: string } => Boolean(turn));
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
  const safeDocs = trimDocBudget(Array.isArray(docs) ? docs.slice(0, MAX_DOCS).map(cleanDoc).filter((doc): doc is VaultDoc => Boolean(doc)) : []);
  const turns = cleanHistory(history);
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
        for await (const event of streamVaultAgentEvents(ctx, question.slice(0, MAX_QUESTION), turns, { signal: req.signal })) {
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
