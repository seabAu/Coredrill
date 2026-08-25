---
"@coredrill/storage-core": minor
---

Add Phase 1 pipeline persistence: custom status definitions, applications and append-only status history, interactions, next actions, interviews, reminders, and atomic job/application projections through focused repositories and shared cross-adapter contract tests.

Compatibility: existing databases advance from schema version `13` to `22` through forward-only migrations. No default display-stage vocabulary is seeded, and document-version references remain nullable validated IDs until the document schema lands.
