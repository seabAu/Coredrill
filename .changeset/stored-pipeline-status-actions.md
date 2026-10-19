---
"@coredrill/web": minor
"@coredrill/ui": minor
"@coredrill/application": minor
"@coredrill/storage-core": minor
---

Connect normal Board moves and Table status edits to guarded local SQLite transactions and durable undo. Retain editor versions and failed drafts, refresh peer projections after acknowledgement, require explicit terminal reopening and route initial Applied changes through exact-document review. Preserve submitted snapshots and leave unconnected scalar controls unavailable.

Correct the offline notification's live-region markup. No schema, dependency or permission changes.
