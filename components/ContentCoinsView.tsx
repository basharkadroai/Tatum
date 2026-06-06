'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { TrendingUp, PlusCircle, Flame } from 'lucide-react';
import { SUI_CHAIN_ID } from '@/lib/network';
import { cleanEnv } from '@/lib/env';
import type { ContentCoinMarket } from '@/types/contentcoin';

const CC = cleanEnv(process.env.NEXT_PUBLIC_CONTENTCOIN_PACKAGE);
const MIST = BigInt(1_000_000_000);
const BASE = BigInt(1_000_000);   // must match content_coin.move
const SLOPE = BigInt(10_000);
const FEE_BPS = BigInt(100);

function short(a?: string) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'; }
function mistToSui(m: bigint | string | number): string {
  try {
    const raw = BigInt(m);
    const whole = raw / MIST, frac = raw % MIST;
    if (frac === BigInt(0)) return whole.toString();
    return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '').slice(0, 5)}`;
  } catch { return '0'; }
}
// Cost (in MIST) to buy `n` coins from supply `s` — integral of a linear curve.
function costOf(s: number, n: number): bigint {
  const sb = BigInt(s), nb = BigInt(n);
  return nb * BASE + SLOPE * (nb * sb + (nb * (nb - BigInt(1))) / BigInt(2));
}

type VaultLite = { filename: string; blobId?: string; owner?: string };
type Holding = { shareId: string; marketId: string; amount: number };

// Content coins — Zora-style attention markets for files. Buy on a bonding
// curve (price rises with demand), sell back, creators earn a fee per buy.
export function ContentCoinsView() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [markets, setMarkets] = useState<ContentCoinMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [holdings, setHoldings] = useState<Holding[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [myFiles, setMyFiles] = useState<VaultLite[]>([]);
  const [pickBlob, setPickBlob] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/market/coins', { cache: 'no-store' });
      const data = await res.json();
      setMarkets(Array.isArray(data.markets) ? data.markets : []);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);

  const loadHoldings = useCallback(async () => {
    if (!account?.address || !CC) { setHoldings([]); return; }
    try {
      const res = await fetch('/api/rpc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_getOwnedObjects', params: [account.address, { filter: { StructType: `${CC}::market::ContentShare` }, options: { showContent: true } }, null, 50] }),
      });
      const json = await res.json();
      const out: Holding[] = [];
      for (const o of json?.result?.data ?? []) {
        const f = o?.data?.content?.fields;
        if (!f) continue;
        out.push({ shareId: o.data.objectId, marketId: String(f.market_id), amount: Number(f.amount) });
      }
      setHoldings(out);
    } catch { setHoldings([]); }
  }, [account?.address]);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 15000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => { loadHoldings(); }, [loadHoldings]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chainmind_vault');
      const list: VaultLite[] = raw ? JSON.parse(raw) : [];
      const owned = (Array.isArray(list) ? list : []).filter(v => v.blobId);
      setMyFiles(owned);
      setPickBlob(prev => prev || owned[0]?.blobId || '');
    } catch { setMyFiles([]); }
  }, [account?.address, createOpen]);

  async function createMarket() {
    const file = myFiles.find(f => f.blobId === pickBlob);
    if (!account?.address || !CC) { setMsg('Connect a wallet first.'); return; }
    if (!file?.blobId) { setMsg('Pick a file.'); return; }
    if (markets.some(m => m.blobId === file.blobId)) { setMsg('That file already has a coin.'); return; }
    setBusy('create'); setMsg('');
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${CC}::market::create_market`, arguments: [tx.pure.string(file.blobId), tx.pure.string(file.filename)] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setMsg(`Launched a coin for ${file.filename}.`);
      setCreateOpen(false);
      setTimeout(() => load(true), 2500);
    } catch (e) {
      setMsg(`Launch failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 130)}`);
    } finally { setBusy(''); }
  }

  async function buy(m: ContentCoinMarket) {
    const n = Number(amounts[m.marketId] || '1');
    if (!account?.address || !CC) { setMsg('Connect a wallet first.'); return; }
    if (!Number.isInteger(n) || n <= 0) { setMsg('Enter a whole number of coins.'); return; }
    setBusy(`buy:${m.marketId}`); setMsg('');
    try {
      const cost = costOf(m.supply, n);
      const total = cost + (cost * FEE_BPS) / BigInt(10000);
      const tx = new Transaction();
      const [pay] = tx.splitCoins(tx.gas, [tx.pure.u64(total)]);
      tx.moveCall({ target: `${CC}::market::buy`, arguments: [tx.object(m.marketId), tx.pure.u64(BigInt(n)), pay] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setMsg(`Bought ${n} ${m.filename} coin${n === 1 ? '' : 's'}.`);
      setTimeout(() => { load(true); loadHoldings(); }, 2500);
    } catch (e) {
      setMsg(`Buy failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 130)}`);
    } finally { setBusy(''); }
  }

  async function sell(h: Holding) {
    if (!account?.address || !CC) return;
    setBusy(`sell:${h.shareId}`); setMsg('');
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${CC}::market::sell`, arguments: [tx.object(h.marketId), tx.object(h.shareId)] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setMsg(`Sold ${h.amount} coin${h.amount === 1 ? '' : 's'} back to the curve.`);
      setTimeout(() => { load(true); loadHoldings(); }, 2500);
    } catch (e) {
      setMsg(`Sell failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 130)}`);
    } finally { setBusy(''); }
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--off-white)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '11px' };
  const input: React.CSSProperties = { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--base)', color: 'var(--text-1)', fontSize: '13px', outline: 'none' };
  const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 15px', borderRadius: '9px', border: 'none', background: 'var(--purple)', color: 'var(--base)', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, maxWidth: '660px', color: 'var(--text-2)', fontSize: '14.5px', lineHeight: 1.6 }}>
          Turn a file into a tradeable <strong style={{ color: 'var(--text-1)' }}>content coin</strong>. The price rises as people buy and falls as they sell — early believers profit if it gains attention, and the <strong style={{ color: 'var(--text-1)' }}>creator earns 1% of every buy</strong>. (Testnet — speculative by design.)
        </p>
        <button onClick={() => { setCreateOpen(o => !o); setMsg(''); }} style={primaryBtn}><PlusCircle size={15} /> Launch a coin</button>
      </div>

      {msg && <p style={{ margin: '16px 0 0', fontSize: '13px', color: msg.includes('failed') ? 'var(--error)' : 'var(--mint-dark)' }}>{msg}</p>}

      {createOpen && (
        <div style={{ ...card, marginTop: '18px', maxWidth: '460px' }}>
          <strong style={{ fontSize: '14px', color: 'var(--text-1)' }}>Launch a content coin</strong>
          {myFiles.length === 0 ? (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-3)' }}>No files yet — upload one first.</p>
          ) : (
            <>
              <select value={pickBlob} onChange={e => setPickBlob(e.target.value)} style={{ ...input, width: '100%' }}>
                {myFiles.map(f => <option key={f.blobId} value={f.blobId}>{f.filename}</option>)}
              </select>
              <button onClick={createMarket} disabled={busy === 'create'} style={{ ...primaryBtn, opacity: busy === 'create' ? 0.6 : 1 }}>
                {busy === 'create' ? 'Launching…' : 'Launch coin'}
              </button>
            </>
          )}
        </div>
      )}

      {/* My coins */}
      {holdings.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 800, color: 'var(--text-1)' }}>My coins</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
            {holdings.map(h => {
              const m = markets.find(x => x.marketId === h.marketId);
              return (
                <div key={h.shareId} style={card}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.filename || short(h.marketId)}</strong>
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-2)' }}>{h.amount} coin{h.amount === 1 ? '' : 's'}{m ? ` · now ${m.priceSui} SUI ea.` : ''}</p>
                  <button onClick={() => sell(h)} disabled={busy === `sell:${h.shareId}`} style={{ ...primaryBtn, alignSelf: 'flex-start', background: 'var(--purple-bg)', color: 'var(--purple)', opacity: busy === `sell:${h.shareId}` ? 0.6 : 1 }}>
                    {busy === `sell:${h.shareId}` ? 'Selling…' : 'Sell'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h3 style={{ margin: '28px 0 12px', fontSize: '15px', fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '7px' }}><Flame size={16} color="#65ca9d" /> Coins</h3>
      {loading && markets.length === 0 ? (
        <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>Loading coins…</p>
      ) : markets.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6 }}>No coins yet. Hit <strong style={{ color: 'var(--text-1)' }}>Launch a coin</strong> to turn one of your files into a tradeable content coin.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {markets.map(m => {
            const n = Number(amounts[m.marketId] || '0');
            const preview = n > 0 ? mistToSui(costOf(m.supply, n) + (costOf(m.supply, n) * FEE_BPS) / BigInt(10000)) : '';
            return (
              <article key={m.marketId} style={card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <strong style={{ fontSize: '15px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.filename}</strong>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 800, color: '#65ca9d', flexShrink: 0 }}><TrendingUp size={12} /> {m.priceSui}</span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-3)' }}>by {short(m.creator)} · {m.supply} coins · {m.reserveSui} SUI pooled</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto' }}>
                  <input value={amounts[m.marketId] ?? ''} placeholder="coins" inputMode="numeric"
                    onChange={e => setAmounts(a => ({ ...a, [m.marketId]: e.target.value }))}
                    style={{ ...input, width: '78px' }} />
                  {account?.address ? (
                    <button onClick={() => buy(m)} disabled={busy === `buy:${m.marketId}`} style={{ ...primaryBtn, opacity: busy === `buy:${m.marketId}` ? 0.6 : 1 }}>
                      {busy === `buy:${m.marketId}` ? 'Buying…' : `Buy${preview ? ` · ${preview} SUI` : ''}`}
                    </button>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Connect wallet</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
