// Public metadata for a social video, fetched via oEmbed (no API keys). Used to
// tokenize a video as a content coin (YouTube / TikTok / X / Vimeo).
export type VideoMeta = {
  url: string;
  provider: string; // 'YouTube' | 'TikTok' | 'X' | 'Vimeo'
  title: string;
  author: string;   // creator handle / name
  thumbnail?: string;
  embedHtml?: string;
};

export function oembedFor(url: string): { endpoint: string; provider: string } | null {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return { endpoint: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, provider: 'YouTube' };
  if (/tiktok\.com/.test(u)) return { endpoint: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, provider: 'TikTok' };
  if (/(twitter|x)\.com/.test(u)) return { endpoint: `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`, provider: 'X' };
  if (/vimeo\.com/.test(u)) return { endpoint: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, provider: 'Vimeo' };
  return null;
}

// Throws on bad URL / unsupported platform / fetch failure (caller maps to HTTP).
export async function fetchVideoMeta(url: string): Promise<VideoMeta> {
  if (!/^https?:\/\//.test(url)) throw new Error('Provide a valid video URL.');
  const o = oembedFor(url);
  if (!o) throw new Error('Unsupported platform. Use a YouTube, TikTok, X, or Vimeo video link.');
  const res = await fetch(o.endpoint, { headers: { 'User-Agent': 'ChainMind/1.0' } });
  if (!res.ok) throw new Error(`Couldn't read that ${o.provider} video (it may be private or removed).`);
  const d = await res.json() as { title?: string; author_name?: string; thumbnail_url?: string; html?: string };
  return {
    url,
    provider: o.provider,
    title: String(d.title || `${o.provider} video`).slice(0, 120),
    author: String(d.author_name || 'Unknown creator').slice(0, 80),
    thumbnail: d.thumbnail_url,
    embedHtml: d.html,
  };
}
