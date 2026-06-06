import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { listVaultEntries, fetchBlobText, listMarketplace } from '@/lib/onchain';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ChainMind MCP server — exposes a wallet's on-chain vault to ANY MCP client
// (Claude Desktop, Cursor, etc.). Files are owned on Sui (read via Tatum RPC)
// and stored on Walrus. Connect at  https://<host>/mcp
const handler = createMcpHandler(server => {
  server.tool(
    'list_vault',
    "List the files a Sui wallet owns in its ChainMind vault — stored on Walrus, owned on Sui (read via Tatum RPC).",
    { owner: z.string().describe('Sui wallet address, e.g. 0x…') },
    async ({ owner }) => {
      const entries = (await listVaultEntries(owner)).filter(e => !e.filename.startsWith('.')); // hide internal .chat backups
      const text = entries.length
        ? entries.map(e => `• ${e.filename}  (${e.fileType}, ${e.sizeBytes} bytes)  ·  blobId: ${e.blobId}`).join('\n')
        : 'No ChainMind files found for that wallet.';
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'read_file',
    'Read the text contents of a vault file by its Walrus blobId (from list_vault or search_vault).',
    { blobId: z.string().describe('The Walrus blobId of the file') },
    async ({ blobId }) => {
      const text = await fetchBlobText(blobId);
      return { content: [{ type: 'text', text: text || '(no readable text content for this blob)' }] };
    },
  );

  server.tool(
    'search_vault',
    "Search a wallet's ChainMind vault by keyword across filenames and file contents.",
    { owner: z.string().describe('Sui wallet address'), query: z.string().describe('Keyword or phrase to search for') },
    async ({ owner, query }) => {
      const entries = (await listVaultEntries(owner)).filter(e => !e.filename.startsWith('.'));
      const q = query.toLowerCase();
      const hits: string[] = [];
      for (const e of entries) {
        const text = await fetchBlobText(e.blobId);
        if (e.filename.toLowerCase().includes(q) || text.toLowerCase().includes(q)) {
          hits.push(`• ${e.filename} (blobId ${e.blobId})\n  ${text.slice(0, 240).replace(/\s+/g, ' ').trim()}`);
        }
      }
      return { content: [{ type: 'text', text: hits.length ? hits.join('\n\n') : `No matches for "${query}".` }] };
    },
  );

  server.tool(
    'list_marketplace',
    'Browse files currently for sale in the ChainMind marketplace — live Sui listings priced in SUI (read via Tatum RPC).',
    { seller: z.string().optional().describe('Optional: only show listings from this seller wallet address') },
    async ({ seller }) => {
      const listings = await listMarketplace(seller);
      const text = listings.length
        ? listings.map(l => `• ${l.filename} — ${l.priceSui} SUI  ·  seller ${l.seller.slice(0, 6)}…${l.seller.slice(-4)}  ·  listingId ${l.listingId}`).join('\n')
        : 'No active marketplace listings right now.';
      return { content: [{ type: 'text', text }] };
    },
  );
});

export { handler as GET, handler as POST };
