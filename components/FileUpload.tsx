'use client';
import { useRef, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { VaultItem } from '@/types/vault';

const WALRUS_PUBLISHER = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';

interface Props { onUploaded: (item: VaultItem) => void; compact?: boolean; }

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  // Text-based: read directly in browser
  const textExts = ['txt', 'md', 'json', 'csv', 'js', 'ts', 'jsx', 'tsx', 'py', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini', 'sh', 'sql', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'env', 'log'];
  const isText = file.type.startsWith('text/') || textExts.includes(ext);
  if (isText) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // Binary formats — send to extract endpoint (these are typically < 10MB)
  if (['pdf', 'docx', 'xlsx', 'xls'].includes(ext)) {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: form });
      if (res.ok) {
        const { content } = await res.json();
        return content ?? '';
      }
    } catch {
      // fall through
    }
  }

  return '';
}

async function uploadToWalrus(file: File): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=5`, {
    method: 'PUT',
    body: file,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Walrus upload failed (${res.status}): ${text.slice(0, 120)}`);
  }
  const data = await res.json();
  const blobId =
    data.newlyCreated?.blobObject?.blobId ??
    data.alreadyCertified?.blobId;
  if (!blobId) throw new Error('Walrus returned no blobId');
  return blobId;
}

export function FileUpload({ onUploaded, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState('');

  const account = useCurrentAccount();

  const steps = [
    'Uploading to Walrus...',
    'Extracting & summarizing...',
    account ? 'Recording on Sui...' : 'Saving locally...',
    'Done!',
  ];

  async function handleFile(file: File) {
    setLoading(true);
    setError('');
    setStepIdx(0);

    try {
      // Step 1 — upload directly to Walrus from browser (no Vercel size limit)
      const blobId = await uploadToWalrus(file);

      // Step 2 — extract text + AI summary
      setStepIdx(1);
      const content = await extractText(file);

      let summary = 'No text content could be extracted from this file.';
      if (content.trim()) {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        const data = await res.json();
        summary = data.summary ?? summary;
      }

      // Step 3 — on-chain registration (server-signed via deployment wallet)
      setStepIdx(2);
      let txDigest: string | undefined;
      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobId,
            filename: file.name,
            fileType: file.type || 'application/octet-stream',
            fileSize: file.size,
          }),
        });
        const data = await res.json();
        if (res.ok && data.digest) {
          txDigest = data.digest;
          console.log('[chain] registered:', txDigest);
        } else {
          console.warn('[chain] register failed:', data.error);
        }
      } catch (chainErr) {
        console.warn('[chain] register error:', chainErr);
      }

      setStepIdx(3);
      onUploaded({
        id: crypto.randomUUID(),
        filename: file.name,
        fileType: file.type,
        blobId,
        summary,
        content: content.slice(0, 12000),
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

  if (compact) {
    return (
      <div>
        <input ref={inputRef} type="file" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        <button
          onClick={() => !loading && inputRef.current?.click()}
          disabled={loading}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
            padding: '9px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            background: loading ? 'var(--purple-bg)' : 'var(--purple)',
            color: loading ? 'var(--purple)' : 'white',
            border: loading ? '1px solid #c7d2fe' : 'none',
            cursor: loading ? 'default' : 'pointer', transition: 'all 0.15s',
          }}
        >
          {loading ? (
            <>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #c7d2fe', borderTopColor: 'var(--purple)', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{steps[stepIdx]}</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Upload File
            </>
          )}
        </button>
        {error && (
          <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', fontSize: '11px', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444' }}>
            ⚠ {error.slice(0, 100)}
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
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
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />

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
                Connect your wallet to record uploads on-chain
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
