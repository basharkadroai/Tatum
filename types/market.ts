export type MarketListing = {
  listingId: string;
  entryId: string;
  filename: string;
  fileType?: string;
  blobId?: string;
  sizeBytes?: number;
  seller: string;
  priceMist: string;
  priceSui: string;
  createdTx?: string;
};
