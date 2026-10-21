---
"@coredrill/storage-core": patch
"@coredrill/ui": patch
"@coredrill/application": patch
"@coredrill/web": patch
---

Dismiss owned pending linked reminders atomically when completing a task, preserving fired, already-dismissed and unrelated reminder history. Reject foreign linked reminders without partial changes and disclose reminder cancellation in completion review.

Add a separate mandatory-viewed-context dismissal command and SQLite port. Dismissal retains task history without a completion timestamp or invented undo, dismisses owned pending reminders and recomputes the remaining earliest due projection atomically.

Expose dismissal through the normal runtime and shared tracking lock, with a distinct root-owned review, acknowledgement and retained-history readback in normal Overview controls.

Add index-only migration 160 for linked task/owner/state reminder lookups. Preserve schema-158/159 exports and recovery fixtures; add a separately named schema-160 fixture without rewriting canonical rows or prior migration checksums.
