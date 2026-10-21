---
"@coredrill/application": patch
"@coredrill/storage-core": patch
---

Add a validated read-only job task-list query and bounded SQLite pagination. Bind cursors to job/archive scope, viewed job revision and anchor task version; preserve pending/completed/dismissed history, reject invalid linkage and stale cursors, and return captured versions needed by later completion controls. No normal UI, scheduling converter or schema change is introduced.
