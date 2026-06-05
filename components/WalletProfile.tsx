'use client';
import { useEffect, useRef, useState } from 'react';
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';
import { LogOut, Wallet, ChevronUp, FileText, Server } from 'lucide-react';
import { SUI_NETWORK as NETWORK } from '@/lib/network';

export function WalletProfile({ collapsed }: { collapsed: boolean }) {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bal, setBal] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Live SUI balance via Tatum's Sui RPC (suix_getAllBalances through the
  // /api/rpc Tatum gateway proxy) — real on-chain data, powered by Tatum.
  useEffect(() => {
    if (!account?.address) { setBal(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/rpc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_getAllBalances', params: [account.address] }),
        });
        const json = await res.json();
        const sui = (json?.result ?? []).find((b: { coinType?: string; totalBalance?: string }) => b.coinType === '0x2::sui::SUI');
        const mist = sui ? Number(sui.totalBalance) : 0;
        if (!cancelled) setBal((mist / 1e9).toLocaleString(undefined, { maximumFractionDigits: 3 }));
      } catch { if (!cancelled) setBal(null); }
    })();
    return () => { cancelled = true; };
  }, [account?.address]);

  // Close the account menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

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

  const menuItem: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '8px 10px',
    borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-1)',
    cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, textAlign: 'left', textDecoration: 'none',
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div title={collapsed ? `${short} - Sui ${NETWORK}` : undefined}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : '10px', padding: collapsed ? '4px 0' : '6px 8px',
          borderRadius: '10px', transition: `gap 0.28s ${ease}, padding 0.28s ${ease}`,
        }}>
        {avatar}
        <div aria-hidden={collapsed} style={{ minWidth: 0, flex: collapsed ? '0 0 0px' : 1, ...revealStyle }}>
          <p style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short}</p>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>{bal !== null ? `${bal} SUI · via Tatum` : `Sui ${NETWORK}`}</p>
        </div>
        <button onClick={() => setMenuOpen(o => !o)} title="Account menu" aria-hidden={collapsed} tabIndex={collapsed ? -1 : 0}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: collapsed ? 0 : '27px', padding: collapsed ? 0 : '6px',
            opacity: collapsed ? 0 : 1, overflow: 'hidden', pointerEvents: collapsed ? 'none' : 'auto',
            borderRadius: '7px', background: menuOpen ? 'var(--hover)' : 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', flexShrink: 0,
            transition: `width 0.28s ${ease}, padding 0.28s ${ease}, opacity 0.16s ease`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { if (!menuOpen) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-3)'; } }}
        >
          <ChevronUp size={15} strokeWidth={2} style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
        </button>
      </div>

      {menuOpen && !collapsed && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
          padding: '5px', borderRadius: '11px', border: '1px solid var(--border)', background: 'var(--off-white)',
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        }}>
          <a href="/docs" target="_blank" rel="noreferrer" style={menuItem}
            onClick={() => setMenuOpen(false)}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          ><FileText size={14} strokeWidth={2} /> Docs</a>
          <a href="/mcp-guide" target="_blank" rel="noreferrer" style={menuItem}
            onClick={() => setMenuOpen(false)}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          ><Server size={14} strokeWidth={2} /> MCP server</a>
          <div style={{ height: '1px', background: 'var(--border)', margin: '5px 6px' }} />
          <button style={{ ...menuItem, color: '#e0796b', transition: 'background 0.12s, color 0.12s' }}
            onClick={() => { disconnect(); setMenuOpen(false); }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c0392b'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#e0796b'; }}
          ><LogOut size={14} strokeWidth={2} /> Disconnect</button>
        </div>
      )}
    </div>
  );
}
