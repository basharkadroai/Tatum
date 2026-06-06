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

// A fractional-investing offering: a file split into shares investors can buy.
export type ShareOffering = {
  vaultId: string;
  entryId: string;
  creator: string;
  filename: string;
  fileType?: string;
  blobId?: string;
  sizeBytes?: number;
  totalShares: number;
  sharesSold: number;
  pricePerShareMist: string;
  pricePerShareSui: string;
};

export type MarketTxEvent = {
  kind: 'listed' | 'sold' | 'delisted';
  listingId?: string;
  entryId?: string;
  priceMist?: string;
  seller?: string;
  buyer?: string;
};
