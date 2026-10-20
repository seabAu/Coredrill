# Normal Job header status composition — work in progress

## Scope

`INT-003` connects the normal header to the existing guarded status controller,
mandatory viewed-state transaction and shared undo. It adds no schema, dependency,
permission, source capability or Accepted decision. SQLite remains canonical.

One root-owned draft captures the job, row version, source status and available
targets. Navigation or refreshed rows cannot silently replace/rebase it. Pending
acknowledgement blocks duplicate save/edit/discard. A terminal-to-nonterminal move
requires explicit confirmation; initial Applied still routes to exact-document
review. Workspace failures retain the draft and have one focus owner, without a
second global retry button resubmitting a separately owned gesture. Board/Table
focus behavior is preserved. Shared feedback and undo render once inside the
active workspace, or in Pipeline when no workspace is open.

The normal header no longer substitutes a cached submission review's status for
the current Pipeline projection. Mark Applied acknowledgement invalidates that
projection, and stored Overview/Company reads invalidate on job row-version
changes. Failed refreshes remain explicitly uncertain rather than optimistic.

## Current checks

- Eight pure draft tests pass: captured immutable tuple/catalog, foreign owner,
  invalid/unchanged target, explicit reopen/reset, pending serialization, retained
  failure/exact retry version, exception redaction and disposed late publication.
- Guarded controller and frame tests pass together with those tests: 20 cases in
  three files. All 35 typecheck tasks and changed-source strict lint pass.
- A normal offline browser journey creates its own jobs/stage, opens the header
  editor, preserves selection across tabs and 320px replacement, saves through
  the actual runtime, checks canonical header/Overview, undoes inside the
  workspace and reloads. Scoped axe and no-overflow assertions pass.
- Initial browser field lookup failed because a wrapping label included select
  option text in label lookup. An explicit accessible stage label repairs it;
  the unchanged focus assertion then passes. Initial TypeScript optional-value
  and lint errors were corrected without disabling strict rules.
- `test-results/workspace-status-note-responsive-focused.log` exits 0,
  `WORKSPACE_STATUS_NOTE_FOCUSED_EXIT=0`, seven journeys. That checkpoint includes
  the new header journey, prior Board/Table/submission regressions, note lifetime,
  deterministic missed-breakpoint recovery and native runtime regression. The
  subsequently expanded native-header and cached-review/terminal header cases
  require their own fresh run; do not attribute them to that earlier checkpoint.

## Remaining proof

The subsequent expanded seven-case run passes, terminal
`WORKSPACE_STATUS_NOTE_EXPANDED_REPAIR_EXIT=0`, log
`test-results/workspace-status-note-expanded-repair.log`. This explicitly covers
actual native header save/undo and two retained reversed events, plus the cached
submission-review label and terminal-reopen cancellation regression. The first
expanded attempt retained an obsolete one-event fixture expectation after adding
a second real move; it failed as expected at count 2 versus 1. The final assertion
requires exactly two events and two recorded undo annotations, not fewer events.
The original failed log remains `workspace-status-note-expanded-focused.log`.

An additional normal offline header run passes, terminal
`WORKSPACE_STATUS_STALE_FAILURE_EXIT=0`, log
`test-results/workspace-status-stale-failure-browser.log`. A real Board move
invalidates the open header draft, which cannot save until explicit cancellation;
undo and fresh opening retain the new tuple. An injected thrown write error
retains the chosen target, leaves canonical status unchanged, redacts private
details, focuses the owned error and offers no competing global retry. Restoring
the actual API and explicitly saving succeeds. The 320px forced-color artifact
was inspected for readable status/undo/details; full-page capture shows sticky
shell compositing and is not a manual accessibility claim.

## Full checkpoint and lifetime refinement

The complete first `pnpm verify` finishes successfully, terminal
`WORKSPACE_STATUS_VERIFY_EXIT=0`, log `test-results/workspace-status-full-verify.log`:
158 files / 1,533 unit tests plus coverage, 35 typecheck tasks, lint/build, seven
UI-foundation, 76 shell, one diagnostic performance, 31 resilience, seven onboarding,
13 document and nine browser-storage cases. Native adapter tests pass 14 cases;
Rust core passes 14 with one intentionally ignored secure-store case, which its
separate harness proves. Archive/backup recovery, schemas, license/secret/policy
and audits finish successfully. npm has no known vulnerabilities; Cargo retains
ten explicitly allowed warnings. This checkpoint precedes the subsequent native
select-layout and foreign-discard focus refinements below, not final-source proof.

The added normal offline lifetime journey creates its own jobs and named stages.
It proves initial Applied routes to exact-document review without any status,
application or event write; another job cannot replace an owned draft; pending
save blocks edit/cancel/duplicate submission; the unchanged canonical DTO remains
readable during the held write; responsive replacement retains the selected
target; deliberate focus survives acknowledgement; a late write to the previous
job leaves the current job DTO/route/focus unchanged; exact two events remain.
Successful writes always delegate to the actual API, with delivery held only by
the test wrapper. Explicit foreign discard and fresh reopening are also covered.

