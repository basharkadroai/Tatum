import { NextRequest, NextResponse } from 'next/server';
import { fetchVideoMeta } from '@/lib/videoMeta';

export const runtime = 'nodejs';

// Preview a social video's public metadata (title, creator, thumbnail) for the
// "tokenize a video" flow.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')?.trim() || '';
  try {
    const meta = await fetchVideoMeta(url);
    return NextResponse.json({ meta });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e).slice(0, 160) }, { status: 400 });
  }
}
