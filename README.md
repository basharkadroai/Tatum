# ChainMind AI — Decentralized Knowledge Vault

> **Tatum × Walrus | Build on Sui Hackathon** · Submission deadline June 6, 2026 · 17:00 UTC

A decentralized AI knowledge vault. Upload any document — stored permanently on Walrus, summarized by AI, and the blob reference recorded on-chain via Tatum's Sui RPC.

## Live App

**https://chainmind-seven.vercel.app**

## What it does

1. **Upload any file** — PDF, DOCX, XLSX, TXT, MD, JSON, CSV, code, images, anything
2. **Walrus** stores the file as an erasure-coded blob (permanent, decentralized)
3. **Groq AI** generates a summary instantly (`llama-3.3-70b-versatile`)
4. **Sui transaction** records the `blobId` on-chain via **Tatum RPC** — verifiable proof of storage
5. **Ask anything** — RAG-style Q&A against the document content

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 + React |
| AI | Groq (`llama-3.3-70b-versatile`) |
| Decentralized storage | Walrus testnet |
| Blockchain | Sui testnet |
| RPC | **Tatum Sui RPC** |
| Hosting | Vercel |

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Smiley617/Tatum
cd chainmind
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
TATUM_API_KEY=your_tatum_api_key
NEXT_PUBLIC_TATUM_SUI_RPC=https://sui-mainnet.tatum.io/YOUR_KEY
NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC=https://sui-testnet.tatum.io/YOUR_KEY
NEXT_PUBLIC_SUI_NETWORK=testnet
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
NEXT_PUBLIC_VAULT_PACKAGE_ID=0x1a20ef3fe5ad3843ab3242cb7ce5e3482cdea773ffdba381c15607f0df3aa138
SUI_DEPLOYER_KEY=your_deployer_keypair_from_sui_keystore
```

### 3. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

### 4. Deploy Move contract (one-time)

```bash
# Testnet package (already deployed):
# 0x1a20ef3fe5ad3843ab3242cb7ce5e3482cdea773ffdba381c15607f0df3aa138

# To redeploy:
cd contracts/chainmind
sui client publish --gas-budget 50000000
```

## How to use

1. Open the app — upload any file by clicking or dragging
2. Watch: Walrus stores it → AI summarizes → Sui records the blobId on-chain
3. Click the green blob link to view the raw file on Walrus
4. Click the purple ⛓ tx link to see the on-chain record on Sui Explorer
5. Click **Ask AI** on any file to chat with its content

## Smart contract

`chainmind::vault::register(blobId, filename, fileType, sizeBytes)` — deployed to Sui testnet.

Every upload creates a `VaultEntry` object on Sui, permanently linking the Walrus blob to the transaction that registered it.

**Testnet package:** `0x1a20ef3fe5ad3843ab3242cb7ce5e3482cdea773ffdba381c15607f0df3aa138`
**Deploy tx:** `FvYYjikc5HR2LV4SSyeVaUDTG2CRKR5J5gFbmdTrQ3Sy`

## Hackathon checklist

- [x] Walrus integrated as core feature (real uploads, real blobIds)
- [x] Tatum RPC used for all Sui interactions
- [x] AI summarization (Groq llama-3.3-70b-versatile)
- [x] RAG-style Q&A against uploaded documents
- [x] On-chain blobId registry via Move smart contract
- [x] Any file type supported
- [x] Clean two-column vault UI
- [x] Deployed to Vercel — https://chainmind-seven.vercel.app
- [ ] Demo video (2–3 min)
