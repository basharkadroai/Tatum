# ChainMind AI — Decentralized Knowledge Vault

> **Tatum × Walrus | Build on Sui Hackathon** · Submission deadline June 6, 2026

A decentralized AI knowledge vault. Upload any document — it is stored permanently on Walrus, summarized by AI, and the blob reference is recorded on the Sui blockchain via Tatum RPC.

## What it does

1. **Upload** a PDF, TXT, MD, JSON, or CSV file
2. **Walrus** stores the file as a blob (erasure-coded, permanent, decentralized)
3. **Groq AI** generates a summary instantly
4. **Sui transaction** records the `blobId` + filename on-chain via Tatum RPC — the user's wallet holds a `VaultEntry` object as proof of ownership
5. **Ask anything** — RAG-style Q&A against the document content

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 + React + Tailwind CSS |
| AI | Groq (`llama-3.3-70b-versatile`) |
| Decentralized storage | Walrus testnet REST API |
| Blockchain | Sui (testnet → mainnet for submission) |
| RPC | Tatum Sui RPC nodes |
| Wallet | Sui dApp Kit + Slush wallet |
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
# Tatum API Keys
TATUM_API_KEY=your_tatum_api_key

# Sui RPC via Tatum
NEXT_PUBLIC_TATUM_SUI_RPC=https://sui-mainnet.tatum.io/YOUR_KEY
NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC=https://sui-testnet.tatum.io/YOUR_TESTNET_KEY

# Network ("testnet" for dev, "mainnet" for submission)
NEXT_PUBLIC_SUI_NETWORK=testnet

# Walrus (testnet)
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space

# Groq AI
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# Smart contract (filled in after deploy)
NEXT_PUBLIC_VAULT_PACKAGE_ID=0x...
```

### 3. Deploy the Move contract (first time only)

```bash
# Install Sui CLI (Linux)
curl -fsSL https://get.sui.io | sh

# Fund testnet wallet via faucet
# Visit https://faucet.sui.io — paste your address from: sui client active-address

# Deploy
cd contracts/chainmind
sui client publish --gas-budget 50000000

# Copy the published package ID into NEXT_PUBLIC_VAULT_PACKAGE_ID in .env.local
# Testnet package (deployed): 0x1a20ef3fe5ad3843ab3242cb7ce5e3482cdea773ffdba381c15607f0df3aa138
```

### 4. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

## How to test

1. Open the app and connect your Slush wallet (set to **Sui Testnet**)
2. Drop any PDF or text file into the upload zone
3. Approve the wallet transaction when prompted
4. See:
   - Green blob ID → click to view the raw file on Walrus
   - Purple tx digest → click to view the on-chain record on Sui Explorer
5. Click **Ask AI** on any card and ask a question about the document

## Deployed app

Live on Vercel — see submission portal for URL.

## Smart contract

The `chainmind::vault` Move module lives in `contracts/chainmind/sources/vault.move`.

When a file is uploaded, the frontend calls `vault::register(blobId, filename, fileType, sizeBytes)` through the user's connected wallet. The transaction is submitted via Tatum's Sui RPC endpoint. The result is a `VaultEntry` Sui object owned by the user's wallet address.

## Hackathon checklist

- [x] Walrus integrated as core feature (real uploads, real blobIds)
- [x] Tatum RPC used for all Sui interactions
- [x] AI summarization + RAG Q&A
- [x] On-chain blobId registry (VaultEntry objects on Sui)
- [x] Clean vault UI with search
- [x] Deployed to Vercel
- [ ] Demo video (2–3 min)
- [ ] Switch to Sui Mainnet + Walrus Mainnet before submission
