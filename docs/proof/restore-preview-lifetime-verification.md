# Restore preview lifetime verification

Date: 2026-10-21. Checklist: prerequisite of `INT-006`, which remains open.

## Scope and finding

Normal restore composition needs an owned preview that cannot be committed twice concurrently or reused after its owner discards it. The prior coordinator marked a preview completed only after adapter success. Two concurrent calls could both cross that boundary, including an identical-target restore whose fingerprint did not change. Preview construction also read mutable request fields again after asynchronous inspection.

`test-results/restore-preview-lifetime-before.log` retains two executed failures: concurrent reuse fulfilled twice, and mutation of the original request changed the expected schema while inspection awaited. Existing eight tests passed in that run. Fixtures are synthetic ZIP members and a fixture storage port, not actual SQLite integrity or normal-user recovery proof.

## Implementation

- Acquire one per-issued-preview guard synchronously before any commit await. Keep target drift, exact confirmation, full archive revalidation, and adapter-bound fingerprint checks.
- Capture inspection expectations, original adapter, and commit preview before asynchronous work. Caller object mutation cannot redirect the retained capability.
- Export `discardPortableArchiveRestorePreviewV1`. It retires only an actual issued capability, removes the retained archive/adapter mapping, and returns false for a clone, completed/retired preview, or adapter mutation already in progress.
- Recheck retirement after target inspection and archive revalidation, immediately before mutation with no intervening await. Retirement during these waits prevents adapter invocation. Once mutation starts, retirement cannot claim cancellation or rollback.
- On success, remove private retained state even if the caller retains metadata. On failure, reset only a still-owned preview for explicit retry; never revive a retired capability. Atomic preservation remains the adapter's contract, not a new guarantee created by a fixture test.

No dependency, schema, permission, wire/archive version, or Accepted decision changes. The new helper is an additive in-process API; no serialized contract migration is required. ADR-0009 remains Proposed and unrelated.

## Verification

Initial focused run after the coordinator fix: 15 tests pass in `test-results/restore-preview-lifetime-focused.log`. Additional standalone inspection/input-capture and guard-release cases are added afterward; final focused/types/lint and full verification remain pending. No final-source or hosted success is inferred from the earlier focused run.

The expanded suite passes all 17 cases in `restore-preview-lifetime-final-focused.log`, and strict source/test typecheck passes in `restore-preview-lifetime-types.log`. Lint rejects a redundant explicit undefined check where optional chaining is required; the first full run also stops at that same rule after all 35 type/build tasks pass (`restore-preview-lifetime-full-verify.log`, terminal exit 1). The guard is expressed with optional chaining without changing its semantics. Final-source full verification remains pending.

Final-source full run is live as session 93560, writing `test-results/restore-preview-lifetime-final-verify.log`, with eventual marker `RESTORE_PREVIEW_LIFETIME_FINAL_VERIFY_EXIT`. It has passed formatting, 19 import boundaries, foundation records, all 35 type/build tasks, all 22 lint tasks, 174 files / 1,859 unit tests and coverage, and all 22 builds. Browser/native/recovery/policy/audit gates and terminal full success remain unproven until that same process finishes. No production source changes follow its launch; only result documentation. A timeout is not terminal and must not cause a restart.

### Complete local gate

That same run finishes successfully, `RESTORE_PREVIEW_LIFETIME_FINAL_VERIFY_EXIT=0`. It passes complete `pnpm verify`: 174 files / 1,859 units and coverage, all 35 type/build tasks, lint/build, seven UI foundations, 76 shell, one diagnostic-only performance case, 41 resilience, seven onboarding, 13 document-browser, 11 browser-storage and all 18 native-adapter cases. Rust core has 21 passes plus the ignored secret lifecycle separately exercised through the redacted harness. Secure storage, native archive/automatic backup, schema, 520 npm / 498 Cargo license, secret, audit and Changesets checks pass. npm has no known advisories; Cargo retains ten reviewed allowed warnings. Manual accessibility/reference-hardware/public-release gates are not closed.

The final-source normal native tracking and document journeys pass in 38.2 / 35.4 seconds under unchanged limits. Browser/native recovery tests still pass their original corruption/stale-target and exact-content assertions. This is supporting adapter regression proof, not normal restore UI completion. No production changes follow the successful gate. The separate serial extension run, final formatting/policy and exact committed hosted proof remain pending.

All nine separate extension cases subsequently pass serially in `restore-preview-lifetime-extension.log`, terminal `RESTORE_PREVIEW_LIFETIME_EXTENSION_EXIT=0`. No source changes follow. Final formatting/policy, commit/push and exact hosted proof remain.

Final whole-workspace formatting and policy pass `RESTORE_PREVIEW_LIFETIME_FINAL_POLICY_EXIT=0` in `restore-preview-lifetime-final-policy.log`: 19 architecture boundaries, 51 dependencies / three toolchains / 16 execution targets / ten accessibility cases, 520 npm / 498 Cargo licenses and secrets. Diff whitespace is clean. Only result documentation follows; no production source changes follow full verification. Commit/push and exact hosted verification remain.

## Remaining work

This does not expose normal restore controls or complete `INT-006`. Normal browser selection and Rust-owned native full-ZIP selection, owned root/session/UI integration, exact preview/confirmation, single-flight coordination with export/deletion, onboarding/clean-target recovery, and real browser/native navigation/reflow/failure/exact-content recovery still require implementation and proof. The older backend and diagnostic recovery suites remain supporting evidence, not substitutes.

The preceding pushed handoff commit `1e1ad4d` now passes exact hosted run `39585320481`; its watch ends `DELETION_EXPORT_HANDOFF_HOSTED_EXIT=0` and aggregate output is retained. See [exact handoff closure](deletion-export-handoff-verification.md#exact-hosted-closure). This uncommitted coordinator change has no hosted proof yet.
