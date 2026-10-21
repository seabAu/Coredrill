# Normal task-list and completion UI verification

Status: expanded normal browser/native hardening, full local/extension/policy and exact hosted proof pass at `9ebe1b4`. Subsequent dismissal/reminder work is tracked separately and `INT-005` stays open.

## Composition

Normal stored Overview now renders shared `StoredJobTasks` controls in either responsive workspace frame. Root-owned coordination holds at most one 25-row page, not all historical pages. Explicit first-page refresh reloads the job projection as well as tasks; older navigation retains the query's captured job-version cursor. Read errors keep visibly stale facts and disable completion. Disposed/old-job readers cannot publish later results.

Completion has a separate review showing the exact task title, copied viewed job/task versions, cancellation and deliberate confirmation. It survives tab/reflow replacement; a review belonging to another job hides its literal title and prevents replacement. Acknowledgement clears intent without inventing undo, even when subsequent reads fail. Failed intent is retained without automatic retry or rebasing. All writes use the shared tracking/controller lock and existing application/SQLite command boundary.

No dismissal controls, reminder completion semantics, notification delivery or scheduling converter are claimed by this UI. Completed and dismissed records are shown as current retained facts, not append-only event snapshots. Time labels preserve complete stored UTC instants and IANA zones.

## Current evidence

- `test-results/task-list-ui-focused.log`: three files / 64 reader/runtime/controller cases pass, including one-page replacement, scope/bounds/version rejection, stale read retention, disposed publication, redacted failure and recovery.
- `task-list-ui-browser-native.log`: all three actual browser/native runtime cases pass with normal controls creating a 512-character Unicode/inert task, opening/cancelling review without changing state, retaining review across Source/Overview and 320px reflow, confirming by keyboard, showing retained completed state and exact canonical history after reload. Narrow workspace axe reports no violations and no document overflow. `task-completion-review-320.png` is retained and visually inspected.
- `task-list-ui-final-types-lint.log`: strict changed-source lint and all 35 workspace typecheck tasks pass after repairing flow-analysis/style findings without suppressions. A subsequent explicit job-plus-task refresh change is under final focused rerun; do not assume these earlier type results verify later changes.
- Initial lint findings are retained in `task-list-ui-lint.log`; no lint policy is weakened.
- `task-list-ui-browser-native-final.log`: all three actual runtime cases pass again after explicit refresh is connected to both the job projection and task page. Only diagnostic proof-flag naming and documentation follow that source run.
- `task-list-ui-current-types-lint.log`: current strict changed-source lint and all 35 workspace typecheck tasks pass after the explicit refresh integration. `git diff --check` is clean. Full final-source verification remains outstanding.

## Required follow-through

`task-list-ui-hardening-cross-job.log` passes all three expanded actual browser/native cases. Synthetic fault delivery wraps real command writes, never fabricated acknowledgements. Assertions prove private-error redaction and retained failed intent; no automatic retry across tabs; held completion blocks cancel/creation/status; deliberate focus survives late completion; peer job-version changes reject original intent without changes; explicit job/task refresh leaves the old review stale until cancelled; acknowledged completion plus failed Pipeline/task reads clears review and disables stale task writes; explicit refresh restores canonical state with exactly one completion call. Twenty-seven synthetic command-created/completed tasks exercise actual Older/First controls: each page replaces the previous one, at most 25 rows remain, and identities neither duplicate nor disappear.

The same run creates another synthetic job through normal capture/review controls. A foreign completion review hides the original task literal, permits deliberate cancellation when idle and forbids cancellation during acknowledgement. Held completion retains the original owner and changes no other-job facts; deliberately focused other-job controls keep focus. A held owned task page delivered after navigation is discarded without foreign rows or focus theft. Tests finish back on the owner with retained completed history.

The first hardening run (`task-list-ui-hardening-first.log`) passes the expanded browser test but exposes a later native helper's ambiguous undo locator after several retained notices exist. The helper is repaired by selecting the exact task title within its undo entry, not choosing an arbitrary first control or removing assertions. All three expanded cases then pass without production changes or timeout relaxation.

Finish final documentation policy, commit/push and exact hosted proof before claiming this slice complete. Dismissal/reminder semantics and scheduled entry remain separate required work before `INT-005` can close. No schema, dependencies, permissions or Accepted decisions change; ADR-0009 remains Proposed.

The initial full run (`task-lifecycle-ui-full-verify.log`) terminates at tooling lint for four empty callbacks in new reader tests. Those callbacks are replaced with `vi.fn()` observers, without suppressions or assertion changes. The replacement full run (`task-lifecycle-ui-full-verify-final.log`) subsequently passes completely, as recorded below.

## Complete local checkpoint

The replacement run is now terminal `TASK_LIFECYCLE_UI_VERIFY_EXIT=0`: 163 files / 1,681 unit tests plus coverage, 35 typecheck tasks, lint/build, seven UI-foundation / 76 shell / one performance / 34 resilience / seven onboarding / 13 document / ten browser-storage / 15 native cases, secure storage, native archive, schema, licenses, secrets, audits and Changesets. npm audit has no known vulnerabilities; Cargo retains ten reviewed allowed warnings. No source change follows the successful full gate; only result documentation remains before separate extension/final policy and exact hosted closure.

All nine separate extension cases pass terminal `TASK_LIFECYCLE_UI_EXTENSION_EXIT=0` in `task-lifecycle-ui-extension.log` against the same production sources.

Final whole-repository formatting and policy pass terminal `TASK_LIFECYCLE_UI_POLICY_EXIT=0` in `task-lifecycle-ui-final-policy.log`: 19 import boundaries, 51 direct dependencies / three toolchains / 16 targets / ten accessibility cases, 520 npm / 498 Cargo licenses and secret scan. `git diff --check` is clean. Only result documentation follows these gates; commit/push and exact hosted proof remain.

## Exact hosted closure

Commit `9ebe1b445a1a8e1eb3528d81cea65b39422b5097` is pushed and terminal success in [run 39544807904](https://github.com/seabAu/Coredrill/actions/runs/39544807904). Every required job is successful; only PR-only dependency review is skipped on this push. Retained aggregate `task-ui-hosted-aggregate-success.log`, job `119040447480`, explicitly passes the actual Rust normal UI journey, expanded browser task workflow and all 34 resilience cases. Unit/coverage each report 1,680 passing / one platform skip; native reports 14 passing / one platform skip. Local Windows has all 1,681 unit and all 15 native cases passing. Separate browser, extension, secrets and Windows/macOS/Ubuntu native packaging/secure-storage lanes are successful; npm audit is clean. This closes that exact normal task-list/completion checkpoint, not later uncommitted dismissal/reminder changes, reference-device acceptance or `INT-005`.
