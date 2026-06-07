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
  const urls = Array.from(new Set([RPC, PUBLIC_FULLNODE]));
  // Two passes with a short backoff + per-try timeout, so a transient blip
  // doesn't immediately read as "Sui RPC unavailable".
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of urls) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 12000);
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.error) continue;
        if (data.result != null) return data.result;
      } catch { /* next upstream */ }
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 600));
  }
  throw new Error('Sui RPC unavailable');
}

// The connected wallet's SUI balance (for the agent's "how much SUI" tool).
export async function getSuiBalance(owner: string): Promise<{ sui: string; mist: string }> {
  const r = await rpc('suix_getBalance', [owner]) as { totalBalance?: string } | null;
  const mist = String(r?.totalBalance ?? '0');
  const whole = BigInt(mist) / BigInt(1_000_000_000);
  const frac = BigInt(mist) % BigInt(1_000_000_000);
  const sui = frac === BigInt(0) ? whole.toString() : `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '').slice(0, 4)}`;
  return { sui, mist };
}

function fmtSui(mist: string | number | bigint): string {
  try {
    const raw = BigInt(mist), whole = raw / BigInt(1_000_000_000), frac = raw % BigInt(1_000_000_000);
    return frac === BigInt(0) ? whole.toString() : `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '').slice(0, 4)}`;
  } catch { return '0'; }
}

const CONTENTCOIN = cleanEnv(process.env.NEXT_PUBLIC_CONTENTCOIN_PACKAGE);
const CC_BASE = BigInt(1_000_000), CC_SLOPE = BigInt(10_000); // must match content_coin.move

// Full wallet portfolio — every coin type the wallet holds, via Tatum.
export async function getPortfolio(owner: string): Promise<{ coins: Array<{ symbol: string; amount: string; coinType: string }> }> {
  const r = await rpc('suix_getAllBalances', [owner]) as Array<{ coinType: string; totalBalance: string }> | null;
  const coins = (r ?? [])
    .filter(b => BigInt(b.totalBalance || '0') > BigInt(0))
    .map(b => ({
      symbol: (b.coinType.split('::').pop() || b.coinType),
      coinType: b.coinType,
      amount: /::sui::SUI$/.test(b.coinType) ? `${fmtSui(b.totalBalance)} SUI` : b.totalBalance,
    }));
  return { coins };
}

// The wallet's ChainMind investments: content-coin holdings (valued on the
// current bonding curve) and fractional-share positions.
export async function getInvestments(owner: string): Promise<{
  contentCoins: Array<{ marketId: string; coins: number; pricePerCoinSui: string; valueSui: string }>;
  shares: Array<{ vaultId: string; shares: number }>;
}> {
  const contentCoins: Array<{ marketId: string; coins: number; pricePerCoinSui: string; valueSui: string }> = [];
  const shares: Array<{ vaultId: string; shares: number }> = [];

  if (CONTENTCOIN) {
    try {
      const owned = await rpc('suix_getOwnedObjects', [owner, { filter: { StructType: `${CONTENTCOIN}::market::ContentShare` }, options: { showContent: true } }, null, 50]) as { data?: Array<{ data?: { content?: { fields?: { market_id?: string; amount?: string | number } } } }> };
      const byMarket = new Map<string, number>();
      for (const o of owned?.data ?? []) {
        const f = o.data?.content?.fields; if (!f?.market_id) continue;
        byMarket.set(String(f.market_id), (byMarket.get(String(f.market_id)) ?? 0) + Number(f.amount ?? 0));
      }
      for (const [marketId, coins] of byMarket) {
        let priceMist = CC_BASE;
        try {
          const m = await rpc('sui_getObject', [marketId, { showContent: true }]) as { data?: { content?: { fields?: { supply?: string | number } } } };
          const supply = Number(m?.data?.content?.fields?.supply ?? 0);
          priceMist = CC_BASE + CC_SLOPE * BigInt(supply);
        } catch { /* use base price */ }
        contentCoins.push({ marketId, coins, pricePerCoinSui: fmtSui(priceMist), valueSui: fmtSui(priceMist * BigInt(coins)) });
      }
    } catch { /* skip content coins */ }
  }

  if (PACKAGE_ID) {
    try {
      const owned = await rpc('suix_getOwnedObjects', [owner, { filter: { StructType: `${PACKAGE_ID}::vault::Share` }, options: { showContent: true } }, null, 50]) as { data?: Array<{ data?: { content?: { fields?: { vault_id?: string; amount?: string | number } } } }> };
      for (const o of owned?.data ?? []) {
        const f = o.data?.content?.fields; if (!f?.vault_id) continue;
        shares.push({ vaultId: String(f.vault_id), shares: Number(f.amount ?? 0) });
      }
    } catch { /* skip shares */ }
  }

  return { contentCoins, shares };
}

