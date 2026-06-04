'use client';
import { useEffect, useState } from 'react';
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';
import { LogOut, Wallet } from 'lucide-react';
import { SUI_NETWORK as NETWORK } from '@/lib/network';

export function WalletProfile({ collapsed }: { collapsed: boolean }) {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const short = account ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}` : '';
  const initials = account ? account.address.slice(2, 4).toUpperCase() : '';
  const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const revealStyle = {
    opacity: collapsed ? 0 : 1,
    maxWidth: collapsed ? 0 : '160px',
    transform: collapsed ? 'translateX(-6px)' : 'translateX(0)',
    overflow: 'hidden',
    whiteSpace: 'nowrap' as const,
    pointerEvents: collapsed ? 'none' as const : 'auto' as const,
    transition: `opacity 0.16s ease, max-width 0.28s ${ease}, transform 0.28s ${ease}`,
  };

  useEffect(() => {
    if (collapsed && confirming) setConfirming(false);
  }, [collapsed, confirming]);

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
    return (
      <>
        <button onClick={() => setOpen(true)} title="Connect wallet"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : '10px', padding: collapsed ? '4px 0' : '8px 10px',
            borderRadius: '10px', cursor: 'pointer',
            background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--text-1)',
            fontSize: '13px', fontWeight: 600,
            transition: `gap 0.28s ${ease}, padding 0.28s ${ease}, background 0.12s ease`,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}
        >
          {avatar}
          <span aria-hidden={collapsed} style={revealStyle}>Connect wallet</span>
        </button>
        <ConnectModal trigger={<span style={{ display: 'none' }} />} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <div title={collapsed ? `${short} - Sui ${NETWORK}` : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : '10px', padding: collapsed ? '4px 0' : '6px 8px',
        borderRadius: '10px', transition: `gap 0.28s ${ease}, padding 0.28s ${ease}`,
      }}>
      {avatar}
      {confirming ? (
        <>
          <div style={{ minWidth: 0, flex: 1, ...revealStyle }}>
            <p style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-1)' }}>Disconnect?</p>
          </div>
          <button onClick={() => { disconnect(); setConfirming(false); }} title="Confirm disconnect"
            style={{ padding: '4px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0, background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error)' }}>
            Yes
          </button>
          <button onClick={() => setConfirming(false)} title="Cancel"
            style={{ padding: '4px 10px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', flexShrink: 0, background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            No
          </button>
        </>
      ) : (
        <>
          <div aria-hidden={collapsed} style={{ minWidth: 0, flex: collapsed ? '0 0 0px' : 1, ...revealStyle }}>
            <p style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>Sui {NETWORK}</p>
          </div>
          <button onClick={() => setConfirming(true)} title="Disconnect" aria-hidden={collapsed} tabIndex={collapsed ? -1 : 0}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: collapsed ? 0 : '27px', padding: collapsed ? 0 : '6px',
              opacity: collapsed ? 0 : 1, overflow: 'hidden', pointerEvents: collapsed ? 'none' : 'auto',
              borderRadius: '7px', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', flexShrink: 0,
              transition: `width 0.28s ${ease}, padding 0.28s ${ease}, opacity 0.16s ease`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-3)'; }}
          >
            <LogOut size={15} strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}
