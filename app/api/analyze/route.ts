import { NextRequest, NextResponse } from 'next/server';
import { analyzeDocument } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { content } = await req.json();
  try {
    const analysis = await analyzeDocument(content || '');
    return NextResponse.json(analysis);
  } catch (err) {
    console.error('[analyze] failed:', err);
    return NextResponse.json(
      { summary: 'AI analysis unavailable — check Groq API key.', tags: [], questions: [] },
      { status: 500 },
    );
  }
}
