---
"@coredrill/desktop": patch
---

Retire main-WebView database sessions when its document starts navigating or its window is destroyed. Roll back abandoned transactions and release connections while preserving committed records and attachment files. Session identifiers remain monotonic. No reset command or operation is exposed through shipped IPC; the isolated probe models host retirement only for executable proof.
