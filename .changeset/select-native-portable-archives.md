---
"@coredrill/storage-native": patch
"@coredrill/desktop": patch
---

Add Rust-owned, non-mutating complete portable archive selection with bounded ordered read chunks, correlated cleanup and independent native/TypeScript hashes. Align internal archive IPC at version 5 without changing user archive formats, SQLite schema, permissions or existing save behavior. Normal restore UI integration remains separate.
