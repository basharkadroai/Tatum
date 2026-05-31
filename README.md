# 🧠 ChainMind AI — Your Decentralized, Verifiable Knowledge Vault

> **Submission for the Tatum × Walrus — Build on Sui Hackathon** (May 23 – June 6, 2026)
> Upload anything → it's stored on **Walrus**, recorded **on Sui via Tatum**, read by **AI**, and **verifiable on-chain** — a knowledge base you actually *own* and can restore from the chain on any device.

### 🔗 Live app: **https://chainmind-seven.vercel.app**
### 📦 Repo: **https://github.com/basharkadroai/Tatum**

---

## The problem

AI knowledge tools (Notion AI, ChatGPT memory, Glean…) lock your documents inside **centralized silos**: you can't verify what's stored, you can't prove provenance, and you can't take your data with you. At the same time, the wider industry has converged on a thesis Walrus itself champions in 2026 — *"verifiable data is the missing layer in AI."* Datasets and content that feed AI need to be **provable, owned, and portable**.

## The solution

**ChainMind** is an AI knowledge vault where every file is:

- **Stored on Walrus** — permanent, erasure-coded, decentralized blob storage (not our server).
- **Recorded on Sui via Tatum** — an on-chain `VaultEntry` object owned by *your wallet*, linking the Walrus blob to a verifiable transaction.
- **Read by AI** — summarized, tagged, and made conversational (chat with one file or across your whole vault).
- **Verifiable & portable** — the app reads the record *back* from chain via Tatum to prove it, and your vault can be **reconstructed on any device** from Sui + Walrus using just your wallet.

It's a working demonstration of the exact "verifiable, user-owned AI data / agent memory" use case the sponsors are building toward.

---

## ✨ Key features

| Feature | What it does |
|---|---|
| 🐋 **Walrus-native storage** | Every upload is a real erasure-coded blob. The file detail view **re-fetches the blob live from Walrus** ("Live on Walrus — retrieved just now") to prove it's truly on decentralized storage. |
| ⛓️ **On-chain registry (Sui via Tatum)** | A Move contract records each blob as a `VaultEntry`, **transferred to the user's connected wallet**, signed & submitted through **Tatum's Sui RPC**. |
| ✅ **On-chain verification via Tatum** | `/api/verify-chain` reads the `BlobRegistered` event back from Sui through Tatum → *"Verified on-chain via Tatum"* badge with a link to the live `VaultEntry` object. |
| 🎬 **Narrated agentic upload** | Uploading streams an **animated step-chain**: Storing on Walrus → Recording on Sui via Tatum → Reading with AI — each step showing the real blob ID / tx digest. |
| 🤖 **AI summaries + Q&A** | On upload, Groq produces a summary, topic tags, and suggested questions. Chat a single file, **or ask across your whole vault** with **clickable `[filename]` citations** that jump to the source. |
| 🔍 **Smart retrieval** | Vault Q&A sends every file's summary (breadth) but only the top-k relevant files' full content (depth) — fast and scalable as the vault grows. |
| 📥 **Decentralized restore** | Connect your wallet (or paste an address) and your vault **rebuilds from Sui + Walrus** — files owned by that wallet are pulled back and their content re-fetched from Walrus. Truly portable. |
| 🪄 **Auto-read restored files** | Open a restored file and it **automatically re-reads itself from Walrus** with AI (vision/transcription/extraction) — no dead ends, no buttons. |
| 🔑 **Bring your own key (BYOK)** | Chat with **OpenAI, Anthropic Claude, or Google Gemini** using your own API key — or just use the built-in default (Groq). Keys live only in your browser, are sent per-request, and are **never stored server-side**. |
| 🧰 **MCP server (Tatum-backed)** | A Model Context Protocol server lets any AI assistant (Claude Desktop, etc.) query the on-chain vault — every tool reads through **Tatum's Sui RPC**. |
| 🌐 **Mainnet-ready** | One env var flips the entire app between testnet (default, free) and mainnet. |
| 📱 **Polished UX** | Claude-style chat, animated cinematic background, responsive mobile layout, reduced-motion support. |

---

## 🗂️ Supported file types

Any file is **stored on Walrus + recorded on Sui** regardless of type. AI *reading* covers:

| Category | Formats | How it's read |
|---|---|---|
| Text & code | `txt, md, json, csv, html, js, ts, py, …` (~55 exts) | direct |
| Documents | **PDF, DOCX, XLSX, PPTX** | server-side extraction (`pdf-parse`, `mammoth`, `xlsx`, `officeparser`) |
| Images | `jpg, png, gif, webp, …` | **vision** (`meta-llama/llama-4-scout-17b-16e-instruct`) |
| Audio & video | `mp3, wav, m4a, ogg, flac, mp4, webm, mov, …` | **transcription** (`whisper-large-v3-turbo`) |

