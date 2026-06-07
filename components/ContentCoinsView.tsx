'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { TrendingUp, PlusCircle, Flame, Play, ExternalLink } from 'lucide-react';
import { SUI_CHAIN_ID, WALRUS_AGGREGATOR } from '@/lib/network';
import { cleanEnv } from '@/lib/env';
import type { ContentCoinMarket } from '@/types/contentcoin';
import type { VideoMeta } from '@/lib/videoMeta';

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

// Content coins — Zora-style attention markets. Tokenize a social video (or a
// file) into a coin on a bonding curve: price rises with demand, the creator
// earns a fee, supporters can profit if it gains attention. Testnet, for
// entertainment & supporting creators — NOT an investment.
export function ContentCoinsView() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [markets, setMarkets] = useState<ContentCoinMarket[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, VideoMeta | null>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [holdings, setHoldings] = useState<Holding[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [launchTab, setLaunchTab] = useState<'video' | 'file'>('video');
  const [videoUrl, setVideoUrl] = useState('');
  const [preview, setPreview] = useState<VideoMeta | null>(null);
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

  // Pull each market's metadata blob from Walrus to detect/show video coins.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const m of markets) {
        if (!m.blobId || metaMap[m.blobId] !== undefined) continue;
        try {
          const r = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${m.blobId}`);
          const j = r.ok ? JSON.parse(await r.text()) : null;
          if (!cancelled) setMetaMap(x => ({ ...x, [m.blobId]: j && j.kind === 'video' ? j as VideoMeta : null }));
        } catch { if (!cancelled) setMetaMap(x => ({ ...x, [m.blobId]: null })); }
      }
    })();
    return () => { cancelled = true; };
  }, [markets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chainmind_vault');
      const list: VaultLite[] = raw ? JSON.parse(raw) : [];
      const owned = (Array.isArray(list) ? list : []).filter(v => v.blobId);
      setMyFiles(owned);
      setPickBlob(prev => prev || owned[0]?.blobId || '');
    } catch { setMyFiles([]); }
  }, [account?.address, createOpen]);

  async function previewVideo() {
    if (!videoUrl.trim()) { setMsg('Paste a video link.'); return; }
    setBusy('preview'); setMsg(''); setPreview(null);
    try {
      const res = await fetch(`/api/video-meta?url=${encodeURIComponent(videoUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read that video.');
      setPreview(data.meta);
    } catch (e) {
      setMsg(`${e instanceof Error ? e.message : e}`);
    } finally { setBusy(''); }
  }

  async function launchVideo() {
    if (!account?.address || !CC) { setMsg('Connect a wallet first.'); return; }
    if (!preview) { setMsg('Preview the video first.'); return; }
    setBusy('create'); setMsg('');
    try {
      // Store the video's metadata on Walrus, then mint the coin on Sui.
      const res = await fetch('/api/video-coin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: videoUrl.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to prepare the video.');
      const tx = new Transaction();
      tx.moveCall({ target: `${CC}::market::create_market`, arguments: [tx.pure.string(data.blobId), tx.pure.string(data.title)] });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setMsg(`Launched a coin for “${data.title}”.`);
      setCreateOpen(false); setPreview(null); setVideoUrl('');
      setTimeout(() => load(true), 2500);
    } catch (e) {
      setMsg(`Launch failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 140)}`);
    } finally { setBusy(''); }
  }

  async function createFromFile() {
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
      setMsg(`Bought ${n} coin${n === 1 ? '' : 's'}.`);
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
        <p style={{ margin: 0, maxWidth: '680px', color: 'var(--text-2)', fontSize: '14.5px', lineHeight: 1.6 }}>
          Tokenize a creator&apos;s <strong style={{ color: 'var(--text-1)' }}>video</strong> into a coin. Back the creators you believe in — the price rises as people buy and falls as they sell, and the <strong style={{ color: 'var(--text-1)' }}>creator earns 1% of every buy</strong>. If a video gains attention, early supporters can profit; if not, the price falls.
        </p>
        <button onClick={() => { setCreateOpen(o => !o); setMsg(''); }} style={primaryBtn}><PlusCircle size={15} /> Launch a coin</button>
      </div>

      {/* Zora-style disclaimer — entertainment & creator support, not an investment */}
      <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: 'var(--text-3)', maxWidth: '720px', lineHeight: 1.5 }}>
        For entertainment and supporting creators only — <strong>not an investment</strong>. Coins are speculative and highly volatile; you can lose what you put in, and on-chain trades are irreversible. Testnet.
      </p>

      {msg && <p style={{ margin: '14px 0 0', fontSize: '13px', color: msg.includes('failed') || msg.includes('Could') ? 'var(--error)' : 'var(--mint-dark)' }}>{msg}</p>}

      {createOpen && (
        <div style={{ ...card, marginTop: '18px', maxWidth: '520px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([['video', 'From a video'], ['file', 'From a file']] as const).map(([t, label]) => (
              <button key={t} onClick={() => { setLaunchTab(t); setMsg(''); }}
                style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${launchTab === t ? 'var(--purple)' : 'var(--border)'}`, background: launchTab === t ? 'var(--purple)' : 'transparent', color: launchTab === t ? 'var(--base)' : 'var(--text-2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>

          {launchTab === 'video' ? (
            <>
              <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="Paste a YouTube / TikTok / X / Vimeo link" style={{ ...input, width: '100%' }} />
              {!preview ? (
                <button onClick={previewVideo} disabled={busy === 'preview'} style={{ ...primaryBtn, background: 'var(--purple-bg)', color: 'var(--purple)', opacity: busy === 'preview' ? 0.6 : 1 }}>
                  {busy === 'preview' ? 'Reading…' : 'Preview video'}
                </button>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {preview.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview.thumbnail} alt="" style={{ width: '92px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.title}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-3)' }}>{preview.author} · {preview.provider}</p>
                    </div>
                  </div>
                  <button onClick={launchVideo} disabled={busy === 'create'} style={{ ...primaryBtn, opacity: busy === 'create' ? 0.6 : 1 }}>
                    {busy === 'create' ? 'Launching…' : 'Launch coin for this video'}
                  </button>
                </>
              )}
            </>
          ) : myFiles.length === 0 ? (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-3)' }}>No files yet — upload one first.</p>
          ) : (
            <>
              <select value={pickBlob} onChange={e => setPickBlob(e.target.value)} style={{ ...input, width: '100%' }}>
                {myFiles.map(f => <option key={f.blobId} value={f.blobId}>{f.filename}</option>)}
              </select>
              <button onClick={createFromFile} disabled={busy === 'create'} style={{ ...primaryBtn, opacity: busy === 'create' ? 0.6 : 1 }}>
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
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6 }}>No coins yet. Hit <strong style={{ color: 'var(--text-1)' }}>Launch a coin</strong> and paste a video link to mint the first one.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {markets.map(m => {
            const n = Number(amounts[m.marketId] || '0');
            const previewCost = n > 0 ? mistToSui(costOf(m.supply, n) + (costOf(m.supply, n) * FEE_BPS) / BigInt(10000)) : '';
            const vm = m.blobId ? metaMap[m.blobId] : null;
            return (
              <article key={m.marketId} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                {vm?.thumbnail && (
                  <a href={vm.url} target="_blank" rel="noopener noreferrer" style={{ position: 'relative', display: 'block' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={vm.thumbnail} alt={vm.title} style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block' }} />
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: '40px', height: '40px', borderRadius: '999px', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={18} color="#fff" fill="#fff" /></span>
                    </span>
                    <span style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '6px', background: 'rgba(0,0,0,0.6)', color: '#fff' }}>{vm.provider}</span>
                  </a>
                )}
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <strong style={{ fontSize: '14.5px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{vm?.title || m.filename}</strong>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 800, color: '#65ca9d', flexShrink: 0 }}><TrendingUp size={12} /> {m.priceSui}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-3)' }}>
                    {vm ? <>by {vm.author} · </> : null}{m.supply} coins · {m.reserveSui} SUI pooled
                    {vm && <> · <a href={vm.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--purple)', textDecoration: 'none', fontWeight: 700 }}>watch <ExternalLink size={9} /></a></>}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto' }}>
                    <input value={amounts[m.marketId] ?? ''} placeholder="coins" inputMode="numeric"
                      onChange={e => setAmounts(a => ({ ...a, [m.marketId]: e.target.value }))}
                      style={{ ...input, width: '74px' }} />
                    {account?.address ? (
                      <button onClick={() => buy(m)} disabled={busy === `buy:${m.marketId}`} style={{ ...primaryBtn, opacity: busy === `buy:${m.marketId}` ? 0.6 : 1 }}>
                        {busy === `buy:${m.marketId}` ? 'Buying…' : `Buy${previewCost ? ` · ${previewCost} SUI` : ''}`}
                      </button>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Connect wallet</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
