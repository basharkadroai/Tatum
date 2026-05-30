import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { tatumRpcUrl, SUI_NETWORK, IS_MAINNET } from '@/lib/network';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID!;

// Tatum RPC is the primary — falls back to the public fullnode inside tatumRpcUrl().
const RPC_URL = tatumRpcUrl();

// On TESTNET the reference gas price is a stable 1000 MIST, so we set it
// explicitly to skip the SDK's getReferenceGasPrice + dryRun calls — cutting the
// per-tx RPC count from ~5 to ~2, critical for Tatum's 3 RPS free tier. On
// MAINNET the reference gas price fluctuates, so we let the SDK fetch it.
const GAS_PRICE = 1000; // testnet reference gas price (MIST)
const GAS_BUDGET = 10_000_000; // 0.01 SUI — ample for a single moveCall

function keypair(): Ed25519Keypair {
  const raw = process.env.SUI_DEPLOYER_KEY;
  if (!raw) throw new Error('SUI_DEPLOYER_KEY not set');
  // Sui keystore format: 1-byte scheme flag + 32-byte private key
  return Ed25519Keypair.fromSecretKey(fromBase64(raw).slice(1));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  try {
    const { blobId, filename, fileType, fileSize, owner } = await req.json();
    if (!PACKAGE_ID) throw new Error('NEXT_PUBLIC_VAULT_PACKAGE_ID not set');

    const kp = keypair();
    const sender = kp.getPublicKey().toSuiAddress();
    // Transfer ownership to the user's wallet if provided, else the signer keeps it.
    const recipient = typeof owner === 'string' && owner.startsWith('0x') ? owner : sender;
    const client = new SuiJsonRpcClient({ url: RPC_URL, network: SUI_NETWORK });

    const tx = new Transaction();
    tx.setSender(sender);
    if (!IS_MAINNET) tx.setGasPrice(GAS_PRICE); // mainnet RGP fluctuates → let SDK fetch it
    tx.setGasBudget(GAS_BUDGET);
    tx.moveCall({
      target: `${PACKAGE_ID}::vault::register`,
      arguments: [
        tx.pure.string(blobId),
        tx.pure.string(filename),
        tx.pure.string(fileType || 'application/octet-stream'),
        tx.pure.u64(fileSize),
        tx.pure.address(recipient),
      ],
    });

    // Retry with backoff to absorb the occasional 429 from the 3 RPS free tier
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const result = await client.signAndExecuteTransaction({
          signer: kp,
          transaction: tx,
          options: { showEffects: true },
        });
        if (result.effects?.status?.status === 'failure') {
          throw new Error(`Sui tx failed: ${result.effects.status.error ?? 'unknown'}`);
        }
        console.log('[register] tx:', result.digest, `(attempt ${attempt})`);
        return NextResponse.json({ digest: result.digest });
      } catch (err) {
        lastErr = err;
        const msg = String(err);
        if (msg.includes('429') && attempt < 4) {
          await sleep(attempt * 700); // 700ms, 1.4s, 2.1s
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  } catch (err) {
    console.error('[register] failed:', String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
