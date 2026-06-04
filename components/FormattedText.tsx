'use client';
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// A code/file window: sidebar-colored (not navy), with a language label and a
// copy button in the top-right. Works for any file type (html, md, py, …).
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
      {lang && (
        <span style={{ position: 'absolute', top: '9px', left: '13px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.02em', color: 'var(--text-3)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{lang.toLowerCase()}</span>
      )}
      <button
        onClick={copy} title="Copy"
        style={{ position: 'absolute', top: '6px', right: '6px', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: copied ? '#65ca9d' : 'var(--text-2)', background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '7px', padding: '4px 8px', cursor: 'pointer', transition: 'color 0.15s' }}
        onMouseEnter={e => { if (!copied) e.currentTarget.style.color = 'var(--text-1)'; }}
        onMouseLeave={e => { if (!copied) e.currentTarget.style.color = 'var(--text-2)'; }}
      >
        {copied ? <><Check size={12} strokeWidth={2.5} /> Copied</> : <><Copy size={12} strokeWidth={2} /> Copy</>}
      </button>
      <pre style={{ margin: 0, padding: '34px 14px 14px', background: 'transparent', color: 'var(--text-1)', overflow: 'auto', fontSize: '12.5px', lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Inline: **bold**, `code`, [citation] pills
function renderInline(text: string, keyBase: string, onCitation?: (label: string) => void): React.ReactNode[] {
  // Split on bold and inline-code, keeping delimiters
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.flatMap((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**')) {
      return [<strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>];
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 1) {
      return [
        <code key={`${keyBase}-c${i}`} style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.88em',
          background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 5px',
        }}>{tok.slice(1, -1)}</code>,
      ];
    }
    // citation pills [filename]
    return tok.split(/(\[[^\]]+\])/g).map((seg, j) => {
      if (seg.startsWith('[') && seg.endsWith(']')) {
        const label = seg.slice(1, -1);
        const pillStyle: React.CSSProperties = {
          fontSize: '0.82em', fontWeight: 600, color: '#65ca9d',
          background: 'rgba(101,202,157,0.12)', borderRadius: '5px', padding: '1px 6px', margin: '0 1px',
        };
        if (onCitation) {
          return (
            <button key={`${keyBase}-cite${i}-${j}`} onClick={() => onCitation(label)} title="Open this file"
              style={{ ...pillStyle, border: 'none', cursor: 'pointer', font: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(101,202,157,0.22)'; e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(101,202,157,0.12)'; e.currentTarget.style.textDecoration = 'none'; }}
            >{label}</button>
          );
        }
        return <span key={`${keyBase}-cite${i}-${j}`} style={pillStyle}>{label}</span>;
      }
      return <React.Fragment key={`${keyBase}-t${i}-${j}`}>{seg}</React.Fragment>;
    });
  });
}

export function FormattedText({ text, onCitation }: { text: string; onCitation?: (label: string) => void }) {
  // Split into code-fence segments: even = prose, odd = code block
  const segments = text.split(/```/g);
  const out: React.ReactNode[] = [];

  segments.forEach((segment, segIdx) => {
    const isCode = segIdx % 2 === 1;
    if (isCode) {
      // Capture + strip an optional leading language/file-type identifier line.
      const langMatch = segment.match(/^([a-zA-Z0-9_+#-]+)\n/);
      const lang = langMatch ? langMatch[1] : undefined;
      const body = segment.replace(/^[a-zA-Z0-9_+#-]*\n/, '');
      out.push(<CodeBlock key={`code-${segIdx}`} code={body} lang={lang} />);
      return;
    }

    // Prose: line-by-line
    const lines = segment.split('\n');
    let bullets: { ordered: boolean; items: string[] } | null = null;
    const flush = (key: string) => {
      if (!bullets) return;
      const items = bullets.items;
      out.push(
        bullets.ordered ? (
          <ol key={key} style={{ margin: '4px 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {items.map((b, i) => <li key={i}>{renderInline(b, `${key}-${i}`, onCitation)}</li>)}
          </ol>
        ) : (
          <ul key={key} style={{ margin: '4px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {items.map((b, i) => <li key={i}>{renderInline(b, `${key}-${i}`, onCitation)}</li>)}
          </ul>
        )
      );
      bullets = null;
    };

    lines.forEach((line, idx) => {
      const t = line.trim();
      const key = `s${segIdx}-l${idx}`;
      const heading = t.match(/^(#{1,3})\s+(.*)$/);
      const numbered = t.match(/^\d+\.\s+(.*)$/);

      if (t.startsWith('- ') || t.startsWith('* ')) {
        if (!bullets || bullets.ordered) { flush(`${key}-pre`); bullets = { ordered: false, items: [] }; }
        bullets.items.push(t.slice(2));
      } else if (numbered) {
        if (!bullets || !bullets.ordered) { flush(`${key}-pre`); bullets = { ordered: true, items: [] }; }
        bullets.items.push(numbered[1]);
      } else {
        flush(`${key}-pre`);
        if (heading) {
          const level = heading[1].length;
          const size = level === 1 ? '16px' : level === 2 ? '14.5px' : '13px';
          out.push(<p key={key} style={{ margin: '8px 0 4px', fontWeight: 800, fontSize: size, color: 'var(--text-1)' }}>{renderInline(heading[2], key, onCitation)}</p>);
        } else if (t) {
          out.push(<p key={key} style={{ margin: '4px 0' }}>{renderInline(line, key, onCitation)}</p>);
        }
      }
    });
    flush(`s${segIdx}-final`);
  });

  return <>{out}</>;
}
