---
"@coredrill/application": minor
"@coredrill/storage-core": minor
"@coredrill/web": patch
---

Add a versioned read-only company interaction-history contract and SQLite query
for jobs currently linked to the originally viewed company. Keep bounded literal
summary previews and explicit UTF-8 summary slices, independent archive choices,
nullable contacts, and company/job/interaction versions in references. Reject
obsolete continuations after job changes or contact detachment without changing
recorded history or implying an occurrence-time employer relationship. Connect the
selected runtime to normal company detail with explicit paging, archive choice,
bounded summary inspection and exact retries. No durable schema or archive format changes.
