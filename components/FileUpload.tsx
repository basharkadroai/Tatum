'use client';
import { useRef, useState } from 'react';
import { Plus, UploadCloud, Loader2 } from 'lucide-react';
import { VaultItem } from '@/types/vault';

const WALRUS_PUBLISHER = (process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space').trim();
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as 'mainnet' | 'testnet';

interface Props { onUploaded: (item: VaultItem) => void; compact?: boolean; }

// ── Debug logger ──────────────────────────────────────────────────────────
// Every step is logged with a [ChainMind] prefix and also buffered on
// window.__cmlog so the whole run can be copied with: copy(__cmlog())
function dbg(step: string, detail?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  let extra = '';
  if (detail !== undefined) {
    if (detail instanceof Error) extra = ` ${detail.name}: ${detail.message}`;
    else if (typeof detail === 'object') {
      try { extra = ' ' + JSON.stringify(detail, Object.getOwnPropertyNames(detail as object)); }
      catch { extra = ' ' + String(detail); }
    } else extra = ' ' + String(detail);
  }
  const line = `[ChainMind ${ts}] ${step}${extra}`;
  console.log(line);
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __cmlogBuf?: string[]; __cmlog?: () => string };
    (w.__cmlogBuf ||= []).push(line);
    w.__cmlog ||= () => (w.__cmlogBuf || []).join('\n');
  }
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const textExts = ['txt', 'md', 'json', 'csv', 'js', 'ts', 'jsx', 'tsx', 'py', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini', 'sh', 'sql', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'env', 'log'];
  if (file.type.startsWith('text/') || textExts.includes(ext)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
  // Server extraction is capped by Vercel's 4.5MB body limit — skip larger files gracefully
  const MAX_EXTRACT_BYTES = 4 * 1024 * 1024;
  if (['pdf', 'docx', 'xlsx', 'xls'].includes(ext) && file.size <= MAX_EXTRACT_BYTES) {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: form });
      if (res.ok) return (await res.json()).content ?? '';
    } catch { /* fall through */ }
  }
  return '';
}

// Upload to Walrus via the public publisher HTTP API.
// The publisher pays the WAL — the correct pattern for a public web app
// (per Walrus docs), so users don't need WAL tokens of their own.
async function uploadToWalrusREST(file: File): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=5`, { method: 'PUT', body: file });
  if (!res.ok) throw new Error(`Walrus upload failed (${res.status}): ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  const blobId = data.newlyCreated?.blobObject?.blobId ?? data.alreadyCertified?.blobId;
  if (!blobId) throw new Error('Walrus returned no blobId');
  return blobId;
}

export function FileUpload({ onUploaded, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState('');

  const steps = [
    'Uploading to Walrus...',
    'Extracting & summarizing...',
    'Recording on Sui via Tatum...',
    'Done!',
  ];

  async function handleFile(file: File) {
    setLoading(true);
    setError('');
    setStepIdx(0);

    try {
      let txDigest: string | undefined;
      dbg('UPLOAD START', {
        file: file.name, sizeBytes: file.size, type: file.type, network: SUI_NETWORK,
      });

      // ── Step 1: store the file on Walrus ─────────────────────────────────
      dbg('WALRUS: uploading to publisher...', { publisher: WALRUS_PUBLISHER });
      const blobId = await uploadToWalrusREST(file);
      dbg('WALRUS: blobId received', { blobId });

      // ── Step 2: AI analysis (summary + tags + suggested questions) ───────
      setStepIdx(1);
      dbg('AI: extracting text...');
      const content = await extractText(file);
      dbg('AI: extracted chars', { chars: content.length });
      let summary = 'No text content could be extracted from this file.';
      let tags: string[] = [];
      let questions: string[] = [];
      if (content.trim()) {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        const data = await res.json();
        summary = data.summary ?? summary;
        tags = Array.isArray(data.tags) ? data.tags : [];
        questions = Array.isArray(data.questions) ? data.questions : [];
        dbg('AI: analysis received', { summaryChars: summary.length, tags: tags.length, questions: questions.length });
      }

      // ── Step 3: record the blobId on Sui via Tatum (server-signed) ───────
      setStepIdx(2);
      dbg('CHAIN: recording blobId on Sui via Tatum...');
      const body = JSON.stringify({
        blobId,
        filename: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      });
      for (let attempt = 1; attempt <= 3 && !txDigest; attempt++) {
        try {
          const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          const data = await res.json();
          if (res.ok && data.digest) {
            txDigest = data.digest;
            dbg(`CHAIN: tx OK (attempt ${attempt})`, { digest: txDigest });
          } else {
            dbg(`CHAIN: attempt ${attempt} failed`, { error: data.error });
          }
        } catch (serverErr) {
          dbg(`CHAIN: attempt ${attempt} error`, serverErr);
        }
      }

      // ── Done ─────────────────────────────────────────────────────────────
      setStepIdx(3);
      dbg('DONE', { blobId, txDigest, onChain: !!txDigest });
      onUploaded({
        id: crypto.randomUUID(),
        filename: file.name,
        fileType: file.type,
        blobId,
        summary,
        content: content.slice(0, 12000),
        txDigest,
        tags,
        questions,
        uploadedAt: new Date().toISOString(),
        sizeBytes: file.size,
      });
    } catch (err) {
      dbg('FATAL ERROR', err);
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
            color: loading ? 'var(--purple)' : 'var(--base)',
            border: loading ? '1px solid var(--purple-border)' : 'none',
            cursor: loading ? 'default' : 'pointer', transition: 'all 0.15s',
          }}
        >
          {loading ? (
            <>
              <Loader2 size={14} strokeWidth={2.5} className="lucide-spin" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{steps[stepIdx]}</span>
            </>
          ) : (
            <>
              <Plus size={15} strokeWidth={2.5} />
              Upload File
            </>
          )}
        </button>
        {error && (
          <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', fontSize: '11px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error)' }}>
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
          background: dragging ? 'var(--purple-bg)' : 'var(--off-white)',
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
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--purple)', animation: 'spin 0.7s linear infinite' }} />
            <p style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '15px' }}>{steps[stepIdx]}</p>
            <div style={{ width: '200px', height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '2px', transition: 'width 0.4s ease', width: `${((stepIdx + 1) / steps.length) * 100}%`, background: 'linear-gradient(90deg, var(--purple), var(--mint))' }} />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Step {stepIdx + 1} of {steps.length}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UploadCloud size={26} strokeWidth={1.8} color="var(--purple)" />
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
              {['Walrus Storage', 'Tatum RPC', 'Groq AI'].map(tag => (
                <span key={tag} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: 'var(--off-white)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error)' }}>
          ⚠ {error}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
