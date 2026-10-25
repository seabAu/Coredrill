---
"@coredrill/application": minor
"@coredrill/storage-core": minor
"@coredrill/web": patch
"@coredrill/ui": patch
---

Add a versioned read-only page of jobs linked to the originally viewed company,
with explicit vault/company version and independent company/job archive scope.
Keep literal titles and current status, validate bounded continuations against
the canonical anchor, and exclude private bodies, contact methods and totals.
Connect normal company detail to an owned role page with first/next/archive
controls, exact read retries and retained stale-result states. Open actual stored
jobs, including archived jobs outside the active Pipeline, and restore the
original company page/cursor/focus after Back, Forward or reload. Keep history
metadata free of display text and reject obsolete return scope until an explicit
new read. Company interaction, source/salary and outcome projections remain separate.
