import { NextRequest, NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE } from '@/lib/network';
import { cleanEnv } from '@/lib/env';

const RPC = tatumRpcUrl();
const PACKAGE_ID = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID);
const MAX_PRICE_MIST = BigInt(1_000_000_000_000); // 1,000 SUI hard safety cap for v1 marketplace actions.

type RpcResult<T = unknown> = { result?: T; error?: { message?: string } };
type MoveObject = {
  data?: {
    objectId?: string;
    owner?: unknown;
    content?: {
      type?: string;
      fields?: Record<string, unknown>;
    };
  };
};

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
      // Try the next upstream.
    }
  }
  throw new Error('Sui RPC unavailable');
}

function sameAddress(a?: unknown, b?: unknown) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

function normalizeOwner(owner: unknown): string {
  if (typeof owner === 'string') return owner;
  if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
    const address = (owner as { AddressOwner?: unknown }).AddressOwner;
    return typeof address === 'string' ? address : '';
  }
  return '';
}

function readNestedEntry(fields?: Record<string, unknown>) {
  const entry = fields?.entry;
  if (entry && typeof entry === 'object' && 'fields' in entry) {
    return (entry as { fields?: Record<string, unknown> }).fields;
  }
  return null;
}

function ok() {
  return NextResponse.json({ ok: true });
}

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parsePrice(priceMist: unknown): bigint | null {
  if (typeof priceMist !== 'string' && typeof priceMist !== 'number') return null;
  const raw = String(priceMist);
  if (!/^\d+$/.test(raw)) return null;
  const value = BigInt(raw);
  if (value <= BigInt(0) || value > MAX_PRICE_MIST) return null;
  return value;
}

async function getObject(id: unknown) {
  if (typeof id !== 'string' || !id.startsWith('0x')) return null;
  return rpc<MoveObject>('sui_getObject', [id, { showOwner: true, showContent: true }]);
}

export async function POST(req: NextRequest) {
  if (!PACKAGE_ID) return fail('Marketplace package is not configured.', 503);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail('Invalid request body.');
  }

  const action = body.action;
  const owner = typeof body.owner === 'string' ? body.owner : '';
  if (!owner.startsWith('0x')) return fail('Connect a wallet before signing this action.');

  try {
    if (action === 'market.list') {
      const price = parsePrice(body.priceMist);
      if (!price) return fail('Enter a valid price between 1 MIST and 1,000 SUI.');
      const obj = await getObject(body.entryId);
      const objectOwner = normalizeOwner(obj?.data?.owner);
      const type = obj?.data?.content?.type || '';
      if (!obj?.data?.objectId || !type.endsWith('::vault::VaultEntry')) return fail('This file is not a ChainMind vault entry.');
      if (!sameAddress(objectOwner, owner)) return fail('Only the wallet that owns this vault entry can list it.');
      return ok();
    }

    if (action === 'market.delist') {
      const obj = await getObject(body.listingId);
      const fields = obj?.data?.content?.fields;
      const seller = fields?.seller;
      if (!obj?.data?.objectId || !fields) return fail('This listing is no longer active.');
      if (!sameAddress(seller, owner)) return fail('Only the seller wallet can cancel this listing.');
      return ok();
    }

    if (action === 'market.buy') {
      const price = parsePrice(body.priceMist);
      if (!price) return fail('This listing has an invalid price.');
      const obj = await getObject(body.listingId);
      const fields = obj?.data?.content?.fields;
      const seller = fields?.seller;
      const currentPrice = String(fields?.price ?? '');
      if (!obj?.data?.objectId || !fields || !readNestedEntry(fields)) return fail('This listing is no longer active.');
      if (sameAddress(seller, owner)) return fail('You already own this listing.');
      if (currentPrice !== price.toString()) return fail('The listing price changed. Refresh the marketplace and try again.');
      return ok();
    }

    return fail('Unsupported marketplace action.');
  } catch (err) {
    return fail(String(err).slice(0, 180), 502);
  }
}
