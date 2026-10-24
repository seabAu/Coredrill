---
"@coredrill/application": patch
"@coredrill/storage-core": patch
"@coredrill/web": patch
"@coredrill/ui": patch
---

Add read-only exact interaction acknowledgement checking and a lazy fixed-intent
runtime that requires an explicit check before retrying an uncertain write.
Preserve literal leading-BOM summaries during SQLite acknowledgement decoding.
No schema, permissions, sending, or normal recording composer is introduced.
Restore job-details refresh focus after the completed render and keep the job
workspace bounded during delayed JavaScript breakpoint-mode updates.
