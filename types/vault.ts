export interface VaultItem {
  id: string;
  filename: string;
  fileType: string;
  blobId: string;
  summary: string;
  content: string;
  uploadedAt: string;
  sizeBytes: number;
  txDigest?: string;
  entryId?: string;
  listingId?: string;
  priceMist?: string;
  listed?: boolean;
  owner?: string; // set when the user claims the file on-chain with their own wallet
  purchased?: boolean; // bought on the marketplace — highlighted in the sidebar
  tags?: string[]; // AI-generated topic tags
  questions?: string[]; // AI-generated suggested questions for this file
  encrypted?: boolean;
  sealId?: string;
  sealPolicyId?: string;
  ciphertextSizeBytes?: number;
  decryptedAt?: string;
}
