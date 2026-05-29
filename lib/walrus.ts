const PUBLISHER = process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';

export async function uploadToWalrus(buffer: Buffer, epochs = 5): Promise<string> {
  const url = `${PUBLISHER}/v1/blobs?epochs=${epochs}`;
  console.log(`[walrus] PUT ${url} (${buffer.length} bytes)`);

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(buffer),
  });

  console.log(`[walrus] response status: ${res.status}`);

  if (!res.ok) {
    const text = await res.text();
    console.error(`[walrus] error body: ${text}`);
    throw new Error(`Walrus upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  console.log('[walrus] response JSON:', JSON.stringify(data).slice(0, 300));

  const blobId =
    data.newlyCreated?.blobObject?.blobId ??
    data.alreadyCertified?.blobId;

  if (!blobId) {
    console.error('[walrus] no blobId in response:', data);
    throw new Error('Walrus returned no blobId');
  }

  console.log(`[walrus] blobId: ${blobId}`);
  return blobId;
}

export function walrusBlobUrl(blobId: string): string {
  return `${AGGREGATOR}/v1/blobs/${blobId}`;
}
