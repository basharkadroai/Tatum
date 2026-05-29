import { NextRequest, NextResponse } from 'next/server';
import { askQuestion } from '@/lib/ollama';

export async function POST(req: NextRequest) {
  console.log('[ask] request received');

  const { content, question } = await req.json();

  if (!content || !question) {
    console.error('[ask] missing content or question');
    return NextResponse.json({ error: 'Missing content or question' }, { status: 400 });
  }

  console.log(`[ask] question: "${question}" | content length: ${content.length} chars`);

  try {
    const answer = await askQuestion(content, question);
    console.log(`[ask] answer received (${answer.length} chars)`);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error('[ask] Ollama failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
