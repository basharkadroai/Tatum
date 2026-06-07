import { NextRequest, NextResponse } from 'next/server';
import { suiRpcRaw } from '@/lib/suiRpc';

// Tatum gateway can't be called directly from the browser (its CORS preflight
// rejects the Sui SDK's `client-sdk-version` header). This server-side proxy
// forwards JSON-RPC to Tatum (public fullnode as fallback), with a per-try
// timeout + retry so a transient blip doesn't break frontend Sui reads.
export async function POST(req: NextRequest) {
  const body = await req.text();
  try {
    const text = await suiRpcRaw(body);
    return new NextResponse(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32000, message: 'RPC upstream unavailable' } },
      { status: 502 },
    );
  }
}
