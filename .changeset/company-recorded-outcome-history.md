---
"@coredrill/application": minor
"@coredrill/storage-core": minor
"@coredrill/web": patch
---

Add a bounded viewed-company read of recorded local stage and outcome history.
Preserve job-level and archived application references, current stage definitions
and recorded reversals, with original owner/keyset/version guards and no private
notes or inferred employer decisions. SQL/export schema remains182; only the
shared repository verification manifest advances to25/45.

Expose the read through the selected normal runtime and an owned company panel
with bounded first/next/exact retry, explicit archive scope, current-definition
labels and retained reversal metadata. Reload starts a newly validated page.
