'use client';

import { useEffect, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Database, LockKeyhole, RefreshCw, ShoppingCart } from 'lucide-react';
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

  async function loadListings() {
    setLoading(true);
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

  useEffect(() => { loadListings(); }, []);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header bar (matches the file-view header) */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexShrink: 0, background: 'rgba(26,25,23,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '8px', background: 'var(--purple-bg)', color: 'var(--purple)', flexShrink: 0 }}>
            <ShoppingCart size={16} strokeWidth={2} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-1)' }}>Marketplace</p>
            <p style={{ fontSize: '11.5px', color: 'var(--text-3)', marginTop: '1px' }}>Buy &amp; sell vault files as Sui objects · paid in SUI</p>
          </div>
        </div>
        <button onClick={loadListings} disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: loading ? 'default' : 'pointer', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
          <RefreshCw size={14} className={loading ? 'lucide-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Listings */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', background: 'var(--off-white)', fontSize: '12px', fontWeight: 700, width: 'fit-content' }}>
            <LockKeyhole size={15} color="#65ca9d" /> Seal-gated access for private files
          </div>
          {actionMsg && (
            <p style={{ margin: '16px 0 0', color: actionMsg.includes('failed') ? 'var(--error)' : 'var(--mint-dark)', fontSize: '13px', lineHeight: 1.5 }}>{actionMsg}</p>
          )}

          {loading ? (
            <p style={{ color: 'var(--text-3)', fontSize: '14px', marginTop: '24px' }}>Loading marketplace listings…</p>
          ) : listings.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start', paddingTop: '28px' }}>
              <Database size={26} color="var(--text-3)" />
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>No active listings yet</h2>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6, maxWidth: '620px' }}>
                Open a file in your vault and choose <strong style={{ color: 'var(--text-1)' }}>List for sale</strong> to put it here. Listings are read live from the on-chain <code>Listed</code> events via Tatum.
              </p>
              {error && <p style={{ margin: '4px 0 0', color: 'var(--error)', fontSize: '12px' }}>RPC note: {error}</p>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', paddingTop: '20px' }}>
              {listings.map(listing => (
                <article key={listing.listingId} style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--off-white)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, overflowWrap: 'anywhere' }}>{listing.filename}</h2>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: '12px' }}>{listing.fileType || 'application/octet-stream'} · {formatBytes(listing.sizeBytes)}</p>
                  </div>
                  <div style={{ display: 'grid', gap: '5px', color: 'var(--text-2)', fontSize: '12px' }}>
                    <span>Seller: {short(listing.seller)}</span>
                    <span>Listing: {short(listing.listingId)}</span>
                    {listing.blobId && <span>Blob: {listing.blobId.slice(0, 14)}…</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: 'auto' }}>
                    <strong style={{ fontSize: '18px' }}>{listing.priceSui} SUI</strong>
                    {!account?.address ? (
                      <button disabled style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'var(--purple-bg)', color: 'var(--purple)', fontSize: '12px', fontWeight: 800, opacity: 0.55 }}>Connect wallet</button>
                    ) : isSeller(listing) ? (
                      <button onClick={() => delistListing(listing)} disabled={busyId === listing.listingId} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: '12px', fontWeight: 800, cursor: busyId ? 'default' : 'pointer', opacity: busyId === listing.listingId ? 0.6 : 1 }}>
                        {busyId === listing.listingId ? 'Cancelling…' : 'Delist'}
                      </button>
                    ) : (
                      <button onClick={() => buyListing(listing)} disabled={!!busyId} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'var(--purple-bg)', color: 'var(--purple)', fontSize: '12px', fontWeight: 800, cursor: busyId ? 'default' : 'pointer', opacity: busyId ? 0.6 : 1 }}>
                        <ShoppingCart size={14} /> {busyId === listing.listingId ? 'Buying…' : 'Buy'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
