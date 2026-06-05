'use client';
import { useEffect, useRef, useState } from 'react';
import { PaperclipIcon, CodeXmlIcon } from '@animateicons/react/lucide';
import type { IconHandle } from '@animateicons/react';
import { MoreVertical, Trash2 } from 'lucide-react';
import type { VaultItem } from '@/types/vault';

const CODE_EXTS = ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'scss', 'sh', 'json', 'xml', 'yaml', 'yml', 'sql'];

// One vault row — icon + filename, plus a ⋮ menu on the right (Claude-style) with
// a Delete option. The animated icon plays when the WHOLE row is hovered.
export function FileListItem({ item, active, onSelect, onDelete }: { item: VaultItem; active: boolean; onSelect: () => void; onDelete?: () => void }) {
  const iconRef = useRef<IconHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ext = item.filename.split('.').pop()?.toLowerCase() ?? '';
  const Icon = CODE_EXTS.includes(ext) ? CodeXmlIcon : PaperclipIcon;

  // Close the menu on any click outside the row.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const showDots = onDelete && (hovered || menuOpen || active);

  return (
    <div
      ref={rootRef}
      onClick={onSelect}
      onMouseEnter={() => { setHovered(true); iconRef.current?.startAnimation(); }}
      onMouseLeave={() => { setHovered(false); iconRef.current?.stopAnimation(); }}
      className={`file-item${active ? ' active' : ''}`}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '9px', cursor: 'pointer' }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>
        <Icon ref={iconRef} size={18} color="var(--text-2)" isAnimated={false} />
      </span>
      <p style={{ minWidth: 0, flex: 1, fontSize: '12.5px', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</p>
      {onDelete && (
        <div style={{ position: 'relative', flexShrink: 0, width: '24px', height: '20px' }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
            title="More"
            style={{
              display: showDots ? 'inline-flex' : 'none', alignItems: 'center', justifyContent: 'center',
              width: '24px', height: '24px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: menuOpen ? 'var(--border)' : 'transparent', color: 'var(--text-2)', position: 'absolute', top: '-2px', right: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { if (!menuOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; } }}
          ><MoreVertical size={15} strokeWidth={2} /></button>
          {menuOpen && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', top: '26px', right: 0, zIndex: 60, minWidth: '150px', padding: '5px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--off-white)', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}
            >
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '8px 9px', borderRadius: '7px', border: 'none', background: 'transparent', color: '#e0796b', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, textAlign: 'left', transition: 'background 0.12s, color 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#c0392b'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#e0796b'; }}
              ><Trash2 size={14} strokeWidth={2} /> Delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
