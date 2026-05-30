import React from 'react';

// Minimal, safe markdown-ish renderer for AI answers:
// **bold**, "- "/"* " bullets, and line breaks. No HTML injection.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>;
    }
    // [filename] citations → subtle pill styling
    const withCites = p.split(/(\[[^\]]+\])/g).map((seg, j) => {
      if (seg.startsWith('[') && seg.endsWith(']')) {
        return (
          <span key={`${keyBase}-${i}-${j}`} style={{
            fontSize: '0.85em', fontWeight: 600, color: 'var(--mint-dark)',
            background: '#ecfdf5', borderRadius: '5px', padding: '0 5px', margin: '0 1px',
          }}>{seg.slice(1, -1)}</span>
        );
      }
      return <React.Fragment key={`${keyBase}-${i}-${j}`}>{seg}</React.Fragment>;
    });
    return <React.Fragment key={`${keyBase}-${i}`}>{withCites}</React.Fragment>;
  });
}

export function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key} style={{ margin: '4px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {bullets.map((b, i) => <li key={i}>{renderInline(b, `${key}-${i}`)}</li>)}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t.startsWith('- ') || t.startsWith('* ')) {
      bullets.push(t.slice(2));
    } else {
      flushBullets(`ul-${idx}`);
      if (t) blocks.push(<p key={`p-${idx}`} style={{ margin: '4px 0' }}>{renderInline(line, `p-${idx}`)}</p>);
    }
  });
  flushBullets('ul-final');

  return <>{blocks}</>;
}
