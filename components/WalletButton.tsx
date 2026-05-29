'use client';
import { useState } from 'react';
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';

export function WalletButton() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);

  if (account) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '7px 14px', borderRadius: '8px', fontSize: '13px',
          fontFamily: 'monospace', fontWeight: 500,
          background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d',
        }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: 'var(--mint)', display: 'inline-block',
            boxShadow: '0 0 6px var(--mint)',
          }} />
          {account.address.slice(0, 6)}…{account.address.slice(-4)}
        </div>
        <button
          onClick={() => disconnect()}
          style={{
            padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: 'var(--off-white)', border: '1px solid var(--border)',
            color: 'var(--text-2)', cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '9px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 700,
          background: 'var(--purple)', color: 'white', border: 'none', cursor: 'pointer',
          letterSpacing: '-0.01em', transition: 'background 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--purple-dark)';
          e.currentTarget.style.boxShadow = '0 4px 14px rgba(79,70,229,0.4)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--purple)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Connect Wallet
      </button>
      <ConnectModal
        trigger={<span style={{ display: 'none' }} />}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
