import { NextRequest, NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE } from '@/lib/network';
import type { MarketTxEvent } from '@/types/market';

const RPC = tatumRpcUrl();

type RpcResult<T = unknown> = { result?: T; error?: { message?: string } };
type SuiEvent = { type?: string; parsedJson?: Record<string, unknown> };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const urls = Array.from(new Set([RPC, PUBLIC_FULLNODE]));
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of urls) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 12000);
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = (await res.json()) as RpcResult<T>;
        if (data.error) continue;
        if (data.result != null) return data.result;
      } catch { /* try next upstream */ }
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 600));
  }
  throw new Error('Sui RPC unavailable');
}

function parseEvent(event: SuiEvent): MarketTxEvent | null {
  const parsed = event.parsedJson ?? {};
  if (event.type?.endsWith('::vault::Listed')) {
    return {
      kind: 'listed',
      listingId: String(parsed.listing_id ?? ''),
      entryId: String(parsed.entry_id ?? ''),
      priceMist: String(parsed.price ?? ''),
      seller: String(parsed.seller ?? ''),
    };
  }
  if (event.type?.endsWith('::vault::Sold')) {
    return {
      kind: 'sold',
      listingId: String(parsed.listing_id ?? ''),
      entryId: String(parsed.entry_id ?? ''),
      priceMist: String(parsed.price ?? ''),
      seller: String(parsed.seller ?? ''),
      buyer: String(parsed.buyer ?? ''),
    };
  }
  if (event.type?.endsWith('::vault::Delisted')) {
    return {
      kind: 'delisted',
      listingId: String(parsed.listing_id ?? ''),
      entryId: String(parsed.entry_id ?? ''),
      seller: String(parsed.seller ?? ''),
    };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const digest = req.nextUrl.searchParams.get('digest');
  if (!digest) return NextResponse.json({ events: [] });
  try {
    const tx = await rpc<{ events?: SuiEvent[] }>('sui_getTransactionBlock', [digest, { showEvents: true }]);
    const events = (tx.events ?? []).map(parseEvent).filter(Boolean) as MarketTxEvent[];
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json({ events: [], error: String(err).slice(0, 240) });
  }
}
