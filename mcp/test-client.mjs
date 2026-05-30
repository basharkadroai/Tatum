// Quick smoke test: spawn the ChainMind MCP server, list its tools, and call
// each against live Tatum Sui RPC. Run: node mcp/test-client.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const KNOWN_BLOB = 'r0BixnIJPXttsk-CVjaQ_-CV883jnPS8QEvchGKDC2Q';
const KNOWN_ENTRY = '0x48d8d1cf308718784f7b036da69ac1910069677a5ba42ffd6d8d69e21811cadc';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['mcp/chainmind-mcp.mjs'],
  env: { ...process.env },
});
const client = new Client({ name: 'test', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('TOOLS:', tools.map(t => t.name).join(', '));

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n── ${name}(${JSON.stringify(args)}) ──\n${r.content[0].text}`);
}

await call('list_vault_entries', { limit: 2 });
await call('verify_blob', { blobId: KNOWN_BLOB });
await call('get_vault_entry', { entryId: KNOWN_ENTRY });
await call('get_blob_content_url', { blobId: KNOWN_BLOB });

await client.close();
process.exit(0);
