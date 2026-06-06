import { NextRequest, NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE } from '@/lib/network';
import { cleanEnv } from '@/lib/env';
import { listingCategory, listingTeaser } from '@/lib/marketListing';
import type { MarketListing } from '@/types/market';

const RPC = tatumRpcUrl();
const PACKAGE_ID = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID);
// `list` runs in the UPGRADED module, so the Listed event type carries the
// upgraded package id (verified on-chain) — query events at the latest id.
const PACKAGE_LATEST = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST) || PACKAGE_ID;
// Listed events carry the id of the package VERSION that emitted them, so query
// the current + prior marketplace versions and merge (listings survive upgrades).
const PRIOR_MARKET_PKGS = [
  '0x0ce4fdc1d2c0d9b90301e65b8cb3651dd65b7935644a2aecc5a79138659c026d',
  '0x370bd880fdd2dcb8d07613087a41bb88caa393db33d5b48834dcf798cfb9ecdc',
  '0xfcfed53bef2f64ed3a5550e1f1c75cdfab0f4a12a8517e8aca44562454311af9',
];
const MARKET_PKGS = Array.from(new Set([PACKAGE_LATEST, ...PRIOR_MARKET_PKGS].filter(Boolean)));
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

function sealIdFromParsed(value: unknown): string | undefined {
  if (typeof value === 'string') return value.startsWith('0x') ? value : `0x${value}`;
  if (Array.isArray(value) && value.every(v => Number.isInteger(v))) {
    return `0x${value.map(v => Number(v).toString(16).padStart(2, '0')).join('')}`;
  }
  return undefined;
}

async function encryptedEntries() {
  const encrypted = new Map<string, { policyId?: string; sealId?: string }>();
  if (!PACKAGE_LATEST) return encrypted;
  try {
    const events = await rpc<{ data?: Array<{ parsedJson?: Record<string, unknown> }> }>('suix_queryEvents', [
      { MoveEventType: `${PACKAGE_LATEST}::vault::EncryptedBlobRegistered` },
      null,
      200,
      true,
    ]);
    for (const event of events.data ?? []) {
      const entryId = event.parsedJson?.entry_id ? String(event.parsedJson.entry_id) : '';
      if (!entryId) continue;
      encrypted.set(entryId, {
        policyId: event.parsedJson?.policy_id ? String(event.parsedJson.policy_id) : undefined,
        sealId: sealIdFromParsed(event.parsedJson?.seal_id),
      });
    }
  } catch {
    return encrypted;
  }
  return encrypted;
}

async function listingMetadata() {
  const metadata = new Map<string, { title?: string; description?: string; category?: string; teaser?: string }>();
  if (!PACKAGE_LATEST) return metadata;
  try {
    const events = await rpc<{ data?: Array<{ parsedJson?: Record<string, unknown> }> }>('suix_queryEvents', [
      { MoveEventType: `${PACKAGE_LATEST}::vault::ListingMetadata` },
      null,
      200,
      true,
    ]);
    for (const event of events.data ?? []) {
      const listingId = event.parsedJson?.listing_id ? String(event.parsedJson.listing_id) : '';
      if (!listingId) continue;
      metadata.set(listingId, {
        title: event.parsedJson?.title ? String(event.parsedJson.title) : undefined,
        description: event.parsedJson?.description ? String(event.parsedJson.description) : undefined,
        category: event.parsedJson?.category ? String(event.parsedJson.category) : undefined,
        teaser: event.parsedJson?.teaser ? String(event.parsedJson.teaser) : undefined,
      });
    }
  } catch {
    return metadata;
  }
  return metadata;
}

export async function GET(req: NextRequest) {
  if (!PACKAGE_ID) return NextResponse.json({ listings: [] });
  try {
    const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '50');
    const limit = Math.max(1, Math.min(Number.isFinite(limitParam) ? limitParam : 50, 100));
    const seller = req.nextUrl.searchParams.get('seller')?.toLowerCase();
    type Ev = { id?: { txDigest?: string }; parsedJson?: Record<string, unknown> };
    const rawEvents: Ev[] = [];
    for (const pkg of MARKET_PKGS) {
      try {
        const ev = await rpc<{ data?: Ev[] }>('suix_queryEvents', [{ MoveEventType: `${pkg}::vault::Listed` }, null, limit, true]);
        for (const e of ev.data ?? []) rawEvents.push(e);
      } catch { /* skip a version that errors */ }
    }

    const encrypted = await encryptedEntries();
    const metadata = await listingMetadata();
    const listings: MarketListing[] = [];
    const seen = new Set<string>();
    for (const event of rawEvents) {
      const parsed = event.parsedJson ?? {};
      const listingId = String(parsed.listing_id ?? '');
      const entryId = String(parsed.entry_id ?? '');
      if (!listingId || !entryId || seen.has(listingId)) continue;
      seen.add(listingId);

      const fields = await readListingObject(listingId);
      if (!fields) continue; // object was sold/delisted or unavailable
      const entry = fields.entry?.fields;
      const priceMist = String(fields.price ?? parsed.price ?? '0');
      const listingSeller = String(fields.seller ?? parsed.seller ?? '');
      if (seller && listingSeller.toLowerCase() !== seller) continue;
      const filename = String(entry?.filename ?? parsed.filename ?? 'Untitled vault item');
      const fileType = entry?.file_type ? String(entry.file_type) : undefined;
      const seal = encrypted.get(entryId);
      const meta = metadata.get(listingId);
      const isEncrypted = !!seal;
      listings.push({
        listingId,
        entryId,
        title: meta?.title,
        description: meta?.description,
        filename,
        fileType,
        blobId: entry?.blob_id ? String(entry.blob_id) : undefined,
        sizeBytes: entry?.size_bytes != null ? Number(entry.size_bytes) : undefined,
        seller: listingSeller,
        priceMist,
        priceSui: mistToSui(priceMist),
        createdTx: event.id?.txDigest,
        saleType: 'nft', // current contract: unique object, transfers once
        encrypted: isEncrypted,
        sealId: seal?.sealId,
        sealPolicyId: seal?.policyId,
        category: meta?.category || listingCategory(filename, fileType),
        teaser: meta?.teaser || meta?.description || listingTeaser(filename, fileType, isEncrypted),
      });
    }

    return NextResponse.json({ listings });
  } catch (err) {
    return NextResponse.json({ listings: [], error: String(err).slice(0, 240) });
  }
}
