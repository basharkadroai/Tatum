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

    public entry fun register(
        blob_id: String,
        filename: String,
        file_type: String,
        size_bytes: u64,
        ctx: &mut TxContext,
    ) {
        let entry = VaultEntry {
            id: object::new(ctx),
            blob_id,
            filename,
            file_type,
            size_bytes,
            owner: ctx.sender(),
        };
        let entry_id = object::id(&entry);
        event::emit(BlobRegistered {
            blob_id: entry.blob_id,
            filename: entry.filename,
            owner: entry.owner,
            entry_id,
        });
        transfer::transfer(entry, ctx.sender());
    }
}
