---
"@coredrill/application": minor
"@coredrill/storage-core": minor
"@coredrill/ui": minor
"@coredrill/web": patch
---

Add bounded, explainable Career Profile evidence retrieval for job requirements using exact skills, typed relations, FTS5, and normalized-token fallback.

Keep retrieval read-only until the user deliberately selects or removes evidence, persist those relations in SQLite and portable exports, and prove equivalent browser/native repository behavior without network or AI dependencies.
