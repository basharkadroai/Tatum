// ─────────────────────────────────────────────────────────────────────────
// Central network config. Everything (Tatum RPC, Walrus endpoints, explorer,
// chain id, gas) is derived from NEXT_PUBLIC_SUI_NETWORK so the whole app can
// flip between testnet (default, free) and mainnet by changing ONE env var.
//
// To run on MAINNET, set:
//   NEXT_PUBLIC_SUI_NETWORK=mainnet
//   NEXT_PUBLIC_TATUM_SUI_MAINNET_RPC=https://sui-mainnet.gateway.tatum.io/<API_KEY>
//   NEXT_PUBLIC_VAULT_PACKAGE_ID=<your mainnet package id>
//   NEXT_PUBLIC_WALRUS_PUBLISHER_URL=<a funded/authenticated mainnet publisher>
//   (+ fund SUI_DEPLOYER_KEY's wallet with SUI for gas and WAL for storage)
//
// Note: mainnet has a public AGGREGATOR (reads, free) but NO free public
// PUBLISHER — mainnet writes cost WAL, so you must supply your own publisher.
// ─────────────────────────────────────────────────────────────────────────

export type SuiNetwork = 'mainnet' | 'testnet';

export const SUI_NETWORK: SuiNetwork =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) || 'testnet';

export const IS_MAINNET = SUI_NETWORK === 'mainnet';

export const SUI_CHAIN_ID = `sui:${SUI_NETWORK}` as `sui:${SuiNetwork}`;

export const SUI_EXPLORER = IS_MAINNET
  ? 'https://suivision.xyz'
  : 'https://testnet.suivision.xyz';

// Public fullnode for the active network — graceful fallback if Tatum 429s.
export const PUBLIC_FULLNODE = `https://fullnode.${SUI_NETWORK}.sui.io:443`;

// Walrus public defaults per network (override either via env).
export const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ||
  process.env.WALRUS_AGGREGATOR_URL ||
  `https://aggregator.walrus-${SUI_NETWORK}.walrus.space`;

export const WALRUS_PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ||
  process.env.WALRUS_PUBLISHER_URL ||
  `https://publisher.walrus-${SUI_NETWORK}.walrus.space`;

// Tatum Sui RPC gateway, keyed per network. Used server-side (the rpc proxy +
// register route); the browser always goes through /api/rpc, never directly.
export function tatumRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_TATUM_SUI_RPC;
  if (explicit) return explicit;
  const byNet = IS_MAINNET
    ? process.env.NEXT_PUBLIC_TATUM_SUI_MAINNET_RPC
    : process.env.NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC;
  return byNet || PUBLIC_FULLNODE;
}
