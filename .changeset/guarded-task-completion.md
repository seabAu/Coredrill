---
"@coredrill/application": patch
"@coredrill/storage-core": patch
---

Add an explicit local next-action completion command and concrete SQLite port requiring captured job/task ownership and versions. Reject stale, archived, wrong-owner and replayed completion without partial writes, preserve pending due projections, and validate version-bound acknowledgements with redacted failures. No normal completion control or scheduling converter is introduced in this prerequisite.
