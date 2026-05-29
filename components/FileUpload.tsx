'use client';
import { useRef, useState } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { VaultItem } from '@/types/vault';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';
const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet';
const SUI_CHAIN = `sui:${SUI_NETWORK}` as `sui:testnet` | `sui:mainnet`;

interface Props { onUploaded: (item: VaultItem) => void; }

export function FileUpload({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState('');

  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const steps = [
    'Uploading to Walrus...',
    'Generating AI summary...',
    account ? 'Recording on Sui via Tatum...' : 'Saving locally (connect wallet for on-chain)...',
    'Done!',
  ];

  async function handleFile(file: File) {
    setLoading(true); setError(''); setStepIdx(0);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      setStepIdx(1);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      const { blobId, summary, content } = data;

      // Record blobId on Sui via Tatum RPC
      setStepIdx(2);
      let txDigest: string | undefined;
      if (account && PACKAGE_ID) {
        try {
          const tx = new Transaction();
          tx.moveCall({
            target: `${PACKAGE_ID}::vault::register`,
            arguments: [
              tx.pure.string(blobId),
              tx.pure.string(file.name),
              tx.pure.string(file.type || 'application/octet-stream'),
              tx.pure.u64(file.size),
            ],
          });
          console.log(`[chain] signing on ${SUI_CHAIN}, package=${PACKAGE_ID}`);
          const result = await signAndExecute({ transaction: tx, chain: SUI_CHAIN });
          txDigest = result.digest;
          console.log('[chain] blobId registered on Sui:', txDigest);
        } catch (chainErr: unknown) {
          const msg = chainErr instanceof Error ? chainErr.message : String(chainErr);
          const detail = typeof chainErr === 'object' && chainErr !== null
            ? JSON.stringify(chainErr, Object.getOwnPropertyNames(chainErr)).slice(0, 200)
            : String(chainErr);
          console.error('[chain] on-chain registration failed:', msg, detail);
          setError(`On-chain step failed: ${msg} — file was still saved to Walrus.`);
        }
      } else if (!account) {
        console.warn('[chain] wallet not connected — skipping on-chain step');
      }

      setStepIdx(3);
      onUploaded({
        id: crypto.randomUUID(),
        filename: file.name,
        fileType: file.type,
        blobId,
        summary,
        content,
        txDigest,
        uploadedAt: new Date().toISOString(),
        sizeBytes: file.size,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }

  return (
    <div>
      <div
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--purple)' : 'var(--border-2)'}`,
          borderRadius: '16px',
          background: dragging ? '#eef2ff' : 'var(--off-white)',
          padding: '48px 32px',
          textAlign: 'center',
          cursor: loading ? 'default' : 'pointer',
          transition: 'all 0.15s ease',
          opacity: loading ? 0.8 : 1,
        }}
      >
        <input ref={inputRef} type="file" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              border: '3px solid var(--border)', borderTopColor: 'var(--purple)',
              animation: 'spin 0.7s linear infinite',
            }} />
            <p style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '15px' }}>{steps[stepIdx]}</p>
            <div style={{ width: '200px', height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '2px', transition: 'width 0.4s ease',
                width: `${((stepIdx + 1) / steps.length) * 100}%`,
                background: 'linear-gradient(90deg, var(--purple), var(--mint))',
              }} />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Step {stepIdx + 1} of {steps.length}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '12px',
              background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-1)', marginBottom: '4px' }}>
                Drop a file or <span style={{ color: 'var(--purple)' }}>click to browse</span>
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                Any file type · Stored permanently on Walrus · AI summarized
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['Walrus Storage', 'Sui Blockchain', 'Groq AI'].map(tag => (
                <span key={tag} style={{
                  fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                  background: 'white', border: '1px solid var(--border)', color: 'var(--text-2)',
                }}>{tag}</span>
              ))}
            </div>
            {!account && (
              <p style={{ fontSize: '12px', color: 'var(--purple)', marginTop: '4px' }}>
                Connect your wallet above to record uploads on-chain
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: '12px', padding: '12px 16px', borderRadius: '10px', fontSize: '13px',
          background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444',
        }}>
          ⚠ {error}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
