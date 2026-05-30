import { NextRequest, NextResponse } from 'next/server';
import { streamGroq, askSystemPrompt, ChatMsg } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { content, question, history } = await req.json();
  if (!question) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400 });
  }

  // No readable text (image / unsupported type) — answer gracefully, not "failed".
  if (!content || !content.trim()) {
    const msg = "I couldn't read any text from this file — it may be an image or an unsupported format, so there's nothing for me to answer questions about. The file is still safely stored on Walrus and recorded on Sui.";
    return new Response(msg, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  const prior: ChatMsg[] = Array.isArray(history)
    ? history
        .filter((m: { role?: string; text?: string }) => m && (m.role === 'user' || m.role === 'ai') && m.text)
        .slice(-6) // last 3 exchanges
        .map((m: { role: string; text: string }) => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          content: m.text,
        }))
    : [];

  const messages: ChatMsg[] = [askSystemPrompt(content), ...prior, { role: 'user', content: question }];
  return new Response(streamGroq(messages), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
