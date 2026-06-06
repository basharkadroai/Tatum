import Link from 'next/link';
import type { CSSProperties } from 'react';
import { DocsShell, type TocItem } from '@/components/DocsShell';
import { CopyBlock, Callout } from '@/components/DocsBits';

export const metadata = { title: 'ChainMind — Documentation' };

const kicker: CSSProperties = { fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#65ca9d', margin: 0 };
const h1: CSSProperties = { fontSize: '36px', fontWeight: 800, letterSpacing: '-0.02em', margin: '8px 0 0' };
const lead: CSSProperties = { fontSize: '17px', lineHeight: 1.65, color: 'var(--text-2)', margin: '14px 0 0' };
const h2: CSSProperties = { fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 4px', color: 'var(--text-1)' };
const section: CSSProperties = { margin: '44px 0 0', paddingTop: '30px', borderTop: '1px solid var(--border)' };
const p: CSSProperties = { fontSize: '15.5px', lineHeight: 1.75, color: 'var(--text-2)', margin: '12px 0' };
const li: CSSProperties = { fontSize: '15.5px', lineHeight: 1.75, color: 'var(--text-2)', margin: '7px 0' };
const code: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.86em', background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 6px' };
const link: CSSProperties = { color: '#65ca9d', textDecoration: 'none', fontWeight: 600 };
const th: CSSProperties = { textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid var(--border-2)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)' };
const td: CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: '14px', color: 'var(--text-2)', verticalAlign: 'top' };
const strong: CSSProperties = { color: 'var(--text-1)' };

const TOC: TocItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'encryption', label: 'Encryption (Seal)' },
  { id: 'using', label: 'Using ChainMind' },
  { id: 'tech', label: 'Tech' },
];

