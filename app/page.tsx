'use client';
import { useState, useEffect, useRef } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { VaultItem } from '@/types/vault';
import { FileUpload } from '@/components/FileUpload';
import { WalletButton } from '@/components/WalletButton';
import { LogoMark } from '@/components/Logo';
import { WalrusProof } from '@/components/WalrusProof';
import { FormattedText } from '@/components/FormattedText';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';
const SUI_NETWORK_NAME = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as 'mainnet' | 'testnet';
const SUI_CHAIN_ID = `sui:${SUI_NETWORK_NAME}` as `sui:testnet` | `sui:mainnet`;

const STORAGE_KEY = 'chainmind_vault';
function loadVault(): VaultItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveVault(items: VaultItem[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

function fileIcon(type: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'md' || ext === 'mdx') return '📝';
  if (ext === 'json') return '🗂';
  if (ext === 'csv') return '📊';
  if (ext === 'docx' || ext === 'doc') return '📘';
  if (ext === 'xlsx' || ext === 'xls') return '📗';
  if (type.startsWith('image/')) return '🖼';
  if (type.startsWith('text/')) return '📄';
  return '📦';
}
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type Message = { role: 'user' | 'ai'; text: string };

export default function Home() {
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [selected, setSelected] = useState<VaultItem | null>(null);
  const [vaultMode, setVaultMode] = useState(false); // "ask across whole vault" mode
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  useEffect(() => { setVault(loadVault()); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { setMessages([]); setQaInput(''); setSummaryExpanded(true); setClaimMsg(''); }, [selected?.id]);
  useEffect(() => { setMessages([]); setQaInput(''); }, [vaultMode]);

  function openVaultMode() { setSelected(null); setVaultMode(true); }
  function handleUploaded(item: VaultItem) {
    setVault(prev => { const next = [item, ...prev]; saveVault(next); return next; });
    setVaultMode(false);
    setSelected(item);
  }
  function handleDelete(id: string) {
    setVault(prev => { const next = prev.filter(i => i.id !== id); saveVault(next); return next; });
    if (selected?.id === id) setSelected(null);
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
      const res = await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      updateItem(item.id, { txDigest: res.digest, owner: account.address });
      setClaimMsg('✓ Claimed — you now own this on-chain');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setClaimMsg(`Could not claim: ${msg.slice(0, 80)}`);
    } finally {
      setClaiming(false);
    }
  }

  async function sendMessage(text?: string) {
    const q = (text ?? qaInput).trim();
    if (!q || qaLoading || (!selected && !vaultMode)) return;
    setQaInput('');
    setMessages(m => [...m, { role: 'user', text: q }]);
    setQaLoading(true);
    try {
      const endpoint = vaultMode ? '/api/ask-vault' : '/api/ask';
      const body = vaultMode
        ? { docs: vault.map(v => ({ filename: v.filename, content: v.content })), question: q }
        : { content: selected!.content, question: q };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        setMessages(m => [...m, { role: 'ai', text: 'Failed to reach AI.' }]);
        return;
      }

      // Stream tokens into a growing AI message
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let started = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (!started) {
          started = true;
          setQaLoading(false);
          setMessages(m => [...m, { role: 'ai', text: acc }]);
        } else {
          setMessages(m => {
            const copy = [...m];
            copy[copy.length - 1] = { role: 'ai', text: acc };
            return copy;
          });
        }
      }
      if (!started) setMessages(m => [...m, { role: 'ai', text: 'No answer.' }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Failed to reach AI.' }]);
    } finally {
      setQaLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const filtered = vault.filter(item =>
    !search ||
    item.filename.toLowerCase().includes(search.toLowerCase()) ||
    item.summary.toLowerCase().includes(search.toLowerCase())
  );

  const network = process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet';
  const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
  const suiExplorer = network === 'mainnet' ? 'https://suivision.xyz' : 'https://testnet.suivision.xyz';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--white)' }}>

      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: '56px', flexShrink: 0,
        borderBottom: '1px solid var(--border)', background: 'var(--white)',
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LogoMark size={30} />
          <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.03em', color: 'var(--text-1)' }}>Chain</span>
          <span style={{ fontWeight: 400, fontSize: '16px', letterSpacing: '-0.02em', color: 'var(--text-2)', marginLeft: '1px' }}>Mind</span>
          <span style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
            background: 'var(--purple-bg)', color: 'var(--purple)', border: '1px solid #c7d2fe',
          }}>
            Sui {network}
          </span>
        </div>
        <WalletButton />
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)', background: 'var(--sidebar-bg)',
          overflow: 'hidden',
        }}>
          {/* Upload button */}
          <div style={{ padding: '14px 14px 10px' }}>
            <FileUpload onUploaded={handleUploaded} compact />
          </div>

          {/* Ask whole vault */}
          {vault.length > 0 && (
            <div style={{ padding: '0 14px 10px' }}>
              <button
                onClick={openVaultMode}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '9px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: vaultMode ? 'var(--purple-bg)' : 'white',
                  color: vaultMode ? 'var(--purple)' : 'var(--text-1)',
                  border: `1px solid ${vaultMode ? '#c7d2fe' : 'var(--border)'}`,
                }}
                onMouseEnter={e => { if (!vaultMode) e.currentTarget.style.borderColor = 'var(--purple)'; }}
                onMouseLeave={e => { if (!vaultMode) e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <span style={{ fontSize: '14px' }}>✦</span>
                Ask your whole vault
              </button>
            </div>
          )}

          {/* Search */}
          {vault.length > 0 && (
            <div style={{ padding: '0 14px 10px' }}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                  width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                </svg>
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

          {/* File list label */}
          {vault.length > 0 && (
            <div style={{ padding: '4px 16px 6px', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Vault · {vault.length} file{vault.length !== 1 ? 's' : ''}
            </div>
          )}

          {/* File list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
            {filtered.length === 0 && search && (
              <p style={{ fontSize: '12px', color: 'var(--text-3)', padding: '12px 8px' }}>No matches.</p>
            )}
            {filtered.map(item => (
              <div
                key={item.id}
                onClick={() => { setVaultMode(false); setSelected(item); }}
                className={`file-item${selected?.id === item.id ? ' active' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 10px', borderRadius: '9px', cursor: 'pointer',
                  borderLeft: selected?.id === item.id ? '3px solid var(--purple)' : '3px solid transparent',
                  animation: 'fadeUp 0.2s ease',
                }}
              >
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{fileIcon(item.fileType, item.filename)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{
                    fontSize: '12px', fontWeight: 600, color: 'var(--text-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{item.filename}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>
                    {formatBytes(item.sizeBytes)} · {formatDate(item.uploadedAt)}
                  </p>
                </div>
                {item.txDigest && (
                  <div title="Recorded on Sui" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--purple)', flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-3)' }}>
            Powered by Walrus · Tatum · Groq
          </div>
        </aside>

        {/* ── Main Panel ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--white)' }}>

          {vaultMode ? (
            /* Ask-across-vault chat */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>✦</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-1)' }}>Ask your whole vault</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '1px' }}>
                    AI searches across all {vault.length} file{vault.length !== 1 ? 's' : ''} and cites its sources
                  </p>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {messages.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 500 }}>Ask anything across your entire knowledge vault</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {['What are the common themes?', 'Which file mentions deadlines?', 'Summarize everything in 3 points.'].map(q => (
                        <button key={q} onClick={() => sendMessage(q)} style={{
                          fontSize: '12px', padding: '6px 12px', borderRadius: '20px',
                          background: 'var(--off-white)', border: '1px solid var(--border)',
                          color: 'var(--text-2)', cursor: 'pointer', transition: 'border-color 0.15s',
                        }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--purple)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                        >{q}</button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeUp 0.2s ease' }}>
                    {m.role === 'ai' && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--mint-dark)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vault AI</span>}
                    <div style={{
                      maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      fontSize: '13px', lineHeight: '1.6',
                      background: m.role === 'user' ? 'var(--purple)' : 'var(--off-white)',
                      color: m.role === 'user' ? 'white' : 'var(--text-1)',
                      border: m.role === 'ai' ? '1px solid var(--border)' : 'none',
                    }}>{m.role === 'ai' ? <FormattedText text={m.text} /> : m.text}</div>
                  </div>
                ))}
                {qaLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--mint-dark)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vault AI</span>
                    <div style={{ padding: '12px 16px', borderRadius: '14px 14px 14px 4px', background: 'var(--off-white)', border: '1px solid var(--border)', display: 'flex', gap: '5px' }}>
                      {[0, 150, 300].map(d => (<div key={d} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--purple)', animation: `bounce 1s ease ${d}ms infinite` }} />))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', flexShrink: 0, background: 'var(--white)' }}>
                <input
                  ref={inputRef}
                  value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Ask across all your files..."
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', fontSize: '13px', border: '1px solid var(--border)', outline: 'none', color: 'var(--text-1)', background: 'var(--off-white)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--purple)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
                <button onClick={() => sendMessage()} disabled={qaLoading || !qaInput.trim()} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, background: 'var(--purple)', color: 'white', border: 'none', cursor: 'pointer', opacity: qaLoading || !qaInput.trim() ? 0.4 : 1, flexShrink: 0 }}>Ask</button>
              </div>
            </div>
          ) : !selected ? (
            /* Empty state */
            vault.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '32px' }}>
                <div style={{ textAlign: 'center', maxWidth: '480px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🧠</div>
                  <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em', marginBottom: '10px', lineHeight: 1.2 }}>
                    Your <span className="grad-text">AI Knowledge Vault</span>
                  </h1>
                  <p style={{ fontSize: '15px', color: 'var(--text-2)', lineHeight: 1.6 }}>
                    Upload any document — stored forever on <strong style={{ color: 'var(--purple)' }}>Walrus</strong>, summarized by AI, and verifiable on <strong style={{ color: 'var(--mint-dark)' }}>Sui</strong>.
                  </p>
                </div>
                <div style={{ width: '100%', maxWidth: '480px' }}>
                  <FileUpload onUploaded={handleUploaded} />
                </div>
                <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: 'var(--text-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['PDF, DOCX, XLSX, TXT, MD, JSON, CSV', 'Permanent Walrus storage', 'On-chain ownership via Sui'].map(t => (
                    <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: 'var(--mint)' }}>✓</span> {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '32px' }}>👈</div>
                <p style={{ fontSize: '15px', color: 'var(--text-2)', fontWeight: 500 }}>Select a file to view it</p>
                <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Or upload a new one using the sidebar</p>
              </div>
            )
          ) : (
            /* File detail + Q&A */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

              {/* File header */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, background: 'var(--white)' }}>
                <span style={{ fontSize: '24px' }}>{fileIcon(selected.fileType, selected.filename)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected.filename}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{formatBytes(selected.sizeBytes)} · {formatDate(selected.uploadedAt)}</span>
                    <a href={`${aggregator}/v1/blobs/${selected.blobId}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--mint-dark)', textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                      🗄 {selected.blobId.slice(0, 16)}…
                    </a>
                    {selected.txDigest && (
                      <a href={`${suiExplorer}/txblock/${selected.txDigest}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--purple)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                        ⛓ {selected.txDigest.slice(0, 16)}…
                      </a>
                    )}
                    {selected.owner && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mint-dark)' }}>
                        ✓ Owned by you
                      </span>
                    )}
                  </div>
                  {claimMsg && (
                    <p style={{ fontSize: '11px', marginTop: '4px', color: claimMsg.startsWith('✓') ? 'var(--mint-dark)' : '#ef4444' }}>{claimMsg}</p>
                  )}
                </div>
                {/* Optional: claim under your own wallet */}
                {account && !selected.owner && (
                  <button
                    onClick={() => claimOnChain(selected)}
                    disabled={claiming}
                    title="Sign with your wallet to own this file on-chain"
                    style={{
                      padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      border: '1px solid #c7d2fe', background: 'var(--purple-bg)', color: 'var(--purple)',
                      cursor: claiming ? 'default' : 'pointer', flexShrink: 0, opacity: claiming ? 0.6 : 1,
                    }}
                  >
                    {claiming ? 'Claiming…' : '⛓ Claim on-chain'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(selected.id)}
                  title="Remove from vault"
                  style={{ padding: '6px', borderRadius: '7px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '14px', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}
                >✕</button>
              </div>

              {/* Summary (collapsible) */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--off-white)' }}>
                <button
                  onClick={() => setSummaryExpanded(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: summaryExpanded ? '10px' : 0 }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Summary</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)', transform: summaryExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                </button>
                {summaryExpanded && (
                  <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.65', animation: 'fadeUp 0.2s ease' }}>
                    {selected.summary}
                  </p>
                )}
              </div>

              {/* Walrus proof — retrieve the file back from decentralized storage */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--white)' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mint-dark)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                  Decentralized Storage Proof
                </p>
                <WalrusProof key={selected.id} blobId={selected.blobId} fileType={selected.fileType} filename={selected.filename} />
              </div>

              {/* Chat messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {messages.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 500 }}>Ask anything about this document</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {['What is this about?', 'What are the key points?', 'Summarize in one sentence.'].map(q => (
                        <button key={q} onClick={() => sendMessage(q)} style={{
                          fontSize: '12px', padding: '6px 12px', borderRadius: '20px',
                          background: 'var(--off-white)', border: '1px solid var(--border)',
                          color: 'var(--text-2)', cursor: 'pointer', transition: 'border-color 0.15s',
                        }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--purple)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                        >{q}</button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                    animation: 'fadeUp 0.2s ease',
                  }}>
                    {m.role === 'ai' && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--mint-dark)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI</span>
                    )}
                    <div style={{
                      maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      fontSize: '13px', lineHeight: '1.6',
                      background: m.role === 'user' ? 'var(--purple)' : 'var(--off-white)',
                      color: m.role === 'user' ? 'white' : 'var(--text-1)',
                      border: m.role === 'ai' ? '1px solid var(--border)' : 'none',
                    }}>
                      {m.role === 'ai' ? <FormattedText text={m.text} /> : m.text}
                    </div>
                  </div>
                ))}

                {qaLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--mint-dark)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI</span>
                    <div style={{ padding: '12px 16px', borderRadius: '14px 14px 14px 4px', background: 'var(--off-white)', border: '1px solid var(--border)', display: 'flex', gap: '5px' }}>
                      {[0, 150, 300].map(d => (
                        <div key={d} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--purple)', animation: `bounce 1s ease ${d}ms infinite` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', flexShrink: 0, background: 'var(--white)' }}>
                <input
                  ref={inputRef}
                  value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Ask anything about this document..."
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '10px', fontSize: '13px',
                    border: '1px solid var(--border)', outline: 'none', color: 'var(--text-1)',
                    background: 'var(--off-white)', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--purple)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={qaLoading || !qaInput.trim()}
                  style={{
                    padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: 'var(--purple)', color: 'white', border: 'none', cursor: 'pointer',
                    opacity: qaLoading || !qaInput.trim() ? 0.4 : 1, transition: 'opacity 0.15s',
                    flexShrink: 0,
                  }}
                >Ask</button>
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} } @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}
