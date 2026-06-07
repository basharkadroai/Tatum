'use client';
import { useState, useEffect } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSignPersonalMessage, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { VaultItem } from '@/types/vault';
import { runUpload, analyzeFile } from '@/lib/upload';
import { SUI_CHAIN_ID, WALRUS_AGGREGATOR } from '@/lib/network';
import { buildEncryptedSealApprovalTxBytes, makeSealClient, makeSessionKey, sealDecrypt } from '@/lib/seal';
import { WalletProfile } from '@/components/WalletProfile';
import { WalrusProof } from '@/components/WalrusProof';
import { ChatPanel } from '@/components/ChatPanel';
import { FileListItem } from '@/components/FileListItem';
import { HomeBackground } from '@/components/HomeBackground';
import { MarketplaceView } from '@/components/MarketplaceView';
import { ContentCoinsView } from '@/components/ContentCoinsView';
import { remember, recallText, restoreFromWalrus, looksMemorable } from '@/lib/walrusMemory';
import { selectVaultDocs } from '@/lib/retrieve';
import { loadAiConfig, type AiConfig } from '@/lib/aiConfig';
import { cleanEnv, envFlag } from '@/lib/env';
import { listingCategory, listingTeaser } from '@/lib/marketListing';
import type { MarketTxEvent } from '@/types/market';
import { PaperclipIcon, CodeXmlIcon } from '@animateicons/react/lucide';
import {
  Database, Link2, X, Check,
  PanelLeft, ChevronDown, Menu, Loader2, SquarePen, ShoppingCart, TrendingUp,
} from 'lucide-react';

const PACKAGE_ID = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID);
// Functions added in the on-chain UPGRADE (list/buy/delist) live at the upgraded
// package id; `register` + all TYPE filters stay on the original id (type identity
// is preserved across upgrades). Falls back to the original id if unset.
const PACKAGE_LATEST = cleanEnv(process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST) || PACKAGE_ID;
const SEAL_UPLOADS_ENABLED = envFlag(process.env.NEXT_PUBLIC_SEAL_UPLOADS);

const STORAGE_KEY = 'chainmind_vault';
const TOMBSTONE_KEY = 'chainmind_vault_tombstones';
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
type VaultTombstone = { blobId?: string; entryId?: string; deletedAt: number };

function agentDoc(item: VaultItem) {
  return {
    filename: item.filename,
    summary: item.summary,
    content: item.content,
    blobId: item.blobId,
    fileType: item.fileType,
    sizeBytes: item.sizeBytes,
    owner: item.owner,
    txDigest: item.txDigest,
    entryId: item.entryId,
    listingId: item.listingId,
    priceMist: item.priceMist,
    listed: item.listed,
    purchased: item.purchased,
    encrypted: item.encrypted,
    sealId: item.sealId,
    sealPolicyId: item.sealPolicyId,
    ciphertextSizeBytes: item.ciphertextSizeBytes,
    decryptedAt: item.decryptedAt,
  };
}

