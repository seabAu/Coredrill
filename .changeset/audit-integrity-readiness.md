---
"@coredrill/storage-core": minor
---

Add stable local-device persistence, monotonic audit validation, soft-archive coverage proof, and database-enforced application-document, immutable-version, and append-only history constraints.

Compatibility: existing databases advance from schema version `31` to `45` through fail-closed forward migrations. This reserves local identity and conflict-detection fields without adding sync operations, a CRDT, accounts, or final multi-device tombstone semantics.
