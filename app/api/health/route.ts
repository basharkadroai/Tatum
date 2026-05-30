import { NextResponse } from 'next/server';
import { SUI_NETWORK, tatumRpcUrl, WALRUS_PUBLISHER } from '@/lib/network';

export async function GET() {
  console.log('[health] check started');

  const usingGroq = !!process.env.GROQ_API_KEY;
  const RPC = tatumRpcUrl();

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    network: SUI_NETWORK,
    ai: { provider: usingGroq ? 'groq' : 'ollama', ok: false, error: null },
    walrus: { ok: false, publisher: WALRUS_PUBLISHER, error: null },
    tatum: { ok: false, rpc: RPC, error: null },
  };

  // Check AI provider
  if (usingGroq) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      console.log('[health] Groq status:', res.status);
      results.ai = { provider: 'groq', ok: res.ok, model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant', error: null };
    } catch (err) {
      console.error('[health] Groq unreachable:', err);
      results.ai = { provider: 'groq', ok: false, error: String(err) };
    }
  } else {
    try {
      const res = await fetch(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      const models = data.models?.map((m: { name: string }) => m.name) ?? [];
      console.log('[health] Ollama models:', models);
      results.ai = { provider: 'ollama', ok: res.ok, models, model: process.env.OLLAMA_MODEL || 'llama3.2', error: null };
    } catch (err) {
      console.error('[health] Ollama unreachable:', err);
      results.ai = { provider: 'ollama', ok: false, error: String(err) };
    }
  }

  // Check Walrus publisher
  try {
    const res = await fetch(
      `${WALRUS_PUBLISHER}/v1/health`,
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
    const res = await fetch(RPC, {
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
