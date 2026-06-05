import Link from 'next/link';
import type { CSSProperties } from 'react';

export const metadata = { title: 'ChainMind — Docs' };

const wrap: CSSProperties = { minHeight: '100dvh', background: 'var(--base)', color: 'var(--text-1)' };
const container: CSSProperties = { maxWidth: '780px', margin: '0 auto', padding: '40px 24px 80px' };
const h1: CSSProperties = { fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 };
const h2: CSSProperties = { fontSize: '18px', fontWeight: 800, margin: '34px 0 10px', color: 'var(--text-1)' };
const p: CSSProperties = { fontSize: '15px', lineHeight: 1.7, color: 'var(--text-2)', margin: '8px 0' };
const li: CSSProperties = { fontSize: '15px', lineHeight: 1.7, color: 'var(--text-2)', margin: '5px 0' };
const code: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.88em', background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 5px' };
const link: CSSProperties = { color: '#65ca9d', textDecoration: 'none', fontWeight: 600 };

export default function DocsPage() {
  return (
    <div style={wrap}>
      <div style={container}>
        <Link href="/" style={{ ...link, fontSize: '13px' }}>← Back to ChainMind</Link>
        <div style={{ marginTop: '20px' }}>
          <h1 style={h1}>🧠 ChainMind</h1>
          <p style={{ ...p, marginTop: '8px' }}>Your AI, on data you provably own. Files are stored on <strong>Walrus</strong> and owned as objects on <strong>Sui</strong> through <strong>Tatum</strong>’s RPC — and an AI agent reads, searches, creates, and stores across your vault.</p>
        </div>

        <h2 style={h2}>What it is</h2>
        <p style={p}>Most “AI + your files” tools keep your data in someone’s database. ChainMind keeps it on decentralized storage you own. Every upload becomes a <code style={code}>VaultEntry</code> object owned by your wallet on Sui, with the bytes on Walrus. Clear your browser, open it on another device, connect the same wallet → <strong>Restore vault from chain</strong> rebuilds everything from Sui + Walrus alone.</p>

        <h2 style={h2}>How it works</h2>
        <ul>
          <li style={li}><strong>Walrus</strong> — the bytes. Files, AI-generated content, and chat history are stored as Walrus blobs.</li>
          <li style={li}><strong>Sui</strong> — ownership. A custom Move contract (<code style={code}>vault::register</code>) records the Walrus <code style={code}>blob_id</code> in an object transferred to your wallet, emitting a <code style={code}>BlobRegistered</code> event.</li>
          <li style={li}><strong>Tatum</strong> — the gateway. Every Sui read/write routes through Tatum’s Sui RPC; the agent also uses Tatum’s Data API for live prices.</li>
        </ul>

        <h2 style={h2}>Features</h2>
        <ul>
          <li style={li}>🧠 <strong>AI agent</strong> — searches your vault, answers with clickable file citations, and streams its response live.</li>
          <li style={li}>🌐 <strong>Web search</strong> (Tavily) and <strong>live crypto prices</strong> (Tatum Data API).</li>
          <li style={li}>✍️ <strong>Create → store on-chain</strong> — ask it to write a doc or script; one click stores it on Walrus + Sui.</li>
          <li style={li}>🗂️ <strong>On-chain vault</strong> — upload anything; owned on Sui, restorable anywhere.</li>
          <li style={li}>💬 <strong>Portable chat history</strong> — backed up to Walrus + Sui.</li>
          <li style={li}>🎙️ <strong>Voice input</strong> — hold-to-talk or tap-to-toggle.</li>
          <li style={li}>🔌 <strong>MCP server</strong> — your vault, usable by any AI client. See <Link href="/mcp-guide" style={link}>the MCP guide</Link>.</li>
        </ul>

        <h2 style={h2}>How to use it</h2>
        <ol>
          <li style={li}><strong>Connect</strong> a Sui wallet (Slush) — bottom of the sidebar.</li>
          <li style={li}><strong>Upload</strong> a file (the <code style={code}>+</code> in the prompt box) — it’s stored on Walrus and recorded on Sui.</li>
          <li style={li}><strong>Ask</strong> across your vault, or open a file to chat about it.</li>
          <li style={li}><strong>Create</strong> something (“write me a …”) and click <strong>Store on-chain</strong>.</li>
          <li style={li}><strong>Restore</strong> from chain on any device with the same wallet.</li>
        </ol>

        <h2 style={h2}>Links</h2>
        <ul>
          <li style={li}>Live app: <a style={link} href="https://chainmind-seven.vercel.app" target="_blank" rel="noreferrer">chainmind-seven.vercel.app</a></li>
          <li style={li}>MCP guide: <Link style={link} href="/mcp-guide">/mcp-guide</Link></li>
        </ul>

        <p style={{ ...p, marginTop: '34px', color: 'var(--text-3)', fontSize: '13px' }}>Built for the Tatum × Build on Sui with Walrus hackathon · Sui testnet.</p>
      </div>
    </div>
  );
}
