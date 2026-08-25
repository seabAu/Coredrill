---
"@coredrill/storage-core": minor
---

Add the Phase 1 tracker storage foundation: reviewed shared migrations for settings, locations, companies, contacts, jobs, sources, immutable snapshots, provenance, aliases, contact-point evidence, and retained field-value candidates; focused parameterized repositories; and one explicit transaction for replacing a user-confirmed value.

Compatibility: existing databases advance from schema version `2` to `13` through forward-only migrations. Browser and native adapters consume the same SQL and repository contract suite; no downgrade path is introduced.