type SuiPage<T> = { data?: T[]; nextCursor?: unknown; hasNextPage?: boolean };

async function queryEvents(moveEventType: string, totalLimit = 500): Promise<Array<{ parsedJson?: Record<string, unknown> }>> {
  const out: Array<{ parsedJson?: Record<string, unknown> }> = [];
  let cursor: unknown = null;
  while (out.length < totalLimit) {
    const page = (await rpc('suix_queryEvents', [
      { MoveEventType: moveEventType },
      cursor,
      Math.min(100, totalLimit - out.length),
      true,
    ])) as SuiPage<{ parsedJson?: Record<string, unknown> }>;
    out.push(...(page.data ?? []));
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

// All VaultEntry objects owned by a wallet (read from Sui via Tatum).
export async function listVaultEntries(owner: string): Promise<VaultEntryOnchain[]> {
  if (!owner || !PACKAGE_ID) return [];
  const data: Array<{ data?: { objectId?: string; previousTransaction?: string; content?: { fields?: Record<string, unknown> } } }> = [];
  let cursor: unknown = null;
  while (data.length < 500) {
    const page = (await rpc('suix_getOwnedObjects', [
      owner,
      { filter: { StructType: `${PACKAGE_ID}::vault::VaultEntry` }, options: { showContent: true, showPreviousTransaction: true } },
      cursor,
      Math.min(100, 500 - data.length),
    ])) as SuiPage<{ data?: { objectId?: string; previousTransaction?: string; content?: { fields?: Record<string, unknown> } } }>;
    data.push(...(page.data ?? []));
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  const entries = data
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
    const events = await queryEvents(`${PACKAGE_LATEST}::vault::EncryptedBlobRegistered`, 1000);
    for (const ev of events) {
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
  title?: string;
  description?: string;
  filename: string;
  fileType?: string;
  blobId?: string;
  sizeBytes?: number;
  seller: string;
  priceMist: string;
  priceSui: string;
  encrypted?: boolean;
  sealId?: string;
  sealPolicyId?: string;
  category?: string;
  teaser?: string;
};

const MIST_PER_SUI = BigInt(1_000_000_000);
const PRIOR_MARKET_PKGS = [
  '0x0ce4fdc1d2c0d9b90301e65b8cb3651dd65b7935644a2aecc5a79138659c026d',
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
      events.push(...await queryEvents(`${pkg}::vault::Listed`, Math.min(Math.max(limit * 3, 100), 500)));
    } catch { /* skip unavailable package version */ }
  }
  const encrypted = new Map<string, { policyId?: string; sealId?: string }>();
  try {
    const encryptedEvents = await queryEvents(`${PACKAGE_LATEST}::vault::EncryptedBlobRegistered`, 1000);
    for (const event of encryptedEvents) {
      const entryId = event.parsedJson?.entry_id ? String(event.parsedJson.entry_id) : '';
      if (!entryId) continue;
      encrypted.set(entryId, {
        policyId: event.parsedJson?.policy_id ? String(event.parsedJson.policy_id) : undefined,
        sealId: sealIdFromParsed(event.parsedJson?.seal_id),
      });
    }
  } catch { /* encrypted metadata is best effort */ }

  const metadata = new Map<string, { title?: string; description?: string; category?: string; teaser?: string }>();
  try {
    const metadataEvents = await queryEvents(`${PACKAGE_LATEST}::vault::ListingMetadata`, 1000);
    for (const event of metadataEvents) {
      const listingId = event.parsedJson?.listing_id ? String(event.parsedJson.listing_id) : '';
      if (!listingId) continue;
      metadata.set(listingId, {
        title: event.parsedJson?.title ? String(event.parsedJson.title) : undefined,
        description: event.parsedJson?.description ? String(event.parsedJson.description) : undefined,
        category: event.parsedJson?.category ? String(event.parsedJson.category) : undefined,
        teaser: event.parsedJson?.teaser ? String(event.parsedJson.teaser) : undefined,
      });
    }
  } catch { /* seller metadata is best effort */ }

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
    const meta = metadata.get(listingId);
    const isEncrypted = !!seal;
    out.push({
      listingId, entryId,
      title: meta?.title,
      description: meta?.description,
      filename,
      fileType,
      blobId: entry?.blob_id ? String(entry.blob_id) : undefined,
      sizeBytes: entry?.size_bytes != null ? Number(entry.size_bytes) : undefined,
      seller: s, priceMist, priceSui: mistToSui(priceMist),
      encrypted: isEncrypted,
      sealId: seal?.sealId,
      sealPolicyId: seal?.policyId,
      category: meta?.category || listingCategory(filename, fileType),
      teaser: meta?.teaser || meta?.description || listingTeaser(filename, fileType, isEncrypted),
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
