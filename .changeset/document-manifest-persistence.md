---
"@coredrill/storage-core": minor
---

Add AI-independent document persistence with immutable canonical-IR versions, explicit lineage and style-example links, purpose-qualified job relationships, and content-addressed attachment manifests through shared browser/native repository contracts.

Compatibility: existing databases advance from schema version `25` to `31` through forward-only migrations. Attachment bytes remain outside SQLite, Tiptap JSON remains adapter-only, and no generation/provider behavior is introduced.
