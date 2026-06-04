'use client';
import { useRef } from 'react';
import { PaperclipIcon, CodeXmlIcon } from '@animateicons/react/lucide';
import type { IconHandle } from '@animateicons/react';
import type { VaultItem } from '@/types/vault';

const CODE_EXTS = ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'scss', 'sh', 'json', 'xml', 'yaml', 'yml', 'sql'];

// One vault row — just the icon + filename. Size, time and on-chain status live
// inside the file's detail page. The animated icon plays when the WHOLE row is
// hovered (imperative startAnimation via ref), not when hovering the icon.
export function FileListItem({ item, active, onSelect }: { item: VaultItem; active: boolean; onSelect: () => void }) {
  const iconRef = useRef<IconHandle>(null);
  const ext = item.filename.split('.').pop()?.toLowerCase() ?? '';
  const Icon = CODE_EXTS.includes(ext) ? CodeXmlIcon : PaperclipIcon;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      className={`file-item${active ? ' active' : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '9px', cursor: 'pointer' }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>
        <Icon ref={iconRef} size={18} color="var(--text-2)" isAnimated={false} />
      </span>
      <p style={{ minWidth: 0, flex: 1, fontSize: '12.5px', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</p>
    </div>
  );
}
