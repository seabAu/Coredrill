---
"@coredrill/application": minor
"@coredrill/storage-core": minor
"@coredrill/ui": minor
"@coredrill/web": minor
---

Add a separate Mark Applied confirmation that records the applied status, time,
and channel together with an immutable snapshot of the exact submitted document
versions, answer versions, and locally retained export artifact identities.

Generated files remain local and content-addressed. The flow does not upload,
autofill, submit, or claim employer receipt, and later document versions cannot
silently replace the submitted set.
