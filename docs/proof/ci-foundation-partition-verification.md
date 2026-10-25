# Complete foundation CI partition — in progress

## Observed failure

Exact60a7a1aa6b6d488c8792ae027de1bf5108a744b1 Foundation CI40220879128 concludes
cancelled. Original quiet watcher62381 closes1/NETWORK_INTERACTIONS_HOSTED_EXIT=1;
complete-log retrieval60303 closes0. Saved jobs and complete logs remain in
test-results/network-interactions-hosted-{jobs.json,complete.log}. All11 other
required jobs succeed:4 Chrome lanes (both exact versions and both suite groups),
2 Firefox lanes,3 native platform/package/secure-store lanes, extension and full
history secrets. PR-only dependency review skips. This is not a green workflow.

Aggregate job121251985171 starts18:21:50Z and completes18:57:10Z, cancelled at its
35-minute limit during final npm/Rust license checks. Complete logs show3487
unit passes/1 Windows-only skip repeated under coverage84.79/78.40/85.91/87.47,
7 UI/76 shell/1 performance/117 resilience/7 onboarding/13 document-browser/36
browser-storage plus native SQLite, archive/backup and schema checks passing
before cancellation. The job identity/timestamps match the saved jobs record.
No functional assertion failure is reported, but unfinished
policy/report/artifact steps prevent exact hosted success.

## Repair and coverage invariant

Keep the full local pnpm verify script unchanged. Add verify:static and
verify:runtime as an exact disjoint partition of all27 original command calls:
17 static/build/unit/coverage/artifact/policy commands and10 complete browser/
native runtime suites. The existing quality-and-policy job gains static/runtime
matrix rows, fail-fast false and its unchanged35-minute limit. Runtime first
builds its own checkout and then runs every original complete runtime suite,
including full default browser-storage selection, secure-store and archive proof.
Do not replace the original runtime gate with only the dedicated Chrome lanes.

All existing exact browser/native/extension/secret jobs remain. Static alone
publishes immutable extension output and both reviewed license inventories;
failed diagnostic artifact names include the matrix row, avoiding collisions.
No assertion, suite selection, test/job timeout, accepted support floor, secret
policy or dependency pin changes. The fresh workflow has13 required jobs rather
than12, plus PR-only review. A completed new exact run remains mandatory.

The independent tooling coverage test checks every full-script command appears
exactly once across the two groups, retains the ten whole runtime calls, verifies
actual matrix dispatch/prebuild and original budget, and ensures required
artifacts/reports have distinct eligible upload paths. The local full script is
still the complete gate, not a CI-only substitute. Focused54256 closes0/
NETWORK_REMINDER_CI_PARTITION_TESTS_EXIT=0 with9 tests across the new guard and
existing native package tests. Full source/lint/policy/exact hosted proof follows.

## Local verification lineage

The reminder-query full run PID45284/launch3538 was explicitly interrupted after
this authoritative CI failure required a configuration repair. CIM confirmed its
exact executable/script path before terminating only that owned process tree.
The launch closes0 but no full-script .exit or terminal pass exists. Preserve
test-results/network-reminder-query-final-verify.log and .interrupted; never count
it as a successful gate. A fresh complete run after final CI/source/test edits is
required. This interruption is not an observation timeout or a user-app shutdown.

## Complete local gate after repair

The first guard lint reports explicit regex-space repetition; equivalent {2}/{4}/
{6}/{8} forms preserve its selection semantics.17456 then catches formatting of
that edit.21346 closes0/NETWORK_REMINDER_CI_CORRECTED_FORMAT_EXIT=0 with lint,
whole formatting and3 guard tests passing. These failed attempts are retained,
not hidden by disabling rules or narrowing suites.

Fresh11480 saves0/NETWORK_REMINDER_QUERY_COMPLETE_VERIFY_EXIT=0, launch35920
closes0: full unchanged pnpm verify runs all27 stages on the final source.
245 files/3546 units repeat under coverage84.95/78.56/86.03/87.63;35types/22lint+
tooling/build/artifact checks,7UI/76shell/1performance/117resilience/7onboarding/
13documents/37browser-storage/23native plus Rust/secure-store/archive/schema/
license/secret/audit/Changesets pass. Serial extension66734 passes9 cases35.3s.
This proves local coverage/configuration and unchanged full runtime behavior,
not execution of the new13-job hosted graph. Fresh exact-current hosted success
is still required before accepting the infrastructure repair as closed.
