# Phase 1 pipeline persistence verification

Date: 2026-08-25

Checklist scope: `DB-003`

Packages: `@coredrill/storage-core`, `@coredrill/storage-browser`, `@coredrill/storage-native`

Decision changes: none

## Outcome

`DB-003` adds shared forward migrations `0014` through `0022` and focused repositories for custom status definitions, applications, append-only status history, interactions, next actions, interviews, and local reminders. Existing databases advance from schema version 13 to 22 through the same checksum-bound migration chain in browser SQLite and native rusqlite.

The slice does not seed or select default display-stage names. Contract fixtures use clearly synthetic custom names mapped to the already-accepted aggregate status categories, leaving `Q-006` open. It does not add an account, hosted database, network dependency, AI path, background browser activity, or automated application action.

## Persistence and transaction proof

| Contract                    | Enforced behavior                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom stages               | A status definition carries a user-facing name, stable aggregate category, ordering, terminal state, archive timestamp, and row version; no system/default rows are seeded.                   |
| Explicit applications       | A second active application for one job is rejected unless the caller supplies the named `allowAdditionalAttempt` authorization.                                                              |
| Atomic status changes       | `changePipelineStatus` validates terminal-stage reopen intent, updates job and application projections, and appends the status event inside one database transaction.                         |
| Rollback                    | A deliberately duplicated event ID fails after projection writes; both projections and the timeline return to their prior state.                                                              |
| Append-only history         | Status events have list/append behavior only; no update or delete repository API exists. Successful transitions add history without rewriting earlier events.                                 |
| Next-action projection      | `setNextAction` validates linked records, inserts the action, and updates `job.next_action_at` atomically. Completing an action recomputes the next pending due time in the same transaction. |
| Interactions and interviews | Bounded interaction records retain direction and occurrence time; interviews retain UTC start, explicit IANA timezone, duration, participants, preparation, and outcome fields.               |
| Local reminders             | Reminder state and firing timestamp are constrained together; firing increments the row version without introducing a hosted scheduler.                                                       |

Every fixture is synthetic and contains no resume, provider credential, token, private page, real employer contact, or applicant data.

## Reproducible local verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:unit packages/storage-core/test/tracker-repositories.test.ts`                      | Passed: 1 file and 2 shared repository-suite tests in fast in-memory SQLite.                                                                                                                                  |
| `pnpm test:coverage`                                                                          | Passed: 27 files and 145 tests; 90.98% statements, 78.04% branches, 96.86% functions, and 92.91% lines overall.                                                                                               |
| `pnpm test:storage-browser`                                                                   | Passed: 6 browser tests, including both shared Phase 1 repository suites at schema version 22.                                                                                                                |
| `pnpm test:storage-native`                                                                    | Passed: 11 TypeScript adapter tests; Rust reported 6 passed and 1 intentionally ignored platform exercise.                                                                                                    |
| `pnpm test:extension-transfer`                                                                | Passed: 2 Chromium/Firefox transfer tests; Firefox fallback imported idempotently at schema version 22.                                                                                                       |
| `pnpm check:licenses`                                                                         | Passed: 351 npm and 498 Cargo package records reviewed.                                                                                                                                                       |
| `pnpm audit --audit-level=low`                                                                | Passed: no known vulnerabilities.                                                                                                                                                                             |
| `pnpm verify`                                                                                 | Passed the complete formatting, architecture, typecheck, lint, unit, coverage, build, browser/native storage, recovery, security, license, audit, and Changesets gate.                                        |
| [Foundation CI run 32853841488](https://github.com/seabAu/Coredrill/actions/runs/32853841488) | Passed implementation commit `7929cbe` across both pinned Chrome and Firefox lanes, Windows/macOS/Ubuntu native lanes, extension reproducibility, full-history secret scan, and the complete foundation gate. |

The Rust audit reported zero vulnerabilities and the 15 already-reviewed allowed transitive Linux GTK maintenance/unsoundness warnings recorded in the dependency inventory. A local real-Firefox WebDriver invocation could not start because this workstation has no `geckodriver`; the hosted pinned Firefox 153 and 154 jobs supplied that clean-run proof. Those two jobs emitted a non-blocking notice that their checksum-pinned geckodriver setup action still declares the deprecated Node.js 20 action runtime while GitHub forces it onto Node.js 24; this should be reviewed when that upstream action publishes a newer runtime.

## Implementation surfaces

- `migrations/0014_status_definition.sql` through `migrations/0022_reminder.sql` — strict forward schema and job projections.
- `packages/storage-core/src/pipeline-records.ts` — adapter-neutral pipeline record types.
- `packages/storage-core/src/pipeline-repositories.ts` — focused parameterized repositories and explicit projection transactions.
- `packages/storage-core/src/pipeline-contract-harness.ts` — reusable cross-adapter transaction and rollback proof.
- `packages/storage-core/test/tracker-repositories.test.ts` — fast SQLite execution for unit coverage.
- `e2e/storage-tracker-repositories.spec.mjs` — real browser OPFS/SQLite execution.
- `packages/storage-native/test/native-database.test.ts` — native rusqlite execution through the thin boundary.

## Boundaries and remaining work

- `application.selected_resume_version_id` and `selected_cover_letter_version_id` are nullable validated IDs without foreign keys until `DB-005` creates document-version storage.
- `APP-002` and `APP-003` still own application-service commands, clock/time-zone orchestration, and UI-facing error translation; this slice proves durable repository behavior only.
- `DB-004` is next for tags, saved views, the versioned filter AST, and allowlisted parameterized SQL compilation.
- Index and FTS work remains reserved for `DB-007`; this slice makes no query-performance acceptance claim.
- `DB-008` remains open until the complete repository contract surface reaches its dedicated checklist review.
- `Q-006` remains open; no default display-stage terminology was chosen or locked.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
