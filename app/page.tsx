'use client';
import { useState, useEffect, useRef } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { VaultItem } from '@/types/vault';
import { FileUpload } from '@/components/FileUpload';
import { motion } from 'motion/react';
import { WalletProfile } from '@/components/WalletProfile';
import { WalrusProof } from '@/components/WalrusProof';
import { ChatPanel } from '@/components/ChatPanel';
import {
  FileText, FileSpreadsheet, FileCode, FileJson, Image as ImageIcon, File,
  Search, Database, KeyRound, Link2, Copy, X, Check,
  PanelLeft, ChevronDown,
} from 'lucide-react';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';
const SUI_NETWORK_NAME = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as 'mainnet' | 'testnet';
const SUI_CHAIN_ID = `sui:${SUI_NETWORK_NAME}` as `sui:testnet` | `sui:mainnet`;

const STORAGE_KEY = 'chainmind_vault';
function loadVault(): VaultItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveVault(items: VaultItem[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

function FileIcon({ type, name, size = 18 }: { type: string; name: string; size?: number }) {
  const ext = name.split('.').pop()?.toLowerCase();
  const common = { size, strokeWidth: 1.8, color: 'var(--text-2)' };
  if (ext === 'json') return <FileJson {...common} />;
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') return <FileSpreadsheet {...common} />;
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'html', 'css', 'sh'].includes(ext || '')) return <FileCode {...common} />;
  if (type.startsWith('image/')) return <ImageIcon {...common} />;
  if (['pdf', 'md', 'mdx', 'docx', 'doc', 'txt'].includes(ext || '') || type.startsWith('text/')) return <FileText {...common} />;
  return <File {...common} />;
}
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Home() {
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [selected, setSelected] = useState<VaultItem | null>(null);
  const [search, setSearch] = useState('');
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [proofExpanded, setProofExpanded] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState('');
  const [toast, setToast] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  useEffect(() => { setVault(loadVault()); }, []);
  useEffect(() => { setSummaryExpanded(true); setProofExpanded(false); setClaimMsg(''); setPendingDelete(null); }, [selected?.id]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); showToast(`${label} copied`); }
    catch { showToast('Copy failed'); }
  }

  function handleUploaded(item: VaultItem) {
    setVault(prev => { const next = [item, ...prev]; saveVault(next); return next; });
    setSelected(item);
    showToast(`"${item.filename}" stored on Walrus${item.txDigest ? ' + recorded on Sui' : ''}`);
  }
  function handleDelete(id: string) {
    const item = vault.find(i => i.id === id);
    setVault(prev => { const next = prev.filter(i => i.id !== id); saveVault(next); return next; });
    if (selected?.id === id) setSelected(null);
    setPendingDelete(null);
    if (item) showToast(`"${item.filename}" removed from vault`);
  }
  function updateItem(id: string, patch: Partial<VaultItem>) {
    setVault(prev => {
      const next = prev.map(i => (i.id === id ? { ...i, ...patch } : i));
      saveVault(next);
      return next;
    });
    setSelected(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  // Optional: let the user record the file under THEIR own wallet address on Sui.
  async function claimOnChain(item: VaultItem) {
    if (!account || !PACKAGE_ID || claiming) return;
    setClaiming(true);
    setClaimMsg('');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::vault::register`,
        arguments: [
          tx.pure.string(item.blobId),
          tx.pure.string(item.filename),
          tx.pure.string(item.fileType || 'application/octet-stream'),
          tx.pure.u64(item.sizeBytes),
        ],
      });
      console.log('[claim] signing on', SUI_CHAIN_ID, 'wallet', account.address);
      const res = await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      console.log('[claim] success', res.digest);
      updateItem(item.id, { txDigest: res.digest, owner: account.address });
      setClaimMsg('Claimed — you now own this on-chain');
      showToast('Claimed on-chain — you own this file');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Surface the real error so we can diagnose (was previously hidden)
      console.error('[claim] FAILED:', raw);
      try { console.error('[claim] detail:', JSON.stringify(err, Object.getOwnPropertyNames(err as object))); } catch {}
      const low = raw.toLowerCase();
      if (low.includes('password') || low.includes('set up') || low.includes('forbidden')) {
        setClaimMsg('Wallet not set up for app signing (use a seed-phrase account). File is already on-chain via Tatum.');
      } else if (low.includes('reject') || low.includes('cancel') || low.includes('denied')) {
        setClaimMsg('You declined the signature. File is already on-chain via Tatum.');
      } else {
        setClaimMsg(`Claim error: ${raw.slice(0, 110)}`);
      }
    } finally {
      setClaiming(false);
    }
  }

  const filtered = vault.filter(item => {
    const matchesSearch =
      !search ||
      item.filename.toLowerCase().includes(search.toLowerCase()) ||
      item.summary.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !tagFilter || (item.tags || []).includes(tagFilter);
    return matchesSearch && matchesTag;
  });
  const totalBytes = vault.reduce((sum, i) => sum + (i.sizeBytes || 0), 0);
  const allTags = Array.from(new Set(vault.flatMap(i => i.tags || []))).slice(0, 12);

  const network = process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet';
  const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
  const suiExplorer = network === 'mainnet' ? 'https://suivision.xyz' : 'https://testnet.suivision.xyz';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--base)' }}>

      {/* ── Sidebar (collapses to an icon rail) ── */}
      <aside style={{
        width: sidebarOpen ? '264px' : '62px', flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)', background: 'var(--sidebar-bg)',
        overflow: 'hidden', transition: 'width 0.2s ease',
      }}>
        {/* Brand + collapse toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center', padding: sidebarOpen ? '16px 14px 12px' : '16px 0 12px', flexShrink: 0 }}>
          {sidebarOpen && (
            <button onClick={() => setSelected(null)} title="Home" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, fontSize: '18px', letterSpacing: '-0.01em', color: 'var(--text-1)' }}>
              ChainMind
            </button>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', border: 'none', background: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            <PanelLeft size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Upload */}
        <div style={{ padding: sidebarOpen ? '2px 12px 8px' : '2px 11px 8px' }}>
          <FileUpload onUploaded={handleUploaded} compact collapsed={!sidebarOpen} />
        </div>

        {/* Search */}
        {sidebarOpen && vault.length > 0 && (
            <div style={{ padding: '0 14px 10px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} strokeWidth={2} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search files..."
                  style={{
                    width: '100%', padding: '7px 10px 7px 28px', borderRadius: '8px',
                    fontSize: '12px', border: '1px solid var(--border)',
                    background: 'var(--white)', color: 'var(--text-1)', outline: 'none',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--purple)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
            </div>
          )}

          {/* File list label + storage stat */}
          {sidebarOpen && vault.length > 0 && (
            <div style={{ padding: '4px 16px 6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Vault · {vault.length} file{vault.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--mint-dark)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Database size={12} strokeWidth={2} /> {formatBytes(totalBytes)} stored permanently on Walrus
              </div>
              {allTags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                  {tagFilter && (
                    <button onClick={() => setTagFilter(null)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                      background: 'var(--purple)', color: 'var(--base)', border: 'none', cursor: 'pointer',
                    }}><X size={10} strokeWidth={2.5} /> {tagFilter}</button>
                  )}
                  {!tagFilter && allTags.map(tag => (
                    <button key={tag} onClick={() => setTagFilter(tag)} style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
                      background: 'var(--off-white)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--purple)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >{tag}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* File list — only when expanded */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
            {sidebarOpen && filtered.length === 0 && search && (
              <p style={{ fontSize: '12px', color: 'var(--text-3)', padding: '12px 8px' }}>No matches.</p>
            )}
            {sidebarOpen && filtered.map(item => (
              <motion.div
                key={item.id}
                onClick={() => setSelected(item)}
                className={`file-item${selected?.id === item.id ? ' active' : ''}`}
                whileHover="hover"
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 10px', borderRadius: '9px', cursor: 'pointer',
                  borderLeft: selected?.id === item.id ? '3px solid var(--purple)' : '3px solid transparent',
                }}
              >
                <motion.span
                  variants={{ hover: { scale: 1.22, rotate: -6 } }}
                  transition={{ type: 'spring', stiffness: 400, damping: 12 }}
                  style={{ flexShrink: 0, display: 'flex' }}
                ><FileIcon type={item.fileType} name={item.filename} size={17} /></motion.span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{
                    fontSize: '12px', fontWeight: 600, color: 'var(--text-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{item.filename}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>
                    {formatBytes(item.sizeBytes)} · {formatDate(item.uploadedAt)}
                  </p>
                </div>
                {item.owner ? (
                  <KeyRound size={13} strokeWidth={2} color="var(--mint-dark)" style={{ flexShrink: 0 }} />
                ) : item.txDigest ? (
                  <div title="Recorded on Sui" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--purple)', flexShrink: 0 }} />
                ) : null}
              </motion.div>
            ))}
          </div>

          {/* Profile (wallet) */}
          <div style={{ padding: sidebarOpen ? '8px 10px 10px' : '8px 8px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <WalletProfile collapsed={!sidebarOpen} />
          </div>
        </aside>

        {/* ── Main Panel ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--white)' }}>

          {!selected ? (
            vault.length === 0 ? (
              /* First-run: centered upload home */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '24px' }}>
                <h1 style={{ fontSize: '30px', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.02em', textAlign: 'center' }}>
                  Welcome to your knowledge vault
                </h1>
                <div style={{ width: '100%', maxWidth: '560px' }}>
                  <FileUpload onUploaded={handleUploaded} />
                </div>
                <div style={{ display: 'flex', gap: '22px', fontSize: '12px', color: 'var(--text-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['Any file type', 'Permanent Walrus storage', 'Recorded on Sui via Tatum'].map(t => (
                    <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={13} strokeWidth={2.5} color="var(--text-2)" /> {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              /* Home: centered "ask your whole vault" chat */
              <ChatPanel
                resetKey="vault"
                centered
                greeting="What do you want to know?"
                endpoint="/api/ask-vault"
                buildBody={(question, history) => ({ docs: vault.map(v => ({ filename: v.filename, content: v.content })), question, history })}
                suggestions={['What are the common themes across my files?', 'Which file mentions deadlines?', 'Summarize my whole vault in 3 points.']}
                placeholder="Ask across your whole vault…"
                aiLabel="ChainMind"
                onToast={showToast}
                leftAction={<FileUpload onUploaded={handleUploaded} iconButton />}
              />
            )
          ) : (
            /* File detail + Q&A */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

              {/* File header */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, background: 'var(--white)' }}>
                <span style={{ display: 'flex', flexShrink: 0 }}><FileIcon type={selected.fileType} name={selected.filename} size={22} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected.filename}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{formatBytes(selected.sizeBytes)} · {formatDate(selected.uploadedAt)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <a href={`${aggregator}/v1/blobs/${selected.blobId}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--mint-dark)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                        <Database size={12} strokeWidth={2} /> {selected.blobId.slice(0, 14)}…
                      </a>
                      <button onClick={() => copy(selected.blobId, 'Blob ID')} title="Copy blob ID"
                        style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 2px' }}><Copy size={11} strokeWidth={2} /></button>
                    </span>
                    {selected.txDigest && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <a href={`${suiExplorer}/txblock/${selected.txDigest}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--purple)', textDecoration: 'none' }}
                          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                          <Link2 size={12} strokeWidth={2} /> {selected.txDigest.slice(0, 14)}…
                        </a>
                        <button onClick={() => copy(selected.txDigest!, 'Tx digest')} title="Copy transaction digest"
                          style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 2px' }}><Copy size={11} strokeWidth={2} /></button>
                      </span>
                    )}
                    {selected.owner && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--mint-dark)' }}>
                        <KeyRound size={12} strokeWidth={2} /> Owned by you
                      </span>
                    )}
                  </div>
                  {claimMsg && (
                    <p style={{ fontSize: '11px', marginTop: '4px', color: claimMsg.startsWith('Claimed') ? 'var(--mint-dark)' : 'var(--error)' }}>{claimMsg}</p>
                  )}
                </div>
                {/* Optional: claim under your own wallet */}
                {account && !selected.owner && (
                  <button
                    onClick={() => claimOnChain(selected)}
                    disabled={claiming}
                    title="Sign with your wallet to own this file on-chain"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      border: '1px solid var(--purple-bg)', background: 'var(--purple-bg)', color: 'var(--purple)',
                      cursor: claiming ? 'default' : 'pointer', flexShrink: 0, opacity: claiming ? 0.6 : 1,
                    }}
                  >
                    <Link2 size={13} strokeWidth={2} /> {claiming ? 'Claiming…' : 'Claim on-chain'}
                  </button>
                )}
                {pendingDelete === selected.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button onClick={() => handleDelete(selected.id)}
                      style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--error-border)', background: 'var(--error-bg)', color: 'var(--error)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                      Delete
                    </button>
                    <button onClick={() => setPendingDelete(null)}
                      style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px' }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setPendingDelete(selected.id)}
                    title="Remove from vault"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '7px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--error-border)'; e.currentTarget.style.color = 'var(--error)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}
                  ><X size={15} strokeWidth={2} /></button>
                )}
              </div>

              {/* Summary (collapsible) */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--off-white)' }}>
                <button
                  onClick={() => setSummaryExpanded(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: summaryExpanded ? '10px' : 0 }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Summary</span>
                  <ChevronDown size={13} strokeWidth={2.5} color="var(--text-3)" style={{ transform: summaryExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
                </button>
                {summaryExpanded && (
                  <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.65', animation: 'fadeUp 0.2s ease' }}>
                    {selected.summary}
                  </p>
                )}
                {summaryExpanded && selected.tags && selected.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                    {selected.tags.map(tag => (
                      <button key={tag} onClick={() => { setTagFilter(tag); setSelected(null); }} title={`Filter vault by "${tag}"`} style={{
                        fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px',
                        background: 'var(--purple-bg)', color: 'var(--purple)', border: '1px solid var(--purple-border)', cursor: 'pointer',
                      }}>#{tag}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Walrus proof — collapsible so the chat stays the focus */}
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--white)' }}>
                <button
                  onClick={() => setProofExpanded(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mint-dark)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Decentralized Storage Proof</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                    background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--mint-dark)',
                  }}><Check size={11} strokeWidth={2.5} /> on Walrus</span>
                  <ChevronDown size={13} strokeWidth={2.5} color="var(--text-3)" style={{ marginLeft: 'auto', transform: proofExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
                </button>
                {proofExpanded && (
                  <div style={{ marginTop: '12px', animation: 'fadeUp 0.2s ease' }}>
                    <WalrusProof key={selected.id} blobId={selected.blobId} fileType={selected.fileType} filename={selected.filename} />
                  </div>
                )}
              </div>

              {/* Chat (Claude-style) — fills the remaining height */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <ChatPanel
                  resetKey={selected.id}
                  endpoint="/api/ask"
                  buildBody={(question, history) => ({ content: selected.content, question, history })}
                  suggestions={selected.questions && selected.questions.length > 0
                    ? selected.questions
                    : ['What is this about?', 'What are the key points?', 'Summarize in one sentence.']}
                  placeholder="Ask anything about this document…"
                  aiLabel="ChainMind AI"
                  onToast={showToast}
                />
              </div>
            </div>
          )}
        </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: '8px',
          background: '#2d2e30', color: 'var(--text-1)', padding: '10px 18px',
          borderRadius: '12px', fontSize: '13px', fontWeight: 600, border: '1px solid var(--border)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.5)', animation: 'toastIn 0.22s ease',
          maxWidth: '90vw',
        }}>
          <Check size={15} strokeWidth={2.5} color="var(--mint)" style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast}</span>
        </div>
      )}

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} } @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} } @keyframes toastIn { from{opacity:0;transform:translate(-50%,8px)} to{opacity:1;transform:translate(-50%,0)} }`}</style>
    </div>
  );
}
