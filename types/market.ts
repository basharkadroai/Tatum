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

export type MarketTxEvent = {
  kind: 'listed' | 'sold' | 'delisted';
  listingId?: string;
  entryId?: string;
  priceMist?: string;
  seller?: string;
  buyer?: string;
};
