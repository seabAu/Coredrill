---
"@coredrill/storage-core": patch
---

Add schema 159's job/creation-order task index and a seekable pagination range without changing task ownership, ordering, or cursor validation. Preserve schema-158 export compatibility; upgrading requires the reviewed SQL migration and does not rewrite canonical rows.
