'use client';
import { useState } from 'react';
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';
import { LogOut, Wallet } from 'lucide-react';
import { SUI_NETWORK as NETWORK } from '@/lib/network';

export function WalletProfile({ collapsed }: { collapsed: boolean }) {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);

  const short = account ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}` : '';
  const initials = account ? account.address.slice(2, 4).toUpperCase() : '';

  const avatar = (
    <div style={{
      width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '11px', fontWeight: 700, fontFamily: 'monospace',
      background: account ? 'var(--off-white)' : 'var(--white)',
      border: '1px solid var(--border)', color: 'var(--text-1)',
    }}>
      {account ? initials : <Wallet size={15} strokeWidth={2} color="var(--text-2)" />}
    </div>
  );

  if (!account) {
    if (collapsed) {
      return (
        <>
          <button onClick={() => setOpen(true)} title="Connect wallet"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
            {avatar}
          </button>
          <ConnectModal trigger={<span style={{ display: 'none' }} />} open={open} onOpenChange={setOpen} />
        </>
      );
    }
    return (
      <>
        <button onClick={() => setOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 10px', borderRadius: '10px', cursor: 'pointer',
            background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--text-1)',
            fontSize: '13px', fontWeight: 600,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}
        >
          {avatar}
          <span>Connect wallet</span>
        </button>
        <ConnectModal trigger={<span style={{ display: 'none' }} />} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  if (collapsed) {
    return (
      <button onClick={() => disconnect()} title={`${short} · click to disconnect`}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
        {avatar}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '10px' }}>
      {avatar}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short}</p>
        <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>Sui {NETWORK}</p>
      </div>
      <button onClick={() => disconnect()} title="Disconnect"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '7px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-3)'; }}
      >
        <LogOut size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
