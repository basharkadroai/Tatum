// Server-side reads of the on-chain vault — Sui via Tatum RPC + Walrus blobs.
// Shared by the MCP server so any AI client can browse a wallet's owned files.
import { tatumRpcUrl, PUBLIC_FULLNODE, WALRUS_AGGREGATOR } from '@/lib/network';

const RPC = tatumRpcUrl();
const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';

export type VaultEntryOnchain = {
  entryId?: string;
  blobId: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  owner: string;
  txDigest?: string;
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

  return (result?.data ?? [])
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
