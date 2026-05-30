import { NextRequest, NextResponse } from 'next/server';
import { analyzeDocument, analyzeImage } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { content, image } = await req.json();
  try {
    // Image (base64 data URL) → vision model; otherwise text analysis
    const analysis = image
      ? await analyzeImage(image)
      : await analyzeDocument(content || '');
    return NextResponse.json(analysis);
  } catch (err) {
    console.error('[analyze] failed:', err);
    return NextResponse.json(
      { summary: 'AI analysis unavailable — check Groq API key.', tags: [], questions: [] },
      { status: 500 },
    );
  }
}
