import { NextRequest, NextResponse } from 'next/server';
import { runVaultAgent, VaultDoc } from '@/lib/agent';

// Step 1 of the ChainMind agent: read-only. Takes the user's vault docs + a
// question, runs the LangChain/Groq agent loop, returns the final answer.
export async function POST(req: NextRequest) {
  const { docs, question } = await req.json();
  if (!Array.isArray(docs) || !question || typeof question !== 'string') {
    return NextResponse.json({ error: 'Missing docs or question' }, { status: 400 });
  }
  try {
    const answer = await runVaultAgent(docs as VaultDoc[], question);
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json({ error: `Agent failed: ${String(err).slice(0, 200)}` }, { status: 500 });
  }
}
