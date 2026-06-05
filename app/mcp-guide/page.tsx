import Link from 'next/link';
import type { CSSProperties } from 'react';

export const metadata = { title: 'ChainMind — MCP server' };

const MCP_URL = 'https://chainmind-seven.vercel.app/mcp';

const wrap: CSSProperties = { minHeight: '100dvh', background: 'var(--base)', color: 'var(--text-1)' };
const container: CSSProperties = { maxWidth: '780px', margin: '0 auto', padding: '40px 24px 80px' };
const h1: CSSProperties = { fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 };
const h2: CSSProperties = { fontSize: '18px', fontWeight: 800, margin: '32px 0 10px' };
const p: CSSProperties = { fontSize: '15px', lineHeight: 1.7, color: 'var(--text-2)', margin: '8px 0' };
const li: CSSProperties = { fontSize: '15px', lineHeight: 1.7, color: 'var(--text-2)', margin: '5px 0' };
const link: CSSProperties = { color: '#65ca9d', textDecoration: 'none', fontWeight: 600 };
const codeInline: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.88em', background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 5px' };
const pre: CSSProperties = { margin: '10px 0', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--sidebar-bg)', color: 'var(--text-1)', overflowX: 'auto', fontSize: '12.5px', lineHeight: 1.6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };

export default function McpGuidePage() {
  const claudeConfig = `{
  "mcpServers": {
    "chainmind": {
      "type": "streamable-http",
      "url": "${MCP_URL}"
    }
  }
}`;

  return (
    <div style={wrap}>
      <div style={container}>
        <Link href="/" style={{ ...link, fontSize: '13px' }}>← Back to ChainMind</Link>

        <div style={{ marginTop: '20px' }}>
          <h1 style={h1}>🔌 ChainMind MCP server</h1>
          <p style={{ ...p, marginTop: '8px' }}>An <strong>MCP (Model Context Protocol)</strong> server that exposes a wallet’s on-chain vault to any AI client — Claude Desktop, Cursor, ChatGPT. Files are owned on <strong>Sui</strong> (read via <strong>Tatum</strong> RPC) and stored on <strong>Walrus</strong>. So any AI can read the data you provably own.</p>
        </div>

        <h2 style={h2}>Endpoint</h2>
        <pre style={pre}>{MCP_URL}</pre>
        <p style={p}>Transport: Streamable HTTP. No key required — it reads public on-chain data scoped to the wallet address you pass.</p>

        <h2 style={h2}>Tools</h2>
        <ul>
          <li style={li}><code style={codeInline}>list_vault(owner)</code> — list the files a Sui wallet owns in its ChainMind vault.</li>
          <li style={li}><code style={codeInline}>read_file(blobId)</code> — read a file’s contents from Walrus.</li>
          <li style={li}><code style={codeInline}>search_vault(owner, query)</code> — keyword search across a wallet’s filenames and contents.</li>
        </ul>

        <h2 style={h2}>Connect from Claude Desktop / Cursor</h2>
        <p style={p}>Add ChainMind as a remote MCP server (Settings → Connectors / <code style={codeInline}>mcp.json</code>):</p>
        <pre style={pre}>{claudeConfig}</pre>
        <p style={p}>Then ask, e.g.: <em>“Use ChainMind to list the vault for 0x…”</em> — the client calls this server, which reads Sui via Tatum and Walrus, and returns your files.</p>

        <h2 style={h2}>Pair it with Tatum’s MCP</h2>
        <p style={p}>For full blockchain superpowers, connect <a style={link} href="https://tatum.io/mcp" target="_blank" rel="noreferrer">Tatum’s MCP server</a> alongside ChainMind’s — your AI can then browse your owned vault <em>and</em> query balances, NFTs, and transactions across 130+ chains:</p>
        <pre style={pre}>{`{
  "mcpServers": {
    "tatumio": {
      "command": "npx",
      "args": ["@tatumio/blockchain-mcp"],
      "env": { "TATUM_API_KEY": "<your Tatum key>" }
    }
  }
}`}</pre>

        <p style={{ ...p, marginTop: '34px', color: 'var(--text-3)', fontSize: '13px' }}>See also the <Link href="/docs" style={link}>main docs</Link>.</p>
      </div>
    </div>
  );
}
