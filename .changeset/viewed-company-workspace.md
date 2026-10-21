---
"@coredrill/application": patch
"@coredrill/storage-core": patch
---

Add validated viewed-vault company details, explicit manual creation and version-bound company notes transactions. Preserve exact supported company fields, reject stale/archived/replayed or foreign-vault writes, and validate acknowledgements before commit. Normal UI composition remains separate follow-through.
