---
"@coredrill/storage-core": minor
"@coredrill/web": patch
---

Add reviewed Phase 1 query indexes, runtime-probed FTS5 job search, a normalized-token fallback, shared browser/native search contracts, and deterministic production-search benchmarks.

Compatibility: existing databases advance from schema version `45` to `84` through forward-only migrations. FTS5 virtual tables remain capability-conditioned rebuildable artifacts outside the numbered schema, so an adapter without the module can still migrate, write, and search the same durable content through the fallback.
