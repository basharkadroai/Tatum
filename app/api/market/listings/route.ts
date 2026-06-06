import { NextRequest, NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE } from '@/lib/network';
import type { MarketListing } from '@/types/market';

const RPC = tatumRpcUrl();
const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';
// `list` runs in the UPGRADED module, so the Listed event type carries the
// upgraded package id (verified on-chain) — query events at the latest id.
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
    } catch {
      // try next upstream
    }
  }
  throw new Error('Sui RPC unavailable');
}

function mistToSui(mist: string | number) {
  try {
    const raw = BigInt(String(mist));
    const whole = raw / MIST_PER_SUI;
    const fraction = raw % MIST_PER_SUI;
    if (fraction === BigInt(0)) return whole.toString();
    const decimals = fraction.toString().padStart(9, '0').replace(/0+$/, '').slice(0, 4);
    return `${whole}.${decimals}`;
  } catch {
    return '0';
  }
}

async function readListingObject(listingId: string) {
  try {
    const obj = await rpc<{
      data?: {
        content?: {
          fields?: {
            price?: string | number;
            seller?: string;
            entry?: {
              fields?: {
                blob_id?: string;
                filename?: string;
                file_type?: string;
                size_bytes?: string | number;
              };
            };
          };
        };
      };
    }>('sui_getObject', [listingId, { showContent: true }]);
    return obj?.data?.content?.fields;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!PACKAGE_ID) return NextResponse.json({ listings: [] });
  try {
    const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '50');
    const limit = Math.max(1, Math.min(Number.isFinite(limitParam) ? limitParam : 50, 100));
    const seller = req.nextUrl.searchParams.get('seller')?.toLowerCase();
    const events = await rpc<{
      data?: Array<{
        id?: { txDigest?: string; eventSeq?: string };
        parsedJson?: Record<string, unknown>;
      }>;
    }>('suix_queryEvents', [
      { MoveEventType: `${PACKAGE_LATEST}::vault::Listed` },
      null,
      limit,
      true,
    ]);

    const listings: MarketListing[] = [];
    for (const event of events.data ?? []) {
      const parsed = event.parsedJson ?? {};
      const listingId = String(parsed.listing_id ?? '');
      const entryId = String(parsed.entry_id ?? '');
      if (!listingId || !entryId) continue;

      const fields = await readListingObject(listingId);
      if (!fields) continue; // object was sold/delisted or unavailable
      const entry = fields.entry?.fields;
      const priceMist = String(fields.price ?? parsed.price ?? '0');
      const listingSeller = String(fields.seller ?? parsed.seller ?? '');
      if (seller && listingSeller.toLowerCase() !== seller) continue;
      listings.push({
        listingId,
        entryId,
        filename: String(entry?.filename ?? parsed.filename ?? 'Untitled vault item'),
        fileType: entry?.file_type ? String(entry.file_type) : undefined,
        blobId: entry?.blob_id ? String(entry.blob_id) : undefined,
        sizeBytes: entry?.size_bytes != null ? Number(entry.size_bytes) : undefined,
        seller: listingSeller,
        priceMist,
        priceSui: mistToSui(priceMist),
        createdTx: event.id?.txDigest,
      });
    }

    return NextResponse.json({ listings });
  } catch (err) {
    return NextResponse.json({ listings: [], error: String(err).slice(0, 240) });
  }
}
