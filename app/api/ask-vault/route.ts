import { NextRequest, NextResponse } from 'next/server';
import { streamGroq, vaultSystemPrompt, ChatMsg } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { docs, question, history } = await req.json();
  if (!Array.isArray(docs) || docs.length === 0 || !question) {
    return NextResponse.json({ error: 'Missing docs or question' }, { status: 400 });
  }

  const prior: ChatMsg[] = Array.isArray(history)
    ? history
        .filter((m: { role?: string; text?: string }) => m && (m.role === 'user' || m.role === 'ai') && m.text)
        .slice(-6)
        .map((m: { role: string; text: string }) => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          content: m.text,
        }))
    : [];

  const messages: ChatMsg[] = [vaultSystemPrompt(docs), ...prior, { role: 'user', content: question }];
  return new Response(streamGroq(messages), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
