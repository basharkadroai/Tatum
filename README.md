# ChainMind AI — Decentralized Knowledge Vault

> **Tatum × Walrus | Build on Sui Hackathon** · Submission deadline June 6, 2026 · 17:00 UTC

A decentralized AI knowledge vault. Upload any document — stored permanently on Walrus, summarized by AI, and the blob reference recorded on-chain via Tatum's Sui RPC.

## Live App

**https://chainmind-seven.vercel.app**

## What it does

1. **Upload any file** — PDF, DOCX, XLSX, **PPTX**, TXT, MD, JSON, CSV, code, **images** (vision), **audio & video** (transcribed via Whisper), anything
2. **Walrus** stores the file as an erasure-coded blob (permanent, decentralized). The app then **retrieves the blob back from Walrus live** ("Live on Walrus — retrieved just now") to *prove* it's really on decentralized storage.
3. **Groq AI** analyzes it on upload — summary, topic **tags**, and file-specific **suggested questions** in one pass (`llama-3.3-70b-versatile`).
4. **Sui transaction** records the `blobId` on-chain via **Tatum RPC** — a `VaultEntry` object as verifiable proof of storage. Users can optionally **claim it with their own wallet** for true on-chain ownership.
5. **On-chain verification** — the app then **reads the registration back from Sui via Tatum** (`/api/verify-chain`) and shows a *"Verified on-chain via Tatum"* badge, proving the record exists on-chain, not just that a tx was sent.
6. **Chat with your knowledge** — streaming, multi-turn Q&A on a single file, **or ask across your whole vault** with `[filename]` source citations.
7. **MCP server** (`mcp/`) — exposes the on-chain vault to any AI assistant (Claude Desktop), with every tool reading through Tatum's Sui RPC.

### Why this is a deep Walrus + Tatum integration
- **Walrus is the core**, not an add-on — every upload is a real blob, and we *show* it's retrievable from storage on screen.
- **Tatum RPC is used for both writes and reads** — the `vault::register` write is signed and submitted via Tatum, a server-side `/api/rpc` proxy routes all browser reads through Tatum's gateway, and `/api/verify-chain` reads the `BlobRegistered` event + `VaultEntry` back from chain via Tatum.
- **Tatum-backed MCP server** lets an LLM verify and explore the vault on-chain (see [`mcp/README.md`](mcp/README.md)).

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 + React |
| AI | Groq (`llama-3.3-70b-versatile`) |
| Decentralized storage | Walrus testnet |
| Blockchain | Sui testnet |
| RPC | **Tatum Sui RPC** (writes + reads + verification) |
| AI tooling | **MCP server** (Tatum-backed) |
| Hosting | Vercel |

## Architecture

```
Browser ──upload──▶ Walrus (blob)                  proof: retrieve blob back from Walrus
   │                                                proof: read VaultEntry back via Tatum
   ├─ /api/register ─▶ Tatum Sui RPC ─▶ vault::register  (signed write, server keypair)
   ├─ /api/verify-chain ─▶ Tatum Sui RPC ─▶ getTransactionBlock  (on-chain read-back)
   ├─ /api/rpc  (proxy) ─▶ Tatum Sui RPC               (all browser Sui reads)
   └─ /api/ask, /api/analyze ─▶ Groq                   (summaries + Q&A)

mcp/chainmind-mcp.mjs ─▶ Tatum Sui RPC                 (LLM tools: list/verify/get vault entries)
```

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Smiley617/Tatum
cd chainmind
npm install
```

### 2. Environment variables

Copy the template and fill it in (`cp .env.example .env.local`):

```env
# ── Network switch — flip this one line to move the whole app to mainnet ──
NEXT_PUBLIC_SUI_NETWORK=testnet          # testnet (default, free) | mainnet

# ── Tatum Sui RPC (keyed per network; the app picks by NEXT_PUBLIC_SUI_NETWORK) ──
TATUM_API_KEY=your_tatum_api_key
NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC=https://sui-testnet.gateway.tatum.io/YOUR_KEY
NEXT_PUBLIC_TATUM_SUI_MAINNET_RPC=https://sui-mainnet.gateway.tatum.io/YOUR_KEY

