import { NextRequest, NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE } from '@/lib/network';

// Lists the ChainMind VaultEntry objects OWNED by a wallet, read from Sui via
// Tatum RPC. Lets a user reconstruct their (claimed) vault on any device from
// the chain — privacy-preserving because it's scoped to their own address.
const RPC = tatumRpcUrl();
const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';

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

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get('owner');
  if (!owner || !PACKAGE_ID) return NextResponse.json({ entries: [] });
  try {
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
        };
      })
      .filter(Boolean);

    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ entries: [], error: String(err) });
  }
}
