#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// ChainMind MCP server — lets any MCP client (Claude Desktop, etc.) query the
// ChainMind on-chain knowledge vault. EVERY read goes through Tatum's Sui RPC
// gateway, so this doubles as a showcase of "Best Use of Tatum Tools (MCP)".
//
// Run:   node mcp/chainmind-mcp.mjs
// Env:   TATUM_SUI_RPC        Tatum Sui RPC gateway URL (keyed). Falls back to
//                             the public testnet fullnode if unset.
//        VAULT_PACKAGE_ID     Move package id of chainmind::vault
//        WALRUS_AGGREGATOR_URL Walrus aggregator (for blob content URLs)
// ─────────────────────────────────────────────────────────────────────────
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TATUM_RPC =
  process.env.TATUM_SUI_RPC ||
  process.env.NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC ||
  'https://fullnode.testnet.sui.io:443';
const FALLBACK_RPC = 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID =
  process.env.VAULT_PACKAGE_ID ||
  '0x206ac074200b07449d570a97c4f903a50e2ad9125db8254c3e0b1f140f7fec64';
const AGGREGATOR =
  process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
const EXPLORER = (process.env.SUI_NETWORK === 'mainnet')
  ? 'https://suivision.xyz'
  : 'https://testnet.suivision.xyz';

const EVENT_TYPE = `${PACKAGE_ID}::vault::BlobRegistered`;

// Single JSON-RPC helper — Tatum first, public fullnode as graceful fallback.
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  let lastErr;
  for (const url of [TATUM_RPC, FALLBACK_RPC]) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const data = await res.json();
      if (data.error) { lastErr = new Error(data.error.message || 'rpc error'); continue; }
      if (data.result != null) return data.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Sui RPC unavailable');
}

const json = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: 'chainmind', version: '1.0.0' });

// 1) List recent vault registrations (read from chain via Tatum)
server.registerTool(
  'list_vault_entries',
  {
    title: 'List vault entries',
    description: 'List the most recent files registered in the ChainMind vault on Sui (read on-chain via Tatum RPC). Returns blobId, filename, owner, on-chain object id and tx digest for each.',
    inputSchema: { limit: z.number().int().min(1).max(50).optional().describe('How many recent entries (default 10)') },
  },
  async ({ limit }) => {
    const result = await rpc('suix_queryEvents', [{ MoveEventType: EVENT_TYPE }, null, limit ?? 10, true]);
    const entries = (result?.data ?? []).map((e) => ({
      blobId: e.parsedJson?.blob_id,
      filename: e.parsedJson?.filename,
      owner: e.parsedJson?.owner,
      entryId: e.parsedJson?.entry_id,
      txDigest: e.id?.txDigest,
      timestampMs: e.timestampMs,
    }));
    return json({ count: entries.length, source: 'Sui via Tatum RPC', entries });
  },
);

// 2) Verify a blob is registered on-chain
server.registerTool(
  'verify_blob',
  {
    title: 'Verify blob on-chain',
    description: 'Check whether a given Walrus blobId is registered on-chain in the ChainMind vault. Reads the BlobRegistered events from Sui via Tatum RPC and returns the on-chain proof if found.',
    inputSchema: { blobId: z.string().describe('The Walrus blob id to verify') },
  },
  async ({ blobId }) => {
    const result = await rpc('suix_queryEvents', [{ MoveEventType: EVENT_TYPE }, null, 50, true]);
    const hit = (result?.data ?? []).find((e) => e.parsedJson?.blob_id === blobId);
    if (!hit) return json({ verified: false, blobId, note: 'Not found in the latest 50 registrations' });
    return json({
      verified: true,
      blobId,
      filename: hit.parsedJson?.filename,
      owner: hit.parsedJson?.owner,
      entryId: hit.parsedJson?.entry_id,
      txDigest: hit.id?.txDigest,
      objectUrl: `${EXPLORER}/object/${hit.parsedJson?.entry_id}`,
    });
  },
);

// 3) Read a specific VaultEntry object back from chain
server.registerTool(
  'get_vault_entry',
  {
    title: 'Get vault entry',
    description: 'Read a ChainMind VaultEntry object back from the Sui chain via Tatum RPC, returning its stored fields (blobId, filename, fileType, sizeBytes, owner).',
    inputSchema: { entryId: z.string().describe('The on-chain VaultEntry object id (0x...)') },
  },
  async ({ entryId }) => {
    const result = await rpc('sui_getObject', [entryId, { showContent: true, showType: true }]);
    const f = result?.data?.content?.fields;
    if (!f) return json({ found: false, entryId });
    return json({
      found: true,
      entryId,
      blobId: f.blob_id,
      filename: f.filename,
      fileType: f.file_type,
      sizeBytes: Number(f.size_bytes),
      owner: f.owner,
      blobContentUrl: `${AGGREGATOR}/v1/blobs/${f.blob_id}`,
    });
  },
);

// 4) Resolve a blob's Walrus content URL
server.registerTool(
  'get_blob_content_url',
  {
    title: 'Get blob content URL',
    description: 'Return the Walrus aggregator URL where a blob can be downloaded.',
    inputSchema: { blobId: z.string().describe('The Walrus blob id') },
  },
  async ({ blobId }) => json({ blobId, url: `${AGGREGATOR}/v1/blobs/${blobId}` }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[chainmind-mcp] ready · RPC=${TATUM_RPC.replace(/\/[^/]+$/, '/***')} · pkg=${PACKAGE_ID.slice(0, 10)}…`);
