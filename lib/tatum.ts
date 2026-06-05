// Tatum Data API helpers. The API key powers both the Sui RPC gateway and the
// Data API; in production it lives in the gateway URL, so we parse it from there
// when TATUM_API_KEY isn't set as its own env var.
export function tatumApiKey(): string {
  if (process.env.TATUM_API_KEY) return process.env.TATUM_API_KEY;
  const rpc =
    process.env.NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC ||
    process.env.NEXT_PUBLIC_TATUM_SUI_MAINNET_RPC ||
    process.env.NEXT_PUBLIC_TATUM_SUI_RPC ||
    '';
  const m = rpc.match(/gateway\.tatum\.io\/([^/?#]+)/);
  return m ? m[1] : '';
}

// Live USD exchange rate for a crypto asset via Tatum's Data API.
export async function getExchangeRate(symbol: string, basePair = 'USD'): Promise<{ value: string; source?: string } | null> {
  const key = tatumApiKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://api.tatum.io/v3/tatum/rate/${encodeURIComponent(symbol.toUpperCase())}?basePair=${basePair}`, {
      headers: { 'x-api-key': key },
    });
    if (!res.ok) return null;
    return (await res.json()) as { value: string; source?: string };
  } catch {
    return null;
  }
}
