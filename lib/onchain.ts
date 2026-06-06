// Server-side reads of the on-chain vault — Sui via Tatum RPC + Walrus blobs.
// Shared by the MCP server so any AI client can browse a wallet's owned files.
import { tatumRpcUrl, PUBLIC_FULLNODE, WALRUS_AGGREGATOR } from '@/lib/network';
import { cleanEnv } from '@/lib/env';
import { listingCategory, listingTeaser } from '@/lib/marketListing';

const RPC = tatumRpcUrl();
const PACKAGE_ID = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID);
// `list` runs in the upgraded module → Listed events carry the upgraded id.
const PACKAGE_LATEST = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST) || PACKAGE_ID;

export type VaultEntryOnchain = {
  entryId?: string;
  blobId: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  owner: string;
  txDigest?: string;
  encrypted?: boolean;
  sealId?: string;
  sealPolicyId?: string;
};

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  for (const url of [RPC, PUBLIC_FULLNODE]) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
      if (data.result != null) return data.result;
    } catch { /* next upstream */ }
  }
  throw new Error('Sui RPC unavailable');
}

// All VaultEntry objects owned by a wallet (read from Sui via Tatum).
export async function listVaultEntries(owner: string): Promise<VaultEntryOnchain[]> {
  if (!owner || !PACKAGE_ID) return [];
  const result = (await rpc('suix_getOwnedObjects', [
    owner,
    { filter: { StructType: `${PACKAGE_ID}::vault::VaultEntry` }, options: { showContent: true, showPreviousTransaction: true } },
    null,
    50,
  ])) as { data?: Array<{ data?: { objectId?: string; previousTransaction?: string; content?: { fields?: Record<string, unknown> } } }> };

  const entries = (result?.data ?? [])
    .map(o => {
      const f = o.data?.content?.fields;
      if (!f) return null;
      return {
        entryId: o.data?.objectId,
        blobId: String(f.blob_id),
        filename: String(f.filename),
        fileType: String(f.file_type),
        sizeBytes: Number(f.size_bytes),
        owner: String(f.owner),
        txDigest: o.data?.previousTransaction,
      } as VaultEntryOnchain;
    })
    .filter((e): e is VaultEntryOnchain => e !== null);

  return annotateEncryptedEntries(entries);
}

function sealIdFromParsed(value: unknown): string | undefined {
  if (typeof value === 'string') return value.startsWith('0x') ? value : `0x${value}`;
  if (Array.isArray(value) && value.every(v => Number.isInteger(v))) {
    return `0x${value.map(v => Number(v).toString(16).padStart(2, '0')).join('')}`;
  }
  return undefined;
}

async function annotateEncryptedEntries(entries: VaultEntryOnchain[]): Promise<VaultEntryOnchain[]> {
  if (!entries.length || !PACKAGE_LATEST) return entries;
  const byId = new Map(entries.filter(e => e.entryId).map(e => [e.entryId, e]));
  if (!byId.size) return entries;
  try {
    const events = (await rpc('suix_queryEvents', [
      { MoveEventType: `${PACKAGE_LATEST}::vault::EncryptedBlobRegistered` },
      null,
      200,
      true,
    ])) as { data?: Array<{ parsedJson?: Record<string, unknown> }> };
    for (const ev of events?.data ?? []) {
      const entryId = ev.parsedJson?.entry_id ? String(ev.parsedJson.entry_id) : '';
      const entry = byId.get(entryId);
      if (!entry) continue;
      entry.encrypted = true;
      entry.sealPolicyId = ev.parsedJson?.policy_id ? String(ev.parsedJson.policy_id) : undefined;
      entry.sealId = sealIdFromParsed(ev.parsedJson?.seal_id);
    }
  } catch {
    return entries;
  }
  return entries;
}

export type MarketListingOnchain = {
  listingId: string;
  entryId: string;
  filename: string;
  fileType?: string;
  blobId?: string;
  sizeBytes?: number;
  seller: string;
  priceMist: string;
  priceSui: string;
  encrypted?: boolean;
  sealPolicyId?: string;
  category?: string;
  teaser?: string;
};

