# Explicit local Applied-stage creation

Date: 2026-10-19. Scope: one prerequisite of `Q3-005`, not closure of that journey.

## Behavior

The actual job document preparation route offers explicit user-named Applied
configuration. The command validates the name, owns identity/time, and rejects
expanded input and malformed adapter responses without leaking storage content.
The repository transaction creates a user-owned nonterminal Applied stage, or
reuses the exact compatible active name. Archived, terminal, case and category
collisions fail without mutation. SQLite's existing unique name constraint also
prevents ambiguous case-insensitive duplicates; the repository retains a defensive
multiple-match guard. No application, job, document selection, event or submitted
snapshot is changed. No migration, dependency, permission or Accepted decision changes.

## Executable evidence

- `pnpm exec vitest run packages/application/test/applied-stage.test.ts packages/storage-core/test/document-editor-repository.test.ts`: 41 tests pass, including 16 new command cases and six new repository cases, rollback after insert, idempotent identity and unchanged job/application/event/document state.
- `pnpm build`: 22 package tasks pass.
- `pnpm typecheck`: 33 tasks pass, including test projects.
- `pnpm exec playwright test --config=playwright.resilience.config.mjs application-attempt.spec.mjs`: one built-PWA offline journey passes. Normal manual capture/review creates the job and attempt; stage creation uses the actual UI and command, not seeded stage records. A synthetic first-call failure retains input, real retry creates, reload and exact-name reuse retain one eligible stage identity, and job/preparation reads remain unchanged. Axe has no violations and the page fits 320 pixels; screenshot `applied-stage-320.png` is attached in `test-results/resilience`. Zero external requests.
- Shared pipeline contract assertions cover creation/reuse, incompatible-category rejection and unchanged application/job/event state. The complete browser and native repository suites pass with these assertions.

The first browser run exposed duplicate sibling React keys and three visible forms
during reload. The new component now uses an Applied-stage-specific key; the same
strict named-form test passes without weakening its locator.

An initial direct ESLint invocation included test files outside the repository's
lint project configuration and failed project discovery; no lint configuration was
weakened. Repository-supported lint subsequently passed in the complete gate.

The first full gate passed lint, 1,023 unit/coverage tests, builds, all 76 shell
tests and the performance diagnostic, then stopped in the existing service-worker
update test: its old-document readiness predicate passed before the consented
reload, so the subsequent OPFS read lost its execution context. Production code
reloads on `controllerchange`; the test now arms a page `load` event before clicking
Reload update and checks that an old-document-only witness is gone before reading
OPFS. No production update/recovery policy, retry or timeout changed. All three
focused repeated executions passed with the sentinel preserved and zero external
requests. The fresh complete `pnpm verify` subsequently passed with exit 0.

The final local gate passes formatting, boundaries, foundation records, typecheck,
lint, 129 files / 1,023 unit tests and coverage, builds, reports, extension package
inspection, all browser suites (including 76 shell and nine resilience tests),
shared browser/native storage contracts, secure store, archive/backup recovery,
contract schemas, license and secret checks, audit and Changesets. npm reports no
known vulnerabilities; Cargo retains the same ten reviewed warnings. Rust's
secure-store lifecycle test is intentionally ignored in the generic unit runner
and passes separately through the real Windows Credential Manager proof harness.

## Remaining proof

The 320-pixel screenshot has been visually inspected: the named form, input,
success message and button remain readable within the page. Fresh clean-commit
hosted verification is still required before this slice is complete. `Q3-005` and
`GATE-3` remain open: the complete canonical journey still needs normal-user setup
instead of its reference fixture, plus tracker composition audit. Human research,
reference hardware, manual assistive technology and public distribution gates
remain independent.
