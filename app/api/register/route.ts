import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID!;

// Tatum RPC is the primary — fallback to public testnet
const RPC_URL =
  process.env.NEXT_PUBLIC_TATUM_SUI_TESTNET_RPC ||
  getJsonRpcFullnodeUrl('testnet');

function keypair(): Ed25519Keypair {
  const raw = process.env.SUI_DEPLOYER_KEY;
  if (!raw) throw new Error('SUI_DEPLOYER_KEY not set');
  // Sui keystore format: 1-byte scheme flag + 32-byte private key
  return Ed25519Keypair.fromSecretKey(fromBase64(raw).slice(1));
}

export async function POST(req: NextRequest) {
  try {
    const { blobId, filename, fileType, fileSize } = await req.json();

    if (!PACKAGE_ID) throw new Error('NEXT_PUBLIC_VAULT_PACKAGE_ID not set');

    const kp = keypair();
    const client = new SuiJsonRpcClient({ url: RPC_URL, network: 'testnet' });

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::vault::register`,
      arguments: [
        tx.pure.string(blobId),
        tx.pure.string(filename),
        tx.pure.string(fileType || 'application/octet-stream'),
        tx.pure.u64(fileSize),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showEffects: true },
    });

    // Check for execution failure
    if (result.effects?.status?.status === 'failure') {
      throw new Error(`Sui tx failed: ${result.effects.status.error ?? 'unknown'}`);
    }

    const digest = result.digest;
    console.log('[register] tx:', digest);
    return NextResponse.json({ digest });
  } catch (err) {
    console.error('[register] failed:', String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
