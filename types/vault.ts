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
  owner?: string; // set when the user claims the file on-chain with their own wallet
  tags?: string[]; // AI-generated topic tags
  questions?: string[]; // AI-generated suggested questions for this file
}
