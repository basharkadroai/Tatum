'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import { useState } from 'react';

const activeNetwork =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') || 'testnet';

// Browser Sui reads route through our /api/rpc proxy → Tatum (Tatum's gateway
// rejects direct browser calls via CORS). SSR falls back to a public fullnode.
const PROXY_RPC =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/rpc`
    : 'https://fullnode.testnet.sui.io:443';

const { networkConfig } = createNetworkConfig({
  mainnet: { url: PROXY_RPC, network: 'mainnet' as const },
  testnet: { url: PROXY_RPC, network: 'testnet' as const },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={activeNetwork}>
        <WalletProvider autoConnect slushWallet={{ name: 'ChainMind' }}>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
