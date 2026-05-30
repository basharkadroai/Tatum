# ChainMind MCP Server

An [MCP](https://modelcontextprotocol.io) server that lets any AI assistant
(Claude Desktop, etc.) query the **ChainMind on-chain knowledge vault**. Every
tool reads from Sui **through Tatum's Sui RPC gateway** — so an LLM can verify
and explore decentralized storage proofs directly.

## Tools

| Tool | What it does (all via Tatum Sui RPC) |
|---|---|
| `list_vault_entries` | List the most recent files registered in the vault (blobId, filename, owner, object id, tx digest) |
| `verify_blob` | Check whether a Walrus `blobId` is registered on-chain; returns the proof if found |
| `get_vault_entry` | Read a `VaultEntry` object back from chain (blobId, filename, fileType, sizeBytes, owner) |
| `get_blob_content_url` | Resolve a blob's Walrus aggregator download URL |

## Run

```bash
npm run mcp        # start the server (stdio)
npm run mcp:test   # smoke test: lists tools and calls each against live Tatum RPC
```

## Claude Desktop config

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chainmind": {
      "command": "node",
      "args": ["/absolute/path/to/chainmind/mcp/chainmind-mcp.mjs"],
      "env": {
        "TATUM_SUI_RPC": "https://sui-testnet.gateway.tatum.io/YOUR_TATUM_KEY",
        "VAULT_PACKAGE_ID": "0x1a20ef3fe5ad3843ab3242cb7ce5e3482cdea773ffdba381c15607f0df3aa138"
      }
    }
  }
}
```

Then ask Claude things like *"verify blob r0Bix… is on-chain"* or *"list the
latest ChainMind vault entries"* — it will call these tools, hitting Tatum's
Sui RPC under the hood.

## Environment

| Var | Default |
|---|---|
| `TATUM_SUI_RPC` | public testnet fullnode (set your keyed Tatum gateway URL for production) |
| `VAULT_PACKAGE_ID` | the deployed testnet package |
| `WALRUS_AGGREGATOR_URL` | `aggregator.walrus-testnet.walrus.space` |
| `SUI_NETWORK` | `testnet` (affects explorer links) |
