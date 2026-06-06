'use client';

import { useEffect, useRef, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Database, ShoppingCart, MoreHorizontal } from 'lucide-react';
import { SUI_CHAIN_ID, WALRUS_AGGREGATOR } from '@/lib/network';
import { cleanEnv } from '@/lib/env';
import type { MarketListing } from '@/types/market';

const TEXTUAL_EXT = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'html', 'htm', 'xml', 'yaml', 'yml', 'js', 'ts', 'tsx', 'jsx', 'py', 'sol', 'move', 'css', 'log'];

// A clean listing card (Claude-style, no icon). Shows what the file is ABOUT —
// a public preview fetched from the Walrus blob, or an image thumbnail.
function ListingCard({ listing, mine, busyId, hasWallet, onBuy, onDelist }: {
  listing: MarketListing; mine: boolean; busyId: string; hasWallet: boolean;
  onBuy: (l: MarketListing) => void; onDelist: (l: MarketListing) => void;
}) {
  const [preview, setPreview] = useState('');
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isImage = (listing.fileType || '').startsWith('image/');
  const blobUrl = listing.blobId ? `${WALRUS_AGGREGATOR}/v1/blobs/${listing.blobId}` : '';
  const ext = (listing.filename.split('.').pop() || '').toLowerCase();
  const isTextual = (listing.fileType || '').startsWith('text/') || TEXTUAL_EXT.includes(ext);
  const busy = busyId === listing.listingId;

  useEffect(() => {
    if (isImage || !blobUrl || !isTextual) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(blobUrl);
        if (!res.ok) return;
        let t = await res.text();
        t = t.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ').replace(/[#*_>`~|=-]{2,}/g, ' ').replace(/[#*_>`~|]/g, '').replace(/\s+/g, ' ').trim();
        if (!cancelled && t) setPreview(t.slice(0, 200));
      } catch { /* preview is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [blobUrl, isImage, isTextual]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ border: `1px solid ${hover ? 'var(--border-2)' : 'var(--border)'}`, borderRadius: '16px', background: 'var(--off-white)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '11px', minHeight: '196px', transition: 'border-color 0.15s ease' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <h3 title={listing.filename} style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{listing.filename}</h3>
        {mine && (
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setMenuOpen(o => !o)} aria-label="Options"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: menuOpen ? 'var(--hover)' : 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; }}
              onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}
            >
              <MoreHorizontal size={16} strokeWidth={2} />
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 30, minWidth: '140px', padding: '5px', borderRadius: '11px', border: '1px solid var(--border)', background: 'var(--off-white)', boxShadow: '0 12px 30px rgba(0,0,0,0.5)' }}>
                <button onClick={() => { setMenuOpen(false); onDelist(listing); }} disabled={busy}
                  style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 10px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#e0796b', cursor: busy ? 'default' : 'pointer', fontSize: '12.5px', fontWeight: 600, textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#c0392b'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#e0796b'; }}
                >
                  {busy ? 'Cancelling…' : 'Delist'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* What it's about — public preview from Walrus */}
      {isImage && blobUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={blobUrl} alt={listing.filename} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border)' }} />
      ) : (
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, color: 'var(--text-3)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {preview ? `${preview}…` : isTextual ? 'Loading preview…' : 'No text preview — open after purchase.'}
        </p>
      )}

      <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-3)' }}>by {listing.seller.slice(0, 6)}…{listing.seller.slice(-4)}</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: 'auto' }}>
        <strong style={{ fontSize: '17px', color: 'var(--text-1)' }}>{listing.priceSui} <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-3)' }}>SUI</span></strong>
        {!hasWallet ? (
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)' }}>Connect wallet to buy</span>
        ) : !mine ? (
          <button onClick={() => onBuy(listing)} disabled={!!busyId}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '9px', border: 'none', background: 'var(--purple)', color: 'var(--base)', fontSize: '12.5px', fontWeight: 800, cursor: busyId ? 'default' : 'pointer', opacity: busyId ? 0.6 : 1 }}
          >
            <ShoppingCart size={14} /> {busy ? 'Buying…' : 'Buy'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

const PACKAGE_ID = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID);
// list/buy/delist live at the upgraded package id (added in the upgrade); types
// + events keep the original id.
const PACKAGE_LATEST = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST) || PACKAGE_ID;

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
            {listings.map(listing => (
              <ListingCard
                key={listing.listingId}
                listing={listing}
                mine={isSeller(listing)}
                busyId={busyId}
                hasWallet={!!account?.address}
                onBuy={buyListing}
                onDelist={delistListing}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
