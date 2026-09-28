---
"@coredrill/application": minor
"@coredrill/documents": minor
"@coredrill/storage-browser": minor
"@coredrill/storage-core": minor
"@coredrill/storage-native": minor
"@coredrill/ui": minor
"@coredrill/web": minor
---

Add the restricted local document editor with safe paste, undo and redo, recoverable debounced autosave, explicit immutable version creation, and line comparison.

Compatibility: existing vaults advance from schema version `145` to `148`. Portable export version 1 retains schema-145 compatibility and adds the durable editor-draft dataset at schema 148. The shared browser/native repository contract advances to version 9 with an exact-draft optimistic concurrency and rollback case.
