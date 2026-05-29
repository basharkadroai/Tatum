'use client';
import { useState, useEffect } from 'react';
import { VaultItem } from '@/types/vault';
import { FileUpload } from '@/components/FileUpload';
import { VaultCard } from '@/components/VaultCard';
import { QAModal } from '@/components/QAModal';
import { WalletButton } from '@/components/WalletButton';

const STORAGE_KEY = 'chainmind_vault';
function loadVault(): VaultItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveVault(items: VaultItem[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

export default function Home() {
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [activeItem, setActiveItem] = useState<VaultItem | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => { setVault(loadVault()); }, []);

  function handleUploaded(item: VaultItem) {
    setVault(prev => { const next = [item, ...prev]; saveVault(next); return next; });
  }
  function handleDelete(id: string) {
    setVault(prev => { const next = prev.filter(i => i.id !== id); saveVault(next); return next; });
  }

  const filtered = vault.filter(item =>
    !search ||
    item.filename.toLowerCase().includes(search.toLowerCase()) ||
    item.summary.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--white)' }}>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 px-8 py-4 flex items-center justify-between"
        style={{ background: 'rgba(255,255,255,0.95)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--purple)' }} />
            <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--mint)' }} />
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ color: 'var(--text-1)' }}>
            ChainMind
          </span>
        </div>
        <WalletButton />
      </header>

      {/* ── Hero + Upload (all above the fold) ── */}
      <section className="px-8 pt-14 pb-12 max-w-3xl mx-auto w-full text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6"
          style={{ background: '#eef2ff', color: 'var(--purple)', border: '1px solid #c7d2fe' }}>
          Built on Sui · Powered by Walrus + Tatum
        </div>

        <h1 className="text-5xl font-black leading-tight tracking-tight mb-4">
          <span className="grad-text">Decentralized</span>
          <br />
          <span style={{ color: 'var(--text-1)' }}>AI Knowledge Vault</span>
        </h1>

        <p className="text-lg max-w-xl mx-auto leading-relaxed mb-8" style={{ color: 'var(--text-2)' }}>
          Upload any document. Store it forever on{' '}
          <strong style={{ color: 'var(--purple)' }}>Walrus</strong>.
          Your local AI summarizes it and answers your questions.
        </p>

        {/* Upload zone — right here, no scrolling needed */}
        <FileUpload onUploaded={handleUploaded} />
      </section>

      {/* ── Feature cards ── */}
      <section className="px-8 pb-14 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="dot-bg rounded-2xl p-8 relative overflow-hidden"
            style={{ border: '1px solid var(--border)', background: 'var(--white)' }}>
            <h3 className="text-2xl font-black mb-4" style={{ color: 'var(--text-1)' }}>Store<br />Forever</h3>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-2)' }}>
              <li>· Permanent Walrus storage</li>
              <li>· Decentralized blob IDs</li>
              <li>· Erasure-coded resilience</li>
              <li>· Verifiable on-chain</li>
            </ul>
            <div className="absolute bottom-4 right-4 opacity-10 text-7xl">🗄</div>
          </div>

          <div className="card-purple rounded-2xl p-8 relative overflow-hidden">
            <h3 className="text-2xl font-black mb-4 text-white">AI<br />Summaries</h3>
            <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
              <li>· 100% local — no API cost</li>
              <li>· Runs on Ollama</li>
              <li>· PDF, TXT, MD, CSV, JSON</li>
              <li>· Instant on upload</li>
            </ul>
            <div className="absolute bottom-4 right-4 opacity-20 text-7xl">🧠</div>
          </div>

          <div className="card-teal rounded-2xl p-8 relative overflow-hidden">
            <h3 className="text-2xl font-black mb-4 text-white">Ask<br />Anything</h3>
            <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <li>· Chat with your documents</li>
              <li>· RAG-style Q&amp;A</li>
              <li>· Context-aware answers</li>
              <li>· Works fully offline</li>
            </ul>
            <div className="absolute bottom-4 right-4 opacity-20 text-7xl">💬</div>
          </div>
        </div>
      </section>

      {/* ── Vault ── */}
      {vault.length > 0 && (
        <section className="px-8 pb-20 max-w-6xl mx-auto w-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-black" style={{ color: 'var(--text-1)' }}>Your Vault</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
                {vault.length} file{vault.length !== 1 ? 's' : ''} stored on Walrus
              </p>
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-3)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search vault..."
                className="pl-9 pr-4 py-2 rounded-xl text-sm outline-none w-52 transition-all"
                style={{ background: 'var(--off-white)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--purple)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
          </div>

          {filtered.length === 0
            ? <p className="text-sm" style={{ color: 'var(--text-3)' }}>No files match your search.</p>
            : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(item => (
                  <VaultCard key={item.id} item={item} onAsk={setActiveItem} onDelete={handleDelete} />
                ))}
              </div>
            )}
        </section>
      )}

      {activeItem && <QAModal item={activeItem} onClose={() => setActiveItem(null)} />}
    </div>
  );
}
