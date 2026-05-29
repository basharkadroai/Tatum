'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import { useState } from 'react';

const TATUM_RPC =
  process.env.NEXT_PUBLIC_TATUM_SUI_RPC || 'https://fullnode.mainnet.sui.io:443';

const { networkConfig } = createNetworkConfig({
  mainnet: { url: TATUM_RPC, network: 'mainnet' as const },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="mainnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