function loadVault(): VaultItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveVault(items: VaultItem[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
function loadTombstones(): VaultTombstone[] {
  if (typeof window === 'undefined') return [];
  try {
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    const raw = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(t => Number(t?.deletedAt) > cutoff) : [];
  } catch {
    return [];
  }
}
function saveTombstone(item: VaultItem) {
  const tombstone = { blobId: item.blobId, entryId: item.entryId, deletedAt: Date.now() };
  const next = [tombstone, ...loadTombstones()]
    .filter((t, index, arr) => index === arr.findIndex(other => other.blobId === t.blobId && other.entryId === t.entryId))
    .slice(0, 200);
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(next));
}
function isTombstoned(entry: { blobId?: string; entryId?: string }) {
  return loadTombstones().some(t => (entry.blobId && t.blobId === entry.blobId) || (entry.entryId && t.entryId === entry.entryId));
}
async function preflightMarket(body: Record<string, unknown>) {
  const res = await fetch('/api/market/preflight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'Marketplace safety check failed.');
}

// Pull a text blob's content back from Walrus so restored files are queryable.
async function fetchWalrusText(blobId: string, fileType: string, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const textual = fileType.startsWith('text/') || ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'xml', 'yaml', 'yml', ...CODE_EXTS].includes(ext);
  if (!textual) return '';
  try {
    const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    if (!res.ok) return '';
    return (await res.text()).slice(0, 12000);
  } catch { return ''; }
}

const CODE_EXTS = ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'scss', 'sh', 'json', 'xml', 'yaml', 'yml', 'sql'];
// Animated file icons (self-animating via isAnimated — not hover). The library
// has no per-type file glyphs, so we use an animated CodeXml for code files and
// an animated Paperclip for everything else.
function FileIcon({ name, size = 18, animated = false }: { type?: string; name: string; size?: number; animated?: boolean }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const Cmp = CODE_EXTS.includes(ext) ? CodeXmlIcon : PaperclipIcon;
  return <Cmp size={size} color="var(--text-2)" isAnimated={animated} />;
}
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function selectMemoryContext(vault: VaultItem[]) {
  return vault
    .filter(item => /memory|preference|profile|strategy|context/i.test(item.filename))
    .slice(0, 5)
    .map(item => [
      `# ${item.filename}`,
      item.summary ? `summary: ${item.summary}` : '',
      item.content ? `content:\n${item.content.slice(0, 1800)}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n')
    .slice(0, 8000);
}
function suiToMist(input: string): string | null {
  const clean = input.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  const mist = BigInt(whole) * BigInt(1_000_000_000) + BigInt((fraction + '000000000').slice(0, 9));
  return mist > BigInt(0) ? mist.toString() : null;
}

export default function Home() {
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [selected, setSelected] = useState<VaultItem | null>(null);
  const [showMarket, setShowMarket] = useState(false); // marketplace view (in-app, no chat)
  const [showCoins, setShowCoins] = useState(false); // content-coins view (in-app, no chat)
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [proofExpanded, setProofExpanded] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [vaultListScrolled, setVaultListScrolled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [homeEmpty, setHomeEmpty] = useState(true);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreAddr, setRestoreAddr] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');
  const [marketPrice, setMarketPrice] = useState('0.1');
  const [saleKind, setSaleKind] = useState<'nft' | 'license'>('nft'); // sell once (NFT) vs sell copies (license)
  const [marketTitle, setMarketTitle] = useState('');
  const [marketCategory, setMarketCategory] = useState('Knowledge');
  const [marketDescription, setMarketDescription] = useState('');
  const [marketTeaser, setMarketTeaser] = useState('');
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketMsg, setMarketMsg] = useState('');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [chatRestoreTick, setChatRestoreTick] = useState(0); // bumped after chat history is restored from chain → remount the home chat

  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  useEffect(() => { setVault(loadVault()); setLoaded(true); setAiConfig(loadAiConfig()); }, []);
  // Refresh the sidebar when the vault changes elsewhere (e.g. a marketplace
  // Restore this wallet's Walrus-backed agent memory (portable across devices).
  useEffect(() => { if (account?.address) void restoreFromWalrus(account.address); }, [account?.address]);

  // purchase writes the bought item to localStorage and fires this event).
  useEffect(() => {
    const onVaultUpdated = () => setVault(loadVault());
    window.addEventListener('chainmind:vault-updated', onVaultUpdated);
    return () => window.removeEventListener('chainmind:vault-updated', onVaultUpdated);
  }, []);
  function updateAiConfig(c: AiConfig | null) { setAiConfig(c); }
  // New chat: clear the main vault conversation (and its saved history) and go home.
  function newChat() {
    // Leave an empty marker (not removeItem) so restore-from-chain treats this as
    // an intentional clear and doesn't resurrect the old chat from its Walrus backup.
    try { localStorage.setItem('chainmind_chat_home', '[]'); } catch { /* ignore */ }
    setSelected(null);
    setShowMarket(false);
    setShowCoins(false);
    setMobileNavOpen(false);
    setChatRestoreTick(t => t + 1); // remount the home chat so it loads empty
  }
  // On phones the sidebar becomes a slide-in drawer; keep its content expanded
  // and let `mobileNavOpen` control visibility.
  useEffect(() => {
    const apply = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) { setSidebarOpen(true); } else { setMobileNavOpen(false); }
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
  useEffect(() => { setSummaryExpanded(true); setProofExpanded(false); setClaimMsg(''); setMarketMsg(''); }, [selected?.id]);
  // Auto-read a file with AI when opened if it has no real summary yet (e.g. just
  // restored from chain) — so it's ready before the user reads or asks anything.
  useEffect(() => {
    if (selected && needsAnalysis(selected) && analyzingId !== selected.id) {
      analyzeRestoredFile(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.summary, selected?.filename, selected?.fileType, selected?.encrypted]);

  // Reconstruct the files OWNED by an address on-chain (VaultEntry objects, read
  // from Sui via Tatum) and pull their content back from Walrus. Read-only — no
  // signing — so a vault can be restored anywhere from just the owner address.
  async function restoreFromChain(owner: string): Promise<number> {
    try {
      const res = await fetch(`/api/vault-onchain?owner=${owner.trim()}`);
      const { entries } = await res.json();
      if (!Array.isArray(entries) || entries.length === 0) return 0;

      // Chat-history backups are hidden VaultEntries (filename starts with ".chat").
      // Replay the latest snapshot per chat into localStorage so chats are portable.
      const chatEntries = entries.filter((e: { filename?: string }) => typeof e.filename === 'string' && e.filename.startsWith('.chat'));
      const fileEntries = entries.filter((e: { filename?: string }) => !(typeof e.filename === 'string' && e.filename.startsWith('.chat')));
      const canRestoreChat = !!account?.address && account.address.toLowerCase() === owner.trim().toLowerCase();
      if (chatEntries.length && canRestoreChat) {
        const latest: Record<string, { ts: number; messages: unknown }> = {};
        for (const e of chatEntries) {
          try {
            const r = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${e.blobId}`);
            if (!r.ok) continue;
            const data = JSON.parse(await r.text());
            if (data?.key && Array.isArray(data.messages)) {
              const ts = Number(data.ts) || 0;
              if (!latest[data.key] || ts > latest[data.key].ts) latest[data.key] = { ts, messages: data.messages };
            }
          } catch { /* skip a bad blob */ }
        }
        let wrote = false;
        for (const key of Object.keys(latest)) {
          try {
            const existing = localStorage.getItem(key);
            // Only restore a chat that has NO local entry at all. A present entry —
            // even an empty "[]" — means this device already has state, including an
            // intentional "New chat" clear, so don't clobber/resurrect it.
            if (existing === null) { localStorage.setItem(key, JSON.stringify(latest[key].messages)); wrote = true; }
          } catch { /* ignore */ }
        }
        if (wrote) setChatRestoreTick(t => t + 1);
      }

      const fresh: VaultItem[] = [];
      setVault(prev => {
        const have = new Set(prev.map(i => i.blobId));
        for (const e of fileEntries) {
          if (have.has(e.blobId)) continue;
          if (isTombstoned({ blobId: e.blobId, entryId: e.entryId })) continue;
          fresh.push({
            id: crypto.randomUUID(),
            filename: e.filename, fileType: e.fileType, blobId: e.blobId,
            summary: e.encrypted
              ? 'Encrypted with Seal. Open with the owner wallet to decrypt and analyze.'
              : 'Restored from the on-chain vault (Sui + Walrus).',
            content: '', txDigest: e.txDigest, entryId: e.entryId, owner: e.owner,
            encrypted: !!e.encrypted, sealId: e.sealId, sealPolicyId: e.sealPolicyId,
            tags: [], questions: [], uploadedAt: new Date().toISOString(), sizeBytes: e.sizeBytes,
          });
        }
        if (fresh.length === 0) return prev;
        const next = [...fresh, ...prev];
        saveVault(next);
        return next;
      });
      for (const item of fresh) {
        if (item.encrypted) continue;
        const content = await fetchWalrusText(item.blobId, item.fileType, item.filename);
        if (content) updateItem(item.id, { content });
      }
      return fresh.length;
    } catch { return 0; }
  }

  // Auto-restore when a wallet connects.
  useEffect(() => {
    if (account?.address) restoreFromChain(account.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address]);
  useEffect(() => {
    if (!selected) return;
    const category = listingCategory(selected.filename, selected.fileType);
    setMarketTitle(selected.filename.replace(/\.[^.]+$/, ''));
    setMarketCategory(category);
    setMarketDescription((selected.summary || '').slice(0, 280));
    setMarketTeaser(listingTeaser(selected.filename, selected.fileType, !!selected.encrypted));
  }, [selected?.id]);

  async function doRestore() {
    const addr = restoreAddr.trim();
    if (!addr || restoring) return;
    setRestoring(true);
    setRestoreMsg('');
    const n = await restoreFromChain(addr);
    setRestoreMsg(n > 0 ? `Restored ${n} file${n === 1 ? '' : 's'} from chain.` : 'No on-chain files found for that address.');
    setRestoring(false);
    if (n > 0) setRestoreAddr('');
  }

  // Add an uploaded file to the vault without switching the view (the chat
  // keeps showing the upload narration).
  function addToVault(item: VaultItem) {
    setVault(prev => { const next = [item, ...prev]; saveVault(next); return next; });
  }
  function handleDelete(id: string) {
    setVault(prev => {
      const item = prev.find(i => i.id === id);
      if (item) saveTombstone(item);
      const next = prev.filter(i => i.id !== id);
      saveVault(next);
      return next;
    });
    if (selected?.id === id) setSelected(null);
    try { localStorage.removeItem(`chainmind_chat_${id}`); } catch { /* ignore */ }
  }
  // Open the file referenced by a [citation] pill. Labels are normally the exact
  // filename; we also handle a bare "FILE N" (index into the current vault order).
  function openCitedFile(label: string) {
    const raw = label.trim();
    const numOnly = raw.match(/^file\s*(\d+)$/i);
    if (numOnly) {
      const item = vault[parseInt(numOnly[1], 10) - 1];
      if (item) { setSelected(item); return; }
    }
    const name = raw.replace(/^\s*file\s*\d+\s*:\s*/i, '').trim().toLowerCase();
    const hit = vault.find(v => v.filename.toLowerCase() === name)
      || vault.find(v => v.filename.toLowerCase().includes(name) || name.includes(v.filename.toLowerCase()));
    if (hit) setSelected(hit);
  }
  function updateItem(id: string, patch: Partial<VaultItem>) {
    setVault(prev => {
      const next = prev.map(i => (i.id === id ? { ...i, ...patch } : i));
      saveVault(next);
      return next;
    });
    setSelected(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  // A restored file has no real AI summary yet (placeholder) — offer to read it.
  function needsAnalysis(item: VaultItem) {
    if (item.encrypted && !item.content) return true;
    const s = (item.summary || '').toLowerCase();
    return !s || s.startsWith('restored from') || s.startsWith('no readable');
  }
  async function decryptRestoredFile(item: VaultItem): Promise<File> {
    if (!account?.address) throw new Error('Connect the owner wallet to decrypt this Seal-encrypted file.');
    if (!PACKAGE_ID || !PACKAGE_LATEST) throw new Error('Seal package is not configured.');
    if (!item.entryId || !item.sealPolicyId || !item.sealId) throw new Error('Encrypted vault metadata is incomplete. Restore this file again after the Seal upgrade is live.');
    if (item.owner && item.owner.toLowerCase() !== account.address.toLowerCase()) throw new Error('This wallet does not own the encrypted vault entry.');

    const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${item.blobId}`);
    if (!res.ok) throw new Error(`Walrus ${res.status}`);
    const ciphertext = new Uint8Array(await (await res.blob()).arrayBuffer());
    const sealClient = makeSealClient(suiClient);
    const sessionKey = await makeSessionKey(
      suiClient,
      account.address,
      PACKAGE_ID,
      async (message) => {
        const signed = await signPersonalMessage({ message, chain: SUI_CHAIN_ID });
        return signed.signature;
      },
    );
    const txBytes = await buildEncryptedSealApprovalTxBytes({
      suiClient,
      approvalPackageId: PACKAGE_LATEST,
      sender: account.address,
      entryId: item.entryId,
      policyId: item.sealPolicyId,
      sealId: item.sealId,
    });
    const plaintext = await sealDecrypt(sealClient, sessionKey, txBytes, ciphertext);
    return new File([plaintext.slice().buffer as ArrayBuffer], item.filename, { type: item.fileType || 'application/octet-stream' });
  }
  // Fetch the blob back from Walrus and run the AI analysis to fill in the
  // summary/tags/content for a restored (or unanalyzed) file.
  async function analyzeRestoredFile(item: VaultItem) {
    if (analyzingId === item.id) return;
    setAnalyzingId(item.id);
    try {
      let file: File;
      if (item.encrypted) {
        file = await decryptRestoredFile(item);
      } else {
        const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${item.blobId}`);
        if (!res.ok) throw new Error(`Walrus ${res.status}`);
        const blob = await res.blob();
        file = new File([blob], item.filename, { type: item.fileType || blob.type || 'application/octet-stream' });
      }
      const a = await analyzeFile(file);
      updateItem(item.id, {
        summary: a.summary,
        tags: a.tags,
        questions: a.questions,
        content: (a.content || item.content || '').slice(0, 12000),
        decryptedAt: item.encrypted ? new Date().toISOString() : item.decryptedAt,
      });
    } catch (err) {
      updateItem(item.id, { summary: item.encrypted
        ? String(err instanceof Error ? err.message : err)
        : 'Could not read this file from Walrus — please try again.' });
    } finally {
      setAnalyzingId(null);
    }
  }

  // Optional: let the user record the file under THEIR own wallet address on Sui.
  async function claimOnChain(item: VaultItem) {
    if (!account || !PACKAGE_ID || claiming) return;
    setClaiming(true);
    setClaimMsg('');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::vault::register`,
        arguments: [
          tx.pure.string(item.blobId),
          tx.pure.string(item.filename),
          tx.pure.string(item.fileType || 'application/octet-stream'),
          tx.pure.u64(item.sizeBytes),
          tx.pure.address(account.address), // recipient — the 5th arg register() requires
        ],
      });
      console.log('[claim] signing on', SUI_CHAIN_ID, 'wallet', account.address);
      const res = await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      console.log('[claim] success', res.digest);
      let entryId: string | undefined;
      try {
        const verify = await fetch('/api/verify-chain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ digest: res.digest, blobId: item.blobId }),
        });
        const data = await verify.json();
        if (data?.entryId) entryId = String(data.entryId);
      } catch { /* best effort */ }
      updateItem(item.id, { txDigest: res.digest, entryId, owner: account.address });
      setClaimMsg('Claimed — you now own this on-chain');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Surface the real error so we can diagnose (was previously hidden)
      console.error('[claim] FAILED:', raw);
      try { console.error('[claim] detail:', JSON.stringify(err, Object.getOwnPropertyNames(err as object))); } catch {}
      const low = raw.toLowerCase();
      if (low.includes('password') || low.includes('set up') || low.includes('forbidden')) {
        setClaimMsg('Wallet not set up for app signing (use a seed-phrase account). File is already on-chain via Tatum.');
      } else if (low.includes('reject') || low.includes('cancel') || low.includes('denied')) {
        setClaimMsg('You declined the signature. File is already on-chain via Tatum.');
      } else {
        setClaimMsg(`Claim error: ${raw.slice(0, 110)}`);
      }
    } finally {
      setClaiming(false);
    }
  }

  async function marketEvents(digest: string): Promise<MarketTxEvent[]> {
    try {
      const res = await fetch(`/api/market/tx?digest=${encodeURIComponent(digest)}`);
      const data = await res.json();
      return Array.isArray(data.events) ? data.events : [];
    } catch {
      return [];
    }
  }

  async function listOnMarket(item: VaultItem) {
    if (!account || !PACKAGE_ID || marketBusy) return;
    if (!item.entryId) {
      setMarketMsg('Claim or restore this file first so ChainMind knows its on-chain object.');
      return;
    }
    const priceMist = suiToMist(marketPrice);
    if (!priceMist) {
      setMarketMsg('Enter a price greater than 0 SUI.');
      return;
    }
    const title = marketTitle.trim() || item.filename;
    const category = marketCategory.trim() || listingCategory(item.filename, item.fileType);
    const description = marketDescription.trim().slice(0, 500);
    const teaser = marketTeaser.trim().slice(0, 220) || listingTeaser(item.filename, item.fileType, !!item.encrypted);
    setMarketBusy(true);
    setMarketMsg('');
    try {
      await preflightMarket({
        action: 'market.list',
        owner: account.address,
        entryId: item.entryId,
        priceMist,
      });
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_LATEST}::vault::list_with_metadata`,
        arguments: [
          tx.object(item.entryId),
          tx.pure.u64(priceMist),
          tx.pure.string(title.slice(0, 120)),
          tx.pure.string(description),
          tx.pure.string(category.slice(0, 40)),
          tx.pure.string(teaser),
        ],
      });
      const res = await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      const listed = (await marketEvents(res.digest)).find(e => e.kind === 'listed');
      updateItem(item.id, {
        listed: true,
        listingId: listed?.listingId,
        priceMist,
        txDigest: res.digest,
      });
      setMarketMsg('Listed on the marketplace.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setMarketMsg(`List failed: ${raw.slice(0, 120)}`);
    } finally {
      setMarketBusy(false);
    }
  }

  // Sell-many: open a license offer (seller keeps the original; each buy mints a
  // copy). Doesn't need an on-chain entry — references the Walrus blob directly.
  async function openLicenseSale(item: VaultItem) {
    if (!account || !PACKAGE_LATEST || marketBusy) return;
    if (!item.blobId) { setMarketMsg('This file has no Walrus blob yet.'); return; }
    const priceMist = suiToMist(marketPrice);
    if (!priceMist) { setMarketMsg('Enter a price greater than 0 SUI.'); return; }
    setMarketBusy(true);
    setMarketMsg('');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_LATEST}::vault::open_license_sale`,
        arguments: [
          tx.pure.string(item.blobId),
          tx.pure.string((item.filename || 'file').slice(0, 120)),
          tx.pure.string(item.fileType || 'application/octet-stream'),
          tx.pure.u64(BigInt(item.sizeBytes || 0)),
          tx.pure.u64(priceMist),
        ],
      });
      await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      setMarketMsg('Listed as licenses — sells unlimited copies; you keep the original.');
    } catch (err) {
      setMarketMsg(`License listing failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`);
    } finally {
      setMarketBusy(false);
    }
  }

  async function delistFromMarket(item: VaultItem) {
    if (!account || !PACKAGE_ID || marketBusy) return;
    if (!item.listingId) {
      setMarketMsg('No listing ID saved for this file yet.');
      return;
    }
    setMarketBusy(true);
    setMarketMsg('');
    try {
      await preflightMarket({
        action: 'market.delist',
        owner: account.address,
        listingId: item.listingId,
      });
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_LATEST}::vault::delist`,
        arguments: [tx.object(item.listingId)],
      });
      const res = await signAndExecute({ transaction: tx, chain: SUI_CHAIN_ID });
      const delisted = (await marketEvents(res.digest)).find(e => e.kind === 'delisted');
      updateItem(item.id, {
        listed: false,
        listingId: undefined,
        entryId: delisted?.entryId || item.entryId,
        txDigest: res.digest,
      });
      setMarketMsg('Listing cancelled and returned to your vault.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setMarketMsg(`Delist failed: ${raw.slice(0, 120)}`);
    } finally {
      setMarketBusy(false);
    }
  }

  const filtered = vault;
  const totalBytes = vault.reduce((sum, i) => sum + (i.sizeBytes || 0), 0);
  const memoryContext = selectMemoryContext(vault);
  // Walrus-backed agent memory: remember durable things the user says, and
  // recall the most relevant ones into the agent's memory context per question.
  const buildAgentMemory = (question: string) => {
    const addr = account?.address;
    if (addr && looksMemorable(question)) void remember(addr, question);
    const recalled = addr ? recallText(addr, question) : '';
    return [memoryContext, recalled && `What you remember about this user (stored on Walrus):\n${recalled}`].filter(Boolean).join('\n\n');
  };
  const sidebarExpanded = isMobile || sidebarOpen;
  const hasVault = vault.length > 0;
  const sidebarEase = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const selectedOwnedByWallet = !!(selected?.owner && account?.address && selected.owner.toLowerCase() === account.address.toLowerCase());
  const selectedSealReady = !!(selected?.encrypted && selected.entryId && selected.sealId && selected.sealPolicyId);
  const selectedSealVerified = !!(selected?.encrypted && selected.decryptedAt);
  const selectedSealStatus = selectedSealVerified
    ? 'Seal access verified'
    : selectedSealReady
      ? 'Seal access ready'
      : 'Seal metadata incomplete';
  const restoreMenu = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <input
        value={restoreAddr}
        onChange={e => setRestoreAddr(e.target.value)}
        onFocus={() => { if (!restoreAddr && account?.address) setRestoreAddr(account.address); }}
        onKeyDown={e => { if (e.key === 'Enter') doRestore(); }}
        placeholder="Owner address 0x..."
        style={{ width: '100%', padding: '8px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--text-1)', fontSize: '12px', outline: 'none', fontFamily: 'ui-monospace, monospace' }}
      />
      <button onClick={doRestore} disabled={restoring || !restoreAddr.trim()}
        style={{ width: '100%', padding: '8px 9px', borderRadius: '8px', border: 'none', background: 'var(--purple)', color: 'var(--base)', cursor: restoring ? 'default' : 'pointer', fontSize: '12px', fontWeight: 700, opacity: restoring || !restoreAddr.trim() ? 0.5 : 1 }}>
        {restoring ? 'Restoring...' : 'Restore from chain'}
      </button>
      {restoreMsg && <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '0 2px' }}>{restoreMsg}</p>}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--base)' }}>

      {/* ── Sidebar — icon rail on desktop, slide-in drawer on mobile ── */}
      <aside style={isMobile ? {
        position: 'fixed', top: 0, left: 0, height: '100dvh', width: '280px', maxWidth: '85vw', zIndex: 50,
        transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        willChange: 'transform',
        display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--sidebar-bg)',
        overflow: 'hidden', boxShadow: mobileNavOpen ? '0 0 40px rgba(0,0,0,0.55)' : 'none',
      } : {
        width: sidebarExpanded ? '264px' : '62px', flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)', background: 'var(--sidebar-bg)',
        overflow: 'hidden', transition: `width 0.28s ${sidebarEase}`, willChange: 'width',
      }}>
        {/* Brand + collapse/close toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: sidebarExpanded ? '8px' : 0, padding: sidebarExpanded ? '16px 14px 12px' : '16px 13px 12px', flexShrink: 0, transition: `gap 0.28s ${sidebarEase}, padding 0.28s ${sidebarEase}` }}>
          <button
            onClick={() => { setSelected(null); setShowMarket(false); setShowCoins(false); setMobileNavOpen(false); }}
            title="Home"
            aria-hidden={!sidebarExpanded}
            tabIndex={sidebarExpanded ? 0 : -1}
            style={{
              background: 'none', border: 'none', cursor: sidebarExpanded ? 'pointer' : 'default', padding: 0,
              fontWeight: 700, fontSize: '18px', color: 'var(--text-1)', textAlign: 'left',
              width: sidebarExpanded ? '154px' : 0, opacity: sidebarExpanded ? 1 : 0,
              transform: sidebarExpanded ? 'translateX(0)' : 'translateX(-8px)',
              overflow: 'hidden', whiteSpace: 'nowrap', pointerEvents: sidebarExpanded ? 'auto' : 'none',
              transition: `width 0.28s ${sidebarEase}, opacity 0.16s ease, transform 0.28s ${sidebarEase}`,
            }}
          >
            ChainMind
          </button>
          <button
            onClick={() => { if (isMobile) setMobileNavOpen(false); else setSidebarOpen(o => !o); }}
            title={isMobile ? 'Close menu' : sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '7px', border: 'none', background: 'none', color: 'var(--text-2)', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            {isMobile ? <X size={16} strokeWidth={2} /> : <PanelLeft size={16} strokeWidth={2} />}
          </button>
        </div>

        <div className="sidebar-middle" data-expanded={sidebarExpanded ? 'true' : 'false'}>
          {/* New chat — clears the main conversation and returns home */}
          <div className="sidebar-expanded-panel" data-expanded={sidebarExpanded ? 'true' : 'false'}>
            <div style={{ padding: '4px 14px 6px' }}>
              <button onClick={newChat} title="Start a new chat"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <SquarePen size={15} strokeWidth={2} /> New chat
              </button>
              <button onClick={() => { setShowMarket(true); setShowCoins(false); setSelected(null); setMobileNavOpen(false); }} title="Open the ChainMind marketplace"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', marginTop: '2px', padding: '9px 12px', borderRadius: '8px', border: 'none', background: showMarket ? 'var(--hover)' : 'transparent', color: showMarket ? 'var(--text-1)' : 'var(--text-2)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { if (!showMarket) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; } }}
              >
                <ShoppingCart size={15} strokeWidth={2} /> Marketplace
              </button>
              <button onClick={() => { setShowCoins(true); setShowMarket(false); setSelected(null); setMobileNavOpen(false); }} title="Content coins — tradeable attention markets"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', marginTop: '2px', padding: '9px 12px', borderRadius: '8px', border: 'none', background: showCoins ? 'var(--hover)' : 'transparent', color: showCoins ? 'var(--text-1)' : 'var(--text-2)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { if (!showCoins) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; } }}
              >
                <TrendingUp size={15} strokeWidth={2} /> Content Coins
              </button>
            </div>
          </div>

          {/* File list label + storage stat */}
          {hasVault && (
            <div className="sidebar-expanded-panel" data-expanded={sidebarExpanded ? 'true' : 'false'}>
            <div style={{ padding: '4px 16px 9px', borderBottom: vaultListScrolled ? '1px solid var(--border)' : '1px solid transparent', transition: 'border-color 0.16s ease' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Vault · {vault.length} file{vault.length !== 1 ? 's' : ''}
              </div>
            </div>
            </div>
          )}

          {/* File list — only when expanded. No right padding so the scrollbar sits
              flush against the sidebar's right edge (rows keep their own inner padding). */}
          <div
            onScroll={e => setVaultListScrolled(e.currentTarget.scrollTop > 2)}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 0 12px 8px' }}
          >
            {hasVault && filtered.map(item => (
              <FileListItem
                key={item.id}
                item={item}
                active={selected?.id === item.id}
                onSelect={() => { setSelected(item); setShowMarket(false); setShowCoins(false); setMobileNavOpen(false); }}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>

          {/* Legacy restore control kept hidden while restore lives in the wallet menu. */}
          <div className="sidebar-expanded-panel" data-expanded={sidebarExpanded ? 'true' : 'false'} style={{ display: 'none' }}>
          <div style={{ padding: '8px 10px 0', flexShrink: 0 }}>
              {!restoreOpen ? (
                <button
                  onClick={() => { setRestoreOpen(true); setRestoreAddr(account?.address || ''); setRestoreMsg(''); }}
                  title="Rebuild your vault from Sui + Walrus using an owner address"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
                >
                  <Database size={14} strokeWidth={2} /> Restore
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    value={restoreAddr}
                    onChange={e => setRestoreAddr(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doRestore(); }}
                    placeholder="Owner address 0x…"
                    autoFocus
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', outline: 'none', fontFamily: 'ui-monospace, monospace' }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={doRestore} disabled={restoring || !restoreAddr.trim()}
                      style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', background: 'var(--purple)', color: 'var(--base)', cursor: restoring ? 'default' : 'pointer', fontSize: '12px', fontWeight: 700, opacity: restoring || !restoreAddr.trim() ? 0.5 : 1 }}>
                      {restoring ? 'Restoring…' : 'Restore'}
                    </button>
                    <button onClick={() => { setRestoreOpen(false); setRestoreMsg(''); }}
                      style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px' }}>
                      Cancel
                    </button>
                  </div>
                  {restoreMsg && <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '2px 2px 0' }}>{restoreMsg}</p>}
                </div>
              )}
          </div>
          </div>
        </div>

          {/* Profile (wallet) */}
          <div style={{ padding: sidebarExpanded ? '8px 10px 10px' : '8px 8px 10px', borderTop: '1px solid var(--border)', flexShrink: 0, marginTop: '8px', transition: `padding 0.28s ${sidebarEase}` }}>
            <WalletProfile collapsed={!sidebarExpanded} restoreMenu={restoreMenu} />
          </div>
        </aside>

        {/* Drawer backdrop (mobile) */}
        {isMobile && mobileNavOpen && (
          <div onClick={() => setMobileNavOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
        )}

        {/* ── Main Panel — looping scene behind every state ── */}
        <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--base)' }}>
          <HomeBackground mode={!selected && homeEmpty ? 'hero' : 'chat'} />

          <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Mobile: floating menu button (no header bar) */}
          {isMobile && (
            <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu"
              style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '9px', border: '1px solid var(--border)', background: 'rgba(20,19,17,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: 'var(--text-1)', cursor: 'pointer' }}>
              <Menu size={20} strokeWidth={2} />
            </button>
          )}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {!loaded ? (
            /* Avoid flashing the upload home before localStorage loads */
            <div style={{ flex: 1 }} />
          ) : showMarket ? (
            /* Marketplace — in-app view (sidebar stays, no chat) */
            <div style={{ flex: 1, minHeight: 0 }}>
              <MarketplaceView />
            </div>
          ) : showCoins ? (
            /* Content Coins — in-app view (sidebar stays, no chat) */
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--sidebar-bg)' }}>
              <div style={{ maxWidth: '1180px', width: '100%', margin: '0 auto', padding: '44px 28px 90px' }}>
                <p style={{ margin: 0, color: '#65ca9d', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Content Coins</p>
                <h1 style={{ margin: '8px 0 0', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Trade attention — back the files you believe in.</h1>
                <div style={{ marginTop: '22px' }}><ContentCoinsView /></div>
              </div>
            </div>
          ) : !selected ? (
            /* Home: centered chat over the scene */
            <div style={{ flex: 1, minHeight: 0 }}>
                <ChatPanel
                  key={`home-${chatRestoreTick}`}
                  resetKey="vault"
                  persistKey="chainmind_chat_home"
                  owner={account?.address}
                  centered
                  mobile={isMobile}
                  aiConfig={aiConfig}
                  onAiConfigChange={updateAiConfig}
                  onEmptyChange={setHomeEmpty}
                  onCitation={openCitedFile}
                  greeting={vault.length === 0 ? 'Upload a file to begin' : 'What do you want to know?'}
                  greetingIcon="/logo.png"
                  endpoint="/api/ask-vault"
                  agent
                  buildBody={(question, history) => ({ docs: selectVaultDocs(vault, question), owner: account?.address, memory: buildAgentMemory(question), question, history })}
                  suggestions={vault.length === 0 ? [] : ['What are the common themes across my files?', 'Find anything about deadlines or dates', 'Give me a 3-point summary of everything']}
                  placeholder={vault.length === 0 ? 'Click + to upload your first file…' : 'Ask across your whole vault…'}
                  aiLabel="ChainMind"
                  disabled={vault.length === 0 && !account?.address}
                  uploadRunner={(file, emit) => runUpload(file, emit, account?.address, account?.address && PACKAGE_ID && SEAL_UPLOADS_ENABLED ? { enabled: true, suiClient, packageId: PACKAGE_ID } : undefined)}
                  onUploaded={addToVault}
                />
            </div>
          ) : (
            /* File detail + Q&A */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

              {/* File header */}
              <div style={{ padding: '14px 24px', paddingLeft: isMobile ? '58px' : '24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, background: 'rgba(26,25,23,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <span style={{ display: 'flex', flexShrink: 0 }}><FileIcon type={selected.fileType} name={selected.filename} size={22} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected.filename}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--text-3)' }}>
                    <span><span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{formatBytes(selected.sizeBytes)}</span></span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>Uploaded {formatDate(selected.uploadedAt)}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--mint-dark)', fontWeight: 600 }}>
                      <Check size={12} strokeWidth={2.5} /> Stored on Walrus
                    </span>
                    {selectedOwnedByWallet ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--mint-dark)', fontWeight: 600 }}>
                        <Check size={12} strokeWidth={2.5} /> Owned by you on Sui
                      </span>
                    ) : selected.owner ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-3)', fontWeight: 600 }}>
                        <Check size={12} strokeWidth={2.5} /> Owned on Sui
                      </span>
                    ) : selected.txDigest ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--mint-dark)', fontWeight: 600 }}>
                        <Check size={12} strokeWidth={2.5} /> Recorded on Sui
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-3)' }}>Recording on Sui…</span>
                    )}
                  </div>
                  {claimMsg && (
                    <p style={{ fontSize: '11px', marginTop: '4px', color: claimMsg.startsWith('Claimed') ? 'var(--mint-dark)' : 'var(--error)' }}>{claimMsg}</p>
                  )}
                  {marketMsg && (
                    <p style={{ fontSize: '11px', marginTop: '4px', color: marketMsg.startsWith('Listed') || marketMsg.startsWith('Listing cancelled') ? 'var(--mint-dark)' : 'var(--error)' }}>{marketMsg}</p>
                  )}
                  {selectedOwnedByWallet && (
                    <div style={{ display: 'grid', gap: '8px', marginTop: '9px' }}>
                      {!selected.listed ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 92px', gap: '8px' }}>
                            <input
                              value={marketTitle}
                              onChange={e => setMarketTitle(e.target.value)}
                              title="Marketplace title"
                              placeholder="Listing title"
                              maxLength={120}
                              style={{ minWidth: 0, padding: '8px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', fontWeight: 700, outline: 'none' }}
                            />
                            <input
                              value={marketPrice}
                              onChange={e => setMarketPrice(e.target.value)}
                              title="Sale price in SUI"
                              inputMode="decimal"
                              style={{ width: '92px', padding: '8px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', fontWeight: 700, outline: 'none' }}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '126px minmax(0, 1fr)', gap: '8px' }}>
                            <select
                              value={marketCategory}
                              onChange={e => setMarketCategory(e.target.value)}
                              title="Marketplace category"
                              style={{ minWidth: 0, padding: '8px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', fontWeight: 700, outline: 'none' }}
                            >
                              {['AI skill', 'Prompt', 'Dataset', 'Template', 'Knowledge', 'Code', 'Media', 'Image'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input
                              value={marketTeaser}
                              onChange={e => setMarketTeaser(e.target.value)}
                              title="Short buyer teaser"
                              placeholder="Short buyer teaser"
                              maxLength={220}
                              style={{ minWidth: 0, padding: '8px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', outline: 'none' }}
                            />
                          </div>
                          <textarea
                            value={marketDescription}
                            onChange={e => setMarketDescription(e.target.value)}
                            title="Marketplace description"
                            placeholder="Describe what the buyer gets"
                            maxLength={500}
                            rows={3}
                            style={{ resize: 'vertical', minHeight: '66px', padding: '8px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--off-white)', color: 'var(--text-1)', fontSize: '12px', lineHeight: 1.45, outline: 'none' }}
                          />
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {([['nft', 'Sell once (NFT)'], ['license', 'Sell licenses']] as const).map(([k, label]) => (
                              <button key={k} onClick={() => setSaleKind(k)}
                                title={k === 'license' ? 'Sell unlimited copies — you keep the original' : 'Sell the unique item once'}
                                style={{ padding: '5px 9px', borderRadius: '7px', border: `1px solid ${saleKind === k ? 'var(--purple)' : 'var(--border)'}`, background: saleKind === k ? 'var(--purple)' : 'transparent', color: saleKind === k ? 'var(--base)' : 'var(--text-2)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{saleKind === 'license' ? 'Sells unlimited copies' : selected.encrypted ? 'Seal-private sale' : 'Public ownership sale'}</span>
                            <button
                              onClick={() => (saleKind === 'license' ? openLicenseSale(selected) : listOnMarket(selected))}
                              disabled={marketBusy || (saleKind === 'license' ? !selected.blobId : !selected.entryId)}
                              title={saleKind === 'license' ? 'Sell unlimited license copies of this file' : selected.entryId ? 'List this owned vault entry for sale' : 'Restore or claim first to get the on-chain entry ID'}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: '1px solid var(--purple-bg)', background: 'var(--purple-bg)', color: 'var(--purple)', cursor: marketBusy ? 'default' : 'pointer', opacity: marketBusy || (saleKind === 'license' ? !selected.blobId : !selected.entryId) ? 0.55 : 1 }}
                            >
                              <ShoppingCart size={13} strokeWidth={2} /> {marketBusy ? 'Listing...' : saleKind === 'license' ? 'Sell licenses' : 'List for sale'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => delistFromMarket(selected)}
                          disabled={marketBusy || !selected.listingId}
                          title="Cancel this marketplace listing"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: marketBusy || !selected.listingId ? 'default' : 'pointer', opacity: marketBusy || !selected.listingId ? 0.55 : 1 }}
                        >
                          <X size={13} strokeWidth={2} /> {marketBusy ? 'Cancelling...' : 'Delist'}
                        </button>
                      )}
                    </div>
                  )}
                  {selectedOwnedByWallet && !selected.listed && (
                    <p style={{ fontSize: '11px', lineHeight: 1.45, margin: '7px 0 0', color: selected.encrypted ? 'var(--mint-dark)' : 'var(--text-3)' }}>
                      {selected.encrypted
                        ? 'Seal-gated: the buyer receives decrypt access when ownership transfers.'
                        : 'Public Walrus file: buyers receive on-chain ownership, but the raw blob is already readable. For private paid knowledge, upload with Seal encryption first.'}
                    </p>
                  )}
                </div>
                {/* Optional: claim under your own wallet */}
                {account && !selected.owner && (
                  <button
                    onClick={() => claimOnChain(selected)}
                    disabled={claiming}
                    title="Sign with your wallet to own this file on-chain"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      border: '1px solid var(--purple-bg)', background: 'var(--purple-bg)', color: 'var(--purple)',
                      cursor: claiming ? 'default' : 'pointer', flexShrink: 0, opacity: claiming ? 0.6 : 1,
                    }}
                  >
                    <Link2 size={13} strokeWidth={2} /> {claiming ? 'Claiming…' : 'Claim on-chain'}
                  </button>
                )}
              </div>

              {/* Summary (collapsible) */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'rgba(26,25,23,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <button
                  onClick={() => setSummaryExpanded(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: summaryExpanded ? '10px' : 0 }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Summary</span>
                  <ChevronDown size={13} strokeWidth={2.5} color="var(--text-3)" style={{ transform: summaryExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
                </button>
                {summaryExpanded && (
                  <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.65', animation: 'fadeUp 0.2s ease' }}>
                    {selected.summary}
                  </p>
                )}
                {summaryExpanded && analyzingId === selected.id && (
                  <p style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--text-3)' }}>
                    <Loader2 size={13} strokeWidth={2.5} className="lucide-spin" /> {selected.encrypted ? 'Decrypting with Seal, then reading with AI...' : 'Reading this file from Walrus with AI...'}
                  </p>
                )}
              </div>

              {/* Walrus proof — collapsible so the chat stays the focus */}
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'rgba(26,25,23,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <button
                  onClick={() => setProofExpanded(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mint-dark)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Decentralized Storage Proof</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                    background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--mint-dark)',
                  }}><Check size={11} strokeWidth={2.5} /> on Walrus</span>
                  {selected.encrypted && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                      background: selectedSealReady ? 'var(--success-bg)' : 'rgba(255, 184, 107, 0.12)',
                      border: selectedSealReady ? '1px solid var(--success-border)' : '1px solid rgba(255, 184, 107, 0.35)',
                      color: selectedSealReady ? 'var(--mint-dark)' : 'var(--text-2)',
                    }}>{selectedSealReady ? <Check size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2.5} />} {selectedSealStatus}</span>
                  )}
                  <ChevronDown size={13} strokeWidth={2.5} color="var(--text-3)" style={{ marginLeft: 'auto', transform: proofExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
                </button>
                {proofExpanded && (
                  <div style={{ marginTop: '12px', animation: 'fadeUp 0.2s ease' }}>
                    {selected.encrypted && (
                      <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--success-border)', background: 'var(--success-bg)', color: 'var(--text-2)', fontSize: '12px', lineHeight: 1.55 }}>
                        <strong style={{ color: 'var(--mint-dark)' }}>{selectedSealStatus}.</strong>{' '}
                        {selectedSealVerified
                          ? `This wallet has unlocked the Seal key and decrypted this vault file${selected.decryptedAt ? ` on ${formatDate(selected.decryptedAt)}` : ''}.`
                          : selectedSealReady
                            ? 'Buying transfers the on-chain vault entry; opening the file asks Seal to verify ownership before decrypting.'
                            : 'This older vault item is missing Seal policy data. Restore it from chain again after the upgraded contract is live.'}
                      </div>
                    )}
                    <WalrusProof key={selected.id} blobId={selected.blobId} fileType={selected.fileType} filename={selected.filename} txDigest={selected.txDigest} entryId={selected.entryId} />
                  </div>
                )}
              </div>

              {/* Chat (Claude-style) — fills the remaining height */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <ChatPanel
                  resetKey={selected.id}
                  persistKey={`chainmind_chat_${selected.blobId || selected.id}`}
                  owner={account?.address}
                  endpoint="/api/ask"
                  mobile={isMobile}
                  aiConfig={aiConfig}
                  onAiConfigChange={updateAiConfig}
                  agent
                  buildBody={(question, history) => ({
                    docs: [agentDoc(selected)],
                    currentFile: agentDoc(selected),
                    owner: account?.address,
                    memory: buildAgentMemory(question),
                    question,
                    history,
                  })}
                  suggestions={selected.questions && selected.questions.length > 0
                    ? selected.questions
                    : ['Summarize this in 3 bullet points', 'What are the key takeaways?', 'Any action items, dates, or deadlines?']}
                  placeholder="Ask anything about this document…"
                  aiLabel="ChainMind AI"
                  uploadRunner={(file, emit) => runUpload(file, emit, account?.address, account?.address && PACKAGE_ID && SEAL_UPLOADS_ENABLED ? { enabled: true, suiClient, packageId: PACKAGE_ID } : undefined)}
                  onUploaded={addToVault}
                />
              </div>
            </div>
          )}
          </div>
          </div>
        </main>

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} } @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}