---

## 🏆 How it meets the hackathon criteria

**Requirements**
- ✅ **Tatum API key + Tatum Sui RPC nodes** — used for *writes* (`register`), *reads* (the `/api/rpc` proxy routes all browser Sui reads through Tatum), *verification* (`/api/verify-chain`), and *vault restore* (`suix_getOwnedObjects`).
- ✅ **Walrus integrated meaningfully** — it's the core storage layer; the app even re-fetches blobs live to prove it.
- ✅ **Built on Sui** (testnet; mainnet supported via one env var).
- ✅ **MCP** (optional/encouraged) — a full Tatum-backed MCP server is included.

**Judging criteria**
- **Walrus + Tatum integration (30%)** — both are first-class: Walrus stores/serves every file; Tatum RPC drives all on-chain writes, reads, and verification, plus an MCP server.
- **Technical quality (30%)** — typed Next.js, one-switch network config (`lib/network.ts`), server-side signing that avoids wallet/rate-limit pitfalls, graceful RPC fallbacks.
- **Creativity (20%)** — narrated agentic upload, ask-across-vault with citations, wallet-portable vault, AI-readable recordings, MCP access.
- **Presentation (20%)** — live demo, this README, in-app proofs.

---

## 🏗️ Architecture

```
                        ┌────────────────────────────────────────────┐
  Browser  ──upload──▶  │ Walrus (erasure-coded blob storage)         │
     │                  └────────────────────────────────────────────┘
     │                         ▲ proof: blob re-fetched live from Walrus
     │
     ├─ /api/register ─────▶ Tatum Sui RPC ─▶ chainmind::vault::register   (signed write → user's wallet)
     ├─ /api/verify-chain ─▶ Tatum Sui RPC ─▶ getTransactionBlock          (read BlobRegistered back)
     ├─ /api/vault-onchain ▶ Tatum Sui RPC ─▶ getOwnedObjects              (rebuild vault from chain)
     ├─ /api/rpc (proxy) ──▶ Tatum Sui RPC                                  (all browser Sui reads)
     ├─ /api/analyze,/ask,/ask-vault ─▶ Groq    (summary, tags, Q&A — text + vision)
     ├─ /api/extract ─▶ pdf-parse / mammoth / xlsx / officeparser          (PDF/DOCX/XLSX/PPTX)
     └─ /api/transcribe ─▶ Groq Whisper                                     (audio / video)

  mcp/chainmind-mcp.mjs ─▶ Tatum Sui RPC   (LLM tools: list / verify / get vault entries)
```

## 🧩 Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 |
| AI | **Groq** default — `llama-3.3-70b-versatile` (chat), `llama-4-scout-17b-16e-instruct` (vision), `whisper-large-v3-turbo` (transcription). **BYOK**: OpenAI · Anthropic · Gemini via OpenAI-compatible endpoints |
| Decentralized storage | **Walrus** (testnet) |
| Blockchain | **Sui** (testnet; mainnet-ready) + Move smart contract |
| RPC | **Tatum Sui RPC Gateway** — writes, reads, verification |
| AI tooling | **MCP server** (Tatum-backed) |
| Wallet | `@mysten/dapp-kit` (Slush + any Sui Wallet-Standard wallet) |
| Hosting | Vercel |

## 📁 Project structure

```
app/
  page.tsx                 # main app (vault, chat, restore, file detail)
  providers.tsx            # dapp-kit wallet + Sui client (via /api/rpc)
  api/
    register/              # sign + submit vault::register via Tatum
    rpc/                   # server proxy → Tatum Sui RPC (browser reads)
    verify-chain/          # read BlobRegistered back from Sui (Tatum)
    vault-onchain/         # list a wallet's VaultEntry objects (Tatum)
    analyze/ ask/ ask-vault/   # Groq summaries + Q&A
    extract/ transcribe/   # PDF/DOCX/XLSX/PPTX + audio/video → text
    health/                # live Tatum/Walrus/Groq status
lib/
  network.ts               # single source of truth for network/RPC/Walrus/explorer
  ai.ts                    # Groq calls + prompts (summary, vault Q&A, vision)
  upload.ts                # narrated upload pipeline + analyzeFile()
  retrieve.ts              # lightweight top-k retrieval for vault Q&A
  walrus.ts                # Walrus upload/aggregator helpers
components/                # ChatPanel, UploadSteps, WalrusProof, FileListItem, …
contracts/chainmind/       # Move package (chainmind::vault)
mcp/                       # Tatum-backed MCP server + test client
```

## 📜 Smart contract

`chainmind::vault::register(blob_id, filename, file_type, size_bytes, owner)` — deployed to Sui testnet.