const MIST_PER_SUI = BigInt(1_000_000_000);
const PRIOR_MARKET_PKGS = [
  '0x370bd880fdd2dcb8d07613087a41bb88caa393db33d5b48834dcf798cfb9ecdc',
  '0xfcfed53bef2f64ed3a5550e1f1c75cdfab0f4a12a8517e8aca44562454311af9',
];
const MARKET_PKGS = Array.from(new Set([PACKAGE_LATEST, ...PRIOR_MARKET_PKGS].filter(Boolean)));

function mistToSui(mist: string | number): string {
  try {
    const raw = BigInt(String(mist));
    const whole = raw / MIST_PER_SUI;
    const frac = raw % MIST_PER_SUI;
    if (frac === BigInt(0)) return whole.toString();
    return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '').slice(0, 4)}`;
  } catch { return '0'; }
}

// Active marketplace listings — read from the `Listed` events on Sui via Tatum,
// then confirmed against the live shared Listing object (skips sold/delisted).
// Shared by the /api/market/listings route and the MCP `list_marketplace` tool.
export async function listMarketplace(seller?: string, limit = 50): Promise<MarketListingOnchain[]> {
  if (!PACKAGE_ID) return [];
  const events: Array<{ parsedJson?: Record<string, unknown> }> = [];
  for (const pkg of MARKET_PKGS) {
    try {
      const page = (await rpc('suix_queryEvents', [
        { MoveEventType: `${pkg}::vault::Listed` }, null, Math.min(Math.max(limit, 1), 100), true,
      ])) as { data?: Array<{ parsedJson?: Record<string, unknown> }> };
      for (const event of page?.data ?? []) events.push(event);
    } catch { /* skip unavailable package version */ }
  }
  const encrypted = new Map<string, { policyId?: string }>();
  try {
    const encryptedEvents = (await rpc('suix_queryEvents', [
      { MoveEventType: `${PACKAGE_LATEST}::vault::EncryptedBlobRegistered` }, null, 200, true,
    ])) as { data?: Array<{ parsedJson?: Record<string, unknown> }> };
    for (const event of encryptedEvents?.data ?? []) {
      const entryId = event.parsedJson?.entry_id ? String(event.parsedJson.entry_id) : '';
      if (!entryId) continue;
      encrypted.set(entryId, {
        policyId: event.parsedJson?.policy_id ? String(event.parsedJson.policy_id) : undefined,
      });
    }
  } catch { /* encrypted metadata is best effort */ }

  const out: MarketListingOnchain[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const p = ev.parsedJson ?? {};
    const listingId = String(p.listing_id ?? '');
    const entryId = String(p.entry_id ?? '');
    if (!listingId || !entryId || seen.has(listingId)) continue;
    seen.add(listingId);
    const obj = (await rpc('sui_getObject', [listingId, { showContent: true }])) as {
      data?: { content?: { fields?: { price?: string | number; seller?: string; entry?: { fields?: Record<string, unknown> } } } };
    };
    const fields = obj?.data?.content?.fields;
    if (!fields) continue; // sold/delisted/unavailable
    const entry = fields.entry?.fields;
    const s = String(fields.seller ?? p.seller ?? '');
    if (seller && s.toLowerCase() !== seller.toLowerCase()) continue;
    const priceMist = String(fields.price ?? p.price ?? '0');
    const filename = String(entry?.filename ?? p.filename ?? 'Untitled vault item');
    const fileType = entry?.file_type ? String(entry.file_type) : undefined;
    const seal = encrypted.get(entryId);
    const isEncrypted = !!seal;
    out.push({
      listingId, entryId,
      filename,
      fileType,
      blobId: entry?.blob_id ? String(entry.blob_id) : undefined,
      sizeBytes: entry?.size_bytes != null ? Number(entry.size_bytes) : undefined,
      seller: s, priceMist, priceSui: mistToSui(priceMist),
      encrypted: isEncrypted,
      sealPolicyId: seal?.policyId,
      category: listingCategory(filename, fileType),
      teaser: listingTeaser(filename, fileType, isEncrypted),
    });
  }
  return out;
}

// Pull a blob's text content back from Walrus (for text/code files).
export async function fetchBlobText(blobId: string): Promise<string> {
  try {
    const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    if (!res.ok) return '';
    return (await res.text()).slice(0, 12000);
  } catch {
    return '';
  }
}
