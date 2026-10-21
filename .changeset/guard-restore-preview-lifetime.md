---
"@coredrill/storage-core": patch
---

Reject simultaneous replay of a portable restore preview, capture inspection and commit inputs before asynchronous work, and allow discarded owners to retire preview capabilities before adapter mutation. Release retained archive state on successful commit or retirement while preserving retry after an atomic adapter failure. No archive format or database migration changes.
