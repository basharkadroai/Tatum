// A content-coin market: a per-file bonding-curve attention market.
export type ContentCoinMarket = {
  marketId: string;
  blobId: string;
  filename: string;
  creator: string;
  supply: number;        // coins minted so far
  reserveMist: string;   // SUI locked in the curve
  reserveSui: string;
  priceMist: string;     // current marginal price (next coin)
  priceSui: string;
};
