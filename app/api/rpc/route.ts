import { NextRequest, NextResponse } from 'next/server';

// Tatum gateway can't be called directly from the browser (its CORS preflight
// rejects the Sui SDK's `client-sdk-version` header). This server-side proxy
// forwards JSON-RPC to Tatum so EVERY Sui read from the frontend still routes
// through Tatum, with the public fullnode as a graceful fallback on 429/error.
const TATUM_RPC =
  process.env.NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC || 'https://fullnode.testnet.sui.io:443';
const FALLBACK_RPC = 'https://fullnode.testnet.sui.io:443';

export async function POST(req: NextRequest) {
  const body = await req.text();

  for (const url of [TATUM_RPC, FALLBACK_RPC]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) {
        const text = await res.text();
        return new NextResponse(text, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      // try next upstream
    }
  }

  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'RPC upstream unavailable' } },
    { status: 502 },
  );
}
