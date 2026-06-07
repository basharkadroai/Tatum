// Testnet-native "Walrus Memory" — the same idea as Mysten's MemWal (portable,
// verifiable AI-agent memory on Walrus), built on our own Walrus stack so it
// runs on testnet today. Memories are kept per wallet, backed up to Walrus
// (portable + verifiable by blob id), and recalled by relevance to feed the
// agent's `memory` context. The official @mysten-incubation/memwal SDK can be
// swapped in behind an env flag once we move to mainnet (its relayer is
// mainnet-only today).
import { WALRUS_AGGREGATOR } from '@/lib/network';

export type MemoryItem = { id: string; text: string; ts: number };

const KEY = (a: string) => `chainmind_memory_${a.toLowerCase()}`;
const BLOB = (a: string) => `chainmind_memory_blob_${a.toLowerCase()}`;
const MAX = 200;

const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'are', 'was', 'this', 'that', 'with', 'what', 'who', 'how', 'can', 'from', 'have', 'has', 'will', 'about', 'they', 'their', 'our', 'out', 'not', 'but', 'all', 'any', 'its', 'his', 'her', 'them', 'then', 'than', 'when', 'where', 'which', 'were', 'been', 'into', 'just', 'like', 'get', 'got', 'user', 'users']);
function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !STOP.has(w));
}
// Loose match so e.g. "preferences" ~ "prefers" (shared 4-char prefix) — a cheap
// stand-in for embeddings until the mainnet MemWal relayer (real semantic search).
function tokenMatch(a: string, b: string): boolean {
  return a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))));
}
// BM25 relevance over the memory set: rewards rare query terms (IDF) and
// saturates repeated hits — far better ranking than raw overlap, no API needed.
function bm25Scores(queryTokens: string[], docs: string[][]): number[] {
  const N = docs.length || 1;
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N || 1;
  const k1 = 1.5, b = 0.75;
  const df: Record<string, number> = {};
  for (const t of queryTokens) df[t] = docs.reduce((n, d) => n + (d.some(x => tokenMatch(t, x)) ? 1 : 0), 0);
  return docs.map(d => {
    let s = 0;
    for (const t of queryTokens) {
      const f = d.filter(x => tokenMatch(t, x)).length;
      if (!f) continue;
      const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.length / avgdl)));
    }
    return s;
  });
}

export function loadMemories(addr?: string): MemoryItem[] {
  if (!addr || typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY(addr)) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function persistLocal(addr: string, items: MemoryItem[]) {
  try { localStorage.setItem(KEY(addr), JSON.stringify(items)); } catch { /* quota */ }
}

// Back the full memory set up to Walrus (portable + verifiable). Best-effort.
export async function backupToWalrus(addr: string, items: MemoryItem[]): Promise<string | null> {
  try {
    const res = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memories: items }) });
    const d = await res.json();
    if (d.blobId && typeof window !== 'undefined') localStorage.setItem(BLOB(addr), d.blobId);
    return d.blobId ?? null;
  } catch { return null; }
}

export function memoryBlobId(addr?: string): string | null {
  if (!addr || typeof window === 'undefined') return null;
  return localStorage.getItem(BLOB(addr));
}

// Store a memory (deduped) and back the set up to Walrus.
export async function remember(addr: string, text: string): Promise<void> {
  const t = text.trim();
  if (!addr || t.length < 4) return;
  const items = loadMemories(addr);
  if (items.some(m => m.text.toLowerCase() === t.toLowerCase())) return;
  const next = [{ id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())), text: t.slice(0, 400), ts: Date.now() }, ...items].slice(0, MAX);
  persistLocal(addr, next);
  await backupToWalrus(addr, next);
}

// Recall the memories most relevant to a query (semantic-ish token overlap).
export function recall(addr: string, query: string, k = 5): MemoryItem[] {
  const items = loadMemories(addr);
  if (!items.length) return [];
  if (!query.trim()) return items.slice(0, k);
  const q = Array.from(new Set(tokenize(query)));
  const scores = bm25Scores(q, items.map(m => tokenize(m.text)));
  const ranked = items.map((m, i) => ({ m, s: scores[i] })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return (ranked.length ? ranked.map(x => x.m) : items).slice(0, k);
}

export function recallText(addr: string, query: string, k = 5): string {
  return recall(addr, query, k).map(m => `- ${m.text}`).join('\n');
}

// On load, merge the Walrus-backed memory set into local (portability).
export async function restoreFromWalrus(addr: string): Promise<void> {
  const blobId = memoryBlobId(addr);
  if (!blobId) return;
  // Walrus reads are eventually-consistent (CDN can briefly 404) — retry w/ backoff.
  const delays = [0, 1200, 2500];
  for (const d of delays) {
    if (d) await new Promise(r => setTimeout(r, d));
    try {
      const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const remote = JSON.parse(await res.text()) as MemoryItem[];
      if (!Array.isArray(remote)) return;
      const byText = new Map(loadMemories(addr).map(m => [m.text.toLowerCase(), m]));
      for (const m of remote) if (m?.text && !byText.has(m.text.toLowerCase())) byText.set(m.text.toLowerCase(), m);
      persistLocal(addr, [...byText.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX));
      return;
    } catch { /* transient — retry */ }
  }
}

// Heuristic: does a user message state a durable fact/preference worth remembering?
export function looksMemorable(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 400 || t.includes('?')) return false;
  // Don't store questions or commands as "memories" (e.g. "What do you know about my wallet",
  // "check our mcp") — only genuine statements of fact/preference.
  if (/^(what|how|why|when|where|who|which|whose|can|could|would|should|do|does|did|is|are|am|was|were|will|tell me|show me|find|search|list|check|give me|explain|help|describe)\b/i.test(t)) return false;
  return /\b(i\s?am|i'?m|my|we\s?are|we'?re|our|i\s(like|prefer|use|want|need|love|hate|own|build|work)|call me|remember (that|this)|note that|always|never|favorite|favourite)\b/i.test(t);
}
