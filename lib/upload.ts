import type { VaultItem } from '@/types/vault';
import { WALRUS_PUBLISHER as WALRUS_PUBLISHER_RAW } from '@/lib/network';
import { generateSealId, makeSealClient, sealEncrypt } from '@/lib/seal';
import type { SealCompatibleClient } from '@mysten/seal';

const WALRUS_PUBLISHER = WALRUS_PUBLISHER_RAW.trim();
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const VISION_MAX = 3 * 1024 * 1024;
const EXTRACT_MAX = 10 * 1024 * 1024;
const DOC_EXTS = ['pdf', 'docx', 'xlsx', 'xls', 'pptx'];
const AV_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'mpga', 'mpeg', 'aac', 'mp4', 'webm', 'mov', 'm4v'];

const CODE_OR_TEXT = ['txt', 'md', 'mdx', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'php', 'html', 'htm', 'xml', 'svg', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'sh', 'bash', 'zsh', 'sql', 'rs', 'go', 'java', 'kt', 'swift', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'css', 'scss', 'less', 'env', 'log', 'gitignore', 'dockerfile', 'lock', 'gql', 'graphql', 'vue', 'svelte', 'r', 'lua', 'pl', 'srt', 'vtt', 'tex', 'rst'];

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsText(file); });
}
function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
}

