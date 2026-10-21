# Task-list index migration verification

Status: full local, extension, policy and exact hosted proof pass at `d15a4c2`. Not a completed integration or release gate.

## Scope

Continue `INT-005` with index-only migration 159, `next_action_job_created_idx` on `(job_id, created_at DESC, id ASC)`, and an equivalent seekable cursor predicate. No new dependencies, permissions, datasets, backfill, or Accepted decision changes. ADR-0009 remains Proposed.

Migration SHA-256: `8a3fb6539bc9f368d8860269e2fee6d60aa585afecf07b45991ea34684300184`.

## Executable evidence

- `test-results/task-list-index-before.log`: new upgrade test fails before the repair because the required index is absent.
- `test-results/task-list-index-focused.log`: three files / 56 tests pass. Shared contracts populate schema 158 before upgrading, preserve canonical scheduling/history state and the first 158 ledger identities/checksums, and inspect actual first/cursor query plans. The plans must search the new index without full task scans or temporary sorting; the cursor plan must use the creation-time range. Existing tied-key, owner, archive and stale-context assertions remain.
- `test-results/task-list-index-initial-typecheck.log`: 35 workspace typecheck tasks pass before the subsequent native recovery-test additions.
- `test-results/task-list-index-native-typecheck-final.log` and `task-list-index-native-recovery-final.log`: all 35 strict workspace typecheck tasks and all 14 native tests pass after adding an explicit missing-attachment failure guard. The intermediate typecheck failure is retained in `task-list-index-native-typecheck.log`; no cast or non-null suppression was added. `git diff --check` passes.
- `test-results/task-list-index-native-recovery.log`: all 14 actual native-adapter tests pass after extending the preserved schema-158 archive recovery case. Restore still validates the source archive and payload hashes and canonical content hash. Only migration 159 applies; all 57 exported datasets retain every row and all metadata except the explicitly advanced source schema version. The original 158 ledger entries remain exact, the index is added, and restored attachment bytes still hash to their content IDs.

The first native run (`task-list-index-native.log`) failed a newly added raw re-export equality assertion. The existing restore commit validates the original payload hash, but the later native SQLite export has a different byte hash. The final test does not assume stable physical page serialization: it retains restore hash validation and canonical-content assertions, then compares all exported rows across migration. This is not a relaxation of a pre-existing assertion.

## Adapter, diagnostic and full local evidence

The production schema-159 diagnostic (`task-list-scale-migrated-production.log`) uses no scratch index or SQL substitution: 100 jobs, 10,000 tasks, 5,000 owned tasks / 50 pages, zero duplicates/mixed jobs/adapter writes/durable-change delta. Plans search `next_action_job_created_idx` and cursor `created_at<?`, with no scan/temp sort. Single-run Node in-memory totals are 384.13 ms (SQL read portion 23.59 ms), p95 page 12.73 ms and max 19.02 ms under concurrent full verification; these are diagnostics, not supported-device performance acceptance. Real browser/native shared contracts separately assert actual initial/cursor plans and tied-key pagination.

`task-list-index-policy.log` passes boundaries, reviewed foundation inventory, both license checks and secret scanning. The first full run stops at shared-harness formatting (`task-list-index-full-verify.log`); mechanical formatting is repaired. The replacement full run (`task-list-index-full-verify-final.log`) passes terminal `TASK_INDEX_VERIFY_EXIT=0`: 162 files / 1,650 unit tests plus coverage, all 35 typecheck tasks, lint/build, seven UI-foundation / 76 shell / one performance / 34 resilience / seven onboarding / 13 document / ten browser-storage / 15 native cases, secure storage, native archive, schema, licenses, secrets, audits and Changesets. npm audit reports no known vulnerabilities; Cargo retains ten reviewed allowed warnings.

The original schema-158 fixture remains unchanged. The separately named schema-159 fixture was generated through the existing explicit fixture-update workflow. `task-list-index-browser-final.log` passes all ten browser-storage tests without update mode, including both current restore and legacy restore/upgrade. Legacy inspection verifies the pinned archive/raw database hash; all 57 datasets and the original 158 ledger entries compare exactly before restore, after restore and after upgrade, with only migration 159 applied. The new current fixture retains its exact re-export hash assertion. `task-list-index-native-both-fixtures.log` passes all 15 native tests across both archive versions; `task-list-index-recovery-typecheck.log` passes all 35 workspace typecheck tasks.

The initial browser generation run (`task-list-index-browser-recovery-generate.log`) passed current-schema restore but failed the new legacy re-export byte equality assumption. The repaired legacy test retains exact source archive/database hash validation and full canonical-content/relationship checks, and adds complete dataset/ledger comparison immediately after restore as well as after upgrade. No current-fixture equality assertion or core archive schema/hash validation was relaxed. The diagnostic fixture API permits only the explicit reviewed legacy source 158 or the current target schema; ordinary restore policy is unchanged.

All nine separate extension cases pass terminal `TASK_INDEX_EXTENSION_EXIT=0` in `task-list-index-extension-final.log`. The earlier passing extension run exposed a stale hard-coded schema 126 in Firefox's informational proof log; only that test's logging was changed to use the actual asserted migration result. The final full extension rerun confirms schema 159. No production source changed after the successful full gate.

## Exact hosted closure

Commit `d15a4c28698a145a0c29dd0597f962b0041e7cba` is pushed and terminal success in [run 39541786325](https://github.com/seabAu/Coredrill/actions/runs/39541786325). Every required job is successful; only PR-only dependency review is skipped on this push. Retained aggregate `task-index-hosted-aggregate-success.log`, job `119030955315`, explicitly passes legacy schema-158 restore/upgrade, current-schema restore and all 34 resilience cases. Unit and coverage each report 1,649 passing / one platform skip; native reports 14 passing / one platform skip. Local Windows has all 1,650 unit and all 15 native cases passing. Separate browser, extension, full-history secrets and Windows/macOS/Ubuntu native packaging/secure-storage lanes are successful. npm audit is clean. This closes migration/query recovery proof, not lifecycle UI, reference-device acceptance or `INT-005`.

Final whole-repository formatting and policy pass terminal `TASK_INDEX_POLICY_EXIT=0` in `task-list-index-final-policy.log`, including 19 boundaries, 51 reviewed direct dependencies / three toolchains / 16 targets / ten accessibility cases, 520 npm / 498 Cargo licenses and secrets. `git diff --check` is clean; only result documentation follows those source gates.

## Remaining product work

Reference-device performance acceptance remains open separately. Normal task-list/completion integration is tracked in its subsequent UI proof; dismissal/reminder semantics remain unfinished and `INT-005` stays unchecked. No dependency, permission or Accepted decision changes; ADR-0009 is still Proposed.
