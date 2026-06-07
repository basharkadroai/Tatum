import { NextRequest, NextResponse } from 'next/server';
import { uploadToWalrus } from '@/lib/walrus';

export const runtime = 'nodejs';

// Persist an agent's memory set to Walrus (decentralized, verifiable by blob id)
// — the storage half of our testnet-native "Walrus Memory". Returns the blobId
// the client tracks so memories are portable across sessions/devices.
export async function POST(req: NextRequest) {
  try {
    const { memories } = await req.json() as { memories?: unknown };
    if (!Array.isArray(memories)) return NextResponse.json({ error: 'memories must be an array' }, { status: 400 });
    const json = JSON.stringify(memories).slice(0, 200_000); // cap blob size
    const blobId = await uploadToWalrus(Buffer.from(json));
    return NextResponse.json({ blobId, count: memories.length });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status: 500 });
  }
}
