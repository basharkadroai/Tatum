'use client';
import { useEffect, useState } from 'react';
import { Check, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';

const AGGREGATOR =
  (process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space').trim();

interface Props {
  blobId: string;
  fileType: string;
  filename: string;
}

// Fetches the blob back from Walrus to PROVE it's really on decentralized
// storage (not just in our localStorage). Renders images inline, previews text.
export function WalrusProof({ blobId, fileType, filename }: Props) {
  const blobUrl = `${AGGREGATOR}/v1/blobs/${blobId}`;
  const isImage = fileType.startsWith('image/');
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const isText =
    fileType.startsWith('text/') ||
    ['txt', 'md', 'json', 'csv', 'log', 'xml', 'yaml', 'yml'].includes(ext);

  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [text, setText] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setText('');

    if (isImage) {
      // <img> handles its own load/error events
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const res = await fetch(blobUrl);
        if (!res.ok) throw new Error(String(res.status));
        if (isText) {
          const t = await res.text();
          if (!cancelled) { setText(t.slice(0, 4000)); setState('ok'); }
        } else {
          // Non-previewable binary — just confirm it's retrievable
          if (!cancelled) setState('ok');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => { cancelled = true; };
  }, [blobUrl, isImage, isText]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Verified badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
            background: state === 'ok' ? '#e6f4ea' : state === 'error' ? '#fef2f2' : 'var(--off-white)',
            border: `1px solid ${state === 'ok' ? '#b7e1c1' : state === 'error' ? '#fecaca' : 'var(--border)'}`,
            color: state === 'ok' ? 'var(--mint-dark)' : state === 'error' ? '#ef4444' : 'var(--text-3)',
          }}
        >
          {state === 'loading' && <><Loader2 size={12} strokeWidth={2.5} className="lucide-spin" /> Retrieving from Walrus…</>}
          {state === 'ok' && <><Check size={12} strokeWidth={2.5} /> Live on Walrus — retrieved just now</>}
          {state === 'error' && <><AlertTriangle size={12} strokeWidth={2.5} /> Could not retrieve (node busy, retry)</>}
        </span>
        <a
          href={blobUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--mint-dark)', textDecoration: 'none', fontWeight: 600 }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          Open raw blob <ExternalLink size={11} strokeWidth={2} />
        </a>
      </div>

      {/* Preview */}
      {isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={blobUrl}
          alt={filename}
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
          style={{
            maxWidth: '100%', maxHeight: '280px', objectFit: 'contain',
            borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--off-white)',
          }}
        />
      )}

      {isText && state === 'ok' && text && (
        <pre
          style={{
            margin: 0, padding: '12px 14px', borderRadius: '10px',
            background: 'var(--off-white)', border: '1px solid var(--border)',
            fontSize: '11.5px', lineHeight: 1.55, color: 'var(--text-2)',
            maxHeight: '220px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}
