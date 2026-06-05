'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { SUI_NETWORK as activeNetwork } from '@/lib/network';

// Relative URL — identical on server and client, so no hydration mismatch can
// remount the provider tree (which would wipe autoConnect). Browser fetch
// resolves '/api/rpc' against the origin → our Tatum proxy.
const PROXY_RPC = '/api/rpc';

const { networkConfig } = createNetworkConfig({
  mainnet: { url: PROXY_RPC, network: 'mainnet' as const },
  testnet: { url: PROXY_RPC, network: 'testnet' as const },
});

// Stable references so WalletProvider props never change identity across renders.
const SLUSH_CONFIG = { name: 'ChainMind' } as const;
const WALLET_STORAGE_KEY = 'chainmind:wallet';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const pathname = usePathname();

  // Docs/MCP pages don't use the wallet — skip the wallet provider there so
  // opening them never spins up a second wallet session (which was knocking out
  // the main tab's connection).
  const noWallet = pathname === '/docs' || pathname === '/mcp-guide';
  if (noWallet) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={activeNetwork}>
        <WalletProvider
          autoConnect
          storageKey={WALLET_STORAGE_KEY}
          slushWallet={SLUSH_CONFIG}
        >
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
