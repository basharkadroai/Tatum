import { NextRequest, NextResponse } from 'next/server';
import { streamGroq, buildVaultPrompt } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { docs, question } = await req.json();
  if (!Array.isArray(docs) || docs.length === 0 || !question) {
    return NextResponse.json({ error: 'Missing docs or question' }, { status: 400 });
  }
  const stream = streamGroq(buildVaultPrompt(docs, question));
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
