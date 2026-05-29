import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID!;
const RPC_URL = 'https://fullnode.testnet.sui.io:443';

function keypair(): Ed25519Keypair {
  const raw = process.env.SUI_DEPLOYER_KEY;
  if (!raw) throw new Error('SUI_DEPLOYER_KEY not set');
  const bytes = fromBase64(raw);
  return Ed25519Keypair.fromSecretKey(bytes.slice(1));
}

export async function POST(req: NextRequest) {
  try {
    const { blobId, filename, fileType, fileSize } = await req.json();

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
    });

    console.log('[register] tx:', result.digest);
    return NextResponse.json({ digest: result.digest });
  } catch (err) {
    console.error('[register] failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
