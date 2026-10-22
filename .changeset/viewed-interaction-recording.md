---
"@coredrill/application": patch
"@coredrill/storage-core": patch
---

Add a versioned viewed-vault/job/contact expectation and an interactive-only
SQLite interaction-recording port. Reject stale or archived owners before
inserting, reconcile an exact fixed-identity retry without a second insert, and
validate exact readback before committing. Existing trusted activity runners
remain compatible. Normal runtime/composer integration is still required; no
schema, permission, sending or source capability changes.
