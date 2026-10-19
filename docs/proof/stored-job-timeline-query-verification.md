# Stored job Timeline query — local verification

Date: 2026-10-19. Checklist `Q3-005` remains open.

## Boundary

The normal Timeline tab is not connected yet. Existing `JobWorkspaceDto` supplies a count, not history. This prerequisite adds a separate read-only `ListJobTimelineQuery` and concrete shared DatabasePort adapter; it does not claim the UI, editing notes, scheduling, follow-ups, or the full canonical journey is complete.

Pages contain actual append-only status events and interactions. Status items retain application identity, source/destination stage identities and current stored labels, optional note and the consumed undo timestamp when recorded by the snapshot ceiling. Labels are not historical name snapshots. Undo never erases the original event, and historical destinations never replace current job/application projections. Future interview/reminder schedules are not invented as completed history.

Each page transaction checks the job and explicit current archive visibility, then reads bounded history with parameter-bound values. Keyset order is `occurred_at DESC, kind ASC, id ASC`; cursor scope includes job, archive choice and the first page's operation instant. Both occurrence and creation times must precede that ceiling, so ordinarily appended backdated interactions cannot enter later pages. A missing or mismatched anchor fails explicitly. These are bounded reads over immutable events, not a long-running database snapshot or frozen historical display-name projection.

The application validates input/context before storage and copies/freezes returned pages, records, labels and cursors. It rejects invalid scope, chronology, order, duplicates, page bounds and continuation facts rather than silently repairing them. Missing jobs differ from existing empty history. Unknown adapter failures return content-free retryable errors; invalid results fail closed. There is no new mutation, schema, dependency, permission, IPC operation, network capability or Accepted decision change.

## Executable evidence

- Initial test fails because the query module does not exist; implementation follows that missing-boundary failure.
- Initial application and Node SQLite run passes two files / 23 tests; expanded run passes two files / 29 tests.
- All 34 typecheck tasks pass. Initial lint identified three style/type-safety findings; these were corrected without changing policy configuration. The subsequent complete lint run passes all 22 tasks.
- The existing shared `undoStatusChange` contract now additionally exercises this query through all adapters that run the aggregate. It proves mixed-kind timestamp ties, one-item pagination, stable snapshot ceiling, original-event retention and reversal timing, missing-anchor rejection, archive scope and unchanged current status/history. Manifest case identities remain unchanged; these are additional assertions in the existing status-undo case, not a claim that old immutable runs executed the new assertions.

The final `pnpm verify` exits 0, explicitly observed as `TIMELINE_VERIFY_EXIT=0`. The process-local `VITEST_MAX_WORKERS=4` setting controls scheduling only; no timeout, assertion, policy or coverage threshold changed. Log: `test-results/stored-job-timeline-verify.log`.

- Unit and coverage: 140 files / 1,146 tests, including all 20 Timeline application cases.
- Build, formatting, typecheck, lint, architecture/foundation records and generated-contract reports pass.
- Browser suites: seven UI foundations, 76 shell, one performance, 21 resilience, seven onboarding, 13 document and nine browser-storage cases pass. Browser storage executes the current shared aggregate with the new Timeline assertions.
- Native core: 14 passed / one intentionally ignored; all 14 native adapter cases pass, including the current shared aggregate against the actual Rust SQLite service.
- OS-secret lifecycle, checksummed archive replacement/recovery and managed backup proofs pass. License checks cover 520 npm packages / 498 crates, secret checks pass, npm reports no known vulnerabilities and Cargo retains ten allowed warnings. Changesets status passes.

No new UI is introduced, so no Timeline visual, manual assistive-technology, packaged interaction or reference-hardware acceptance is claimed here.

## Remaining

Hosted run `39338734668` at exact query commit `c81e1e3d39dc965c71daf5949c911ac9e0f1493b` passes all browser, extension, Windows/macOS/diagnostic Linux and secret lanes, but its aggregate fails the existing status-action focus assertion immediately after an axe scan. The query-specific shared contracts pass. This is not an aggregate-green checkpoint. The subsequent normal Timeline slice isolates the unchanged focus assertion before the unchanged accessibility audit: installed `@axe-core/playwright` `finishRun` creates and closes a separate browser page. That interference is a plausible explanation, not a confirmed production focus defect or proof that a rerun will pass. See [normal Timeline proof](normal-stored-job-timeline-verification.md) for fresh verification.

Predecessor focus checkpoint `c828eb36afa11c3fda17246665463ff3617e0a39` passes every required hosted job in [run 39336936560](https://github.com/seabAu/Coredrill/actions/runs/39336936560). That result does not verify this subsequent query implementation.

Complete clean-commit hosted CI. Then compose the normal Timeline loading/empty/error/retry/pagination surface and prove offline navigation/reload without reference fixtures. No milestone gate closes on this prerequisite.
