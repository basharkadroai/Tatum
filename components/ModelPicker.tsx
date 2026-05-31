'use client';
import { useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import { AI_PROVIDERS, providerLabel, type AiConfig } from '@/lib/aiConfig';

// Sidebar control to pick the AI model. Default = ChainMind's Groq (no key).
// Choosing OpenAI / Anthropic / Gemini lets the user bring their own key (BYOK).
export function ModelPicker({ config, onChange }: { config: AiConfig | null; onChange: (c: AiConfig | null) => void }) {
  const [open, setOpen] = useState(false);
  const activeProvider = config?.provider ?? 'groq';
  const [provider, setProvider] = useState(activeProvider);
  const [model, setModel] = useState(config?.model ?? '');
  const [apiKey, setApiKey] = useState(config?.apiKey ?? '');

  const meta = AI_PROVIDERS.find(p => p.id === provider) ?? AI_PROVIDERS[0];
  const activeLabel = providerLabel(activeProvider);
  const activeModel = config?.model || AI_PROVIDERS.find(p => p.id === activeProvider)?.model || '';

  function pickProvider(id: string) {
    setProvider(id);
    setModel(AI_PROVIDERS.find(p => p.id === id)?.model ?? '');
    if (id === 'groq') setApiKey('');
  }
  function save() {
    if (provider === 'groq') { onChange(null); setOpen(false); return; }
    if (!apiKey.trim()) return; // key required for BYOK providers
    onChange({ provider, model: model.trim() || meta.model, apiKey: apiKey.trim() });
    setOpen(false);
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', outline: 'none',
  };

  return (
    <div style={{ padding: '8px 10px 0', flexShrink: 0 }}>
      {!open ? (
        <button
          onClick={() => { setProvider(activeProvider); setModel(config?.model ?? ''); setApiKey(config?.apiKey ?? ''); setOpen(true); }}
          title="Choose the AI model (use your own key)"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
        >
          <Sparkles size={14} strokeWidth={2} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{activeLabel}</span>
          <ChevronDown size={13} strokeWidth={2} style={{ opacity: 0.6, flexShrink: 0 }} />
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <select value={provider} onChange={e => pickProvider(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            {AI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {meta.needsKey && (
            <>
              <input value={model} onChange={e => setModel(e.target.value)} placeholder={`Model (e.g. ${meta.model})`} style={input} />
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder={`${meta.label} API key`} autoComplete="off" style={{ ...input, fontFamily: 'ui-monospace, monospace' }} />
              <p style={{ fontSize: '10.5px', color: 'var(--text-3)', margin: '0 2px' }}>Your key is stored only in this browser and sent per-request — never saved on our servers.</p>
            </>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={save} disabled={meta.needsKey && !apiKey.trim()}
              style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', background: 'var(--purple)', color: 'var(--base)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, opacity: meta.needsKey && !apiKey.trim() ? 0.5 : 1 }}>
              Use this
            </button>
            <button onClick={() => setOpen(false)}
              style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {!open && config && (
        <p style={{ fontSize: '10.5px', color: 'var(--text-3)', margin: '4px 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeModel} · your key</p>
      )}
    </div>
  );
}
