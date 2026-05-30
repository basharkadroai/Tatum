import type { VaultItem } from '@/types/vault';

const WALRUS_PUBLISHER = (process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space').trim();
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const VISION_MAX = 3 * 1024 * 1024;
const EXTRACT_MAX = 4 * 1024 * 1024;

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

async function uploadToWalrus(file: File): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=5`, { method: 'PUT', body: file });
  if (!res.ok) throw new Error(`Walrus upload failed (${res.status})`);
  const data = await res.json();
  const blobId = data.newlyCreated?.blobObject?.blobId ?? data.alreadyCertified?.blobId;
  if (!blobId) throw new Error('Walrus returned no blobId');
  return blobId;
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type.startsWith('text/') || CODE_OR_TEXT.includes(ext)) return readAsText(file);
  if (['pdf', 'docx', 'xlsx', 'xls'].includes(ext) && file.size <= EXTRACT_MAX) {
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

type Analysis = { summary: string; tags: string[]; questions: string[]; content: string };

async function analyze(file: File): Promise<Analysis> {
  const isImage = file.type.startsWith('image/');
  if (isImage && file.size <= VISION_MAX) {
    const dataUrl = await readAsDataURL(file);
    const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl }) });
    const data = await res.json();
    const summary = data.summary ?? 'Could not analyze this image.';
    return { summary, tags: data.tags ?? ['image'], questions: data.questions ?? [], content: summary };
  }
  const content = await extractText(file);
  if (!content.trim()) {
    return { summary: 'No readable text could be extracted from this file.', tags: [], questions: [], content: '' };
  }
  const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  const data = await res.json();
  return { summary: data.summary ?? '', tags: data.tags ?? [], questions: data.questions ?? [], content };
}

// Runs the full upload pipeline, narrating each step via emit(). Returns the
// finished VaultItem (or null on a hard failure).
export async function runUpload(file: File, emit: (chunk: string) => void): Promise<VaultItem | null> {
  if (file.size > MAX_UPLOAD_BYTES) {
    emit(`**${file.name}** is ${fmtBytes(file.size)} — the max is 10 MB. Try a smaller file.`);
    return null;
  }

  emit(`Got it — **${file.name}** (${fmtBytes(file.size)}).\n\nStoring it on **Walrus** decentralized storage…`);
  let blobId: string;
  try {
    blobId = await uploadToWalrus(file);
  } catch (e) {
    emit(`\n\n⚠ Walrus upload failed: ${String(e).slice(0, 120)}`);
    return null;
  }
  emit(`  ✓\nIt's now stored permanently and erasure-coded across Walrus nodes — blob \`${blobId.slice(0, 18)}…\`\n\n`);

  emit(`Recording it on **Sui** via **Tatum** so there's a verifiable on-chain proof…`);
  let txDigest: string | undefined;
  const body = JSON.stringify({ blobId, filename: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size });
  for (let attempt = 1; attempt <= 3 && !txDigest; attempt++) {
    try {
      const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const data = await res.json();
      if (res.ok && data.digest) txDigest = data.digest;
    } catch { /* retry */ }
  }
  emit(txDigest ? `  ✓\nOn-chain as a VaultEntry — tx \`${txDigest.slice(0, 18)}…\`\n\n` : `  (the on-chain step will retry in the background)\n\n`);

  emit(`Reading and understanding the file with AI…`);
  const { summary, tags, questions, content } = await analyze(file);
  emit(`  ✓\n\n${summary}\n\nAsk me anything about it.`);

  return {
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
  };
}
