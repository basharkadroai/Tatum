'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { ArrowLeft, Database, LockKeyhole, RefreshCw, ShoppingCart } from 'lucide-react';
import { SUI_CHAIN_ID } from '@/lib/network';
import { cleanEnv } from '@/lib/env';
import type { MarketListing } from '@/types/market';

const PACKAGE_ID = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID);
// list/buy/delist were added in the package upgrade — call them at the upgraded id
// (type filters/events stay on the original id, which keeps its type identity).
const PACKAGE_LATEST = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST) || PACKAGE_ID;

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
    const next = vault.map(item => {
      if (item?.listingId !== listing.listingId && item?.entryId !== listing.entryId) return item;
      const { listingId, priceMist, listed, ...rest } = item;
      void listingId; void priceMist; void listed;
      return rest;
    });
    localStorage.setItem('chainmind_vault', JSON.stringify(next));
  } catch {
    // local cache cleanup is best effort
  }
}

async function preflightMarket(body: Record<string, unknown>) {
  const res = await fetch('/api/market/preflight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'Marketplace safety check failed.');
}

export default function MarketplacePage() {
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
      await preflightMarket({
        action: 'market.buy',
        owner: account.address,
        listingId: listing.listingId,
        priceMist: listing.priceMist,
      });
      const tx = new Transaction();
      const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(listing.priceMist)]);
      tx.moveCall({
        target: `${PACKAGE_LATEST}::vault::buy`,
        arguments: [tx.object(listing.listingId), payment],
      });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setListings(prev => prev.filter(item => item.listingId !== listing.listingId));
      setActionMsg('Purchase complete. Restore your vault from chain to pull the bought entry into ChainMind.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setActionMsg(`Buy failed: ${raw.slice(0, 140)}`);
    } finally {
      setBusyId('');
    }
  }

  async function delistListing(listing: MarketListing) {
    if (!account?.address || !PACKAGE_ID || busyId) return;
    setBusyId(listing.listingId);
    setActionMsg('');
    try {
      await preflightMarket({
        action: 'market.delist',
        owner: account.address,
        listingId: listing.listingId,
      });
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_LATEST}::vault::delist`,
        arguments: [tx.object(listing.listingId)],
      });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setListings(prev => prev.filter(item => item.listingId !== listing.listingId));
      clearLocalListing(listing);
      setActionMsg('Listing cancelled.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setActionMsg(`Delist failed: ${raw.slice(0, 140)}`);
    } finally {
      setBusyId('');
    }
  }

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--base)', color: 'var(--text-1)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--sidebar-bg)' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-2)', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>
            <ArrowLeft size={15} /> ChainMind
          </Link>
          <button
            onClick={loadListings}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: loading ? 'default' : 'pointer', fontSize: '12px', fontWeight: 700 }}
          >
            <RefreshCw size={14} className={loading ? 'lucide-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      <section style={{ maxWidth: '1040px', margin: '0 auto', padding: '34px 24px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#65ca9d', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Marketplace v1</p>
            <h1 style={{ margin: '8px 0 0', fontSize: '32px', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.02em' }}>Encrypted knowledge and AI skills marketplace</h1>
            <p style={{ margin: '12px 0 0', maxWidth: '680px', color: 'var(--text-2)', fontSize: '15px', lineHeight: 1.65 }}>
              Buy and sell prompts, agent instructions, datasets, templates, and knowledge files as wallet-owned Sui vault entries. Seal encryption is live for private uploads, so access follows ownership after purchase.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', background: 'var(--off-white)', fontSize: '12px', fontWeight: 700 }}>
            <LockKeyhole size={16} color="#65ca9d" /> Seal-gated access live
          </div>
        </div>
        {actionMsg && (
          <p style={{ margin: '18px 0 0', color: actionMsg.includes('failed') ? 'var(--error)' : 'var(--mint-dark)', fontSize: '13px', lineHeight: 1.5 }}>{actionMsg}</p>
        )}

        <div style={{ marginTop: '28px', borderTop: '1px solid var(--border)' }}>
          {loading ? (
            <p style={{ color: 'var(--text-3)', fontSize: '14px', marginTop: '24px' }}>Loading marketplace listings...</p>
          ) : listings.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start', paddingTop: '28px' }}>
              <Database size={26} color="var(--text-3)" />
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>No active listings yet</h2>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6, maxWidth: '620px' }}>
                Open a file in your vault and choose List for sale. Listings are read from the upgraded on-chain vault contract, and private uploads can be Seal-gated for the buyer.
              </p>
              {error && <p style={{ margin: '4px 0 0', color: 'var(--error)', fontSize: '12px' }}>RPC note: {error}</p>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', paddingTop: '20px' }}>
              {listings.map(listing => (
                <article key={listing.listingId} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--off-white)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, overflowWrap: 'anywhere' }}>{listing.filename}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginTop: '9px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: '999px', padding: '3px 8px', background: 'var(--base)' }}>{listing.category || 'Knowledge'}</span>
                      {listing.encrypted && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 800, color: '#65ca9d', border: '1px solid rgba(101,202,157,0.35)', borderRadius: '999px', padding: '3px 8px', background: 'rgba(101,202,157,0.08)' }}>
                          <LockKeyhole size={11} /> Seal locked
                        </span>
                      )}
                    </div>
                    {listing.teaser && <p style={{ margin: '10px 0 0', color: 'var(--text-2)', fontSize: '12.5px', lineHeight: 1.5 }}>{listing.teaser}</p>}
                    <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: '12px' }}>{listing.fileType || 'application/octet-stream'} · {formatBytes(listing.sizeBytes)}</p>
                  </div>
                  <div style={{ display: 'grid', gap: '5px', color: 'var(--text-2)', fontSize: '12px' }}>
                    <span>Seller: {short(listing.seller)}</span>
                    <span>Listing: {short(listing.listingId)}</span>
                    {listing.blobId && <span>Blob: {listing.blobId.slice(0, 14)}...</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: 'auto' }}>
                    <strong style={{ fontSize: '18px' }}>{listing.priceSui} SUI</strong>
                    {!account?.address ? (
                      <button disabled style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'var(--purple-bg)', color: 'var(--purple)', fontSize: '12px', fontWeight: 800, opacity: 0.55 }}>
                        Connect wallet
                      </button>
                    ) : isSeller(listing) ? (
                      <button onClick={() => delistListing(listing)} disabled={busyId === listing.listingId} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: '12px', fontWeight: 800, cursor: busyId ? 'default' : 'pointer', opacity: busyId === listing.listingId ? 0.6 : 1 }}>
                        {busyId === listing.listingId ? 'Cancelling...' : 'Delist'}
                      </button>
                    ) : (
                      <button onClick={() => buyListing(listing)} disabled={!!busyId} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'var(--purple-bg)', color: 'var(--purple)', fontSize: '12px', fontWeight: 800, cursor: busyId ? 'default' : 'pointer', opacity: busyId ? 0.6 : 1 }}>
                        <ShoppingCart size={14} /> {busyId === listing.listingId ? 'Buying...' : 'Buy'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
