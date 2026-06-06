/// Content coins — Zora-style attention markets for ChainMind files.
/// Each file can have a CoinMarket: a bonding curve where the price rises as
/// people buy and falls as they sell, and the creator earns a fee on every buy.
/// Holdings are tracked as ContentShare objects (Sui can't mint a fresh Coin
/// type per file). The reserve always equals the curve integral, so sells are
/// solvent. Testnet only — speculative by design.
module contentcoin::market {
    use std::string::String;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};

    const EWrongPayment: u64 = 0;
    const EZeroAmount: u64 = 1;
    const ENotEnoughSupply: u64 = 2;
    const EMarketMismatch: u64 = 3;

    const BASE: u128 = 1_000_000;  // starting price per coin (MIST = 0.001 SUI)
    const SLOPE: u128 = 10_000;    // price increase per coin minted (MIST)
    const FEE_BPS: u128 = 100;     // 1% creator fee on each buy

    public struct CoinMarket has key {
        id: UID,
        blob_id: String,
        filename: String,
        creator: address,
        supply: u64,
        reserve: Balance<SUI>,
        creator_earned: u64,
    }

    public struct ContentShare has key, store {
        id: UID,
        market_id: ID,
        amount: u64,
    }

    public struct MarketCreated has copy, drop { market_id: ID, blob_id: String, filename: String, creator: address }
    public struct Bought has copy, drop { market_id: ID, buyer: address, amount: u64, cost: u64, fee: u64, new_supply: u64 }
    public struct Sold has copy, drop { market_id: ID, seller: address, amount: u64, payout: u64, new_supply: u64 }

    /// Total SUI to buy `n` coins starting from supply `s`:
    /// n*BASE + SLOPE*(n*s + n*(n-1)/2) — the integral of a linear price curve.
    fun cost(s: u64, n: u64): u64 {
        let s128 = s as u128;
        let n128 = n as u128;
        ((n128 * BASE) + SLOPE * (n128 * s128 + n128 * (n128 - 1) / 2)) as u64
    }

    /// Open a content-coin market for a file (creator = sender).
    public entry fun create_market(blob_id: String, filename: String, ctx: &mut TxContext) {
        let m = CoinMarket {
            id: object::new(ctx),
            blob_id, filename,
            creator: ctx.sender(),
            supply: 0,
            reserve: balance::zero<SUI>(),
            creator_earned: 0,
        };
        let market_id = object::id(&m);
        event::emit(MarketCreated { market_id, blob_id: m.blob_id, filename: m.filename, creator: m.creator });
        transfer::share_object(m);
    }

    /// Buy `amount` coins on the curve. Payment must equal cost + 1% creator fee.
    public entry fun buy(market: &mut CoinMarket, amount: u64, payment: Coin<SUI>, ctx: &mut TxContext) {
        assert!(amount > 0, EZeroAmount);
        let c = cost(market.supply, amount);
        let fee = ((c as u128) * FEE_BPS / 10000) as u64;
        assert!(coin::value(&payment) == c + fee, EWrongPayment);
        let market_id = object::id(market);
        let mut pay = payment;
        let fee_coin = coin::split(&mut pay, fee, ctx);
        transfer::public_transfer(fee_coin, market.creator);
        market.creator_earned = market.creator_earned + fee;
        balance::join(&mut market.reserve, coin::into_balance(pay));
        market.supply = market.supply + amount;
        let share = ContentShare { id: object::new(ctx), market_id, amount };
        event::emit(Bought { market_id, buyer: ctx.sender(), amount, cost: c, fee, new_supply: market.supply });
        transfer::public_transfer(share, ctx.sender());
    }

    /// Sell a ContentShare back to the curve at the current price.
    public entry fun sell(market: &mut CoinMarket, share: ContentShare, ctx: &mut TxContext) {
        let ContentShare { id, market_id, amount } = share;
        assert!(market_id == object::id(market), EMarketMismatch);
        assert!(amount > 0, EZeroAmount);
        assert!(market.supply >= amount, ENotEnoughSupply);
        let new_supply = market.supply - amount;
        let payout = cost(new_supply, amount);
        market.supply = new_supply;
        let coin_out = coin::take(&mut market.reserve, payout, ctx);
        transfer::public_transfer(coin_out, ctx.sender());
        event::emit(Sold { market_id, seller: ctx.sender(), amount, payout, new_supply });
        object::delete(id);
    }
}
