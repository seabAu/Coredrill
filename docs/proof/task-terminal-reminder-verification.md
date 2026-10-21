# Task terminal-state and reminder consistency

Status: `INT-005` is proven at commit `4af387a59577f38573d8e1e4c5dfeb7e4aea6a9b`: normal completion/dismissal, bounded history, reminder consistency, migration160 and legacy/current recovery pass full local, separate extension/policy and exact hosted verification. Scheduling (`INT-004`), notification delivery and independent manual/reference-device gates remain open.

## Behavior

### INT-005 completion audit

| Requirement                                                   | Current evidence                                                                                                                              | Remaining gate      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Normal bounded stored-task reading                            | Prior task-query/index/UI proofs; expanded page traversal checks canonical identities/order, one 25-row page, no duplicate or missing records | Closed at `4af387a` |
| Deliberate completion and dismissal                           | Distinct normal UI reviews, cancellation without writes, keyboard confirmation and retained canonical history                                 | Closed at `4af387a` |
| Viewed identity/version, archive and replay protection        | Command/controller cases and shared actual browser/native contract; stale reviews never rebase                                                | Closed at `4af387a` |
| Atomic retained history and coherent reminders/due projection | Exact before/after storage snapshots, fired/unrelated facts preserved, foreign-owner rejection and injected final-write rollback              | Closed at `4af387a` |
| Offline/reload and browser/native behavior                    | Both-action normal journeys and independent lifetime/error/foreign/readback hardening on both adapters                                        | Closed at `4af387a` |
| Indexed reminder lookup without compatibility loss            | Migration160 populated staged upgrade, production diagnostic, all 11 browser-storage / 16 native cases, original fixture pairs unchanged      | Closed at `4af387a` |

This audit does not close scheduling (`INT-004`), notification delivery, reference-hardware performance or manual accessibility/usability gates. A green prerequisite commit is not evidence for the subsequent uncommitted source.

## Exact hosted closure

