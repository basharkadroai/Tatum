import React from 'react';

// Inline: **bold**, `code`, [citation] pills
function renderInline(text: string, keyBase: string): React.ReactNode[] {
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
        return (
          <span key={`${keyBase}-cite${i}-${j}`} style={{
            fontSize: '0.82em', fontWeight: 600, color: 'var(--mint-dark)',
            background: '#ecfdf5', borderRadius: '5px', padding: '0 5px', margin: '0 1px',
          }}>{seg.slice(1, -1)}</span>
        );
      }
      return <React.Fragment key={`${keyBase}-t${i}-${j}`}>{seg}</React.Fragment>;
    });
  });
}

export function FormattedText({ text }: { text: string }) {
  // Split into code-fence segments: even = prose, odd = code block
  const segments = text.split(/```/g);
  const out: React.ReactNode[] = [];

  segments.forEach((segment, segIdx) => {
    const isCode = segIdx % 2 === 1;
    if (isCode) {
      // Strip optional leading language identifier line
      const body = segment.replace(/^[a-zA-Z0-9_-]*\n/, '');
      out.push(
        <pre key={`code-${segIdx}`} style={{
          margin: '8px 0', padding: '12px 14px', borderRadius: '10px',
          background: '#0f172a', color: '#e2e8f0', overflow: 'auto',
          fontSize: '12.5px', lineHeight: 1.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>
          <code>{body}</code>
        </pre>
      );
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
            {items.map((b, i) => <li key={i}>{renderInline(b, `${key}-${i}`)}</li>)}
          </ol>
        ) : (
          <ul key={key} style={{ margin: '4px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {items.map((b, i) => <li key={i}>{renderInline(b, `${key}-${i}`)}</li>)}
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
          out.push(<p key={key} style={{ margin: '8px 0 4px', fontWeight: 800, fontSize: size, color: 'var(--text-1)' }}>{renderInline(heading[2], key)}</p>);
        } else if (t) {
          out.push(<p key={key} style={{ margin: '4px 0' }}>{renderInline(line, key)}</p>);
        }
      }
    });
    flush(`s${segIdx}-final`);
  });

  return <>{out}</>;
}
