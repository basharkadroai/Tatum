import { NextRequest, NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE } from '@/lib/network';
import type { ShareOffering } from '@/types/market';

const RPC = tatumRpcUrl();
const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';
// Fractional investing (offer_shares) was added in v3, so SharesOffered events
// carry the latest package id.
const PACKAGE_LATEST = process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST || PACKAGE_ID;
const MIST_PER_SUI = BigInt(1_000_000_000);

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

function mistToSui(mist: string | number) {
  try {
    const raw = BigInt(String(mist));
    const whole = raw / MIST_PER_SUI;
    const frac = raw % MIST_PER_SUI;
    if (frac === BigInt(0)) return whole.toString();
    return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '').slice(0, 4)}`;
  } catch { return '0'; }
}

async function readVault(vaultId: string) {
  try {
    const obj = await rpc<{ data?: { content?: { fields?: {
      creator?: string; filename?: string; total_shares?: string | number; shares_sold?: string | number;
      price_per_share?: string | number;
      entry?: { fields?: { blob_id?: string; file_type?: string; size_bytes?: string | number } };
    } } } }>('sui_getObject', [vaultId, { showContent: true }]);
    return obj?.data?.content?.fields ?? null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (!PACKAGE_ID) return NextResponse.json({ offerings: [] });
  try {
    const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '50');
    const limit = Math.max(1, Math.min(Number.isFinite(limitParam) ? limitParam : 50, 100));
    const creator = req.nextUrl.searchParams.get('creator')?.toLowerCase();

    const events = await rpc<{ data?: Array<{ parsedJson?: Record<string, unknown> }> }>(
      'suix_queryEvents', [{ MoveEventType: `${PACKAGE_LATEST}::vault::SharesOffered` }, null, limit, true],
    );

    const offerings: ShareOffering[] = [];
    const seen = new Set<string>();
    for (const ev of events.data ?? []) {
      const p = ev.parsedJson ?? {};
      const vaultId = String(p.vault_id ?? '');
      const entryId = String(p.entry_id ?? '');
      if (!vaultId || seen.has(vaultId)) continue;
      seen.add(vaultId);

      const f = await readVault(vaultId);
      if (!f) continue; // vault gone/unavailable
      const entry = f.entry?.fields;
      const creatorAddr = String(f.creator ?? p.creator ?? '');
      if (creator && creatorAddr.toLowerCase() !== creator) continue;
      const pricePerShareMist = String(f.price_per_share ?? p.price_per_share ?? '0');
      offerings.push({
        vaultId,
        entryId,
        creator: creatorAddr,
        filename: String(f.filename ?? p.filename ?? 'Untitled vault item'),
        fileType: entry?.file_type ? String(entry.file_type) : undefined,
        blobId: entry?.blob_id ? String(entry.blob_id) : undefined,
        sizeBytes: entry?.size_bytes != null ? Number(entry.size_bytes) : undefined,
        totalShares: Number(f.total_shares ?? p.total_shares ?? 0),
        sharesSold: Number(f.shares_sold ?? 0),
        pricePerShareMist,
        pricePerShareSui: mistToSui(pricePerShareMist),
      });
    }

    return NextResponse.json({ offerings });
  } catch (err) {
    return NextResponse.json({ offerings: [], error: String(err).slice(0, 240) });
  }
}
