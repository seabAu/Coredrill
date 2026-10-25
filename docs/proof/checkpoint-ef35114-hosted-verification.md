# Contact review checkpoint: exact hosted evidence and infrastructure headroom

Date: 2026-10-25. Status: nine required hosted witnesses passed; aggregate timed
out. The follow-up changes only its whole-job allowance, not product sources or
individual test/performance budgets. Complete hosted closure is not yet proven.

## Exact published source and local evidence

Product checkpoint `ef351149db9f61d1d78b1d25d4dbac6d7cdfeaf9` is committed
and pushed to `origin/main`. It contains schema182 durable contact field-use
reviews, recovery, normal runtime/current-basis display and pending proof/ledger
receipts. Complete local `pnpm verify` passed3104 unit cases and coverage,
all required browser/native/policy/audit gates; separate extension9 and final
installed-Firefox v21/41 runs passed. See the
[complete local proof](contact-field-use-persistence.md#complete-local-checkpoint-verification).
Normal qualification forms and INT-007 remain unfinished.

## Exact hosted outcome

[CI40164548638](https://github.com/seabAu/Coredrill/actions/runs/40164548638)
ran that exact SHA. Its original watcher79771 consumed terminal exit1 and
`CONTACT_FIELD_USE_CHECKPOINT_HOSTED_EXIT=1`; do not restart that watcher or
attribute the older cf3c6b0 success to this source.

The exact job snapshot proves nine required successes: Chrome151 and152,
Firefox153 and154, Windows native/Tauri, macOS26 native/package, Ubuntu26.04
native/package, extension Chromium/Firefox fallback, and full-history secrets.
The pull-request-only dependency review is skipped on this push. Aggregate
`121082800801` is cancelled, so the whole workflow is not green.

The authoritative check-run annotation states:

> The job has exceeded the maximum execution time of 30m0s

The aggregate starts at05:10:20Z; pinned Rust/RustSec installation takes3m05s,
and `pnpm verify` starts at05:13:42Z. Its log shows successful functional suites
through all15 browser storage/recovery cases,24 Rust core cases (one separate
secure-store lifecycle case explicitly ignored) and23 native storage cases.
The prepared Unix Secret Service lifecycle is explicitly skipped in this
unprepared aggregate; the separate prepared Ubuntu job succeeds. Archive/backup
and schema checks then pass. At05:40:14Z it starts the final license checks;
the job deadline cancels execution at05:40:35Z. Remaining checks and artifact/
inventory publication in this job are not claimed to have run.

Evidence is retained locally in
`test-results/contact-field-use-checkpoint-hosted-watch.log` and
`test-results/contact-field-use-checkpoint-aggregate.log`. The aggregate log
retrieval exits0 with `CHECKPOINT_AGGREGATE_LOG_EXIT=0`. This is a diagnosed
whole-job infrastructure limit, not an assertion failure or manual cancellation.

## Bounded correction

Increase only `quality-and-policy.timeout-minutes` from30 to35. Keep the entire
`pnpm verify` chain, all other jobs, test counts/assertions, individual timeouts,
performance budgets, version pins, permissions and confinement unchanged.
No Accepted decision requires the previous wrapper deadline; no product,
schema, dependency, source approval or runtime permission changes.

This operational fix is a separate commit from the uncommitted normal research/
form-controller work. A fresh exact hosted run for the fix is required before
closing checkpoint verification. Do not rerun the old source under its unchanged
30m wrapper, weaken tests, or call nine witnesses complete workflow proof.

Local validation for this CI-only correction: Prettier parses/checks the workflow
and this proof successfully; complete policy75581 consumes exit0 and
`CHECKPOINT_CI_HEADROOM_POLICY_EXIT=0` (19 boundaries, foundation records,
831 npm/498 Rust license policy and secret scan). The product sources in this
commit are identical to the fully locally verified ef35114 checkpoint. The
unfinished research/runtime/controller work is deliberately excluded from this
operational commit and has separate in-progress verification.