export async function uploadToWalrus(file: File): Promise<string> {
  // The public testnet publisher is occasionally flaky — retry a few times with
  // backoff so a transient 5xx/timeout doesn't fail an upload on camera.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // epochs=53 — the max the testnet publisher accepts (~53 days), so blobs
      // don't expire mid-demo (verified: 100+ is rejected).
      const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=53`, { method: 'PUT', body: file });
      if (!res.ok) throw new Error(`Walrus upload failed (${res.status})`);
      const data = await res.json();
      const blobId = data.newlyCreated?.blobObject?.blobId ?? data.alreadyCertified?.blobId;
      if (!blobId) throw new Error('Walrus returned no blobId');
      return blobId;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 800));
    }
  }
  throw lastErr ?? new Error('Walrus upload failed');
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type.startsWith('text/') || CODE_OR_TEXT.includes(ext)) return readAsText(file);
  if (DOC_EXTS.includes(ext) && file.size <= EXTRACT_MAX) {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: form });
      if (res.ok) return (await res.json()).content ?? '';
    } catch { /* fall through */ }
  }
  if (file.size <= 2 * 1024 * 1024 && !file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
    try {
      const txt = await readAsText(file);
      const sample = txt.slice(0, 2000);
      let bad = 0;
      for (let i = 0; i < sample.length; i++) {
        const c = sample.charCodeAt(i);
        if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 0xfffd) bad++;
      }
      if (sample.length > 0 && bad / sample.length < 0.05) return txt;
    } catch { /* not text */ }
  }
  return '';
}

// Transcribe audio/video to text via Groq Whisper (server route).
async function transcribe(file: File): Promise<string> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/transcribe', { method: 'POST', body: form });
    if (res.ok) return (await res.json()).content ?? '';
  } catch { /* fall through */ }
  return '';
}

type Analysis = { summary: string; tags: string[]; questions: string[]; content: string };

export async function analyzeFile(file: File): Promise<Analysis> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isImage = file.type.startsWith('image/');
  if (isImage && file.size <= VISION_MAX) {
    const dataUrl = await readAsDataURL(file);
    const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl }) });
    const data = await res.json();
    const summary = data.summary ?? 'Could not analyze this image.';
    return { summary, tags: data.tags ?? ['image'], questions: data.questions ?? [], content: summary };
  }

  // Audio / video → transcribe with Whisper, then summarize the transcript.
  const isAV = file.type.startsWith('audio/') || file.type.startsWith('video/') || AV_EXTS.includes(ext);
  const content = isAV ? await transcribe(file) : await extractText(file);
  if (!content.trim()) {
    return {
      summary: isAV ? 'No speech could be transcribed from this file.' : 'No readable text could be extracted from this file.',
      tags: [], questions: [], content: '',
    };
  }
  const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  const data = await res.json();
  return { summary: data.summary ?? '', tags: data.tags ?? [], questions: data.questions ?? [], content };
}

// ── Structured step events for the animated chain in the chat ──
export type UploadStepStatus = 'running' | 'done' | 'error';
export type UploadStep = {
  id?: string;
  label: string;
  status: UploadStepStatus;
  detail?: string;
  tool?: string;
  permission?: string;
  automatic?: boolean;
  durationMs?: number;
};
export type UploadEvent =
  | { kind: 'start'; label: string }       // begin a new step (spinner)
  | { kind: 'done'; detail?: string }      // resolve current step (checkmark)
  | { kind: 'error'; detail?: string }     // fail current step
  | { kind: 'summary'; text: string };     // final AI answer below the chain

export type SealUploadOptions = {
  enabled?: boolean;
  suiClient: SealCompatibleClient;
  packageId: string;
};

async function registerVaultEntry({
  blobId,
  filename,
  fileType,
  fileSize,
  owner,
  sealId,
}: {
  blobId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  owner?: string;
  sealId?: string;
}) {
  const endpoint = sealId ? '/api/register-encrypted' : '/api/register';
  const body = JSON.stringify({ blobId, filename, fileType, fileSize, owner, sealId });
  let lastData: { digest?: string; entryId?: string; policyId?: string; error?: string } = {};
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const data = await res.json();
      lastData = data;
      if (res.ok && data.digest) return data as { digest: string; entryId?: string; policyId?: string };
    } catch { /* retry */ }
  }
  throw new Error(lastData.error || 'On-chain registration failed');
}

// Runs the full upload pipeline, narrating each step via emit() as structured
// events. Returns the finished VaultItem (or null on a hard failure).
export async function runUpload(
  file: File,
  emit: (e: UploadEvent) => void,
  owner?: string,
  seal?: SealUploadOptions,
): Promise<VaultItem | null> {
  if (file.size > MAX_UPLOAD_BYTES) {
    emit({ kind: 'summary', text: `**${file.name}** is ${fmtBytes(file.size)} — the max upload is 10 MB. Try a smaller file.` });
    return null;
  }

  let encrypted = !!(owner && seal?.enabled && seal.packageId);
  let fileForWalrus = file;
  let sealId: string | undefined;
  let ciphertextSizeBytes: number | undefined;

  if (encrypted && seal) {
    emit({ kind: 'start', label: `Encrypting ${file.name} with Seal (private)` });
    try {
      sealId = generateSealId();
      const plaintext = new Uint8Array(await file.arrayBuffer());
      const ciphertext = await sealEncrypt(makeSealClient(seal.suiClient), seal.packageId!, sealId, plaintext);
      ciphertextSizeBytes = ciphertext.byteLength;
      fileForWalrus = new File([ciphertext.slice().buffer as ArrayBuffer], `${file.name}.seal`, { type: 'application/octet-stream' });
      emit({ kind: 'done', detail: `Encrypted before storage · Seal ID ${sealId.slice(0, 14)}...` });
    } catch (e) {
      // Don't abort — fall back to a public upload so the file still saves.
      console.warn('[upload] Seal encryption failed, storing public:', e);
      emit({ kind: 'done', detail: 'Seal unavailable right now — stored as a public file.' });
      encrypted = false;
      sealId = undefined;
      ciphertextSizeBytes = undefined;
      fileForWalrus = file;
    }
  }

  // Step 1 — Walrus
  emit({ kind: 'start', label: `Storing ${encrypted ? 'encrypted ciphertext' : file.name} on Walrus decentralized storage` });
  let blobId: string;
  try {
    blobId = await uploadToWalrus(fileForWalrus);
  } catch (e) {
    emit({ kind: 'error', detail: `Walrus upload failed — ${String(e).slice(0, 100)}` });
    emit({ kind: 'summary', text: `I couldn't store this file on Walrus. Please try again in a moment.` });
    return null;
  }
  emit({ kind: 'done', detail: `Erasure-coded across nodes · blob ${blobId.slice(0, 14)}…` });

  // Step 2 — Sui via Tatum
  emit({ kind: 'start', label: `Recording an on-chain proof on Sui via Tatum` });
  let txDigest: string | undefined;
  let entryId: string | undefined;
  let sealPolicyId: string | undefined;
  try {
    const data = await registerVaultEntry({
      blobId,
      filename: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      owner,
      sealId,
    });
    txDigest = data.digest;
    entryId = data.entryId;
    sealPolicyId = data.policyId;
  } catch (e) {
    emit({ kind: 'error', detail: `On-chain registration failed — ${String(e).slice(0, 100)}` });
    emit({ kind: 'summary', text: shouldEncrypt
      ? `The encrypted blob was stored, but I could not create its Seal access policy. Please try the upload again.`
      : `I couldn't record the file on Sui. Please try again in a moment.` });
    return null;
  }
  emit(txDigest
    ? { kind: 'done', detail: shouldEncrypt
      ? `Registered encrypted vault access · tx ${txDigest.slice(0, 14)}...`
      : `Registered as a VaultEntry · tx ${txDigest.slice(0, 14)}...` }
    : { kind: 'done', detail: `Queued — the on-chain write will retry in the background` });

  // Step 3 — AI read
  emit({ kind: 'start', label: `Reading and understanding the file with AI` });
  const { summary, tags, questions, content } = await analyzeFile(file);
  emit({ kind: 'done', detail: `Indexed and ready for questions` });
  emit({ kind: 'summary', text: `${summary}\n\nAsk me anything about it.` });

  return {
    id: crypto.randomUUID(),
    filename: file.name,
    fileType: file.type,
    blobId,
    summary,
    content: content.slice(0, 12000),
    txDigest,
    entryId,
    encrypted: shouldEncrypt,
    sealId,
    sealPolicyId,
    ciphertextSizeBytes,
    decryptedAt: shouldEncrypt ? new Date().toISOString() : undefined,
    owner: txDigest && owner ? owner : undefined,
    tags,
    questions,
    uploadedAt: new Date().toISOString(),
    sizeBytes: file.size,
  };
}
