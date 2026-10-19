# Normal stored status actions — verification

Date: 2026-10-19. Checklist: `Q3-005` remains open.

## Outcome

Normal Board moves and Table status edits now use guarded local transactions and durable undo. Final-source component checks pass across the recorded runs; the final local aggregate run is **not** green because three existing browser cases timed out. Those same three pass unchanged in isolation. Exact clean commit `1aa4d093c93a866b32557ed9819c706c8352049c` subsequently passed every required hosted job in [run 39323540428](https://github.com/seabAu/Coredrill/actions/runs/39323540428). This does not verify the later [focus refinement](status-focus-recovery-verification.md). `Q3-005` and milestone gates remain open.

Final-source coverage: 138 unit files / 1,119 tests and coverage; six foundation cases; all 76 shell cases across the 73-pass aggregate plus three-case retry; performance; 21 resilience, seven onboarding, 13 document and nine browser-storage cases; 14 native adapter cases; Rust core, redacted secret, archive/backup recovery, reports, policy and audits. Windows package proof is recorded below. No assertions, thresholds or timeouts were weakened.

## Scope

The normal runtime now composes mandatory viewed-state status commands and durable undo through its selected DatabasePort. Board gestures carry their viewed row version; Table editors retain the version from opening rather than rebinding on refresh. Only status editing is connected in the normal Table. Unsupported scalar/configuration actions remain unavailable.

Both views reread SQLite after acknowledgement, rather than publishing optimistic canonical values. An acknowledged write remains saved if its subsequent refresh fails. Pending operations are single-flight; failed drafts remain editable and retryable. Undo entries remain reachable across Board/Table until used or explicitly dismissed, with persisted exact-state preconditions. Terminal reopening requires confirmation. Initial Applied moves route to existing Documents review, with a transactional submission-snapshot requirement at the interactive runtime boundary; ordinary later classification changes do not rewrite submitted snapshots.

No migration, dependency, permission or Accepted decision changes. The offline status notice uses a div live region rather than an unsupported aside/status role combination exposed by this journey's axe scan.

## Evidence to date

- All 34 workspace typecheck tasks passed after normal screen wiring.
- Focused runtime/controller/application/Board/Table unit run: 5 files / 67 tests passed.
- Changed runtime/UI source ESLint passes. Directly invoking ESLint on the UI test file is unsupported by its project-service configuration; package checks remain authoritative.
- Normal navigation and initial status journey passed together: two real-browser cases, including user-created jobs/stage, Board move, undo after more than ten seconds, Table save, axe with zero violations and offline reload. Subsequent held-write and stale-draft additions require the final run below.
- Real Rust process / simulated Tauri host journey passes Board move, peer-view undo and Table status save alongside capture, document creation/export/reload and zero OPFS fallback. Native unavailable-IPC case also passes. This does not prove a packaged interactive workflow.
- Predecessor `d5339ac` is fully hosted-green in [run 39310159834](https://github.com/seabAu/Coredrill/actions/runs/39310159834). That run does not verify this uncommitted UI integration.

## Earlier full local checkpoint (before final focus/fixture refinements)

`pnpm verify` exits 0. Ignored log: `test-results/stored-status-actions-verify.log`.

- Unit and coverage runs each pass 138 files / 1,119 tests.
- All 34 typecheck tasks, package/tooling lint, formatting, builds, boundaries and foundation checks pass.
- Browser suites pass: six foundations, 76 shell/capture cases, one diagnostic performance case, 20 resilience cases, seven onboarding cases, 13 document cases and nine storage cases. The final status case includes held-write single flight, unchanged SQLite status while pending, failure/draft retention, retry and an open draft made stale by acknowledged undo.
- All 14 real native adapter cases pass, plus Rust core, redacted platform-secret, archive recovery and managed-backup checks.
- Contract/report/extension inspections, license and secret checks pass. npm audit reports no vulnerabilities; Cargo retains the same ten allowed warnings.

## Remaining proof

The expanded normal status browser case passes initial Applied routing with unchanged status, user-created Applied stage naming, 320-pixel forced-colors page-width/axe checks and explicit save/cancel focus restoration. Its updated screenshot was visually inspected. The subsequent full `pnpm verify` also exits 0 in `test-results/stored-status-actions-final-verify.log`.

The two final status browser cases pass together. The additional case explicitly opts into synthetic documents/stages, creates a separate job and sole application through normal UI, selects a reusable exact resume and records a reviewed plain-text submission. Normal Board actions then close the job, cancel reopening without a move, confirm reopening, undo back to closed and confirm a return to Applied. The exact submitted snapshot, hashes, original applied time/channel and selected versions remain equal. The opted-in fixture gains a terminal reference stage only; fresh production vaults still have no invented defaults. The fixture's separate ambiguous application attempts are not modified or silently selected.

Row-scoped Table focus restoration and Board move/cancel focus restoration were refined after those full gates; the two browser cases pass. Both cases now explicitly switch the browser offline before their status mutations, rather than proving offline reload only; that strengthened variant awaits the full run below. No milestone or checklist gate is closed by this report.

## Windows package checkpoint

Fresh NSIS build and the guarded temporary install/launch/uninstall harness pass. The package contains the current renderer, including the focus refinements and the explicitly opted-in terminal fixture stage.

- Twenty measured launches, zero failures; diagnostic page-load p95 650.5 ms and aggregate working-set p95 374,480,896 bytes.
- Installer: 4,154,373 bytes; SHA-256 `75a23b5773a323b9c8799cc701dd7dc4eec5d404f910a4fc28e53be8ddd2a811`.
- Temporary installation removed, application data preserved. The harness refuses an existing default installation and uses the confined startup diagnostic storage root.
- Ignored artifact: `test-results/stored-status-actions-package-proof.json`; build/check logs use the same prefix. Dirty-worktree diagnostic evidence, not reference-hardware, signing or full installed-workflow acceptance (`targetConformant: false`).

## Final gate timing observations

The four-worker run passes all 138 unit files / 1,119 tests and coverage, then exits 1 with three existing browser cases reaching their 30-second whole-test timeout: Job core tabs, tablet-landscape reflow and capture review actions. The suite passes the other 73 cases. The unchanged isolated rerun passes all three in `test-results/stored-status-actions-shell-retry.log`; neither assertions nor timeouts were altered. A system snapshot shows 16% aggregate CPU and available memory, which does not establish the cause of the stalls.

The final-source run in `test-results/stored-status-actions-release-verify.log` passed unit/coverage, all 76 shell cases and earlier checks, then timed out during the performance suite's web-server build before its test started. The unchanged performance suite subsequently passed with its original 120-second startup timeout; its log records slow plugin hooks (`test-results/stored-status-actions-performance-retry.log`). The precise cause of the slowdown is not established.

The next full run (`test-results/stored-status-actions-complete-verify.log`) passed 1,118 tests but the existing synchronous Rust-license CLI test exceeded its five-second test timeout. Its unchanged isolated rerun passes in 691 ms. No timeout, assertion, audit or threshold was weakened.

The completed full run is retained in `test-results/stored-status-actions-bounded-verify.log`, with process-local `VITEST_MAX_WORKERS=4`, a supported setting verified against the installed Vitest resolver. This changes unit-test scheduling only, not scope or thresholds. It is not a green aggregate result.

Every verification check not reached after that shell-suite failure passes in `test-results/stored-status-actions-remaining-gate.log` (command sequence exit 0), including the strengthened offline status journeys, performance, remaining browser/native/recovery checks and policy/audits. Both status cases run their mutations while explicitly offline and pass, including terminal cancellation/confirmation, undo and identical submitted snapshots/applied facts. License checks pass for 520 npm packages and 498 crates; npm audit reports no vulnerabilities and Cargo retains ten allowed warnings. The local aggregate remains a failure; successful component reruns are not an aggregate pass. Subsequent clean-commit hosted run `39323540428` passes every required job at `1aa4d09`, as recorded above.

## Remaining engineering and release boundaries

- Retain the local timeout observations alongside the successful clean-commit hosted result.
- Complete the separate [focus recovery refinement](status-focus-recovery-verification.md) for removed origins and deliberate focus movement; it requires its own final/hosted proof.
- Complete remaining stored workspace/backup/recovery composition and the unseeded canonical Phase 3 journey. Reference documents in the additional submission case do not close that requirement.
- Representative-user studies, manual assistive-technology, reference hardware, signing, publication and other independent gates remain open.

Changed surfaces: normal app runtime/shell and new status runtime/controller/actions; shared Board/Table contracts and editor state; application/storage submission-review policy; explicitly opted-in reference fixture; unit/browser/native regressions; Changeset, design notes and living ledger. No dependency, schema, permission or Accepted decision changes.
