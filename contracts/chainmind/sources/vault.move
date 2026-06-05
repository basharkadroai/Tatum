module chainmind::vault {
    use std::string::String;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;

    const ENoAccess: u64 = 0;
    const EWrongPrice: u64 = 1;
    const ENotSeller: u64 = 2;
    const EBadPrice: u64 = 3;
    const ESelfBuy: u64 = 4;

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

    public struct Sold has copy, drop {
        entry_id: ID,
        listing_id: ID,
        price: u64,
        seller: address,
        buyer: address,
    }

    public struct Delisted has copy, drop {
        entry_id: ID,
        listing_id: ID,
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
        let listing_id = object::id(&listing);
        let Listing { id, mut entry, price, seller } = listing;
        assert!(coin::value(&payment) == price, EWrongPrice);
        let buyer = ctx.sender();
        assert!(buyer != seller, ESelfBuy);
        let entry_id = object::id(&entry);
        entry.owner = buyer;
        transfer::public_transfer(entry, buyer);
        transfer::public_transfer(payment, seller);
        event::emit(Sold { entry_id, listing_id, price, seller, buyer });
        object::delete(id);
    }

    /// Cancel a listing and return the VaultEntry to the seller.
    public entry fun delist(listing: Listing, ctx: &mut TxContext) {
        let listing_id = object::id(&listing);
        let Listing { id, entry, price: _, seller } = listing;
        assert!(seller == ctx.sender(), ENotSeller);
        let entry_id = object::id(&entry);
        transfer::public_transfer(entry, seller);
        event::emit(Delisted { entry_id, listing_id, seller });
        object::delete(id);
    }
}
