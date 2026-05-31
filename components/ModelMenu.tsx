'use client';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { ProviderLogo } from './BrandIcons';
import { AI_PROVIDERS, providerShort, type AiConfig } from '@/lib/aiConfig';

// In-prompt model switcher (Claude/ChatGPT style): a small chip showing the
// active model's logo + name; click opens a menu to switch provider and, for
// BYOK providers, paste an API key.
export function ModelMenu({ config, onChange, openUp = false }: { config: AiConfig | null; onChange: (c: AiConfig | null) => void; openUp?: boolean }) {
  const [open, setOpen] = useState(false);
  const [keyFor, setKeyFor] = useState<string | null>(null); // provider awaiting a key
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const activeId = config?.provider ?? 'groq';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setKeyFor(null); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function choose(id: string) {
    if (id === 'groq') { onChange(null); setOpen(false); setKeyFor(null); return; }
    const meta = AI_PROVIDERS.find(p => p.id === id)!;
    // If we already have a key for this provider, just switch to it.
    if (config?.provider === id && config.apiKey) { setOpen(false); return; }
    setKeyFor(id);
    setModel(meta.model);
    setApiKey(config?.provider === id ? config.apiKey : '');
  }
  function saveKey() {
    if (!keyFor || !apiKey.trim()) return;
    const meta = AI_PROVIDERS.find(p => p.id === keyFor)!;
    onChange({ provider: keyFor, model: model.trim() || meta.model, apiKey: apiKey.trim() });
    setOpen(false);
    setKeyFor(null);
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', outline: 'none',
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setKeyFor(null); }}
        title="Switch AI model"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 9px',
          borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-2)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
      >
        <ProviderLogo provider={activeId} size={15} />
        <span>{providerShort(activeId)}</span>
        <ChevronDown size={13} strokeWidth={2} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', [openUp ? 'bottom' : 'top']: 'calc(100% + 8px)', left: 0, zIndex: 60, width: '256px',
          background: 'var(--white)', border: '1px solid var(--border-2)', borderRadius: '14px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)', padding: '6px', animation: 'fadeUp 0.15s ease',
        }}>
          {!keyFor ? (
            AI_PROVIDERS.map(p => (
              <button key={p.id} type="button" onClick={() => choose(p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 10px', borderRadius: '9px', border: 'none', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <ProviderLogo provider={p.id} size={18} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>{p.label}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)' }}>{p.id === activeId && config?.model ? config.model : p.model}</span>
                </span>
                {p.id === activeId && <Check size={14} strokeWidth={2.5} style={{ color: '#65ca9d', flexShrink: 0 }} />}
              </button>
            ))
          ) : (
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'var(--text-1)' }}>
                <ProviderLogo provider={keyFor} size={16} /> {AI_PROVIDERS.find(p => p.id === keyFor)?.label}
              </div>
              <input value={model} onChange={e => setModel(e.target.value)} placeholder="Model" style={input} />
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="API key" autoComplete="off" style={{ ...input, fontFamily: 'ui-monospace, monospace' }} />
              <p style={{ fontSize: '10.5px', color: 'var(--text-3)', margin: 0 }}>Stored only in your browser · sent per-request · never saved on our servers.</p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={saveKey} disabled={!apiKey.trim()}
                  style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', background: 'var(--purple)', color: 'var(--base)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, opacity: apiKey.trim() ? 1 : 0.5 }}>
                  Use
                </button>
                <button type="button" onClick={() => setKeyFor(null)}
                  style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px' }}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
