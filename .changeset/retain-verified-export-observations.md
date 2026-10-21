---
"@coredrill/application": patch
"@coredrill/storage-core": patch
"@coredrill/web": patch
"@coredrill/ui": patch
---

Add strict bounded vault-scoped export verification observations and atomic SQLite history/reminder storage. Recording verified bytes preserves an explicitly disabled reminder; preparation and download handoff do not count as verification.
