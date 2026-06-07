import { NextRequest, NextResponse } from 'next/server';
import { fetchVideoMeta } from '@/lib/videoMeta';
import { uploadToWalrus } from '@/lib/walrus';

export const runtime = 'nodejs';

// Prepare a video coin: fetch the video's public metadata, store it as a JSON
// blob on Walrus, and return the blobId + title so the client can launch the
// coin on-chain (create_market). The video itself stays on its platform — we
// tokenize a reference to it.
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url?: string };
    const meta = await fetchVideoMeta((url || '').trim());
    const blobId = await uploadToWalrus(Buffer.from(JSON.stringify({ ...meta, kind: 'video' })));
    return NextResponse.json({ blobId, title: meta.title, meta });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status: 400 });
  }
}
