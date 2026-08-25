---
"@coredrill/search-filter": minor
"@coredrill/storage-core": minor
---

Add the versioned job-filter AST and allowlisted parameterized SQL compiler, plus durable tag assignments and optimistic saved-view repositories with shared cross-adapter contracts and property-based validation proof.

Compatibility: existing databases advance from schema version `22` to `25` through forward-only migrations. The version-1 filter compiler supports only fields backed by the current schema and rejects future salary, skill, or match fields until their reviewed persistence slices land; no default tags or saved-view vocabulary is seeded.
