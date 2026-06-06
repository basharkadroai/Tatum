import { NextRequest, NextResponse } from 'next/server';
import { tatumRpcUrl, PUBLIC_FULLNODE, SUI_EXPLORER } from '@/lib/network';

// Reads the registration back FROM the Sui chain via Tatum RPC to prove the blob
// is genuinely on-chain — not just that we once sent a tx. Two Tatum RPC reads:
//   1. sui_getTransactionBlock(digest, showEvents) → find a registration event when the digest is the upload tx
//   2. sui_getObject(entry_id, showContent)        → read the current VaultEntry object back, including after buys
const RPC = tatumRpcUrl();

type RpcResult = { result?: unknown; error?: { message?: string } };
type VaultObject = { data?: { objectId?: string; content?: { fields?: Record<string, unknown> } } };

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
    const { digest, blobId, entryId: suppliedEntryId } = await req.json();
    if (!blobId) throw new Error('blobId is required');

    let entryId = typeof suppliedEntryId === 'string' ? suppliedEntryId : '';
    let owner = '';
    let filename = '';

    if (digest) {
      // Upload txs emit BlobRegistered or EncryptedBlobRegistered. Buy txs do not
      // include blob_id, so those fall through to the object read below.
      const tx = (await rpc('sui_getTransactionBlock', [digest, { showEvents: true }])) as
        | { events?: Array<{ type?: string; parsedJson?: Record<string, unknown> }> }
        | null;
      const event = tx?.events?.find(
        e => (e.type?.endsWith('::vault::BlobRegistered') || e.type?.endsWith('::vault::EncryptedBlobRegistered')) && e.parsedJson?.blob_id === blobId,
      );
      if (event?.parsedJson) {
        entryId = String(event.parsedJson.entry_id || entryId);
        owner = String(event.parsedJson.owner || '');
        filename = String(event.parsedJson.filename || '');
      }
    }

    if (!entryId) {
      return NextResponse.json({ verified: false, reason: 'No matching registration event or entry id on-chain' });
    }

    const object = (await rpc('sui_getObject', [entryId, { showContent: true }])) as VaultObject | null;
    const fields = object?.data?.content?.fields;
    if (!fields || String(fields.blob_id) !== String(blobId)) {
      return NextResponse.json({ verified: false, reason: 'VaultEntry object does not match this blob' });
    }

    return NextResponse.json({
      verified: true,
      entryId,
      objectUrl: `${SUI_EXPLORER}/object/${entryId}`,
      owner: owner || String(fields.owner || ''),
      onChain: {
        blobId: String(fields.blob_id),
        filename: filename || String(fields.filename || ''),
      },
    });
  } catch (err) {
    return NextResponse.json({ verified: false, error: String(err) }, { status: 200 });
  }
}
