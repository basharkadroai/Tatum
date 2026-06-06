import { NextRequest } from 'next/server';
import { marked } from 'marked';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - html-to-docx ships no type declarations
import HTMLtoDOCX from 'html-to-docx';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Server-side file conversion: turns the agent's generated markdown/text into a
// real downloadable file. Pure JS (no chromium) so it runs on Vercel.
//   POST { content, format: 'docx' | 'html', filename? }
export async function POST(req: NextRequest) {
  try {
    const { content, format, filename } = await req.json();
    if (typeof content !== 'string' || !content.trim()) {
      return new Response('Missing content', { status: 400 });
    }
    const fmt = String(format || 'docx').toLowerCase();
    const base = (typeof filename === 'string' && filename.trim() ? filename : 'chainmind').replace(/\.[^.]+$/, '').slice(0, 80) || 'chainmind';
    const innerHtml = await marked.parse(content);

    if (fmt === 'docx') {
      const buffer: Buffer = await HTMLtoDOCX(innerHtml, null, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false });
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${base}.docx"`,
        },
      });
    }

    if (fmt === 'html') {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${base}</title><style>body{font-family:system-ui,sans-serif;max-width:780px;margin:40px auto;padding:0 20px;line-height:1.6}pre,code{font-family:ui-monospace,Menlo,monospace}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}</style></head><body>${innerHtml}</body></html>`;
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.html"` },
      });
    }

    return new Response('Unsupported format', { status: 415 });
  } catch (e) {
    return new Response('Export failed: ' + String(e).slice(0, 160), { status: 500 });
  }
}
