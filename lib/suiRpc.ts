import { tatumRpcUrl, PUBLIC_FULLNODE } from '@/lib/network';

const RPC = tatumRpcUrl();

// Robust server-side Sui JSON-RPC: Tatum gateway (primary) + public fullnode
// (fallback), with a per-try timeout and a second pass on a short backoff — so a
// transient blip or a slow node doesn't surface as "Sui RPC unavailable".
// Shared by every API route + on-chain reader so the fix lives in one place.
export async function suiRpc<T = unknown>(method: string, params: unknown[], opts?: { timeoutMs?: number; passes?: number }): Promise<T> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const urls = Array.from(new Set([RPC, PUBLIC_FULLNODE].filter(Boolean)));
  const timeoutMs = opts?.timeoutMs ?? 12000;
  const passes = opts?.passes ?? 2;
  for (let attempt = 0; attempt < passes; attempt++) {
    for (const url of urls) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json() as { result?: T; error?: unknown };
        if (data.error) continue;
        if (data.result != null) return data.result;
      } catch { /* try next upstream */ }
    }
    if (attempt < passes - 1) await new Promise(r => setTimeout(r, 600));
  }
  throw new Error('Sui RPC unavailable');
}

// Raw passthrough (for the browser /api/rpc proxy, which forwards an opaque
// JSON-RPC body rather than a method+params). Returns the upstream Response text.
export async function suiRpcRaw(body: string, opts?: { timeoutMs?: number; passes?: number }): Promise<string> {
  const urls = Array.from(new Set([RPC, PUBLIC_FULLNODE].filter(Boolean)));
  const timeoutMs = opts?.timeoutMs ?? 12000;
  const passes = opts?.passes ?? 2;
  for (let attempt = 0; attempt < passes; attempt++) {
    for (const url of urls) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctl.signal });
        clearTimeout(timer);
        if (res.ok) return await res.text();
      } catch { /* try next upstream */ }
    }
    if (attempt < passes - 1) await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('Sui RPC upstream unavailable');
}