The first fixture exceeded the domain's 80-character stage-name limit and waited
for an option that could not exist. Its failed log is retained at
`test-results/workspace-status-lifetime-first.log`; the valid fixture stays long
without changing product limits. The valid-name run then exposes real overflow.
Content-free geometry in `workspace-status-lifetime-geometry.log` proves a 494px
select expanding the 320px page to 540px while already in full-page mode. The
editor now uses a shrinkable single column and constrained native select, with
the full requested name separately wrapping as visible text. No hiding/cropping
of page overflow or shortening stored names is used.

That repaired journey passes, terminal
`WORKSPACE_STATUS_LIFETIME_REFLOW_REPAIR_EXIT=0`. An additional explicit foreign
discard assertion first fails the missing header-focus fallback, retained in
`workspace-status-foreign-discard-focus-before.log`. The same owner/job-guarded
post-render focus mechanism now returns to the current header after that control
is removed. The complete journey passes, terminal
`WORKSPACE_STATUS_LIFETIME_FINAL_EXIT=0`, log
`test-results/workspace-status-lifetime-final-focused.log`. The pending 320px
artifact was inspected: full name, disabled controls, pending acknowledgement and
unchanged canonical status remain readable. Sticky shell full-page compositing
is not represented as manual accessibility acceptance. Additional forced-color,
reduced-motion and scoped axe assertions are included for the final run.

## Final local verification

The frozen final sources pass complete `pnpm verify`, terminal
`WORKSPACE_STATUS_FINAL_VERIFY_EXIT=0`, log
`test-results/workspace-status-final-verify.log`: 158 files / 1,533 unit tests plus
coverage; all 35 typecheck tasks; lint/build; seven UI-foundation, 76 shell, one
diagnostic performance, **32 resilience**, seven onboarding, 13 document and nine
browser-storage cases. The final resilience run includes the complete lifetime
journey with forced colors, reduced motion and scoped axe, plus actual native
header save/undo and unchanged original focus/submission assertions. Native
adapter, Rust, secure-store, archive/backup, schema, boundary/foundation, extension
package/build, license, secret and dependency-audit gates pass. npm reports no
known vulnerabilities; Cargo retains ten reviewed allowed warnings. Existing
bundle-size/dynamic-import warnings are not represented as performance acceptance.

All nine separate extension cases also pass on the same final sources, terminal
`WORKSPACE_STATUS_FINAL_EXTENSION_EXIT=0`, log
`test-results/workspace-status-final-extension.log`. This includes canonical
capture/correction, acknowledgement/restart, hostile/oversized input and checksummed
Firefox manual fallback. Only documentation changes follow these complete runs.

Requirement audit: the normal header uses the existing view-bound atomic command
and undo token, not reference catalog data or optimistic status. The session
coordinator and actual browser negative/latency cases cover retained original
tuple, stale/failure/foreign ownership, explicit discard, responsive pending
single flight and late-job/focus isolation. Submission-review and native journeys
prove the relevant separate scopes; no claim is made that every negative runs on
every adapter or in an installed WebView. Shared feedback is reachable exactly
once in both layouts. Header and Overview follow canonical refresh, while exact
submitted artifacts remain immutable. Initial Applied and terminal reopening
retain explicit review/confirmation. No default stages or next-action/scheduling
completion are implied.

Final whole-repository formatting and boundary/foundation/license/secret policy
checks pass, terminal `WORKSPACE_STATUS_FINAL_POLICY_EXIT=0`, log
`test-results/workspace-status-final-policy.log`. `git diff --check` is clean.
Exact clean-commit hosted CI remains required.
`INT-003` remains unchecked. Manual/reference-device and milestone gates remain
independently open. No scheduling or next-action composition is claimed.

## Hosted aggregate follow-up at fbcda1e (2026-10-20)

Exact run `39379112047` is terminal failure, not success. All non-aggregate required jobs pass, including both exact Chrome lanes, Firefox, Windows/macOS/Ubuntu native diagnostics, extension and secret scan. The aggregate passes the header and normal note journeys but fails the new missed-breakpoint fault-injection test's subscribed-event counter (zero); retained snapshot already shows full-page mode and exact note draft. Raw log and artifact are retained locally. The [next-action prerequisite follow-up](normal-next-action-verification.md#prerequisite-full-checkpoint-and-predecessor-hosted-follow-up) records an independent native-event observer, unchanged behavioral assertions and timeout, a passing focused run and a deliberate failure without production reconciliation. `INT-002` and `INT-003` remain open pending fresh exact hosted proof; no product fix or milestone completion is inferred from the failed aggregate.
