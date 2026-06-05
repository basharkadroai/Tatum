'use client';
import { useEffect, useState } from 'react';
import { Check, Loader2, AlertTriangle, ExternalLink, Link2 } from 'lucide-react';
import { WALRUS_AGGREGATOR } from '@/lib/network';

const AGGREGATOR = WALRUS_AGGREGATOR.trim();

interface Props {
  blobId: string;
  fileType: string;
  filename: string;
  txDigest?: string;
}

type ChainState =
  | { status: 'idle' | 'loading' }
  | { status: 'ok'; entryId: string; objectUrl: string }
  | { status: 'fail' };

// Reads the VaultEntry back from the Sui chain via Tatum RPC to PROVE the blob
// is genuinely registered on-chain — not just that a tx was once sent.
function useOnChainVerify(txDigest: string | undefined, blobId: string): ChainState {
  const [state, setState] = useState<ChainState>({ status: 'idle' });
  useEffect(() => {
    if (!txDigest) { setState({ status: 'idle' }); return; }
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch('/api/verify-chain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ digest: txDigest, blobId }),
        });
        const data = await res.json();
        if (cancelled) return;
        setState(data.verified
          ? { status: 'ok', entryId: data.entryId, objectUrl: data.objectUrl }
          : { status: 'fail' });
      } catch {
        if (!cancelled) setState({ status: 'fail' });
      }
    })();
    return () => { cancelled = true; };
  }, [txDigest, blobId]);
  return state;
}

// Fetches the blob back from Walrus to PROVE it's really on decentralized
// storage (not just in our localStorage). Renders images inline, previews text.
export function WalrusProof({ blobId, fileType, filename, txDigest }: Props) {
  const blobUrl = `${AGGREGATOR}/v1/blobs/${blobId}`;
  const chain = useOnChainVerify(txDigest, blobId);
  const isImage = fileType.startsWith('image/');
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const isText =
    fileType.startsWith('text/') ||
    ['txt', 'md', 'json', 'csv', 'log', 'xml', 'yaml', 'yml'].includes(ext);

  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [text, setText] = useState('');
  const [imgAttempt, setImgAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setText('');
    setImgAttempt(0);

    if (isImage) {
      // <img> handles its own load/error + retry (see onError below)
      return () => { cancelled = true; };
    }

    (async () => {
      // Per Walrus docs, a CDN-fronted aggregator can briefly cache a 404 from
      // before the blob propagated — so retry with backoff before giving up.
      const delays = [0, 1200, 2400, 4000];
      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return;
        if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
        try {
          const res = await fetch(blobUrl, { cache: 'no-store' });
          if (!res.ok) throw new Error(String(res.status));
          if (isText) {
            const t = await res.text();
            if (!cancelled) { setText(t.slice(0, 4000)); setState('ok'); }
          } else if (!cancelled) {
            setState('ok'); // non-previewable binary — just confirm it's retrievable
          }
          return;
        } catch { /* transient miss — back off and retry */ }
      }
      if (!cancelled) setState('error');
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
            background: state === 'ok' ? 'var(--success-bg)' : state === 'error' ? 'var(--error-bg)' : 'var(--off-white)',
            border: `1px solid ${state === 'ok' ? 'var(--success-border)' : state === 'error' ? 'var(--error-border)' : 'var(--border)'}`,
            color: state === 'ok' ? 'var(--mint-dark)' : state === 'error' ? 'var(--error)' : 'var(--text-3)',
          }}
        >
          {state === 'loading' && <><Loader2 size={12} strokeWidth={2.5} className="lucide-spin" /> Retrieving from Walrus…</>}
          {state === 'ok' && <><Check size={12} strokeWidth={2.5} /> Live on Walrus — retrieved just now</>}
          {state === 'error' && <><AlertTriangle size={12} strokeWidth={2.5} /> Couldn’t retrieve — testnet blob may have expired</>}
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

      {/* On-chain verification — reads the VaultEntry back via Tatum Sui RPC */}
      {txDigest && chain.status !== 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
              background: chain.status === 'ok' ? 'var(--success-bg)' : chain.status === 'fail' ? 'var(--error-bg)' : 'var(--off-white)',
              border: `1px solid ${chain.status === 'ok' ? 'var(--success-border)' : chain.status === 'fail' ? 'var(--error-border)' : 'var(--border)'}`,
              color: chain.status === 'ok' ? 'var(--mint-dark)' : chain.status === 'fail' ? 'var(--error)' : 'var(--text-3)',
            }}
          >
            {chain.status === 'loading' && <><Loader2 size={12} strokeWidth={2.5} className="lucide-spin" /> Verifying on-chain via Tatum…</>}
            {chain.status === 'ok' && <><Check size={12} strokeWidth={2.5} /> Verified on-chain via Tatum — read back from Sui</>}
            {chain.status === 'fail' && <><AlertTriangle size={12} strokeWidth={2.5} /> On-chain record not found</>}
          </span>
          {chain.status === 'ok' && (
            <a
              href={chain.objectUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--purple)', textDecoration: 'none', fontWeight: 600 }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
            >
              View VaultEntry object <Link2 size={11} strokeWidth={2} />
            </a>
          )}
        </div>
      )}

      {/* Preview */}
      {isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgAttempt ? `${blobUrl}?r=${imgAttempt}` : blobUrl}
          alt={filename}
          onLoad={() => setState('ok')}
          onError={() => {
            // Same CDN-stale-404 case — retry a few times with backoff before failing.
            if (imgAttempt < 3) setTimeout(() => setImgAttempt(a => a + 1), 1200 * (imgAttempt + 1));
            else setState('error');
          }}
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
