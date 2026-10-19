---
"@coredrill/application": minor
"@coredrill/storage-core": minor
---

Add validated, read-only current-vault inspection and a single-identity SQLite bootstrap port. Explicit initialization preserves existing unidentified records and cannot replace an existing name or add an ambiguous second root. Open refreshes only operational schema/open-time metadata, rejects future schema metadata and backward audit times, and returns transaction-bound identity snapshots. Keep generic diagnostic lifecycle behavior compatible. No schema, external dependency, or permission changes; production onboarding composition remains subsequent work.
