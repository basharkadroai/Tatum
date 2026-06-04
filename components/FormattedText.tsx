'use client';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// A code/file window: sidebar-colored (not navy), language label + copy button.
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div style={{ position: 'relative', margin: '8px 0', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--sidebar-bg)', overflow: 'hidden' }}>
      {lang && <span style={{ position: 'absolute', top: '9px', left: '13px', fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', fontFamily: MONO }}>{lang.toLowerCase()}</span>}
      <button
        onClick={copy} title="Copy"
        style={{ position: 'absolute', top: '6px', right: '6px', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: copied ? '#65ca9d' : 'var(--text-2)', background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '7px', padding: '4px 8px', cursor: 'pointer' }}
      >
        {copied ? <><Check size={12} strokeWidth={2.5} /> Copied</> : <><Copy size={12} strokeWidth={2} /> Copy</>}
      </button>
      <pre style={{ margin: 0, padding: '34px 14px 14px', background: 'transparent', color: 'var(--text-1)', overflow: 'auto', fontSize: '12.5px', lineHeight: 1.5, fontFamily: MONO }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const citePill: React.CSSProperties = {
  fontSize: '0.86em', fontWeight: 600, color: '#65ca9d',
  background: 'rgba(101,202,157,0.12)', borderRadius: '5px', padding: '1px 6px', margin: '0 1px',
};

// Render an LLM markdown message: GitHub-flavored markdown (headings, bold,
// italic, lists, tables, code) via react-markdown, plus [filename] citations
// turned into clickable pills.
export function FormattedText({ text, onCitation }: { text: string; onCitation?: (label: string) => void }) {
  // Turn bare [filename] references (not real [text](url) links) into clickable
  // citation links the renderer can intercept.
  const withCites = text.replace(/\[([^\]\n]+)\](?!\()/g, (m, label: string) => {
    const t = label.trim();
    if (!t || t === 'x' || t === 'X' || t === ' ') return m; // skip task-list checkboxes
    return `[${label}](#cite:${encodeURIComponent(t)})`;
  });

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Block code → our window; inline code → a chip.
        pre({ children }) {
          const el = (Array.isArray(children) ? children[0] : children) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;
          const className = el?.props?.className || '';
          const match = /language-(\w+)/.exec(className);
          const codeText = String(el?.props?.children ?? '').replace(/\n$/, '');
          return <CodeBlock code={codeText} lang={match?.[1]} />;
        },
        code({ children }) {
          return <code style={{ fontFamily: MONO, fontSize: '0.88em', background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 5px' }}>{children}</code>;
        },
        a({ href, children }) {
          if (href && href.startsWith('#cite:')) {
            const label = decodeURIComponent(href.slice('#cite:'.length));
            if (onCitation) {
              return <button onClick={() => onCitation(label)} title="Open this file" style={{ ...citePill, border: 'none', cursor: 'pointer', font: 'inherit' }}>{children}</button>;
            }
            return <span style={citePill}>{children}</span>;
          }
          return <a href={href} target="_blank" rel="noreferrer" style={{ color: '#65ca9d', textDecoration: 'underline' }}>{children}</a>;
        },
        h1: ({ children }) => <p style={{ margin: '10px 0 4px', fontWeight: 800, fontSize: '16px', color: 'var(--text-1)' }}>{children}</p>,
        h2: ({ children }) => <p style={{ margin: '10px 0 4px', fontWeight: 800, fontSize: '14.5px', color: 'var(--text-1)' }}>{children}</p>,
        h3: ({ children }) => <p style={{ margin: '8px 0 4px', fontWeight: 800, fontSize: '13px', color: 'var(--text-1)' }}>{children}</p>,
        p: ({ children }) => <p style={{ margin: '6px 0' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '3px' }}>{children}</ol>,
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
        blockquote: ({ children }) => <blockquote style={{ margin: '8px 0', paddingLeft: '12px', borderLeft: '3px solid var(--border-2)', color: 'var(--text-2)' }}>{children}</blockquote>,
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>{children}</table>
          </div>
        ),
        th: ({ children }) => <th style={{ textAlign: 'left', padding: '6px 11px', borderBottom: '1px solid var(--border-2)', fontWeight: 700, color: 'var(--text-1)' }}>{children}</th>,
        td: ({ children }) => <td style={{ padding: '6px 11px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', color: 'var(--text-2)' }}>{children}</td>,
      }}
    >
      {withCites}
    </ReactMarkdown>
  );
}
