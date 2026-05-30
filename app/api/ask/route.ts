import { NextRequest, NextResponse } from 'next/server';
import { streamGroq, buildAskPrompt } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { content, question } = await req.json();
  if (!content || !question) {
    return NextResponse.json({ error: 'Missing content or question' }, { status: 400 });
  }
  const stream = streamGroq(buildAskPrompt(content, question));
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
