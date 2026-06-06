import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { tatumRpcUrl, SUI_NETWORK, IS_MAINNET } from '@/lib/network';

const PACKAGE_ID = process.env.NEXT_PUBLIC_VAULT_PACKAGE_ID!;
const PACKAGE_LATEST = process.env.NEXT_PUBLIC_VAULT_PACKAGE_LATEST || PACKAGE_ID;
const RPC_URL = tatumRpcUrl();
const GAS_PRICE = 1000;
const GAS_BUDGET = 12_000_000;

function keypair(): Ed25519Keypair {
  const raw = process.env.SUI_DEPLOYER_KEY;
  if (!raw) throw new Error('SUI_DEPLOYER_KEY not set');
  return Ed25519Keypair.fromSecretKey(fromBase64(raw).slice(1));
}

function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length !== 64 || !/^[0-9a-fA-F]+$/.test(clean)) throw new Error('Invalid Seal ID');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function idsFromResult(result: {
  events?: Array<{ type?: string; parsedJson?: unknown }> | null;
  objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> | null;
}) {
  const event = result.events?.find(e => e.type?.endsWith('::vault::EncryptedBlobRegistered'));
  const parsed = event?.parsedJson;
  if (parsed && typeof parsed === 'object') {
    const p = parsed as Record<string, unknown>;
    return {
      entryId: p.entry_id ? String(p.entry_id) : undefined,
      policyId: p.policy_id ? String(p.policy_id) : undefined,
    };
  }
  const entry = result.objectChanges?.find(c => c.type === 'created' && c.objectType?.endsWith('::vault::VaultEntry'));
  const policy = result.objectChanges?.find(c => c.type === 'created' && c.objectType?.endsWith('::vault::SealPolicy'));
  return { entryId: entry?.objectId, policyId: policy?.objectId };
}

export async function POST(req: NextRequest) {
  try {
    const { blobId, filename, fileType, fileSize, owner, sealId } = await req.json();
    if (!PACKAGE_ID || !PACKAGE_LATEST) throw new Error('Vault package ID not set');
    if (typeof sealId !== 'string') throw new Error('sealId is required');

    const kp = keypair();
    const sender = kp.getPublicKey().toSuiAddress();
    const recipient = typeof owner === 'string' && owner.startsWith('0x') ? owner : sender;
    const client = new SuiJsonRpcClient({ url: RPC_URL, network: SUI_NETWORK });

    const tx = new Transaction();
    tx.setSender(sender);
    if (!IS_MAINNET) tx.setGasPrice(GAS_PRICE);
    tx.setGasBudget(GAS_BUDGET);
    tx.moveCall({
      target: `${PACKAGE_LATEST}::vault::register_encrypted`,
      arguments: [
        tx.pure.string(blobId),
        tx.pure.string(filename),
        tx.pure.string(fileType || 'application/octet-stream'),
        tx.pure.u64(fileSize),
        tx.pure.address(recipient),
        tx.pure.vector('u8', hexToBytes(sealId)),
      ],
    });

    let lastErr: unknown;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const result = await client.signAndExecuteTransaction({
          signer: kp,
          transaction: tx,
          options: { showEffects: true, showEvents: true, showObjectChanges: true },
        });
        if (result.effects?.status?.status === 'failure') {
          throw new Error(`Sui tx failed: ${result.effects.status.error ?? 'unknown'}`);
        }
        const ids = idsFromResult(result);
        console.log('[register-encrypted] tx:', result.digest, `(attempt ${attempt})`);
        return NextResponse.json({ digest: result.digest, ...ids });
      } catch (err) {
        lastErr = err;
        if (String(err).includes('429') && attempt < 4) {
          await sleep(attempt * 700);
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  } catch (err) {
    console.error('[register-encrypted] failed:', String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
