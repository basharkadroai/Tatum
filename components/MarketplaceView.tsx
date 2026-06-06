'use client';

import { useEffect, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Database, LockKeyhole, RefreshCw, ShoppingCart, FileText } from 'lucide-react';

// Human-readable "what is it" for a listing, from filename/MIME.
function kindLabel(filename: string, fileType?: string): string {
  if (fileType?.startsWith('image/')) return 'Image';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'Web page', htm: 'Web page', md: 'Markdown doc', markdown: 'Markdown doc',
    pdf: 'PDF document', txt: 'Text file', json: 'JSON data', csv: 'CSV dataset',
    docx: 'Word document', xlsx: 'Spreadsheet', js: 'JavaScript', ts: 'TypeScript',
    tsx: 'TypeScript', py: 'Python script', sol: 'Solidity', move: 'Move module',
    zip: 'Archive', mp3: 'Audio', mp4: 'Video',
  };
  return map[ext] || (fileType || 'File');
}
import { SUI_CHAIN_ID } from '@/lib/network';
import type { MarketListing } from '@/types/market';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';
// list/buy/delist live at the upgraded package id (added in the upgrade); types
// + events keep the original id.
const PACKAGE_LATEST = process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST || PACKAGE_ID;

function short(addr?: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'Unknown';
}
function formatBytes(bytes?: number) {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function clearLocalListing(listing: MarketListing) {
  try {
    const raw = localStorage.getItem('chainmind_vault');
    if (!raw) return;
    const vault = JSON.parse(raw);
    if (!Array.isArray(vault)) return;
    const next = vault.map((item: Record<string, unknown>) => {
      if (item?.listingId !== listing.listingId && item?.entryId !== listing.entryId) return item;
      const { listingId, priceMist, listed, ...rest } = item;
      void listingId; void priceMist; void listed;
      return rest;
    });
    localStorage.setItem('chainmind_vault', JSON.stringify(next));
  } catch { /* best-effort */ }
}

// The marketplace as an in-app view (rendered inside the main panel, keeping the
// sidebar + wallet) — not a standalone route.
export function MarketplaceView() {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [busyId, setBusyId] = useState('');
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  async function loadListings(silent = false) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/market/listings', { cache: 'no-store' });
      const data = await res.json();
      setListings(Array.isArray(data.listings) ? data.listings : []);
      if (data.error) setError(String(data.error));
    } catch (err) {
      setError(String(err).slice(0, 160));
    } finally {
      setLoading(false);
    }
  }

  // Auto-refresh: load on open, then poll every 15s (silently) and whenever the
  // tab regains focus — so new listings from anyone appear without a manual refresh.
  useEffect(() => {
    loadListings();
    const id = setInterval(() => loadListings(true), 15000);
    const onFocus = () => { if (document.visibilityState === 'visible') loadListings(true); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isSeller(listing: MarketListing) {
    return !!account?.address && listing.seller.toLowerCase() === account.address.toLowerCase();
  }

  async function buyListing(listing: MarketListing) {
    if (!account?.address || !PACKAGE_ID || busyId) return;
    setBusyId(listing.listingId);
    setActionMsg('');
    try {
      const tx = new Transaction();
      const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(listing.priceMist)]);
      tx.moveCall({ target: `${PACKAGE_LATEST}::vault::buy`, arguments: [tx.object(listing.listingId), payment] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setListings(prev => prev.filter(item => item.listingId !== listing.listingId));
      setActionMsg('Purchase complete. Restore your vault from chain to pull the bought entry into ChainMind.');
    } catch (err) {
      setActionMsg(`Buy failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 140)}`);
    } finally {
      setBusyId('');
    }
  }

  async function delistListing(listing: MarketListing) {
    if (!account?.address || !PACKAGE_ID || busyId) return;
    setBusyId(listing.listingId);
    setActionMsg('');
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${PACKAGE_LATEST}::vault::delist`, arguments: [tx.object(listing.listingId)] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setListings(prev => prev.filter(item => item.listingId !== listing.listingId));
      clearLocalListing(listing);
      setActionMsg('Listing cancelled.');
    } catch (err) {
      setActionMsg(`Delist failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 140)}`);
    } finally {
      setBusyId('');
    }
  }

  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 11px', borderRadius: '20px', border: '1px solid var(--border)', background: 'var(--off-white)', color: 'var(--text-2)', fontSize: '11.5px', fontWeight: 700 };

  return (
    // Solid sidebar-colored background (covers the home scene), own scroll.
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--sidebar-bg)' }}>
      <div style={{ maxWidth: '1180px', width: '100%', margin: '0 auto', padding: '44px 28px 90px' }}>
        {/* Intro — what this is (no header bar) */}
        <p style={{ margin: 0, color: '#65ca9d', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Marketplace</p>
        <h1 style={{ margin: '8px 0 0', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Own it. Sell it. Invest in it.</h1>
        <p style={{ margin: '12px 0 0', maxWidth: '740px', color: 'var(--text-2)', fontSize: '15.5px', lineHeight: 1.65 }}>
          A public marketplace for data you own on-chain. Every item is a file stored on <strong style={{ color: 'var(--text-1)' }}>Walrus</strong> and owned as a <strong style={{ color: 'var(--text-1)' }}>Sui</strong> object — anyone can browse; connect a wallet to buy (paid in SUI) or list your own files. Private files stay Seal-encrypted until you own them.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          <span style={chip} title="Listings update automatically from the chain">
            {loading
              ? <><RefreshCw size={12} className="lucide-spin" /> Updating…</>
              : <><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#65ca9d', boxShadow: '0 0 0 3px rgba(101,202,157,0.18)' }} /> Live</>}
          </span>
          <span style={chip}><LockKeyhole size={13} color="#65ca9d" /> Seal-gated access</span>
        </div>

        {actionMsg && (
          <p style={{ margin: '20px 0 0', color: actionMsg.includes('failed') ? 'var(--error)' : 'var(--mint-dark)', fontSize: '13px', lineHeight: 1.5 }}>{actionMsg}</p>
        )}

        {loading && listings.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: '14px', marginTop: '32px' }}>Loading marketplace listings…</p>
        ) : listings.length === 0 ? (
          <div style={{ marginTop: '36px', border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--off-white)', padding: '36px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
            <Database size={26} color="var(--text-3)" />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-1)' }}>No items for sale yet</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6, maxWidth: '620px' }}>
              Open a file in your vault and choose <strong style={{ color: 'var(--text-1)' }}>List for sale</strong> to put it here. Listings are read live from the on-chain <code>Listed</code> events via Tatum.
            </p>
            {error && <p style={{ margin: '4px 0 0', color: 'var(--error)', fontSize: '12px' }}>RPC note: {error}</p>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', marginTop: '30px' }}>
            {listings.map(listing => {
              const mine = isSeller(listing);
              const busy = busyId === listing.listingId;
              return (
                <article key={listing.listingId} style={{ border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--off-white)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '188px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '10px', background: 'var(--purple-bg)', color: 'var(--purple)', flexShrink: 0 }}>
                      <FileText size={18} strokeWidth={2} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 title={listing.filename} style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.filename}</h3>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: '12px' }}>{kindLabel(listing.filename, listing.fileType)} · {formatBytes(listing.sizeBytes)}</p>
                    </div>
                    {mine && <span style={{ ...chip, padding: '3px 9px', fontSize: '10.5px', color: 'var(--mint-dark)' }}>Yours</span>}
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-3)' }}>Seller {short(listing.seller)} · owned on Sui, stored on Walrus</p>

                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', marginTop: 'auto' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)' }}>Price</div>
                      <strong style={{ fontSize: '20px', color: 'var(--text-1)' }}>{listing.priceSui} <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>SUI</span></strong>
                    </div>
                    {!account?.address ? (
                      <button disabled style={{ padding: '9px 14px', borderRadius: '9px', border: 'none', background: 'var(--purple-bg)', color: 'var(--purple)', fontSize: '12.5px', fontWeight: 800, opacity: 0.55 }}>Connect wallet</button>
                    ) : mine ? (
                      <button onClick={() => delistListing(listing)} disabled={busy} style={{ padding: '9px 14px', borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: '12.5px', fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                        {busy ? 'Cancelling…' : 'Delist'}
                      </button>
                    ) : (
                      <button onClick={() => buyListing(listing)} disabled={!!busyId} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '9px', border: 'none', background: 'var(--purple)', color: 'var(--base)', fontSize: '12.5px', fontWeight: 800, cursor: busyId ? 'default' : 'pointer', opacity: busyId ? 0.6 : 1 }}>
                        <ShoppingCart size={14} /> {busy ? 'Buying…' : 'Buy'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
