# 🧠 ChainMind — your AI, on data you provably own

> **Submission for the Tatum × Build on Sui with Walrus hackathon** (May 23 – June 6, 2026)

**ChainMind is an AI agent over a vault of files you own on-chain.** Every file is stored as a blob on **Walrus** and registered as an owned object on **Sui** through **Tatum's** Sui RPC. The agent searches your vault, searches the web, generates new files, and stores them back on-chain — and even your chat history lives on Walrus, so it follows your wallet to any device.

> 🔗 Live: https://chainmind-seven.vercel.app · Network: Sui **testnet** (flip to mainnet via one env var)

---

## Why it's different

Most "AI + your files" tools put your data in someone's database. ChainMind puts it on **decentralized storage you own**:

- **You own the data.** Each upload becomes a `VaultEntry` object on Sui owned by your wallet, with the bytes on Walrus. Wipe your browser, open it on another device, connect the same wallet → **Restore vault from chain** rebuilds everything (files *and* chats) from Sui + Walrus alone.
- **The AI works on owned data.** A LangChain agent reads across your vault, cites sources as clickable files, searches the web, and — when it *creates* something — offers to store it back on-chain in one click.
- **No lock-in.** No centralized database. Sui is the index of ownership; Walrus is the storage; Tatum is the gateway.

---

## How we use Walrus + Tatum (the hackathon core)

### Walrus (decentralized storage)
- **Every file** uploaded to ChainMind is `PUT` to the Walrus publisher and addressed by its `blobId`; reads come from the Walrus aggregator.
- **Chat history** is serialized and stored on Walrus (a hidden `.chat` blob), making conversations portable and trustless — not just the files.
- **Generated content** (agent output) is stored the same way, so AI artifacts are first-class owned blobs.

### Tatum (Sui RPC)
All Sui reads and writes route through **Tatum's gateway** (`sui-testnet.gateway.tatum.io`):
- `lib/network.ts` derives the RPC from the Tatum gateway; the browser never hits Sui directly — it goes through the `/api/rpc` **Tatum proxy** (`app/api/rpc/route.ts`), with a public fullnode only as a 429 fallback.
- `app/api/register/route.ts` mints each `VaultEntry` on Sui via Tatum RPC (server-signed, so storing is **gasless for the user** on testnet) and transfers ownership to the connected wallet.
- `app/api/vault-onchain/route.ts` reconstructs a wallet's entire vault from Sui via Tatum.
- The wallet's live **SUI balance** is fetched with `suix_getAllBalances` through the same Tatum proxy and shown in the UI.

### Sui
- Move entry `vault::register` records `{ blobId, filename, fileType, fileSize, owner }` as an owned object — the on-chain proof behind every file.

---

## Features

- 🧠 **AI agent** (LangChain 1.0 + Groq, free tier) — searches your vault, answers with **clickable file citations**, and **streams** its response token-by-token (code renders live in its window). One unified activity chain shows the tools it's using.
- 🌐 **Web search** via Tavily, cited in answers.
- ✍️ **Create → store on-chain** — ask it to write a doc/script; it streams the result and offers a one-click, **context-aware Store on-chain** (Walrus + Sui), storing the precise artifact (just the code block when that's what you made).
- 🗂️ **On-chain vault** — upload any file; stored on Walrus + owned on Sui, restorable anywhere from your wallet.
- 💬 **Portable chat history** — per-file conversations persist locally and back up to Walrus + Sui.
- 🎙️ **Voice input** — hold-to-talk or tap-to-toggle, live waveform (Web Speech API + Groq Whisper fallback).
- 🟢 Animated pixel agent mascot that works while the agent works.

---

## Architecture

```
            Browser (Next.js / React)
        ┌───────────────┬───────────────┐
        │   Chat UI     │   Vault UI    │
        └───────┬───────┴───────┬───────┘
                │               │
   /api/agent (LangChain+Groq)  │  /api/rpc ─────────► Tatum Sui RPC gateway
   /api/ask · /api/ask-vault    │  /api/register ────► Sui (VaultEntry, server-signed via Tatum)
                │               │  /api/vault-onchain ► restore vault from Sui via Tatum
                ▼               ▼
     Walrus publisher / aggregator  ◄── files · generated content · chat history (blobs)
```

---

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

Required env (`.env.local`):

```
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC=https://sui-testnet.gateway.tatum.io/<YOUR_TATUM_KEY>
NEXT_PUBLIC_VAULT_PACKAGE_ID=<deployed vault package id>
SUI_DEPLOYER_KEY=<sui keypair (base64) that pays gas + owns the register fn>
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
GROQ_API_KEY=<groq key>       # free-tier LLM + Whisper transcription
TAVILY_API_KEY=<tavily key>   # optional: web search
```

Get a free Tatum Sui RPC key at [dashboard.tatum.io](https://dashboard.tatum.io). To run on **mainnet**, set `NEXT_PUBLIC_SUI_NETWORK=mainnet`, point the RPC at the mainnet gateway, deploy the package to mainnet, and supply a funded Walrus publisher (mainnet writes cost WAL).

---

## Tech
Next.js 16 · React 19 · TypeScript · LangChain 1.0 + Groq · Walrus · Sui (`@mysten/sui`, `@mysten/dapp-kit`) · **Tatum Sui RPC**.

## Judging-criteria map
- **Walrus + Tatum integration (30%)** — files, AI output, and chat history all on Walrus; every Sui read/write through Tatum's gateway (proxy, register, restore, balances).
- **Technical quality (30%)** — typed end-to-end, server-signed gasless writes, RPC fallback, streaming agent, restore-from-chain.
- **Creativity (20%)** — the "AI + Walrus" track: an agent that creates and stores data you provably own.
- **Presentation (20%)** — this README + a live deploy + demo video.
