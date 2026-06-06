// ── Seal (encryption + on-chain access control) — foundation ──
//
// How Seal works here:
//  1. encrypt(data) with a `packageId` namespace + an `id` → ciphertext stored on Walrus.
//  2. To decrypt, the user's wallet signs a SessionKey, and we build a PTB that
//     calls our Move `seal_approve*` function. The key servers dry-run that PTB;
//     if it doesn't abort (the caller is allowed), they release the key.
//  3. Because `seal_approve` checks on-chain OWNERSHIP, decryption rights follow
//     the object — so a marketplace BUYER can decrypt after purchase.
//
import { SealClient, SessionKey } from '@mysten/seal';
import type { SealCompatibleClient } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';

// Mysten-run permissionless Seal key servers on Sui TESTNET (object IDs).
// threshold 2 over weight-1 servers = both must release a share to decrypt.
export const SEAL_TESTNET_KEY_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];
export const SEAL_THRESHOLD = 2;

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array | number[]): string {
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

export function generateSealId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** Construct a SealClient bound to the testnet key servers. `suiClient` must be a
 *  v2 core-compatible client (has `.core`). */
export function makeSealClient(suiClient: SealCompatibleClient): SealClient {
  return new SealClient({
    suiClient,
    serverConfigs: SEAL_TESTNET_KEY_SERVERS.map(objectId => ({ objectId, weight: 1 })),
    verifyKeyServers: true,
  });
}

/** Encrypt bytes under `packageId` + `id`. Returns the ciphertext to store on Walrus. */
export async function sealEncrypt(
  client: SealClient,
  packageId: string,
  id: string,
  data: Uint8Array,
): Promise<Uint8Array> {
  const { encryptedObject } = await client.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId,
    id,
    data,
  });
  return encryptedObject;
}

/** Build a wallet-signed SessionKey for decryption.
 *  `sign` comes from the wallet (e.g. dapp-kit's signPersonalMessage). */
export async function makeSessionKey(
  suiClient: SealCompatibleClient,
  address: string,
  packageId: string,
  sign: (message: Uint8Array) => Promise<string>,
  ttlMin = 10,
): Promise<SessionKey> {
  const sessionKey = await SessionKey.create({ address, packageId, ttlMin, suiClient });
  const signature = await sign(sessionKey.getPersonalMessage());
  await sessionKey.setPersonalMessageSignature(signature);
  return sessionKey;
}

/** Decrypt ciphertext. `txBytes` is a built PTB that calls our `seal_approve*`. */
export async function sealDecrypt(
  client: SealClient,
  sessionKey: SessionKey,
  txBytes: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  return client.decrypt({ data, sessionKey, txBytes });
}

export async function buildEncryptedSealApprovalTxBytes({
  suiClient,
  approvalPackageId,
  sender,
  entryId,
  policyId,
  sealId,
}: {
  suiClient: SealCompatibleClient;
  approvalPackageId: string;
  sender: string;
  entryId: string;
  policyId: string;
  sealId: string;
}): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({
    target: `${approvalPackageId}::vault::seal_approve_encrypted`,
    arguments: [
      tx.pure.vector('u8', Array.from(hexToBytes(sealId))),
      tx.object(entryId),
      tx.object(policyId),
    ],
  });
  return tx.build({ client: suiClient, onlyTransactionKind: true });
}
