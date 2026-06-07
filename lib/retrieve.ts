import type { VaultItem } from '@/types/vault';

export type RetrievedDoc = {
  filename: string;
  summary: string;
  content: string;
  blobId?: string;
  fileType?: string;
  sizeBytes?: number;
  owner?: string;
  txDigest?: string;
  entryId?: string;
  listingId?: string;
  priceMist?: string;
  listed?: boolean;
  purchased?: boolean;
  tags?: string[];
  uploadedAt?: string;
  encrypted?: boolean;
  sealId?: string;
  sealPolicyId?: string;
  ciphertextSizeBytes?: number;
  decryptedAt?: string;
};

type Chunk = { text: string; index: number; start: number; end: number; score: number };
type ScoredVaultItem = { v: VaultItem; score: number; chunks: Chunk[] };

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'what', 'when', 'where', 'which', 'about', 'into', 'only', 'using']);

function termsFor(question: string) {
  return Array.from(new Set((question.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(t => !STOPWORDS.has(t))));
}

function countTerm(text: string, term: string) {
  return (text.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length;
}

function splitChunks(text: string, size = 1100): Chunk[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const parts = clean.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/g).map(p => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let pending = '';
  let pendingStart = 0;
  let cursor = 0;

  for (const part of parts.length ? parts : [clean]) {
    const found = clean.indexOf(part, cursor);
    const partStart = found >= 0 ? found : cursor;
    cursor = partStart + part.length;
    if (!pending) pendingStart = partStart;
    if ((pending + ' ' + part).trim().length > size && pending) {
      chunks.push({ text: pending, index: chunks.length + 1, start: pendingStart, end: pendingStart + pending.length, score: 0 });
      pending = part;
      pendingStart = partStart;
    } else {
      pending = (pending + ' ' + part).trim();
    }
  }
  if (pending) chunks.push({ text: pending, index: chunks.length + 1, start: pendingStart, end: pendingStart + pending.length, score: 0 });
  return chunks;
}

function scoreChunk(chunk: Chunk, terms: string[], idf?: Record<string, number>) {
  const body = chunk.text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    score += Math.min(countTerm(body, term), 8) * (idf?.[term] ?? 1);
  }
  return score / Math.max(1, chunk.text.length / 900);
}

function sourceHeader(v: VaultItem, chunk: Chunk) {
  return [
    `Source: [${v.filename}]`,
    v.blobId ? `blobId: ${v.blobId}` : '',
    `chunk: ${chunk.index}`,
    `chars: ${chunk.start}-${chunk.end}`,
    v.txDigest ? `txDigest: ${v.txDigest}` : '',
  ].filter(Boolean).join(' | ');
}

// Lightweight retrieval for vault Q&A: include EVERY file's summary (breadth),
// but only the full content of the top-k files relevant to the question (depth).
// Keeps the prompt small and fast instead of stuffing every file's full text.
export function selectVaultDocs(vault: VaultItem[], question: string, k = 5): RetrievedDoc[] {
  const terms = termsFor(question);
  const totalBudget = 16000;

  // IDF: weight rarer query terms higher — a term in few files is far more
  // discriminating than one in every file (lexical stand-in for semantics).
  const N = Math.max(1, vault.length);
  const idf: Record<string, number> = {};
  for (const t of terms) {
    const df = vault.reduce((n, v) => n + (`${v.filename} ${v.summary || ''} ${(v.tags || []).join(' ')} ${v.content || ''}`.toLowerCase().includes(t) ? 1 : 0), 0);
    idf[t] = Math.log(1 + N / (df + 0.5));
  }
  const w = (t: string) => idf[t] ?? 1;

  const score = (v: VaultItem): ScoredVaultItem => {
    const fn = v.filename.toLowerCase();
    const sum = (v.summary || '').toLowerCase();
    const tags = (v.tags || []).join(' ').toLowerCase();
    const body = (v.content || '').toLowerCase();
    let fileScore = 0;
    for (const t of terms) {
      if (fn.includes(t)) fileScore += 8 * w(t);
      if (tags.includes(t)) fileScore += 6 * w(t);
      fileScore += countTerm(sum, t) * 4 * w(t);
      fileScore += Math.min(countTerm(body, t), 12) * w(t);
    }
    const chunks = splitChunks(v.content || '')
      .map(chunk => ({ ...chunk, score: scoreChunk(chunk, terms, idf) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .filter(c => c.score > 0 || fileScore > 0)
      .map(c => c);
    return { v, score: fileScore, chunks };
  };

  const ranked = vault.map(score).sort((a, b) => b.score - a.score);
  const include = new Map(ranked.slice(0, k).map(r => [r.v.id, r.chunks]));
  let remaining = totalBudget;

  // Preserve original order (stable FILE numbering); attach relevant passages only for top-k.
  return vault.map(v => ({
    filename: v.filename,
    summary: v.summary || '',
    content: (() => {
      if (!include.has(v.id) || remaining <= 0) return '';
      const chunks = include.get(v.id) || [];
      const fallback: Chunk = { text: (v.content || '').slice(0, 2500), index: 1, start: 0, end: Math.min((v.content || '').length, 2500), score: 0 };
      const passages = (chunks.length ? chunks : [fallback]).map(chunk => `${sourceHeader(v, chunk)}\n${chunk.text}`);
      const text = passages.join('\n\n--- relevant passage ---\n\n').slice(0, remaining);
      remaining -= text.length;
      return text;
    })(),
    blobId: v.blobId,
    fileType: v.fileType,
    sizeBytes: v.sizeBytes,
    owner: v.owner,
    txDigest: v.txDigest,
    entryId: v.entryId,
    listingId: v.listingId,
    priceMist: v.priceMist,
    listed: v.listed,
    purchased: v.purchased,
    tags: v.tags,
    uploadedAt: v.uploadedAt,
    encrypted: v.encrypted,
    sealId: v.sealId,
    sealPolicyId: v.sealPolicyId,
    ciphertextSizeBytes: v.ciphertextSizeBytes,
    decryptedAt: v.decryptedAt,
  }));
}
