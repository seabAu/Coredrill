---
"@coredrill/application": patch
"@coredrill/storage-core": patch
"@coredrill/web": patch
---

Support captured job-version preconditions for next-action creation and reject stale or archived viewed jobs atomically. Keep the maintained next-due projection aligned with the earliest scheduled pending task when adding another action, retaining existing tasks and projection-bound undo.
