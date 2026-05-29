'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import { useState } from 'react';

const MAINNET_RPC =
  process.env.NEXT_PUBLIC_TATUM_SUI_RPC || 'https://fullnode.mainnet.sui.io:443';
// Tatum testnet subdomain is unreliable — use standard testnet fullnode
const TESTNET_RPC = 'https://fullnode.testnet.sui.io:443';

const activeNetwork =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') || 'testnet';

const { networkConfig } = createNetworkConfig({
  mainnet: { url: MAINNET_RPC, network: 'mainnet' as const },
  testnet: { url: TESTNET_RPC, network: 'testnet' as const },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={activeNetwork}>
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
