'use client';
import { VaultItem } from '@/types/vault';

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ICONS: Record<string, string> = {
  'application/pdf': '📕', 'text/plain': '📄', 'text/markdown': '📝',
  'application/json': '🗂', 'text/csv': '📊',
};

interface Props { item: VaultItem; onAsk: (item: VaultItem) => void; onDelete: (id: string) => void; }

export function VaultCard({ item, onAsk, onDelete }: Props) {
  const icon = ICONS[item.fileType] ?? '📄';
  const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
  const network = process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet';
  const suiExplorer = network === 'mainnet' ? 'https://suivision.xyz' : 'https://testnet.suivision.xyz';

  return (
    <div
      style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '20px', display: 'flex',
        flexDirection: 'column', gap: '14px', transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(79,70,229,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px', background: '#eef2ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', flexShrink: 0,
          }}>{icon}</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.filename}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
              {formatBytes(item.sizeBytes)} · {formatDate(item.uploadedAt)}
            </p>
          </div>
        </div>
        <button onClick={() => onDelete(item.id)}
          style={{ fontSize: '13px', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>✕</button>
      </div>

      {/* Summary */}
      <p style={{
        fontSize: '12px', color: 'var(--text-2)', lineHeight: '1.6',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{item.summary}</p>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
          <a
            href={`${aggregator}/v1/blobs/${item.blobId}`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--mint-dark)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            🗄 {item.blobId.slice(0, 14)}…
          </a>
          {item.txDigest && (
            <a
              href={`${suiExplorer}/txblock/${item.txDigest}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--purple)', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
            >
              ⛓ {item.txDigest.slice(0, 14)}…
            </a>
          )}
        </div>
        <button onClick={() => onAsk(item)}
          style={{
            background: 'var(--purple)', color: 'white', border: 'none', borderRadius: '8px',
            padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--purple-dark)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--purple)')}>
          Ask AI
        </button>
      </div>
    </div>
  );
}