export default function DocsPage() {
  return (
    <DocsShell active="docs" toc={TOC}>
      <p style={kicker}>Documentation</p>
      <h1 style={h1}>Your AI, on data you provably own</h1>
      <p style={lead}>ChainMind is an AI agent over a vault of files you own on-chain. Files are stored as blobs on <strong style={strong}>Walrus</strong> and registered as objects owned by your wallet on <strong style={strong}>Sui</strong> through <strong style={strong}>Tatum</strong>&rsquo;s RPC. The agent reads, searches, creates, and stores across your vault — and your chat history lives on Walrus too, so it follows your wallet to any device.</p>

      <section id="overview" style={section}>
        <h2 style={h2}>Overview</h2>
        <p style={p}>Most &ldquo;AI over your files&rdquo; products keep your data in a centralized database. ChainMind keeps it on decentralized storage you actually own. Every upload becomes a <code style={code}>VaultEntry</code> object, owned by your wallet on Sui, pointing at a Walrus blob. Because ownership and storage are both on-chain, you can wipe your browser, open ChainMind on a different machine, connect the same wallet, and restore the entire vault — files and conversations — straight from the chain.</p>
        <Callout title="No database, no lock-in">Your data lives on Walrus, owned by your wallet on Sui. Connect the same wallet on any device and <strong style={strong}>Restore vault from chain</strong> rebuilds everything — files and chat history alike.</Callout>
      </section>

      <section id="architecture" style={section}>
        <h2 style={h2}>Architecture</h2>
        <p style={p}>Three layers, each doing one job:</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0' }}>
            <thead><tr><th style={th}>Layer</th><th style={th}>Role</th><th style={th}>In the code</th></tr></thead>
            <tbody>
              <tr><td style={td}><strong style={strong}>Walrus</strong></td><td style={td}>Stores the bytes — files, generated content, and chat history as blobs.</td><td style={td}><code style={code}>lib/walrus.ts</code>, <code style={code}>lib/upload.ts</code></td></tr>
              <tr><td style={td}><strong style={strong}>Sui</strong></td><td style={td}>Ownership. A Move contract records the Walrus <code style={code}>blob_id</code> in an object transferred to your wallet.</td><td style={td}><code style={code}>contracts/chainmind/sources/vault.move</code></td></tr>
              <tr><td style={td}><strong style={strong}>Tatum</strong></td><td style={td}>The gateway. Every Sui read/write routes through Tatum&rsquo;s Sui RPC; the agent also uses Tatum&rsquo;s Data API for live prices.</td><td style={td}><code style={code}>lib/network.ts</code>, <code style={code}>app/api/rpc</code>, <code style={code}>lib/tatum.ts</code></td></tr>
            </tbody>
          </table>
        </div>
        <CopyBlock>{`Browser (Next.js / React)
   |                         |
   |  /api/agent (LangChain) |  /api/rpc ---------> Tatum Sui RPC gateway
   |  /api/ask-vault         |  /api/register ----> Sui  (VaultEntry, server-signed via Tatum)
   |                         |  /api/vault-onchain > restore vault from Sui via Tatum
   v                         v
   Walrus publisher / aggregator   <-- files, generated content, chat history (blobs)`}</CopyBlock>
      </section>

      <section id="how-it-works" style={section}>
        <h2 style={h2}>How it works</h2>
        <p style={p}><strong style={strong}>Storing a file.</strong> The file is uploaded to the Walrus publisher and addressed by its <code style={code}>blob_id</code>. The server then calls the Move <code style={code}>vault::register</code> entry through Tatum&rsquo;s RPC, minting a <code style={code}>VaultEntry</code> and transferring it to your wallet. Registration is server-signed, so storing is gasless for you on testnet.</p>
        <p style={p}><strong style={strong}>Restoring from chain.</strong> Given your wallet address, ChainMind reads your owned <code style={code}>VaultEntry</code> objects from Sui via Tatum (<code style={code}>suix_getOwnedObjects</code>) and pulls each blob back from the Walrus aggregator — rebuilding the vault on any device.</p>
        <p style={p}><strong style={strong}>The agent.</strong> A LangChain agent (running on a free Groq model) searches your vault, answers with clickable file citations, optionally searches the web, and streams its response token by token. When it creates a document or script, it offers to store the result on-chain in one click.</p>
        <p style={p}><strong style={strong}>Verification.</strong> Each file&rsquo;s detail view reads the <code style={code}>VaultEntry</code> back from Sui and confirms the blob is genuinely registered on-chain — not just that a transaction was once sent.</p>
      </section>

      <section id="features" style={section}>
        <h2 style={h2}>Features</h2>
        <ul>
          <li style={li}><strong style={strong}>On-chain vault</strong> — upload any file; stored on Walrus, owned on Sui, restorable anywhere.</li>
          <li style={li}><strong style={strong}>AI agent</strong> — vault search with citations, web search, live crypto prices via Tatum, streamed responses.</li>
          <li style={li}><strong style={strong}>Create and store</strong> — generate a document or code, then store the exact artifact on-chain.</li>
          <li style={li}><strong style={strong}>Portable chat history</strong> — conversations persist locally and back up to Walrus and Sui.</li>
          <li style={li}><strong style={strong}>Voice input</strong> — hold to talk or tap to toggle, with a live waveform.</li>
          <li style={li}><strong style={strong}>Marketplace</strong> - list encrypted knowledge, prompts, AI skills, templates, or datasets for sale; buy with SUI, ownership transfers on-chain.</li>
          <li style={li}><strong style={strong}>MCP server</strong> — your vault (and the marketplace) usable by any AI client. See the <Link href="/mcp-guide" style={link}>MCP guide</Link>.</li>
        </ul>
      </section>

      <section id="marketplace" style={section}>
        <h2 style={h2}>Marketplace</h2>
        <p style={p}>Because every file is a wallet-owned Sui object, it can be sold. The product focus is a private knowledge and AI-skills marketplace: prompts, agent instructions, datasets, templates, and other useful files, with Seal encryption for private access.</p>
        <ul>
          <li style={li}><strong style={strong}>List</strong> (<code style={code}>vault::list</code>) — wrap your <code style={code}>VaultEntry</code> in a shared <code style={code}>Listing</code> at a price in SUI.</li>
          <li style={li}><strong style={strong}>Buy</strong> (<code style={code}>vault::buy</code>) — pay the exact price; the entry transfers to you and the SUI goes to the seller, atomically.</li>
          <li style={li}><strong style={strong}>Delist</strong> (<code style={code}>vault::delist</code>) — the seller can cancel and reclaim the entry.</li>
        </ul>
        <p style={p}>Listings are read from the on-chain <code style={code}>Listed</code> events via Tatum RPC — browse them inside the app, or from any AI via the MCP <code style={code}>list_marketplace</code> tool.</p>
      </section>

      <section id="encryption" style={section}>
        <h2 style={h2}>Encryption (Seal)</h2>
        <p style={p}>Public Walrus blobs are readable by anyone, so a sale only matters if the data is private. ChainMind integrates <a style={link} href="https://seal.mystenlabs.com/" target="_blank" rel="noreferrer">Seal</a> for that: a file is encrypted before it goes to Walrus, and decryption is gated by an on-chain <code style={code}>seal_approve</code> check that the requester <strong style={strong}>owns the entry</strong>. When a buyer takes ownership, the right to decrypt follows automatically — and no one else can read it.</p>
      </section>

      <section id="using" style={section}>
        <h2 style={h2}>Using ChainMind</h2>
        <ol>
          <li style={li}>Connect a Sui wallet (Slush) from the bottom of the sidebar.</li>
          <li style={li}>Upload a file with the <code style={code}>+</code> in the prompt box — it is stored on Walrus and recorded on Sui.</li>
          <li style={li}>Ask questions across your whole vault, or open a single file to chat about it.</li>
          <li style={li}>Ask the agent to create something, then choose <strong style={strong}>Store on-chain</strong>.</li>
          <li style={li}>On another device, connect the same wallet and choose <strong style={strong}>Restore vault from chain</strong>.</li>
        </ol>
      </section>

      <section id="tech" style={section}>
        <h2 style={h2}>Tech</h2>
        <p style={p}>Next.js 16, React 19, TypeScript, LangChain with Groq, Walrus, Sui (<code style={code}>@mysten/sui</code>, <code style={code}>@mysten/dapp-kit</code>), Seal, and Tatum&rsquo;s Sui RPC and Data API. Built for the Tatum &times; Build on Sui with Walrus hackathon. Currently on Sui testnet; the app flips to mainnet via a single environment variable.</p>
        <p style={{ ...p, color: 'var(--text-3)', fontSize: '13px', marginTop: '20px' }}>Live app: <a style={link} href="https://chainmind-seven.vercel.app" target="_blank" rel="noreferrer">chainmind-seven.vercel.app</a></p>
      </section>
    </DocsShell>
  );
}
