'use client';
import { useRef } from 'react';
import { PaperclipIcon, CodeXmlIcon } from '@animateicons/react/lucide';
import type { IconHandle } from '@animateicons/react';
import type { VaultItem } from '@/types/vault';

const CODE_EXTS = ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'scss', 'sh', 'json', 'xml', 'yaml', 'yml', 'sql'];

// One vault row — just the icon + filename. Size, time and on-chain status live
// inside the file's detail page. The animated icon plays when the WHOLE row is
// hovered (imperative startAnimation via ref), not when hovering the icon.
export function FileListItem({ item, active, collapsed, onSelect }: { item: VaultItem; active: boolean; collapsed: boolean; onSelect: () => void }) {
  const iconRef = useRef<IconHandle>(null);
  const ext = item.filename.split('.').pop()?.toLowerCase() ?? '';
  const Icon = CODE_EXTS.includes(ext) ? CodeXmlIcon : PaperclipIcon;
  const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      className={`file-item${active ? ' active' : ''}`}
      title={collapsed ? item.filename : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : '10px', padding: collapsed ? '9px 0' : '9px 12px',
        borderRadius: '9px', cursor: 'pointer', minHeight: '36px',
        transition: `gap 0.28s ${ease}, padding 0.28s ${ease}, background 0.12s ease`,
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>
        <Icon ref={iconRef} size={18} color="var(--text-2)" isAnimated={false} />
      </span>
      <p
        aria-hidden={collapsed}
        style={{
          minWidth: 0, flex: collapsed ? '0 0 0px' : 1, maxWidth: collapsed ? 0 : '180px',
          opacity: collapsed ? 0 : 1, transform: collapsed ? 'translateX(-6px)' : 'translateX(0)',
          fontSize: '12.5px', fontWeight: 600, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: `flex-basis 0.28s ${ease}, max-width 0.28s ${ease}, opacity 0.16s ease, transform 0.28s ${ease}`,
        }}
      >
        {item.filename}
      </p>
    </div>
  );
}
