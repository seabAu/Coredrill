---
"@coredrill/contracts": minor
"@coredrill/extractors": minor
---

Add the version-1 deterministic job-candidate normalization contract and pure
normalizer for title, company, location, work mode, salary, currency, dates, and
source identity while retaining every raw candidate and provenance record.

Compatibility: normalization emits a new parallel proposal view. It never
confirms a value, mutates a source candidate, or writes a durable entity.
