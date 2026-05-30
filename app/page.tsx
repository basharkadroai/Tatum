'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { VaultItem } from '@/types/vault';
import { runUpload } from '@/lib/upload';
import { SUI_CHAIN_ID, WALRUS_AGGREGATOR } from '@/lib/network';
import { WalletProfile } from '@/components/WalletProfile';
import { WalrusProof } from '@/components/WalrusProof';
import { ChatPanel } from '@/components/ChatPanel';
import { FileListItem } from '@/components/FileListItem';
import { HomeBackground } from '@/components/HomeBackground';
import { selectVaultDocs } from '@/lib/retrieve';
import { PaperclipIcon, CodeXmlIcon } from '@animateicons/react/lucide';
import {
  Search, Database, Link2, X, Check,
  PanelLeft, ChevronDown,
} from 'lucide-react';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';

const STORAGE_KEY = 'chainmind_vault';
function loadVault(): VaultItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveVault(items: VaultItem[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

// Pull a text blob's content back from Walrus so restored files are queryable.
async function fetchWalrusText(blobId: string, fileType: string, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const textual = fileType.startsWith('text/') || ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'xml', 'yaml', 'yml', ...CODE_EXTS].includes(ext);
  if (!textual) return '';
  try {
    const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    if (!res.ok) return '';
    return (await res.text()).slice(0, 12000);
  } catch { return ''; }
}

const CODE_EXTS = ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'scss', 'sh', 'json', 'xml', 'yaml', 'yml', 'sql'];
// Animated file icons (self-animating via isAnimated — not hover). The library
// has no per-type file glyphs, so we use an animated CodeXml for code files and
// an animated Paperclip for everything else.
function FileIcon({ name, size = 18, animated = false }: { type?: string; name: string; size?: number; animated?: boolean }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const Cmp = CODE_EXTS.includes(ext) ? CodeXmlIcon : PaperclipIcon;
  return <Cmp size={size} color="var(--text-2)" isAnimated={animated} />;
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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [homeEmpty, setHomeEmpty] = useState(true);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreAddr, setRestoreAddr] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');

  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  useEffect(() => { setVault(loadVault()); setLoaded(true); }, []);
  // Collapse the sidebar to its rail on small screens so the chat gets the room.
  useEffect(() => {
    const apply = () => { if (window.innerWidth < 768) setSidebarOpen(false); };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
  useEffect(() => { setSummaryExpanded(true); setProofExpanded(false); setClaimMsg(''); setPendingDelete(null); }, [selected?.id]);

  // Reconstruct the files OWNED by an address on-chain (VaultEntry objects, read
  // from Sui via Tatum) and pull their content back from Walrus. Read-only — no
  // signing — so a vault can be restored anywhere from just the owner address.
  async function restoreFromChain(owner: string): Promise<number> {
    try {
      const res = await fetch(`/api/vault-onchain?owner=${owner.trim()}`);
      const { entries } = await res.json();
      if (!Array.isArray(entries) || entries.length === 0) return 0;
      const fresh: VaultItem[] = [];
      setVault(prev => {
        const have = new Set(prev.map(i => i.blobId));
        for (const e of entries) {
          if (have.has(e.blobId)) continue;
          fresh.push({
            id: crypto.randomUUID(),
            filename: e.filename, fileType: e.fileType, blobId: e.blobId,
            summary: 'Restored from the on-chain vault (Sui + Walrus).',
            content: '', txDigest: e.txDigest, owner: e.owner,
            tags: [], questions: [], uploadedAt: new Date().toISOString(), sizeBytes: e.sizeBytes,
          });
        }
        if (fresh.length === 0) return prev;
        const next = [...fresh, ...prev];
        saveVault(next);
        return next;
      });
      for (const item of fresh) {
        const content = await fetchWalrusText(item.blobId, item.fileType, item.filename);
        if (content) updateItem(item.id, { content });
      }
      return fresh.length;
    } catch { return 0; }
  }

  // Auto-restore when a wallet connects.
  useEffect(() => {
    if (account?.address) restoreFromChain(account.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address]);

  async function doRestore() {
    const addr = restoreAddr.trim();
    if (!addr || restoring) return;
    setRestoring(true);
    setRestoreMsg('');
    const n = await restoreFromChain(addr);
    setRestoreMsg(n > 0 ? `Restored ${n} file${n === 1 ? '' : 's'} from chain.` : 'No on-chain files found for that address.');
    setRestoring(false);
    if (n > 0) setRestoreAddr('');
  }

  // Add an uploaded file to the vault without switching the view (the chat
  // keeps showing the upload narration).
  function addToVault(item: VaultItem) {
    setVault(prev => { const next = [item, ...prev]; saveVault(next); return next; });
  }
  function handleDelete(id: string) {
    setVault(prev => { const next = prev.filter(i => i.id !== id); saveVault(next); return next; });
    if (selected?.id === id) setSelected(null);
    setPendingDelete(null);
  }
  // Open the file referenced by a [citation] pill. Labels look like
  // "FILE 8: business project blueprint.txt" or just the filename.
  function openCitedFile(label: string) {
    const name = label.replace(/^\s*file\s*\d+\s*:\s*/i, '').trim().toLowerCase();
    const hit = vault.find(v => v.filename.toLowerCase() === name)
      || vault.find(v => v.filename.toLowerCase().includes(name) || name.includes(v.filename.toLowerCase()));
    if (hit) setSelected(hit);
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

        {/* Search */}
        {sidebarOpen && vault.length > 0 && (
            <div style={{ padding: '12px 14px 10px' }}>
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
                tagFilter ? (
                  <div style={{ marginTop: '8px' }}>
                    <button onClick={() => setTagFilter(null)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px',
                      background: 'var(--purple)', color: 'var(--base)', border: 'none', cursor: 'pointer',
                    }}><X size={10} strokeWidth={2.5} /> {tagFilter}</button>
                  </div>
                ) : (
                  <div className="tag-strip" style={{ display: 'flex', gap: '5px', marginTop: '8px', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: '2px' }}>
                    {allTags.map(tag => (
                      <button key={tag} onClick={() => setTagFilter(tag)} style={{
                        flexShrink: 0, whiteSpace: 'nowrap',
                        fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px',
                        background: 'var(--off-white)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: 'pointer',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--purple)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                      >{tag}</button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* File list — only when expanded */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
            {sidebarOpen && filtered.length === 0 && search && (
              <p style={{ fontSize: '12px', color: 'var(--text-3)', padding: '12px 8px' }}>No matches.</p>
            )}
            {sidebarOpen && filtered.map(item => (
              <FileListItem
                key={item.id}
                item={item}
                active={selected?.id === item.id}
                onSelect={() => setSelected(item)}
              />
            ))}
          </div>

          {/* Restore vault from chain (read-only, by owner address) */}
          {sidebarOpen && (
            <div style={{ padding: '8px 10px 0', flexShrink: 0 }}>
              {!restoreOpen ? (
                <button
                  onClick={() => { setRestoreOpen(true); setRestoreAddr(account?.address || ''); setRestoreMsg(''); }}
                  title="Rebuild your vault from Sui + Walrus using an owner address"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
                >
                  <Database size={14} strokeWidth={2} /> Restore vault from chain
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    value={restoreAddr}
                    onChange={e => setRestoreAddr(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doRestore(); }}
                    placeholder="Owner address 0x…"
                    autoFocus
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', outline: 'none', fontFamily: 'ui-monospace, monospace' }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={doRestore} disabled={restoring || !restoreAddr.trim()}
                      style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', background: 'var(--purple)', color: 'var(--base)', cursor: restoring ? 'default' : 'pointer', fontSize: '12px', fontWeight: 700, opacity: restoring || !restoreAddr.trim() ? 0.5 : 1 }}>
                      {restoring ? 'Restoring…' : 'Restore'}
                    </button>
                    <button onClick={() => { setRestoreOpen(false); setRestoreMsg(''); }}
                      style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px' }}>
                      Cancel
                    </button>
                  </div>
                  {restoreMsg && <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '2px 2px 0' }}>{restoreMsg}</p>}
                </div>
              )}
            </div>
          )}

          {/* Profile (wallet) */}
          <div style={{ padding: sidebarOpen ? '8px 10px 10px' : '8px 8px 10px', borderTop: '1px solid var(--border)', flexShrink: 0, marginTop: '8px' }}>
            <WalletProfile collapsed={!sidebarOpen} />
          </div>
        </aside>

        {/* ── Main Panel — looping scene behind every state ── */}
        <main style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--base)' }}>
          <HomeBackground mode={!selected && homeEmpty ? 'hero' : 'chat'} />

          <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {!loaded ? (
            /* Avoid flashing the upload home before localStorage loads */
            <div style={{ flex: 1 }} />
          ) : !selected ? (
            /* Home: centered chat over the scene */
            <div style={{ flex: 1, minHeight: 0 }}>
                <ChatPanel
                  resetKey="vault"
                  centered
                  onEmptyChange={setHomeEmpty}
                  onCitation={openCitedFile}
                  greeting={vault.length === 0 ? 'Upload a file to begin' : 'What do you want to know?'}
                  greetingIcon="/logo.png"
                  endpoint="/api/ask-vault"
                  buildBody={(question, history) => ({ docs: selectVaultDocs(vault, question), question, history })}
                  suggestions={vault.length === 0 ? [] : ['What are the common themes across my files?', 'Find anything about deadlines or dates', 'Give me a 3-point summary of everything']}
                  placeholder={vault.length === 0 ? 'Click + to upload your first file…' : 'Ask across your whole vault…'}
                  aiLabel="ChainMind"
                  disabled={vault.length === 0}
                  uploadRunner={runUpload}
                  onUploaded={addToVault}
                />
            </div>
          ) : (
            /* File detail + Q&A */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

              {/* File header */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, background: 'rgba(26,25,23,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <span style={{ display: 'flex', flexShrink: 0 }}><FileIcon type={selected.fileType} name={selected.filename} size={22} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected.filename}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--text-3)' }}>
                    <span><span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{formatBytes(selected.sizeBytes)}</span></span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>Uploaded {formatDate(selected.uploadedAt)}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--mint-dark)', fontWeight: 600 }}>
                      <Check size={12} strokeWidth={2.5} /> Stored on Walrus
                    </span>
                    {selected.owner ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--mint-dark)', fontWeight: 600 }}>
                        <Check size={12} strokeWidth={2.5} /> Owned by you on Sui
                      </span>
                    ) : selected.txDigest ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--mint-dark)', fontWeight: 600 }}>
                        <Check size={12} strokeWidth={2.5} /> Recorded on Sui
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-3)' }}>Recording on Sui…</span>
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
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'rgba(26,25,23,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
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
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'rgba(26,25,23,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
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
                    <WalrusProof key={selected.id} blobId={selected.blobId} fileType={selected.fileType} filename={selected.filename} txDigest={selected.txDigest} />
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
                    : ['Summarize this in 3 bullet points', 'What are the key takeaways?', 'Any action items, dates, or deadlines?']}
                  placeholder="Ask anything about this document…"
                  aiLabel="ChainMind AI"
                  uploadRunner={runUpload}
                  onUploaded={addToVault}
                />
              </div>
            </div>
          )}
          </div>
        </main>

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} } @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}
