import Link from 'next/link';
import type { CSSProperties } from 'react';
import { DocsShell, type TocItem } from '@/components/DocsShell';
import { CopyBlock, Callout } from '@/components/DocsBits';

export const metadata = { title: 'ChainMind — MCP Server' };

const MCP_URL = 'https://chainmind-seven.vercel.app/mcp';

const kicker: CSSProperties = { fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#65ca9d', margin: 0 };
const h1: CSSProperties = { fontSize: '34px', fontWeight: 800, letterSpacing: '-0.02em', margin: '8px 0 0' };
const lead: CSSProperties = { fontSize: '17px', lineHeight: 1.65, color: 'var(--text-2)', margin: '14px 0 0' };
const h2: CSSProperties = { fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 4px' };
const section: CSSProperties = { margin: '44px 0 0', paddingTop: '30px', borderTop: '1px solid var(--border)' };
const p: CSSProperties = { fontSize: '15.5px', lineHeight: 1.75, color: 'var(--text-2)', margin: '12px 0' };
const link: CSSProperties = { color: '#65ca9d', textDecoration: 'none', fontWeight: 600 };
const codeInline: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.86em', background: 'var(--off-white)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 6px' };
const toolCard: CSSProperties = { border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px', margin: '12px 0', background: 'var(--off-white)' };
const toolName: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' };
const strong: CSSProperties = { color: 'var(--text-1)' };

const TOC: TocItem[] = [
  { id: 'endpoint', label: 'Endpoint' },
  { id: 'tools', label: 'Tools' },
  { id: 'connect', label: 'Connect' },
  { id: 'tatum', label: "Pair with Tatum's MCP" },
  { id: 'notes', label: 'Notes' },
];

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
    <DocsShell active="mcp" toc={TOC}>
      <p style={kicker}>Model Context Protocol</p>
      <h1 style={h1}>Use your on-chain vault from any AI</h1>
      <p style={lead}>ChainMind ships a remote MCP server that exposes a wallet&rsquo;s vault — and the marketplace — to any MCP-capable client (Claude Desktop, Cursor, and others). Files are owned on Sui (read through Tatum&rsquo;s RPC) and stored on Walrus, so any AI can read the data you provably own — no database, no API key, no copies.</p>

      <section id="endpoint" style={section}>
        <h2 style={h2}>Endpoint</h2>
        <CopyBlock>{MCP_URL}</CopyBlock>
        <p style={p}><strong style={strong}>Transport:</strong> Streamable HTTP. <strong style={strong}>Auth:</strong> none — the server only reads public on-chain data, scoped to the wallet address you pass in.</p>
      </section>

      <section id="tools" style={section}>
        <h2 style={h2}>Tools</h2>

        <div style={toolCard}>
          <div style={toolName}>list_vault(owner)</div>
          <p style={{ ...p, margin: '8px 0 0' }}>Lists the files a Sui wallet owns in its ChainMind vault. Reads the owner&rsquo;s <code style={codeInline}>VaultEntry</code> objects from Sui via Tatum and returns filename, type, size, and Walrus <code style={codeInline}>blobId</code> for each.</p>
          <p style={{ ...p, margin: '6px 0 0' }}><code style={codeInline}>owner</code> — Sui wallet address (<code style={codeInline}>0x…</code>).</p>
        </div>

        <div style={toolCard}>
          <div style={toolName}>read_file(blobId)</div>
          <p style={{ ...p, margin: '8px 0 0' }}>Reads a file&rsquo;s text contents from Walrus by its <code style={codeInline}>blobId</code> (from <code style={codeInline}>list_vault</code> or <code style={codeInline}>search_vault</code>).</p>
          <p style={{ ...p, margin: '6px 0 0' }}><code style={codeInline}>blobId</code> — the Walrus blob identifier.</p>
        </div>

        <div style={toolCard}>
          <div style={toolName}>search_vault(owner, query)</div>
          <p style={{ ...p, margin: '8px 0 0' }}>Searches a wallet&rsquo;s vault by keyword across filenames and file contents, returning matches with short snippets.</p>
          <p style={{ ...p, margin: '6px 0 0' }}><code style={codeInline}>owner</code> — Sui wallet address. <code style={codeInline}>query</code> — keyword or phrase.</p>
        </div>

        <div style={toolCard}>
          <div style={toolName}>list_marketplace(seller?)</div>
          <p style={{ ...p, margin: '8px 0 0' }}>Browses files currently for sale in the ChainMind marketplace — live Sui listings priced in SUI, read from the on-chain <code style={codeInline}>Listed</code> events via Tatum. Returns filename, price, seller, and listing id.</p>
          <p style={{ ...p, margin: '6px 0 0' }}><code style={codeInline}>seller</code> — optional; only listings from this wallet address.</p>
        </div>
      </section>

      <section id="connect" style={section}>
        <h2 style={h2}>Connect</h2>
        <p style={p}>Add ChainMind as a remote MCP server in your client (Claude Desktop &rarr; Settings &rarr; Connectors, or a Cursor / client <code style={codeInline}>mcp.json</code>):</p>
        <CopyBlock>{httpConfig}</CopyBlock>
        <Callout title="Tip">Restart your MCP client after editing the config so it picks up the new server. No API key is needed — ChainMind only reads public on-chain data.</Callout>
        <p style={p}>Then ask, for example: <em>&ldquo;Use ChainMind to list the vault for 0x… and summarize the files.&rdquo;</em> The client calls this server, which reads Sui through Tatum and the bytes from Walrus, and returns your files.</p>
      </section>

      <section id="tatum" style={section}>
        <h2 style={h2}>Pair with Tatum&rsquo;s MCP</h2>
        <p style={p}>For full blockchain coverage, run <a style={link} href="https://tatum.io/mcp" target="_blank" rel="noreferrer">Tatum&rsquo;s MCP server</a> alongside ChainMind&rsquo;s. Your AI can then browse your owned vault and query balances, NFTs, transactions, and raw RPC across 130+ chains:</p>
        <CopyBlock>{tatumConfig}</CopyBlock>
      </section>

      <section id="notes" style={section}>
        <h2 style={h2}>Notes</h2>
        <p style={p}>The server is read-only and stateless. Internal chat-history backups are filtered out of results. Built on <code style={codeInline}>mcp-handler</code> as a Next.js route handler; reads use the same Tatum RPC and Walrus endpoints as the app.</p>
        <p style={p}>Files sold on the marketplace can be <strong style={strong}>Seal-encrypted</strong> — <code style={codeInline}>read_file</code> returns ciphertext for those unless the caller owns the entry and decrypts via <code style={codeInline}>seal_approve</code> (see the <Link href="/docs" style={link}>docs</Link>).</p>
      </section>
    </DocsShell>
  );
}
