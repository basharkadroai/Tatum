module chainmind::vault {
    use std::string::String;
    use sui::event;

    public struct VaultEntry has key, store {
        id: UID,
        blob_id: String,
        filename: String,
        file_type: String,
        size_bytes: u64,
        owner: address,
    }

    public struct BlobRegistered has copy, drop {
        blob_id: String,
        filename: String,
        owner: address,
        entry_id: ID,
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
}
