'use client';
import { useRef } from 'react';
import { PaperclipIcon, CodeXmlIcon } from '@animateicons/react/lucide';
import type { IconHandle } from '@animateicons/react';
import { KeyRound } from 'lucide-react';
import type { VaultItem } from '@/types/vault';

const CODE_EXTS = ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'scss', 'sh', 'json', 'xml', 'yaml', 'yml', 'sql'];

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// One vault row. The animated icon plays when the WHOLE row is hovered
// (imperative startAnimation via ref) — not when hovering the icon directly.
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
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</p>
        <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>{fmtBytes(item.sizeBytes)} · {fmtDate(item.uploadedAt)}</p>
      </div>
      {item.owner ? (
        <KeyRound size={13} strokeWidth={2} color="var(--mint-dark)" style={{ flexShrink: 0 }} />
      ) : item.txDigest ? (
        <div title="Recorded on Sui" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--purple)', flexShrink: 0 }} />
      ) : null}
    </div>
  );
}
