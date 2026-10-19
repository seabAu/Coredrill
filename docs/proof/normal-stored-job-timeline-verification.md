# Normal stored job Timeline — local verification

Date: 2026-10-19. Checklist `Q3-005` remains open.

## Implemented boundary

The normal Timeline now reads the validated application query through the actual selected browser/native DatabasePort. Reference catalog content stays opt-in. No SQL or privileged adapter enters the UI, and native failures never start browser storage. The screen shows actual status/interaction identities, occurrence times in UTC, current stored stage labels and explicit recorded undo annotations. It never derives the current stage from history or invents emails, source visits, submissions, interviews or follow-ups.

The root-owned ephemeral reader survives replacement of the responsive side/full-page frame. It disposes when the job/tab/runtime API changes, refuses overlapping reads and ignores disposed work. Older pages retain their snapshot ceiling and append only in valid order without duplicate identities. Initial failures have an explicit retry; failed older pages and refreshes retain prior facts/cursor. A failed refresh requires retry before continuing an older snapshot. No read writes canonical state.

Named keyboard context is restored after an older-page control disappears; a surviving trigger remains the preferred target. Deliberate focus movement during pending reads is preserved. Record text renders as React text nodes, not HTML. The read-only view adds no fake note-editing or scheduling control; those normal activity actions remain subsequent work.

No schema, dependency, permission, IPC protocol or Accepted decision changes.

## Failure reproduction and focused proof

- Runtime tests initially fail because `timeline` is absent; the coordinator module is absent. The first browser red run (`test-results/stored-job-timeline-red.log`) reaches the real unseeded offline status/undo workflow and fails because the normal stored-history region does not exist.
- The first UI-focused run passes native and existing status cases but exposes a test-harness reset that cleared two independent fault flags together. Only that reset was corrected; no timeout or assertion changed.
- Visual review discovers that responsive frame replacement resets two loaded records to one. The added 320-pixel assertion reproduces that failure in `test-results/stored-job-timeline-responsive-red.log`. Moving the reader to the shell root repairs it without adding canonical storage or a global cache.
- Final focused run (`test-results/stored-job-timeline-ui-responsive.log`) passes all five cases: the new complete normal Timeline journey, both existing offline status/submission cases and both real-native/failure cases. The separate focused unit run passes 17 tests across runtime, coordination and server-rendered presentation; typecheck passes 34 tasks and lint passes 22 tasks before the responsive ownership refinement. Final full verification follows below.

The new browser case creates its vault, jobs, user-named stage and status/undo events through normal UI actions with AI disabled and the network offline. Fault/page-size injection wraps the real validated query; it creates no records. It proves an existing empty history, initial retry, failed older-page/refresh retention, exact-key pagination, keyboard fallback, preserved deliberate focus, responsive loaded-page continuity, zero axe violations/page overflow, a completed late read that cannot enter a different job, exact event identity after offline reload and zero external requests. Native assertions run against the actual Rust SQLite process through the existing simulated host; this is not an installed-WebView interaction claim.

Hostile note/interaction strings are covered by server-rendered presentation tests. The normal browser records are user-action-created status events, not an imported malicious-history fixture. A 320-pixel forced-colors visual artifact is inspected; it is not manual screen-reader or reference-hardware acceptance.

## Remaining proof and work

The first full `pnpm verify` exits 0 (`NORMAL_TIMELINE_VERIFY_EXIT=0`): 142 unit files / 1,157 tests, coverage, all browser suites including 22 resilience cases, native contracts/recovery and policy/audits. Log: `test-results/normal-stored-timeline-verify.log`. The current 320-pixel visual shows both events and the explicit recorded reversal; the final artifact is scoped to the Timeline region rather than a full-page sticky-header composite.

Predecessor query run `39338734668` is terminal: all lanes except aggregate pass. Aggregate fails an existing focus assertion immediately after `AxeBuilder.analyze()`. Inspection of installed `@axe-core/playwright` shows `finishRun` creates/closes a second browser page. The test now awaits the same focus assertion immediately after the save, before the same axe audit; no assertion, timeout, accessibility scope or production status logic changes. Tool interference is an inference, not a confirmed root cause. The failure log is retained at `test-results/timeline-query-hosted-failure.log`; do not call that old run green.

## Final local verification

The second full `pnpm verify`, after the test-isolation edit, exits 0 with `NORMAL_TIMELINE_FINAL_EXIT=0` retained in `test-results/normal-stored-timeline-final-verify.log`. The source remained unchanged throughout the run. Process-local `VITEST_MAX_WORKERS=4` controls scheduling only; no timeout, assertion or threshold was weakened.

- Unit and coverage: 142 files / 1,157 tests.
- All formatting, typecheck, lint, build, architecture/foundation records and generated reports pass.
- Browser suites: seven UI foundations, 76 shell, one performance, 22 resilience, seven onboarding, 13 documents and nine browser-storage cases pass.
- Native core: 14 passed / one intentionally ignored; all 14 native adapter cases pass. Secure-store, archive replacement/recovery and managed backup proofs pass.
- Licenses: 520 npm packages / 498 crates. Secret scan and Changesets pass. npm reports no known vulnerabilities; Cargo retains ten allowed warnings.

The final 320-pixel forced-colors Timeline-region screenshot was inspected: both loaded records, UTC timestamps and the explicit undo explanation remain readable; no page overflow or automated axe violation is reported. Fixed mobile navigation is visible at the bottom of the crop. This is not a manual assistive-technology or installed-desktop interaction claim.

Exact commit `d6a130cc077c68963f8d290632a476f2d20f1952` passes every required hosted job in [run 39341919878](https://github.com/seabAu/Coredrill/actions/runs/39341919878): aggregate, exact Chrome/Firefox, extension, Windows/macOS/diagnostic Linux and secret lanes. This verifies the normal Timeline and its query prerequisite. The old query run remains a failure; a successful descendant does not rewrite its result or establish the inferred focus-interference cause.

The separate [unseeded canonical proof](phase-3-unseeded-canonical-journey-verification.md) now passes locally while retaining the scaffolded regression. Its own clean-commit hosted verification remains. Continue the remaining Overview/Company/Source/activity and backup/recovery composition. Do not close `Q3-005`, a milestone gate or manual accessibility row on the Timeline-only checkpoint.