[Foundation CI run 39550125045](https://github.com/seabAu/Coredrill/actions/runs/39550125045) is terminal success for exact SHA `4af387a59577f38573d8e1e4c5dfeb7e4aea6a9b`. Every required job passes; only PR-only dependency review is skipped. The aggregate job `119057166943` log is retained at `test-results/task-terminal-reminder-hosted-aggregate-success.log` and inspected beyond the workflow badge: actual Rust normal runtime, expanded browser task workflow, all 34 resilience cases, both legacy browser restore/upgrades and current160 recovery pass. All three native archive versions pass too. Hosted unit/coverage each have 1,721 passing plus one platform skip (1,722 total); hosted native has 15 passing plus one Windows-only journey skip (16 total), versus all 1,722 / all 16 locally on Windows. Exact Chrome151/152, Firefox153/154, extension/secrets and Windows/macOS/Ubuntu native package/secure-store lanes pass. npm audit is clean; existing reviewed Cargo warnings remain.

The old runtime proof's manually fixed `normalTaskLifecycleControlsProven: false` was a pre-closure marker, not a skipped test: the same runner already executes both normal actions and their independent hardening. After this requirement audit it is true, with the three actual browser/native cases passing again in `vault-export-browser-native-runtime.log`. The scheduled-form flag remains false and `INT-004` stays open. This hosted checkpoint does not verify the subsequent uncommitted archive-preparation implementation under `INT-006`.

## Full local verification

`test-results/task-terminal-reminder-full-verify.log` is terminal success (`TASK_TERMINAL_REMINDER_VERIFY_EXIT=0`). The complete `pnpm verify` sequence passes formatting, boundaries/governance, all 35 typechecks, lint, 164 files / 1,722 unit tests plus coverage, builds, UI-foundation/shell/performance/resilience/onboarding/document-browser suites, all 11 browser-storage / 16 native cases, secure-store/native archive, contract schemas, licenses, secrets, dependency audits and Changesets. The npm audit reports no known vulnerabilities; Cargo retains ten reviewed allowed warnings. Only result documentation follows this full run; extension and final documentation policy are separately recorded when terminal.

`test-results/task-terminal-reminder-policy.log` independently passes 19 import policies, 51 reviewed direct dependencies / three toolchains / 16 targets / ten accessibility cases, 520 npm / 498 Cargo licenses and secret scanning. This predates final result-documentation updates and will be rerun before commit.

`test-results/task-terminal-reminder-extension.log` passes all nine separate Chromium/Firefox cases (`TASK_TERMINAL_REMINDER_EXTENSION_EXIT=0`) against the full-gate production sources. Firefox explicitly reports durable schema160. Only result documentation follows; final formatting/policy and exact hosted verification remain.

`test-results/task-terminal-reminder-final-format-policy.log` passes whole-repository formatting and the complete policy gate (`TASK_TERMINAL_REMINDER_FINAL_POLICY_EXIT=0`). `git diff --check` is clean. This local checkpoint does not close `INT-005` before exact committed hosted proof.

Completion retains its task record and dismisses only its owned linked pending reminders in the same transaction as the task state and earliest-pending-due job projection. Fired reminders keep their recorded firing facts; already-dismissed and unrelated reminders remain byte-for-byte logically unchanged. A reminder linked to the task but assigned to another job rejects completion before writes rather than silently reassigning or dismissing that record. Existing viewed job/task versions, ownership, archive and replay guards remain.

The existing reminder vocabulary is pending/fired/dismissed: completion never invents a completed reminder state or claims notification delivery. The later index-only migration160 below changes no canonical rows or datasets. There is no backfill, dependency/permission change, generated evidence, outreach or Accepted decision change. The normal review explicitly discloses that pending linked reminders are dismissed and fired history remains.

## Evidence

- `test-results/task-reminder-completion-before.log` reproduces the original failure: a linked reminder remains pending after task completion; 14 other focused cases pass.
- `task-reminder-completion-final-focused.log`: all 15 focused storage cases pass. The shared scheduling case adds pending linked, fired, already-dismissed and standalone reminders. It preserves exact non-target records, verifies pending dismissal audit/version and rejects stale/archive/replay without partial changes.
- A wrapped transaction intentionally interrupts the final job-projection write after task/reminder changes; exact before/after snapshots prove complete rollback. A deliberately corrupt cross-job reminder similarly rejects without changing either job/history. Only the synthetic fixture is explicitly repaired before verifying normal owned reminder dismissal; product code does not reassign it.
- `task-reminder-types-lint.log`: strict changed-source lint and all 35 workspace typecheck tasks pass.
- `task-reminder-native.log`: all 15 actual native-adapter cases pass, plus Rust core (14 passing / one separately exercised secure-store test ignored in this invocation).
- `task-reminder-browser.log`: the identical shared repository contract passes in actual browser SQLite.
- `task-reminder-normal-browser-native.log`: all three expanded normal runtime/UI cases pass after the transaction repair, including explicit review disclosure that linked pending reminders are dismissed while fired history is retained. Shared contract proof above, not this text assertion alone, proves actual linked-reminder persistence.

## Deliberate dismissal command/storage checkpoint

The new `DismissNextActionCommand` rejects missing/invalid viewed versions, caller-supplied audit/state fields and forged acknowledgements; copies frozen intent before awaiting storage; owns operation time; returns dismissed with `completedAt = null`; redacts private failures and never retries writes. Its `dismissedAt` acknowledgement is the operation time persisted as the task's `updated_at`, not a new SQL column or immutable event certificate.

Completion and dismissal now share a private, closed-state terminal transaction. Existing trusted completion calls retain their optional-context signature; new dismissal rejects omitted context even from untyped callers. The normal application/port boundary always supplies original job/task identity and versions. Dismissal does not consume a creation undo token or claim undo/delete semantics.

- `task-dismissal-command-before.log`: all 25 new command cases fail before the command exists.
- `task-dismissal-storage-focused.log`: three files / 63 cases pass after command, port and storage implementation, including existing completion regression. Shared persistence adds two scheduled tasks so dismissal must advance the earliest due projection to the remaining task; archived history grows from four to six actual retained records, not by relaxing history assertions.
- Shared cases prove missing context, stale job/task, wrong owner, archived owner and foreign linked-reminder rejection without writes; forced final projection failure rolls back all task/reminder/job changes. Success preserves fired/unrelated reminders, applications, status events, undo tokens and the other job; replay with fresh versions rejects, and old pagination cursors invalidate.
- `task-dismissal-final-types-lint.log`: strict changed-source lint and all 35 workspace typecheck tasks pass. Initial findings remain in `task-dismissal-types-lint.log`; the persisted record still asserts dismissed state and null completion time, while command tests separately reject forged DTO state/time.
- `task-dismissal-native.log`: all 15 actual native-adapter cases plus Rust core pass (the separately exercised secure-store case is ignored in the core invocation).
- `task-dismissal-browser.log`: the identical expanded repository contract passes in browser SQLite.

## Normal dismissal runtime and initial UI

The runtime composes the dismissal command through a lazy port, preserving validation/copying before database opening. The status controller and UI feedback share the existing status/task/undo lock. One root-owned review captures action kind plus original job/task versions and literal title; completion and dismissal have distinct questions, confirmations, notices and acknowledged states. Neither action can replace the other while review or acknowledgement is pending. Dismissal retains history without completion, does not create undo and discloses pending linked reminder cancellation.

- `task-dismissal-runtime-before.log`: 17 runtime/controller assertions fail before composition exists; 56 prior assertions pass.
- `task-dismissal-runtime-after.log`: both files / 73 cases pass after composition, including no database access for invalid/forged input, frozen original intent through opening/preflight, typed conflicts/redaction/no retry and single flight against completion/dismissal/creation/status/undo.
- `task-dismissal-ui-typecheck.log`: all 35 workspace typecheck tasks pass; `task-dismissal-ui-lint.log` passes strict changed-source lint.
- `task-dismissal-normal-browser-native-final.log`: all three actual browser/native runtime cases pass with normal creation, explicit dismissal review/cancel, identical facts after cancellation, tab/320px lifetime, keyboard confirmation, exact 512-character Unicode/inert title, retained dismissed state with null completion time, replay and completion-after-dismissal rejection even with fresh versions, and exact canonical history after reload. Axe/overflow assertions pass; narrow screenshots are retained.

The initial passing UI run is retained separately. A copied synthetic fixture title was corrected to literal Unicode before the final rerun; no production behavior or assertion was relaxed. Future Windows source-template reads must specify UTF-8 to avoid introducing a mojibake fixture.

## Both-action lifetime and pagination hardening

`task-terminal-hardening-canonical-pages.log` passes all three expanded actual browser/native cases with the same hardening independently dispatched to completion and dismissal. Both retain failed intent, redact errors, prevent automatic retry, block overlapping cancellation/tracking operations during acknowledgement, preserve deliberate focus, reject stale reviews without rebasing, clear acknowledged intent despite failed Pipeline/task reads and recover through explicit reads without another write. Both hide foreign task literals, require explicit foreign-review cancellation, retain original ownership through held acknowledgement, preserve other-job facts and discard late disposed task pages.

Pagination now walks all bounded pages (including multiple equal-sized 25-row pages), verifies each page's exact canonical identity/order, forbids duplicates and compares the complete identity set. The two initial expanded runs (`task-dismissal-hardening-browser-native.log` and `task-dismissal-hardening-browser-native-final.log`) read an old initial 25-row page before asynchronous first-page refresh completed. Waiting for a different identity only on older navigation did not address that initial race. The final test waits for the exact canonical first identity on initial refresh, every older page and final first-page return; no product change, timeout relaxation or identity/bounds assertion removal follows these failures.

## Reminder query-plan diagnostic and follow-through

An ignored synthetic Node SQLite diagnostic applies all 159 migrations and executes the actual compiled dismissal transaction over 100 jobs / 10,000 tasks / 10,000 reminders (512-character notes). It preserves all unrelated jobs/tasks/reminders, retained target records and the remaining due projection. `task-reminder-scale-production.log` captures an ownership-guard table scan and a pending-reminder index scan; this is not targeted task lookup. A scratch `(next_action_id, job_id, state)` index in `task-reminder-scale-candidate.log` yields indexed searches for both actual statements. Single-run transaction times are 3.45 ms versus 1.00 ms; these are diagnostics under concurrent local testing, not a statistically proven speedup, supported-adapter budget or reference-device acceptance.

Migration 160 now adds only `reminder_next_action_job_state_idx(next_action_id, job_id, state)`; all previous SQL checksums and canonical rows remain unchanged. `reminder-index-focused.log` passes four files / 71 cases; `reminder-index-types-lint.log` passes strict changed-source lint and all 35 types. Shared actual browser/native contracts prove populated 158→159→160 upgrade with exact prior ledger prefixes and unchanged rows. Both terminal actions exercise indexed ownership guards and read-only equivalents of the exact reminder-update selection predicate; native query/execute confinement is unchanged. This is not a claim that native EXPLAIN executes a writable UPDATE. `task-reminder-scale-migrated-production.log` separately captures indexed plans for both actual production statements under Node, without scratch indexes; its 1.04 ms single-run timing remains diagnostic only.

`reminder-index-browser-recovery-generate.log` passes both preserved legacy restores/upgrades and generates a separately named current160 fixture. `reminder-index-native-current-recovery.log` passes all 16 native cases, including all three fixture versions, original archive/content/attachment validation, expected pre-upgrade index presence, exact canonical data and ledger preservation, and current160 no-op migration. `reminder-index-browser-storage-final.log` passes all 11 browser-storage cases without regeneration, including both legacy upgrades and current recovery. Git diff for both original archive/metadata pairs is empty. Final full/extension/policy and exact hosted verification remain before closing the slice. ADR-0009 remains Proposed.
