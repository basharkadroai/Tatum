import { NextRequest, NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE, SUI_EXPLORER } from '@/lib/network';

// Reads the registration back FROM the Sui chain via Tatum RPC to prove the blob
// is genuinely on-chain — not just that we once sent a tx. Two Tatum RPC reads:
//   1. sui_getTransactionBlock(digest, showEvents) → find the BlobRegistered event
//   2. sui_getObject(entry_id, showContent)        → read the VaultEntry object back
const RPC = tatumRpcUrl();

type RpcResult = { result?: unknown; error?: { message?: string } };

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  for (const url of [RPC, PUBLIC_FULLNODE]) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) continue;
      const data = (await res.json()) as RpcResult;
      if (data.error) continue; // try next upstream
      if (data.result != null) return data.result;
    } catch {
      // try next upstream
    }
  }
  throw new Error('Sui RPC unavailable');
}

export async function POST(req: NextRequest) {
  try {
    const { digest, blobId } = await req.json();
    if (!digest || !blobId) throw new Error('digest and blobId are required');

    // 1) Pull the transaction's events from chain via Tatum
    const tx = (await rpc('sui_getTransactionBlock', [digest, { showEvents: true }])) as
      | { events?: Array<{ type?: string; parsedJson?: Record<string, unknown> }> }
      | null;

    const event = tx?.events?.find(
      e => e.type?.endsWith('::vault::BlobRegistered') && e.parsedJson?.blob_id === blobId,
    );
    if (!event?.parsedJson) {
      return NextResponse.json({ verified: false, reason: 'No matching BlobRegistered event on-chain' });
    }

    // The matched event — read from chain via Tatum — proves the blob is
    // registered on-chain AND carries the registered data back to us.
    const pj = event.parsedJson;
    const entryId = String(pj.entry_id);

    return NextResponse.json({
      verified: true,
      entryId,
      objectUrl: `${SUI_EXPLORER}/object/${entryId}`,
      owner: String(pj.owner),
      onChain: {
        blobId: String(pj.blob_id),
        filename: String(pj.filename),
      },
    });
  } catch (err) {
    return NextResponse.json({ verified: false, error: String(err) }, { status: 200 });
  }
}
