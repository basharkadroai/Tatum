import Link from 'next/link';
import type { CSSProperties } from 'react';

export const metadata = { title: 'ChainMind — MCP Server' };

const MCP_URL = 'https://chainmind-seven.vercel.app/mcp';

const pageStyle: CSSProperties = { minHeight: '100dvh', background: 'var(--base)', color: 'var(--text-1)' };
const bar: CSSProperties = { borderBottom: '1px solid var(--border)', background: 'var(--sidebar-bg)', position: 'sticky', top: 0, zIndex: 10 };
const barInner: CSSProperties = { maxWidth: '880px', margin: '0 auto', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const container: CSSProperties = { maxWidth: '880px', margin: '0 auto', padding: '44px 28px 100px' };
const kicker: CSSProperties = { fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#65ca9d' };
const lead: CSSProperties = { fontSize: '17px', lineHeight: 1.65, color: 'var(--text-2)', margin: '10px 0 0', maxWidth: '700px' };
const h2: CSSProperties = { fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 4px' };
const section: CSSProperties = { margin: '40px 0 0', paddingTop: '28px', borderTop: '1px solid var(--border)' };
const p: CSSProperties = { fontSize: '15px', lineHeight: 1.7, color: 'var(--text-2)', margin: '12px 0' };
const link: CSSProperties = { color: '#65ca9d', textDecoration: 'none', fontWeight: 600 };
const codeInline: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.86em', background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 6px' };
const pre: CSSProperties = { margin: '14px 0', padding: '16px 18px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--sidebar-bg)', color: 'var(--text-1)', overflowX: 'auto', fontSize: '12.5px', lineHeight: 1.65, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
const toolCard: CSSProperties = { border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px', margin: '12px 0', background: 'var(--off-white)' };
const toolName: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' };

export default function McpGuidePage() {
  const httpConfig = `{
  "mcpServers": {
    "chainmind": {
      "type": "streamable-http",
      "url": "${MCP_URL}"
    }
  }
}`;
  const tatumConfig = `{
  "mcpServers": {
    "tatumio": {
      "command": "npx",
      "args": ["@tatumio/blockchain-mcp"],
      "env": { "TATUM_API_KEY": "<your Tatum key>" }
    }
  }
}`;

  return (
    <div style={pageStyle}>
      <div style={bar}>
        <div style={barInner}>
          <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.01em' }}>ChainMind <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>MCP server</span></span>
          <span style={{ display: 'flex', gap: '20px' }}>
            <Link href="/docs" style={{ ...link, fontSize: '13px' }}>Docs</Link>
            <Link href="/" style={{ ...link, fontSize: '13px' }}>Open app</Link>
          </span>
        </div>
      </div>

      <div style={container}>
        <p style={kicker}>Model Context Protocol</p>
        <h1 style={{ fontSize: '34px', fontWeight: 800, letterSpacing: '-0.02em', margin: '8px 0 0' }}>Use your on-chain vault from any AI</h1>
        <p style={lead}>ChainMind ships a remote MCP server that exposes a wallet&rsquo;s vault to any MCP-capable client — Claude Desktop, Cursor, and others. Files are owned on Sui (read through Tatum&rsquo;s RPC) and stored on Walrus, so any AI can read the data you provably own — no database, no API key, no copies.</p>

        <section style={section}>
          <h2 style={h2}>Endpoint</h2>
          <pre style={pre}>{MCP_URL}</pre>
          <p style={p}><strong style={{ color: 'var(--text-1)' }}>Transport:</strong> Streamable HTTP. <strong style={{ color: 'var(--text-1)' }}>Auth:</strong> none — the server only reads public on-chain data, scoped to the wallet address you pass in.</p>
        </section>

        <section style={section}>
          <h2 style={h2}>Tools</h2>

          <div style={toolCard}>
            <div style={toolName}>list_vault(owner)</div>
            <p style={{ ...p, margin: '8px 0 0' }}>Lists the files a Sui wallet owns in its ChainMind vault. Reads the owner&rsquo;s <code style={codeInline}>VaultEntry</code> objects from Sui via Tatum and returns filename, type, size, and Walrus <code style={codeInline}>blobId</code> for each.</p>
            <p style={{ ...p, margin: '6px 0 0' }}><code style={codeInline}>owner</code> — Sui wallet address (<code style={codeInline}>0x…</code>).</p>
          </div>

          <div style={toolCard}>
            <div style={toolName}>read_file(blobId)</div>
            <p style={{ ...p, margin: '8px 0 0' }}>Reads a file&rsquo;s text contents from Walrus by its <code style={codeInline}>blobId</code> (obtained from <code style={codeInline}>list_vault</code> or <code style={codeInline}>search_vault</code>).</p>
            <p style={{ ...p, margin: '6px 0 0' }}><code style={codeInline}>blobId</code> — the Walrus blob identifier.</p>
          </div>

          <div style={toolCard}>
            <div style={toolName}>search_vault(owner, query)</div>
            <p style={{ ...p, margin: '8px 0 0' }}>Searches a wallet&rsquo;s vault by keyword across filenames and file contents, returning matches with short snippets.</p>
            <p style={{ ...p, margin: '6px 0 0' }}><code style={codeInline}>owner</code> — Sui wallet address. <code style={codeInline}>query</code> — keyword or phrase.</p>
          </div>
        </section>

        <section style={section}>
          <h2 style={h2}>Connect</h2>
          <p style={p}>Add ChainMind as a remote MCP server in your client (Claude Desktop &rarr; Settings &rarr; Connectors, or a Cursor / client <code style={codeInline}>mcp.json</code>):</p>
          <pre style={pre}>{httpConfig}</pre>
          <p style={p}>Then ask, for example: <em>&ldquo;Use ChainMind to list the vault for 0x… and summarize the files.&rdquo;</em> The client calls this server, which reads Sui through Tatum and the bytes from Walrus, and returns your files.</p>
        </section>

        <section style={section}>
          <h2 style={h2}>Pair with Tatum&rsquo;s MCP</h2>
          <p style={p}>For full blockchain coverage, run <a style={link} href="https://tatum.io/mcp" target="_blank" rel="noreferrer">Tatum&rsquo;s MCP server</a> alongside ChainMind&rsquo;s. Your AI can then browse your owned vault and query balances, NFTs, transactions, and raw RPC across 130+ chains:</p>
          <pre style={pre}>{tatumConfig}</pre>
        </section>

        <section style={section}>
          <h2 style={h2}>Notes</h2>
          <p style={p}>The server is read-only and stateless. Internal chat-history backups are filtered out of results. Built on <code style={codeInline}>mcp-handler</code> as a Next.js route handler; reads use the same Tatum RPC and Walrus endpoints as the app.</p>
          <p style={{ ...p, color: 'var(--text-3)', fontSize: '13px', marginTop: '20px' }}>See also the <Link href="/docs" style={link}>main documentation</Link>.</p>
        </section>
      </div>
    </div>
  );
}