Each upload creates a `VaultEntry` object and **transfers it to `owner`** (the user's connected wallet, or the signer if none), permanently linking the Walrus blob to the registering transaction and emitting a `BlobRegistered` event. Because entries are **owned by the user's wallet**, the vault can be reconstructed on any device from the chain (`/api/vault-onchain`) + Walrus.

- **Testnet package:** `0x206ac074200b07449d570a97c4f903a50e2ad9125db8254c3e0b1f140f7fec64`
- **Deploy tx:** `FdFmPEJJ9t74cTRj4WGWL1LnfFdMixqykcyd6NF8L4vs`

## 🤖 MCP server

A Tatum-backed [MCP](https://modelcontextprotocol.io) server in [`mcp/`](mcp/) exposes the on-chain vault to any AI assistant. Tools — all reading through **Tatum's Sui RPC**:

| Tool | Description |
|---|---|
| `list_vault_entries` | Recent files registered in the vault |
| `verify_blob` | Check a blob is registered on-chain (returns the proof) |
| `get_vault_entry` | Read a `VaultEntry` object back from chain |
| `get_blob_content_url` | Resolve a blob's Walrus download URL |

```bash
npm run mcp        # start (stdio)
npm run mcp:test   # smoke test all tools against live Tatum RPC
```

See [`mcp/README.md`](mcp/README.md) for the Claude Desktop config.

---

## 🚀 Getting started

### 1. Clone & install
```bash
git clone https://github.com/basharkadroai/Tatum
cd Tatum
npm install
```

### 2. Environment variables
Copy the template and fill it in (`cp .env.example .env.local`):
```env
# Network switch — flip this one line to move the whole app to mainnet
NEXT_PUBLIC_SUI_NETWORK=testnet           # testnet (default, free) | mainnet

# Tatum Sui RPC (free key at https://dashboard.tatum.io)
TATUM_API_KEY=your_tatum_api_key
NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC=https://sui-testnet.gateway.tatum.io/YOUR_KEY
NEXT_PUBLIC_TATUM_SUI_MAINNET_RPC=https://sui-mainnet.gateway.tatum.io/YOUR_KEY

# Walrus (optional; sensible per-network defaults are built in)
# NEXT_PUBLIC_WALRUS_PUBLISHER_URL=
# NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=

# AI (Groq)
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# Sui Move contract
NEXT_PUBLIC_VAULT_PACKAGE_ID=0x206ac074200b07449d570a97c4f903a50e2ad9125db8254c3e0b1f140f7fec64
SUI_DEPLOYER_KEY=your_deployer_keypair_from_sui_keystore   # Sui keystore base64; server signs + pays gas
```

### 3. Run
```bash
npm run dev          # http://localhost:3000
```

### 4. (Optional) Redeploy the Move contract
```bash
cd contracts/chainmind
sui client publish --gas-budget 100000000
```

## 🌐 Running on mainnet

Everything is derived from `NEXT_PUBLIC_SUI_NETWORK` via `lib/network.ts`, so to go mainnet:
1. `NEXT_PUBLIC_SUI_NETWORK=mainnet`
2. Set `NEXT_PUBLIC_TATUM_SUI_MAINNET_RPC` to your Tatum mainnet gateway URL
3. Publish the contract to mainnet → set `NEXT_PUBLIC_VAULT_PACKAGE_ID`
4. Set `NEXT_PUBLIC_WALRUS_PUBLISHER_URL` to a funded mainnet publisher (mainnet writes cost WAL)
5. Fund `SUI_DEPLOYER_KEY`'s wallet with **SUI** (gas) and **WAL** (storage)

We run on **testnet by default** so the live demo stays free; mainnet is fully supported by the same codebase.

## 🔐 Privacy & roadmap

- **Today:** Walrus blobs are **public and unencrypted** (anyone with the blob ID can read them), which suits shareable knowledge. The UI isolates each browser's vault locally, and on-chain ownership is scoped to your wallet.
- **Roadmap:** **Seal** (Mysten's encryption + on-chain access control) for private, owner-gated vaults; OpenDocument support; larger uploads via Walrus chunking; agent-memory API.

## ✅ Hackathon checklist

- [x] Walrus integrated as the core (real blobs + live retrieval proof)
- [x] Tatum Sui RPC for writes **and** reads (`register`, `/api/rpc`, `/api/verify-chain`, `/api/vault-onchain`)
- [x] On-chain verification — `VaultEntry` read back from Sui via Tatum
- [x] MCP server backed by Tatum Sui RPC
- [x] AI summaries + Q&A (text, vision, transcription) with clickable citations
- [x] Wallet-owned on-chain registry + decentralized cross-device restore
- [x] Wide file support: docs, slides, sheets, code, images, audio, video
- [x] Mainnet-ready (one env var); runs free on testnet
- [x] Deployed to Vercel + polished responsive UI
- [ ] 2–3 min demo video

---

*Built with Tatum Sui RPC · Walrus · Sui · Groq · MCP.*
