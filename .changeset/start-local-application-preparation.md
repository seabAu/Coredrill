---
"@coredrill/application": minor
"@coredrill/storage-core": minor
"@coredrill/ui": minor
"@coredrill/web": minor
"@coredrill/storage-browser": patch
---

Start local application preparation from a stored job using an explicitly user-named Preparing stage. Atomically create the attempt, stage when needed, job projection, and timeline event. Reject stale, closed, archived, or already-active attempts without reopening or selecting/submitting documents. No schema migration or default-stage decision changes.

Bound initial OPFS opens to four fresh attempts only for the exact file-handle conflict emitted while a previous worker terminates after reload. Preserve lease acquisition and typed busy exhaustion; never retry user-data writes, transactions, permission/quota failures, or corrupt databases.
