'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { TrendingUp, Coins, PlusCircle } from 'lucide-react';
import { SUI_CHAIN_ID } from '@/lib/network';
import { cleanEnv } from '@/lib/env';
import type { ShareOffering } from '@/types/market';

const PACKAGE_ID = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID);
const PACKAGE_LATEST = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST) || PACKAGE_ID;
const MIST = 1_000_000_000n;

function short(a?: string) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'; }
function suiToMist(input: string): bigint | null {
  const c = input.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(c)) return null;
  const [w, f = ''] = c.split('.');
  const m = BigInt(w) * MIST + BigInt((f + '000000000').slice(0, 9));
  return m > 0n ? m : null;
}
function mistToSui(m: string | number | bigint): string {
  try {
    const raw = BigInt(m);
    const whole = raw / MIST, frac = raw % MIST;
    if (frac === 0n) return whole.toString();
    return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '').slice(0, 4)}`;
  } catch { return '0'; }
}

type VaultLite = { entryId?: string; filename: string; owner?: string; blobId?: string };
type ShareHolding = { shareId: string; vaultId: string; amount: number };

// The investing experience: offer a file as fractional shares, buy shares of
// others' files, and claim your share of any distributed proceeds.
export function InvestView() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [offerings, setOfferings] = useState<ShareOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({}); // shares to buy per offering

  const [offerOpen, setOfferOpen] = useState(false);
  const [myFiles, setMyFiles] = useState<VaultLite[]>([]);
  const [offerFile, setOfferFile] = useState('');
  const [offerTotal, setOfferTotal] = useState('100');
  const [offerPrice, setOfferPrice] = useState('0.05');

  const [holdings, setHoldings] = useState<ShareHolding[]>([]);

  const loadOfferings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/market/shares', { cache: 'no-store' });
      const data = await res.json();
      setOfferings(Array.isArray(data.offerings) ? data.offerings : []);
    } catch { /* keep prior */ } finally { setLoading(false); }
  }, []);

  // My on-chain Share objects (type identity uses the ORIGINAL package id).
  const loadHoldings = useCallback(async () => {
    if (!account?.address || !PACKAGE_ID) { setHoldings([]); return; }
    try {
      const res = await fetch('/api/rpc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_getOwnedObjects', params: [account.address, { filter: { StructType: `${PACKAGE_ID}::vault::Share` }, options: { showContent: true } }, null, 50] }),
      });
      const json = await res.json();
      const out: ShareHolding[] = [];
      for (const o of json?.result?.data ?? []) {
        const f = o?.data?.content?.fields;
        if (!f) continue;
        out.push({ shareId: o.data.objectId, vaultId: String(f.vault_id), amount: Number(f.amount) });
      }
      setHoldings(out);
    } catch { setHoldings([]); }
  }, [account?.address]);

  useEffect(() => {
    loadOfferings();
    const id = setInterval(() => loadOfferings(true), 15000);
    return () => clearInterval(id);
  }, [loadOfferings]);
  useEffect(() => { loadHoldings(); }, [loadHoldings]);

  // Files the connected wallet can offer (registered on-chain).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chainmind_vault');
      const list: VaultLite[] = raw ? JSON.parse(raw) : [];
      const owned = (Array.isArray(list) ? list : []).filter(v => v.entryId && (!v.owner || v.owner.toLowerCase() === account?.address?.toLowerCase()));
      setMyFiles(owned);
      setOfferFile(prev => prev || owned[0]?.entryId || '');
    } catch { setMyFiles([]); }
  }, [account?.address, offerOpen]);

  async function offerShares() {
    const file = myFiles.find(f => f.entryId === offerFile);
    const total = Number(offerTotal);
    const price = suiToMist(offerPrice);
    if (!account?.address || !PACKAGE_LATEST) { setMsg('Connect a wallet first.'); return; }
    if (!file?.entryId || !Number.isInteger(total) || total <= 0 || !price) { setMsg('Pick a file, a whole number of shares, and a price.'); return; }
    setBusy('offer'); setMsg('');
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${PACKAGE_LATEST}::vault::offer_shares`, arguments: [tx.object(file.entryId), tx.pure.u64(BigInt(total)), tx.pure.u64(price)] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setMsg(`Offered ${total} shares of ${file.filename}.`);
      setOfferOpen(false);
      setTimeout(() => loadOfferings(true), 2500);
    } catch (e) {
      setMsg(`Offer failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 130)}`);
    } finally { setBusy(''); }
  }

  async function buyShares(o: ShareOffering) {
    const amount = Number(amounts[o.vaultId] || '1');
    if (!account?.address || !PACKAGE_LATEST) { setMsg('Connect a wallet first.'); return; }
    if (!Number.isInteger(amount) || amount <= 0) { setMsg('Enter a whole number of shares.'); return; }
    setBusy(o.vaultId); setMsg('');
    try {
      const cost = BigInt(amount) * BigInt(o.pricePerShareMist);
      const tx = new Transaction();
      const [pay] = tx.splitCoins(tx.gas, [tx.pure.u64(cost)]);
      tx.moveCall({ target: `${PACKAGE_LATEST}::vault::buy_shares`, arguments: [tx.object(o.vaultId), tx.pure.u64(BigInt(amount)), pay] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setMsg(`Bought ${amount} share${amount === 1 ? '' : 's'} of ${o.filename}.`);
      setTimeout(() => { loadOfferings(true); loadHoldings(); }, 2500);
    } catch (e) {
      setMsg(`Buy failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 130)}`);
    } finally { setBusy(''); }
  }

  async function claim(h: ShareHolding) {
    if (!account?.address || !PACKAGE_LATEST) return;
    setBusy(h.shareId); setMsg('');
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${PACKAGE_LATEST}::vault::claim`, arguments: [tx.object(h.vaultId), tx.object(h.shareId)] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setMsg('Claimed your share of the proceeds.');
    } catch (e) {
      const raw = (e instanceof Error ? e.message : String(e));
      setMsg(/ENothingToClaim|abort.*7/i.test(raw) ? 'Nothing to claim yet — no proceeds have been distributed.' : `Claim failed: ${raw.slice(0, 120)}`);
    } finally { setBusy(''); }
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--off-white)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '11px' };
  const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--base)', color: 'var(--text-1)', fontSize: '13px', outline: 'none' };
  const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 15px', borderRadius: '9px', border: 'none', background: 'var(--purple)', color: 'var(--base)', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, maxWidth: '640px', color: 'var(--text-2)', fontSize: '14.5px', lineHeight: 1.6 }}>
          Buy fractional <strong style={{ color: 'var(--text-1)' }}>shares</strong> of a data asset. The creator raises funds; if the asset earns or resells, proceeds are distributed and shareholders <strong style={{ color: 'var(--text-1)' }}>claim</strong> their pro-rata cut.
        </p>
        <button onClick={() => { setOfferOpen(o => !o); setMsg(''); }} style={primaryBtn}><PlusCircle size={15} /> Offer a file as shares</button>
      </div>

      {msg && <p style={{ margin: '16px 0 0', fontSize: '13px', color: msg.includes('failed') ? 'var(--error)' : 'var(--mint-dark)' }}>{msg}</p>}

      {offerOpen && (
        <div style={{ ...card, marginTop: '18px', maxWidth: '520px' }}>
          <strong style={{ fontSize: '14px', color: 'var(--text-1)' }}>Offer fractional shares</strong>
          {myFiles.length === 0 ? (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-3)' }}>No on-chain files to offer. Upload a file first (it must be registered on Sui).</p>
          ) : (
            <>
              <label style={{ fontSize: '12px', color: 'var(--text-3)' }}>File
                <select value={offerFile} onChange={e => setOfferFile(e.target.value)} style={{ ...input, marginTop: '4px' }}>
                  {myFiles.map(f => <option key={f.entryId} value={f.entryId}>{f.filename}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-3)' }}>Total shares
                  <input value={offerTotal} onChange={e => setOfferTotal(e.target.value)} inputMode="numeric" style={{ ...input, marginTop: '4px' }} />
                </label>
                <label style={{ flex: 1, fontSize: '12px', color: 'var(--text-3)' }}>Price / share (SUI)
                  <input value={offerPrice} onChange={e => setOfferPrice(e.target.value)} inputMode="decimal" style={{ ...input, marginTop: '4px' }} />
                </label>
              </div>
              <button onClick={offerShares} disabled={busy === 'offer'} style={{ ...primaryBtn, opacity: busy === 'offer' ? 0.6 : 1 }}>
                {busy === 'offer' ? 'Offering…' : 'Create offering'}
              </button>
            </>
          )}
        </div>
      )}

      {/* My investments */}
      {holdings.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '7px' }}><Coins size={16} color="#65ca9d" /> My investments</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {holdings.map(h => {
              const o = offerings.find(x => x.vaultId === h.vaultId);
              return (
                <div key={h.shareId} style={card}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o?.filename || `Vault ${short(h.vaultId)}`}</strong>
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-2)' }}>{h.amount} share{h.amount === 1 ? '' : 's'}{o ? ` of ${o.totalShares}` : ''}</p>
                  <button onClick={() => claim(h)} disabled={busy === h.shareId} style={{ ...primaryBtn, alignSelf: 'flex-start', background: 'var(--purple-bg)', color: 'var(--purple)', opacity: busy === h.shareId ? 0.6 : 1 }}>
                    {busy === h.shareId ? 'Claiming…' : 'Claim proceeds'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Offerings */}
      <h3 style={{ margin: '28px 0 12px', fontSize: '15px', fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '7px' }}><TrendingUp size={16} color="#65ca9d" /> Open offerings</h3>
      {loading && offerings.length === 0 ? (
        <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>Loading offerings…</p>
      ) : offerings.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6 }}>No share offerings yet. Use <strong style={{ color: 'var(--text-1)' }}>Offer a file as shares</strong> to put one up — investors can then buy a fraction of it.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {offerings.map(o => {
            const mine = !!account?.address && o.creator.toLowerCase() === account.address.toLowerCase();
            const remaining = Math.max(0, o.totalShares - o.sharesSold);
            const pct = o.totalShares ? Math.round((o.sharesSold / o.totalShares) * 100) : 0;
            return (
              <article key={o.vaultId} style={card}>
                <strong style={{ fontSize: '15px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.filename}</strong>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-3)' }}>by {short(o.creator)}{mine ? ' · you' : ''}</p>
                <div>
                  <div style={{ height: '6px', borderRadius: '4px', background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#65ca9d' }} />
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: 'var(--text-3)' }}>{o.sharesSold}/{o.totalShares} sold · {remaining} left · {o.pricePerShareSui} SUI / share</p>
                </div>
                {!account?.address ? (
                  <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Connect wallet to invest</span>
                ) : mine || remaining === 0 ? (
                  <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{remaining === 0 ? 'Fully subscribed' : 'Your offering'}</span>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto' }}>
                    <input value={amounts[o.vaultId] ?? ''} placeholder="shares" inputMode="numeric"
                      onChange={e => setAmounts(a => ({ ...a, [o.vaultId]: e.target.value }))}
                      style={{ ...input, width: '80px' }} />
                    <button onClick={() => buyShares(o)} disabled={busy === o.vaultId} style={{ ...primaryBtn, opacity: busy === o.vaultId ? 0.6 : 1 }}>
                      {busy === o.vaultId ? 'Buying…' : `Buy${amounts[o.vaultId] ? ` · ${mistToSui(BigInt(Number(amounts[o.vaultId]) || 0) * BigInt(o.pricePerShareMist))} SUI` : ''}`}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
