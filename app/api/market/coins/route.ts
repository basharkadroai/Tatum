import { NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE } from '@/lib/network';
import { cleanEnv } from '@/lib/env';
import type { ContentCoinMarket } from '@/types/contentcoin';

const RPC = tatumRpcUrl();
const CC = cleanEnv(process.env.NEXT_PUBLIC_CONTENTCOIN_PACKAGE);
// Must match content_coin.move.
const BASE = BigInt(1_000_000);
const SLOPE = BigInt(10_000);
const MIST = BigInt(1_000_000_000);

type RpcResult<T = unknown> = { result?: T; error?: { message?: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  for (const url of [RPC, PUBLIC_FULLNODE]) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) continue;
      const data = (await res.json()) as RpcResult<T>;
      if (data.error) continue;
      if (data.result != null) return data.result;
    } catch { /* next upstream */ }
  }
  throw new Error('Sui RPC unavailable');
}

function mistToSui(m: string | number | bigint) {
  try {
    const raw = BigInt(m);
    const whole = raw / MIST, frac = raw % MIST;
    if (frac === BigInt(0)) return whole.toString();
    return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '').slice(0, 5)}`;
  } catch { return '0'; }
}

async function readMarket(marketId: string) {
  try {
    const obj = await rpc<{ data?: { content?: { fields?: {
      blob_id?: string; filename?: string; creator?: string; supply?: string | number;
      reserve?: string | number;
    } } } }>('sui_getObject', [marketId, { showContent: true }]);
    return obj?.data?.content?.fields ?? null;
  } catch { return null; }
}

export async function GET() {
  if (!CC) return NextResponse.json({ markets: [] });
  try {
    const events = await rpc<{ data?: Array<{ parsedJson?: Record<string, unknown> }> }>(
      'suix_queryEvents', [{ MoveEventType: `${CC}::market::MarketCreated` }, null, 100, true],
    );
    const markets: ContentCoinMarket[] = [];
    const seen = new Set<string>();
    for (const ev of events.data ?? []) {
      const p = ev.parsedJson ?? {};
      const marketId = String(p.market_id ?? '');
      if (!marketId || seen.has(marketId)) continue;
      seen.add(marketId);
      const f = await readMarket(marketId);
      if (!f) continue;
      const supply = Number(f.supply ?? 0);
      const reserveMist = String(f.reserve ?? '0');
      const priceMist = (BASE + SLOPE * BigInt(supply)).toString();
      markets.push({
        marketId,
        blobId: String(f.blob_id ?? p.blob_id ?? ''),
        filename: String(f.filename ?? p.filename ?? 'Untitled'),
        creator: String(f.creator ?? p.creator ?? ''),
        supply,
        reserveMist,
        reserveSui: mistToSui(reserveMist),
        priceMist,
        priceSui: mistToSui(priceMist),
      });
    }
    return NextResponse.json({ markets });
  } catch (err) {
    return NextResponse.json({ markets: [], error: String(err).slice(0, 240) });
  }
}
