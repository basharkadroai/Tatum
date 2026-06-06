module chainmind::vault {
    use std::string::String;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};

    const ENoAccess: u64 = 0;
    const EWrongPrice: u64 = 1;
    const ENotSeller: u64 = 2;
    const EBadPrice: u64 = 3;
    const ESelfBuy: u64 = 4;
    const EZeroAmount: u64 = 5;
    const ENotEnoughShares: u64 = 6;
    const ENothingToClaim: u64 = 7;

    // Fixed-point scale for the per-share dividend accumulator.
    const ACC_SCALE: u128 = 1_000_000_000_000;

    public struct VaultEntry has key, store {
        id: UID,
        blob_id: String,
        filename: String,
        file_type: String,
        size_bytes: u64,
        owner: address,
    }

    /// A VaultEntry listed for sale. Shared so any buyer can purchase it.
    public struct Listing has key {
        id: UID,
        entry: VaultEntry,
        price: u64,
        seller: address,
    }

    public struct BlobRegistered has copy, drop {
        blob_id: String,
        filename: String,
        owner: address,
        entry_id: ID,
    }

    public struct Listed has copy, drop {
        entry_id: ID,
        listing_id: ID,
        price: u64,
        seller: address,
        filename: String,
    }

    // NOTE: Sold/Delisted field layout MUST match the deployed package (no
    // listing_id) — Sui forbids changing struct fields in an upgrade.
    public struct Sold has copy, drop {
        entry_id: ID,
        price: u64,
        seller: address,
        buyer: address,
    }

    public struct Delisted has copy, drop {
        entry_id: ID,
        seller: address,
    }

    /// Register a Walrus blob on-chain and transfer the VaultEntry to `owner`,
    /// so an uploaded file is owned by the user's wallet (not the signer).
    public entry fun register(
        blob_id: String,
        filename: String,
        file_type: String,
        size_bytes: u64,
        owner: address,
        ctx: &mut TxContext,
    ) {
        let entry = VaultEntry {
            id: object::new(ctx),
            blob_id,
            filename,
            file_type,
            size_bytes,
            owner,
        };
        let entry_id = object::id(&entry);
        event::emit(BlobRegistered {
            blob_id: entry.blob_id,
            filename: entry.filename,
            owner: entry.owner,
            entry_id,
        });
        transfer::public_transfer(entry, owner);
    }

    /// Seal key servers dry-run this function. It aborts unless the requester
    /// owns the VaultEntry and the Seal identity matches the entry object ID.
    entry fun seal_approve(id: vector<u8>, entry: &VaultEntry, ctx: &TxContext) {
        assert!(entry.owner == ctx.sender(), ENoAccess);
        assert!(id == object::id(entry).to_bytes(), ENoAccess);
    }

    /// List a wallet-owned VaultEntry for sale at `price` MIST.
    public entry fun list(entry: VaultEntry, price: u64, ctx: &mut TxContext) {
        let entry_id = object::id(&entry);
        let seller = ctx.sender();
        assert!(price > 0, EBadPrice);
        assert!(entry.owner == seller, ENoAccess);
        let filename = entry.filename;
        let listing = Listing {
            id: object::new(ctx),
            entry,
            price,
            seller,
        };
        let listing_id = object::id(&listing);
        event::emit(Listed { entry_id, listing_id, price, seller, filename });
        transfer::share_object(listing);
    }

    /// Buy a listed entry. Payment must exactly match the list price.
    public entry fun buy(listing: Listing, payment: Coin<SUI>, ctx: &mut TxContext) {
        let Listing { id, mut entry, price, seller } = listing;
        assert!(coin::value(&payment) == price, EWrongPrice);
        let buyer = ctx.sender();
        assert!(buyer != seller, ESelfBuy);
        let entry_id = object::id(&entry);
        entry.owner = buyer;
        transfer::public_transfer(entry, buyer);
        transfer::public_transfer(payment, seller);
        event::emit(Sold { entry_id, price, seller, buyer });
        object::delete(id);
    }

    /// Cancel a listing and return the VaultEntry to the seller.
    public entry fun delist(listing: Listing, ctx: &mut TxContext) {
        let Listing { id, entry, price: _, seller } = listing;
        assert!(seller == ctx.sender(), ENotSeller);
        let entry_id = object::id(&entry);
        transfer::public_transfer(entry, seller);
        event::emit(Delisted { entry_id, seller });
        object::delete(id);
    }

    // ── Fractional investing ──────────────────────────────────────────────
    // A data asset can be offered as fractional SHARES. Investors buy shares
    // (SUI → creator). Later proceeds (e.g. a resale) are added to the pool via
    // `distribute`, and each shareholder pulls their pro-rata cut via `claim`
    // (a dividend accumulator — scales to any number of holders without loops).

    public struct ShareVault has key {
        id: UID,
        entry: VaultEntry,
        creator: address,
        filename: String,
        total_shares: u64,
        shares_sold: u64,
        price_per_share: u64,
        pool: Balance<SUI>,
        acc_per_share: u128,
    }

    public struct Share has key, store {
        id: UID,
        vault_id: ID,
        amount: u64,
        reward_debt: u128,
    }

    public struct SharesOffered has copy, drop { vault_id: ID, entry_id: ID, creator: address, total_shares: u64, price_per_share: u64, filename: String }
    public struct SharesBought has copy, drop { vault_id: ID, buyer: address, amount: u64, cost: u64 }
    public struct Distributed has copy, drop { vault_id: ID, amount: u64, by: address }
    public struct Claimed has copy, drop { vault_id: ID, holder: address, amount: u64 }

    /// Offer an owned entry as `total_shares` fractional shares at `price_per_share` MIST each.
    public entry fun offer_shares(entry: VaultEntry, total_shares: u64, price_per_share: u64, ctx: &mut TxContext) {
        let creator = ctx.sender();
        assert!(entry.owner == creator, ENoAccess);
        assert!(total_shares > 0, EZeroAmount);
        assert!(price_per_share > 0, EBadPrice);
        let entry_id = object::id(&entry);
        let filename = entry.filename;
        let vault = ShareVault {
            id: object::new(ctx), entry, creator, filename,
            total_shares, shares_sold: 0, price_per_share,
            pool: balance::zero<SUI>(), acc_per_share: 0,
        };
        let vault_id = object::id(&vault);
        event::emit(SharesOffered { vault_id, entry_id, creator, total_shares, price_per_share, filename });
        transfer::share_object(vault);
    }

    /// Buy `amount` shares; pays amount * price_per_share to the creator.
    public entry fun buy_shares(vault: &mut ShareVault, amount: u64, payment: Coin<SUI>, ctx: &mut TxContext) {
        assert!(amount > 0, EZeroAmount);
        assert!(vault.shares_sold + amount <= vault.total_shares, ENotEnoughShares);
        assert!(coin::value(&payment) == amount * vault.price_per_share, EWrongPrice);
        let vault_id = object::id(vault);
        transfer::public_transfer(payment, vault.creator);
        vault.shares_sold = vault.shares_sold + amount;
        let buyer = ctx.sender();
        let share = Share { id: object::new(ctx), vault_id, amount, reward_debt: vault.acc_per_share };
        event::emit(SharesBought { vault_id, buyer, amount, cost: amount * vault.price_per_share });
        transfer::public_transfer(share, buyer);
    }

    /// Add proceeds (e.g. resale revenue) to the pool, credited pro-rata to shares sold.
    public entry fun distribute(vault: &mut ShareVault, payment: Coin<SUI>, ctx: &mut TxContext) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EZeroAmount);
        assert!(vault.shares_sold > 0, ENotEnoughShares);
        let vault_id = object::id(vault);
        vault.acc_per_share = vault.acc_per_share + (amount as u128) * ACC_SCALE / (vault.shares_sold as u128);
        balance::join(&mut vault.pool, coin::into_balance(payment));
        event::emit(Distributed { vault_id, amount, by: ctx.sender() });
    }

    /// Claim a Share's accrued proceeds from the pool.
    public entry fun claim(vault: &mut ShareVault, share: &mut Share, ctx: &mut TxContext) {
        let vault_id = object::id(vault);
        assert!(share.vault_id == vault_id, ENoAccess);
        let accrued = ((vault.acc_per_share - share.reward_debt) * (share.amount as u128) / ACC_SCALE) as u64;
        assert!(accrued > 0, ENothingToClaim);
        share.reward_debt = vault.acc_per_share;
        let payout = coin::take(&mut vault.pool, accrued, ctx);
        transfer::public_transfer(payout, ctx.sender());
        event::emit(Claimed { vault_id, holder: ctx.sender(), amount: accrued });
    }
}
