import { NextResponse } from 'next/server';

export async function GET() {
  console.log('[health] check started');

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    ollama: { ok: false, model: process.env.OLLAMA_MODEL || 'llama3.2', error: null },
    walrus: { ok: false, publisher: process.env.WALRUS_PUBLISHER_URL, error: null },
    tatum: { ok: false, rpc: process.env.NEXT_PUBLIC_TATUM_SUI_RPC, error: null },
  };

  // Check Ollama
  try {
    const res = await fetch(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const models = data.models?.map((m: { name: string }) => m.name) ?? [];
    console.log('[health] Ollama models:', models);
    results.ollama = { ok: res.ok, models, model: process.env.OLLAMA_MODEL || 'llama3.2', error: null };
  } catch (err) {
    console.error('[health] Ollama unreachable:', err);
    results.ollama = { ok: false, error: String(err) };
  }

  // Check Walrus publisher
  try {
    const res = await fetch(
      `${process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space'}/v1/health`,
      { signal: AbortSignal.timeout(5000) },
    );
    console.log('[health] Walrus status:', res.status);
    results.walrus = { ok: res.status < 500, status: res.status, error: null };
  } catch (err) {
    console.error('[health] Walrus unreachable:', err);
    results.walrus = { ok: false, error: String(err) };
  }

  // Check Tatum / Sui RPC
  try {
    const rpc = process.env.NEXT_PUBLIC_TATUM_SUI_RPC || '';
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sui_getChainIdentifier', params: [] }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    console.log('[health] Tatum/Sui response:', data);
    results.tatum = { ok: !!data.result, chainId: data.result, error: data.error ?? null };
  } catch (err) {
    console.error('[health] Tatum RPC unreachable:', err);
    results.tatum = { ok: false, error: String(err) };
  }

  console.log('[health] results:', results);
  return NextResponse.json(results);
}
