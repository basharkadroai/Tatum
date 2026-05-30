import { NextRequest, NextResponse } from 'next/server';
import { askAcrossVault } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { docs, question } = await req.json();

  if (!Array.isArray(docs) || docs.length === 0 || !question) {
    return NextResponse.json({ error: 'Missing docs or question' }, { status: 400 });
  }

  try {
    const answer = await askAcrossVault(docs, question);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error('[ask-vault] failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
