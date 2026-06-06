'use client';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Copy, Check, Info } from 'lucide-react';

const preStyle: CSSProperties = {
  margin: 0, padding: '16px 44px 16px 18px', borderRadius: '12px',
  border: '1px solid var(--border)', background: 'var(--sidebar-bg)', color: 'var(--text-1)',
  overflowX: 'auto', fontSize: '12.5px', lineHeight: 1.65,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

// Code block with a copy button (top-right), like Claude/Mintlify docs.
export function CopyBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div style={{ position: 'relative', margin: '16px 0' }}>
      <button onClick={copy} aria-label="Copy" title="Copy"
        style={{
          position: 'absolute', top: '8px', right: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '5px 8px', borderRadius: '7px', border: '1px solid var(--border)',
          background: 'var(--off-white)', color: copied ? '#65ca9d' : 'var(--text-3)',
          cursor: 'pointer', fontSize: '11px', fontWeight: 600,
        }}
        onMouseEnter={e => { if (!copied) e.currentTarget.style.color = 'var(--text-1)'; }}
        onMouseLeave={e => { if (!copied) e.currentTarget.style.color = 'var(--text-3)'; }}
      >
        {copied ? <><Check size={12} strokeWidth={2.5} /> Copied</> : <><Copy size={12} strokeWidth={2} /> Copy</>}
      </button>
      <pre style={preStyle}>{children}</pre>
    </div>
  );
}

// Highlighted note/callout box for the important bits.
export function Callout({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div style={{
      display: 'flex', gap: '11px', margin: '18px 0', padding: '13px 16px',
      borderRadius: '12px', border: '1px solid var(--purple-border, var(--border))',
      background: 'var(--purple-bg, var(--off-white))',
    }}>
      <Info size={16} strokeWidth={2} color="#65ca9d" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--text-2)' }}>
        {title && <strong style={{ color: 'var(--text-1)', display: 'block', marginBottom: '2px' }}>{title}</strong>}
        {children}
      </div>
    </div>
  );
}
