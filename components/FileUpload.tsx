'use client';
import { useRef, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { VaultItem } from '@/types/vault';

const WALRUS_PUBLISHER = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as 'mainnet' | 'testnet';
const SUI_CHAIN = `sui:${SUI_NETWORK}` as `sui:testnet` | `sui:mainnet`;
const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID || '';
const TATUM_RPC = process.env.NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC || 'https://fullnode.testnet.sui.io:443';

interface Props { onUploaded: (item: VaultItem) => void; compact?: boolean; }

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
  if (['pdf', 'docx', 'xlsx', 'xls'].includes(ext)) {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: form });
      if (res.ok) return (await res.json()).content ?? '';
    } catch { /* fall through */ }
  }
  return '';
}

// REST fallback for when Walrus SDK flow fails
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

  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  // WalrusClient is created lazily inside handleFile to avoid WASM loading during SSR

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
      // ── Step 1: Walrus upload ────────────────────────────────────────────
      // Primary: Walrus SDK writeFilesFlow (proper on-chain registration, user-owned blobs)
      // Fallback: REST PUT to publisher
      let blobId: string;
      let txDigest: string | undefined;

      const canWalletSign = !!(account && currentWallet?.features['sui:signAndExecuteTransaction']);

      if (account && canWalletSign) {
        try {
          // Dynamic import keeps WASM out of the SSR bundle
          const { WalrusClient, WalrusFile } = await import('@mysten/walrus');
          const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
          const suiClient = new SuiJsonRpcClient({
            url: TATUM_RPC || getJsonRpcFullnodeUrl('testnet'),
            network: SUI_NETWORK,
          });
          const walrusClient = new WalrusClient({ network: SUI_NETWORK, suiClient });

          const fileBytes = new Uint8Array(await file.arrayBuffer());
          const flow = walrusClient.writeFilesFlow({
            files: [WalrusFile.from({ contents: fileBytes, identifier: file.name })],
          });

          await flow.encode();

          // Register blob on Sui (user signs — proves ownership)
          const registerTx = flow.register({ owner: account.address, epochs: 5, deletable: false });
          const registerResult = await signAndExecute({ transaction: registerTx, chain: SUI_CHAIN });
          txDigest = registerResult.digest;
          console.log('[walrus-sdk] registered, tx:', txDigest);

          // Upload data directly from browser to Walrus storage nodes
          await flow.upload({ digest: txDigest });
          console.log('[walrus-sdk] data uploaded to storage nodes');

          // Certify blob on Sui (user signs — finalises storage proof)
          const certifyTx = flow.certify();
          const certifyResult = await signAndExecute({ transaction: certifyTx, chain: SUI_CHAIN });
          console.log('[walrus-sdk] certified, tx:', certifyResult.digest);

          const files = await flow.listFiles();
          blobId = files[0].blobId;
          console.log('[walrus-sdk] blobId:', blobId);

        } catch (sdkErr) {
          console.warn('[walrus-sdk] flow failed, falling back to REST:', sdkErr);
          blobId = await uploadToWalrusREST(file);
        }
      } else {
        // No wallet or old wallet API — use REST
        blobId = await uploadToWalrusREST(file);
      }

      // ── Step 2: AI summary ───────────────────────────────────────────────
      setStepIdx(1);
      const content = await extractText(file);
      let summary = 'No text content could be extracted from this file.';
      if (content.trim()) {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        summary = (await res.json()).summary ?? summary;
      }

      // ── Step 3: On-chain registration ────────────────────────────────────
      // If Walrus SDK flow already gave us a txDigest, skip.
      // Otherwise always record via server (retries up to 3 times — mandatory step).
      setStepIdx(2);
      if (!txDigest) {
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
              console.log(`[chain] server-signed tx (attempt ${attempt}):`, txDigest);
            } else {
              console.warn(`[chain] attempt ${attempt} failed:`, data.error);
            }
          } catch (serverErr) {
            console.warn(`[chain] attempt ${attempt} error:`, serverErr);
          }
        }
      }

      // ── Done ─────────────────────────────────────────────────────────────
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
            <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              {['Walrus SDK', 'Tatum RPC', 'Groq AI'].map(tag => (
                <span key={tag} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: 'white', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{tag}</span>
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
        <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444' }}>
          ⚠ {error}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
