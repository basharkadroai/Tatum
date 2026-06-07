import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Fetch public metadata for a social video via oEmbed (no API keys needed) so it
// can be tokenized as a content coin. Supports YouTube, TikTok, X/Twitter, Vimeo.
type VideoMeta = {
  url: string;
  provider: string;       // 'YouTube' | 'TikTok' | 'X' | 'Vimeo' | 'Other'
  title: string;
  author: string;         // creator handle / name
  thumbnail?: string;
  embedHtml?: string;
};

function oembedFor(url: string): { endpoint: string; provider: string } | null {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return { endpoint: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, provider: 'YouTube' };
  if (/tiktok\.com/.test(u)) return { endpoint: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, provider: 'TikTok' };
  if (/(twitter|x)\.com/.test(u)) return { endpoint: `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`, provider: 'X' };
  if (/vimeo\.com/.test(u)) return { endpoint: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, provider: 'Vimeo' };
  return null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')?.trim() || '';
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'Provide a valid video URL.' }, { status: 400 });
  }
  const o = oembedFor(url);
  if (!o) {
    return NextResponse.json({ error: 'Unsupported platform. Use a YouTube, TikTok, X, or Vimeo video link.' }, { status: 400 });
  }
  try {
    const res = await fetch(o.endpoint, { headers: { 'User-Agent': 'ChainMind/1.0' } });
    if (!res.ok) return NextResponse.json({ error: `Couldn't read that ${o.provider} video (it may be private or removed).` }, { status: 502 });
    const d = await res.json() as { title?: string; author_name?: string; thumbnail_url?: string; html?: string };
    const meta: VideoMeta = {
      url,
      provider: o.provider,
      title: String(d.title || `${o.provider} video`).slice(0, 120),
      author: String(d.author_name || 'Unknown creator').slice(0, 80),
      thumbnail: d.thumbnail_url,
      embedHtml: d.html,
    };
    return NextResponse.json({ meta });
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch video metadata: ${String(e).slice(0, 120)}` }, { status: 500 });
  }
}