# ── Walrus (optional overrides; sensible per-network defaults are built in) ──
# Defaults: aggregator/publisher.walrus-<network>.walrus.space
# Mainnet note: reads work on the public aggregator, but there is NO free public
# mainnet publisher — set NEXT_PUBLIC_WALRUS_PUBLISHER_URL to a funded one to write.
# NEXT_PUBLIC_WALRUS_PUBLISHER_URL=
# NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=

# ── AI + contract ──
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
NEXT_PUBLIC_VAULT_PACKAGE_ID=0x206ac074200b07449d570a97c4f903a50e2ad9125db8254c3e0b1f140f7fec64
SUI_DEPLOYER_KEY=your_deployer_keypair_from_sui_keystore
```

### Running on mainnet

The app is network-agnostic — everything (Tatum RPC, Walrus endpoints, explorer
links, chain id, gas) is derived from `NEXT_PUBLIC_SUI_NETWORK` via `lib/network.ts`.
To run on **Sui mainnet**:

1. `NEXT_PUBLIC_SUI_NETWORK=mainnet`
2. Set `NEXT_PUBLIC_TATUM_SUI_MAINNET_RPC` to your Tatum mainnet gateway URL
3. Publish the Move contract to mainnet and set `NEXT_PUBLIC_VAULT_PACKAGE_ID` to the new package id
4. Set `NEXT_PUBLIC_WALRUS_PUBLISHER_URL` to a funded mainnet publisher (mainnet writes cost WAL)
5. Fund `SUI_DEPLOYER_KEY`'s wallet with **SUI** (gas) and **WAL** (storage)

We run on **testnet** by default so the live demo stays free; mainnet is fully
supported by the same codebase.

### 3. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

### 4. Deploy Move contract (one-time)

```bash
# Testnet package (already deployed):
# 0x206ac074200b07449d570a97c4f903a50e2ad9125db8254c3e0b1f140f7fec64

# To redeploy:
cd contracts/chainmind
sui client publish --gas-budget 50000000
```

## How to use

1. Open the app — upload any file from the chat (the assistant narrates each step as an animated chain)
2. Watch: Walrus stores it → Sui records the blobId via Tatum → AI reads & summarizes it
3. Open a file to see its proof panel: *"Live on Walrus — retrieved just now"* and *"Verified on-chain via Tatum"*, with links to the raw blob and the `VaultEntry` object
4. Ask questions about a single file, or **ask across your whole vault** with source citations

## Smart contract

`chainmind::vault::register(blobId, filename, fileType, sizeBytes, owner)` — deployed to Sui testnet.

Every upload creates a `VaultEntry` object on Sui and transfers it to `owner` (the user's connected wallet, or the signer if none), permanently linking the Walrus blob to the transaction that registered it. Because the entry is **owned by the user's wallet**, the vault can be reconstructed on any device from the chain (`/api/vault-onchain`) + Walrus.

**Testnet package:** `0x206ac074200b07449d570a97c4f903a50e2ad9125db8254c3e0b1f140f7fec64`
**Deploy tx:** `FdFmPEJJ9t74cTRj4WGWL1LnfFdMixqykcyd6NF8L4vs`

## MCP server

A Tatum-backed [MCP](https://modelcontextprotocol.io) server in [`mcp/`](mcp/) exposes
the on-chain vault to any AI assistant. Tools: `list_vault_entries`, `verify_blob`,
`get_vault_entry`, `get_blob_content_url` — all reading through Tatum's Sui RPC.

```bash
npm run mcp        # start (stdio)
npm run mcp:test   # smoke test all tools against live Tatum RPC
```

See [`mcp/README.md`](mcp/README.md) for the Claude Desktop config.

## Hackathon checklist

- [x] Walrus integrated as core feature (real uploads, real blobIds, live retrieval proof)
- [x] Tatum Sui RPC for writes **and** reads (`register`, `/api/rpc` proxy, `/api/verify-chain`)
- [x] On-chain verification — VaultEntry read back from Sui via Tatum
- [x] MCP server backed by Tatum Sui RPC
- [x] AI summarization (Groq llama-3.3-70b-versatile) + vision for images
- [x] RAG-style Q&A on a file or across the whole vault with citations
- [x] On-chain blobId registry via Move smart contract
- [x] Any file type supported, narrated agentic upload
- [x] Mainnet-ready (one env var) — runs on testnet by default
- [x] Deployed to Vercel — https://chainmind-seven.vercel.app
- [ ] Demo video (2–3 min)
