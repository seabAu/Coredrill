# Normal task lifecycle — guarded completion prerequisite

Date: 2026-10-20. Checklist: `INT-005`, **not complete**.

## Scope

The full product requires useful task follow-through, not just creation. The existing trusted `completeNextAction` helper accepted only an action ID/time. Its new optional captured expectation checks original job ID, job row version, action row version and unarchived ownership inside the same SQLite transaction before writing. The old trusted helper signature remains compatible; the separate interactive application command and concrete port always require captured expectations. Caller intent is copied before awaiting storage, never rebased to a fresh read. Completion retains the task record and recomputes the earliest scheduled pending due projection.

`CompleteNextActionCommand` validates strict bounded identity/version input, takes completion time only from validated operation context, freezes request/expectations, validates exact acknowledged IDs/time/state and successor versions, and returns only sanitized fields. The concrete SQLite port maps missing/conflicted/unknown storage failures to reviewed redacted errors. No new dependencies, migrations, permissions or Accepted decisions. ADR-0009 remains Proposed; no clock converter is adopted.

This prerequisite does not expose completion in the normal app, implement a task list/query, dismissal/rescheduling, complete reminder lifecycle semantics or claim `INT-005` done. Those remain mandatory follow-through.

## Evidence

- `test-results/task-completion-guards-before.log`: test-first shared contract fails because stale/wrong-owner completion is accepted.
- `test-results/task-completion-guards-after.log`: all 15 focused SQLite cases pass after transactional guard repair. The shared scheduling case now checks stale job/action versions, wrong job, current-version archived job and replay. Rejections preserve exact job/action/reminder/undo table snapshots; successful completion retains the row and refreshes the due projection.
- `test-results/task-completion-guards-typecheck.log`: all 35 workspace typecheck tasks pass. Initial optional-chain lint finding was repaired without suppression.
- `test-results/task-completion-guards-native.log`: Rust core tests and all 14 actual native-adapter cases pass. One secure-store case is intentionally ignored in this core invocation, not claimed as executed.
- `test-results/task-completion-guards-browser.log`: all nine real browser-storage cases pass, including the same shared repository manifest.
- `test-results/task-completion-application-first.log`: all 38 focused command/storage tests pass. Validation rejects absent/invalid/extra input and caller-supplied timestamps before writes; frozen intent survives caller mutation, forged acknowledgements fail, and reviewed/unknown failures are redacted without automatic retries.
- `test-results/task-completion-command-port.log`: retained integrated failure from stale built application exports, not a passing contract.
- `test-results/task-completion-command-port-built.log`: all 38 focused cases pass after rebuilding application public exports. Shared SQLite cases now include concrete-port conflict mapping and a real validated command acknowledgement. A redundant literal-type comparison found by strict lint was removed while preserving stored completion-state assertions.

The inherited process PATH grew beyond 11,000 characters: direct Node and `where.exe` lookup worked while `cmd.exe` could not resolve Node. A short process-local PATH restored the exact existing Node 24.19.0 / pnpm 11.22.0 tools. Deduplication alone remained overlong. No machine environment, dependency or repository toolchain change was made. An ignored local diagnostic records only relevant executable-resolution fields.

Final command/port browser/native parity passes terminal `TASK_COMPLETION_COMMAND_ADAPTERS_EXIT=0`: `test-results/task-completion-command-native.log` proves 14 actual native-adapter cases plus Rust core, and `test-results/task-completion-command-browser.log` proves all nine browser-storage cases including the shared manifest. All 35 workspace typecheck tasks pass again in `test-results/task-completion-command-typecheck.log`; strict changed-source lint passes. Initial full `pnpm verify` then fails terminal `TASK_COMPLETION_VERIFY_EXIT=1` at npm audit after all functional/recovery/schema/license/secret checks pass: six editor-launch findings affect the existing Vite/launch-editor graph. Nine separate extension cases pass on that graph. The gate is not weakened; [reviewed two-patch maintenance](dependency-security-maintenance-2026-10-20.md) restores zero audit findings, but fresh full/extension verification and exact hosted proof remain. The completed hosted task-entry checkpoint `6371a1e` / `39392818938` does not verify these uncommitted lifecycle or patched graph changes.

## Final local checkpoint

The patched final-source complete `pnpm verify` passes terminal `TASK_COMPLETION_PATCHED_VERIFY_EXIT=0` in `test-results/task-completion-patched-full-verify.log`: 161 files / 1,617 unit tests plus coverage, all 35 typecheck tasks and full lint/build/browser/native/recovery/schema/license/secret/audit/Changesets gates, including all 34 resilience cases. All nine separate extension cases pass terminal `TASK_COMPLETION_PATCHED_EXTENSION_EXIT=0`. Npm audit is clean; Cargo has ten existing reviewed allowed warnings. Only documentation follows. Final policy and exact hosted proof remain, and no normal task-list/completion UI or full reminder lifecycle is claimed; `INT-005` stays unchecked.

Final whole-repository formatting and policy pass terminal `TASK_COMPLETION_POLICY_EXIT=0` in `test-results/task-completion-final-policy.log`: 19 boundaries, 51 direct dependencies / three toolchains / 16 targets / ten accessibility cases, 520 npm / 498 Cargo license records and secret scan. `git diff --check` is clean. Only result documentation follows these gates. Commit/push and exact hosted proof remain separate requirements.

## Exact hosted completion prerequisite checkpoint

Commit `a5851c1d3a38e80cf982e83c824c18e20b0e55c6` is pushed to `origin/main`. Exact [run 39536020133](https://github.com/seabAu/Coredrill/actions/runs/39536020133) is terminal success with every required job green. Retained aggregate `119012732668`, `test-results/completion-security-hosted-aggregate-success.log`, explicitly passes actual Rust runtime, all 34 resilience cases, shared browser repository manifest and clean npm audit. Aggregate unit/coverage each report 1,616 passing / one platform-skipped test out of 1,617; local Windows reports all 1,617 passing. Separate hosted browser/extension/native-package and full-history secret lanes pass. This verifies guarded completion infrastructure and the patched graph, not subsequent task-query sources or normal lifecycle UI; `INT-005` remains open.

The aggregate's platform skip is in native packaging. Its native-adapter invocation reports 13 passing / one platform skip out of 14, versus all 14 passing locally on Windows. Aggregate secure-storage proof is skipped without a prepared Secret Service session; separate required platform secure-storage/package lanes are green. These skips are not counted as executed aggregate tests.
