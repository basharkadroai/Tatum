import { NextRequest, NextResponse } from 'next/server';
import { summarize } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ summary: 'No text content could be extracted from this file.' });
  }

  try {
    const summary = await summarize(content);
    return NextResponse.json({ summary });
  } catch (err) {
    console.error('[summarize] failed:', err);
    return NextResponse.json(
      { summary: 'AI summary unavailable — check Groq API key.' },
      { status: 500 },
    );
  }
}
