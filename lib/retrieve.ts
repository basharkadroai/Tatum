import type { VaultItem } from '@/types/vault';

export type RetrievedDoc = { filename: string; summary: string; content: string };

// Lightweight retrieval for vault Q&A: include EVERY file's summary (breadth),
// but only the full content of the top-k files relevant to the question (depth).
// Keeps the prompt small and fast instead of stuffing every file's full text.
export function selectVaultDocs(vault: VaultItem[], question: string, k = 5): RetrievedDoc[] {
  const terms = Array.from(new Set((question.toLowerCase().match(/[a-z0-9]{3,}/g) || [])));

  const score = (v: VaultItem): number => {
    const fn = v.filename.toLowerCase();
    const sum = (v.summary || '').toLowerCase();
    const tags = (v.tags || []).join(' ').toLowerCase();
    const body = (v.content || '').slice(0, 4000).toLowerCase();
    let s = 0;
    for (const t of terms) {
      if (fn.includes(t)) s += 3;
      if (tags.includes(t)) s += 3;
      s += (sum.split(t).length - 1) * 2;
      s += Math.min(body.split(t).length - 1, 5);
    }
    return s;
  };

  const ranked = vault.map(v => ({ v, s: score(v) })).sort((a, b) => b.s - a.s);
  const includeIds = new Set(ranked.slice(0, k).map(r => r.v.id));

  // Preserve original order (stable FILE numbering); attach content only for top-k.
  return vault.map(v => ({
    filename: v.filename,
    summary: v.summary || '',
    content: includeIds.has(v.id) ? (v.content || '') : '',
  }));
}
