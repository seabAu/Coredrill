# Viewed-state status and undo boundary verification

Date: 2026-10-19. Scope: `Q3-005` production status/undo composition prerequisite. No milestone closure.

## Finding and implementation

The existing status transaction compared projections/row versions read inside its own transaction but accepted no state from the view that initiated an edit. A stale UI could therefore overwrite a later nonterminal status, or omit a newly created active application. Existing undo already protected its exact post-edit state, but its concrete application port/error mapping was absent.

- `ChangeStatusInput` / `ChangeStatusPortInput` accept optional `expected` with job row version, current status identity (including null), and active-application row version (including explicit null). Legacy trusted runners remain compatible without it. Normal interactive composition must require it.
- The application validates/copies/freezes the tuple before the port and requires a returned event to start at the viewed status. Invalid/incomplete/mismatched application context fails before storage; unknown/private adapter details are not exposed.
- The repository checks job archive state, viewed version/status and the exact unique active application identity/version in the same transaction before any projection, timeline event or token write. Omitted/new/ambiguous active attempts and stale versions fail closed.
- `createDatabaseMutationUndoPort` maps existing missing-token, replay and changed-target conflicts into the existing application vocabulary. Status history remains append-only; tokens remain single-use and unexpired, subject to their exact target preconditions.
- The shared manifest keeps its current ordered case identities; existing status/undo cases now contain stronger assertions. No migration, contract-manifest version, dependency, permission, default-stage terminology or Accepted decision changes.

## Focused executable evidence

- Initial red: application/status + fast SQLite run failed 9 tests / passed 42 because expected view context was ignored and an incompatible returned source status was accepted. Retained ignored log: `test-results/stored-status-preconditions-red.log`.
- `pnpm exec vitest run packages/application/test/job-pipeline.test.ts packages/application/test/mutation-undo.test.ts packages/storage-core/test/tracker-repositories.test.ts`: 3 files / 62 tests pass.
- All 34 typecheck tasks pass. Changed application/storage-core source lint passes after removing an unnecessary test assertion.
- `pnpm test:storage-browser`: all 9 cases pass through official SQLite WASM/OPFS, including the strengthened shared status/undo contract.
- `pnpm test:storage-native`: 14 actual native adapter tests pass, including that same contract through the Rust process. Rust core separately passes 14 tests with the platform-secret case intentionally reserved for the redacted harness. Local combined log: `test-results/stored-status-adapters.log`.
- Shared negative cases cover wrong job version/status, stale application version, omitted active attempt, multiple active attempts and an archived job. Rejections leave no status event/token or partial projection. A valid tuple commits afterward; old trusted calls still pass existing rollback/reopen/undo tests.
- Concrete undo/application proof covers success, replay, stale target and missing token. The shared native/browser status-undo case consumes through the new port and checks its stable replay error.

## Final-source local gate

`pnpm verify` exits 0. Retained ignored log: `test-results/stored-status-preconditions-verify.log`.

- Format, architecture/foundation checks, all 34 typecheck tasks, all 22 package lint tasks plus tooling lint, build and Changesets pass.
- Unit and coverage runs each pass 136 files / 1,107 tests.
- Browser suites pass: 6 foundations, 76 shell/capture/review, 1 diagnostic performance, 19 resilience, 7 separate onboarding cases, 13 document cases and 9 storage cases. Native adapter tests pass all 14 cases; Rust core, the separately redacted platform-secret harness, archive recovery and managed-backup checks pass.
- Schema drift, contrast/extraction reports and extension build/package inspection pass. License checks pass for 520 npm packages and 498 crates, secret scan passes, npm reports no known vulnerabilities and Cargo retains the same ten reviewed allowed warnings.
- The unchanged runtime/UI is regression-tested, but these results do not make its currently disabled mutation controls connected. No installed end-user status/undo workflow is claimed.

## Remaining verification and product boundaries

Clean-commit hosted verification remains. This does not enable Board/Table controls or prove an end-user mutation journey. Normal runtime/UI composition must supply mandatory viewed context, refresh both views from SQLite after acknowledgement, retain failures/input, provide accessible pending/confirmation/retry states and at least ten seconds of undo, and preserve Mark Applied/document-snapshot review. Multiple active attempts require explicit selection rather than an inferred default. The Table currently reads its row version at submit time; wiring must retain the version from editor opening rather than silently rebinding a retained draft to refreshed rows. Board gestures likewise need a well-defined viewed-state binding, and undo must remain reachable from both peer views. `Q3-005` stays open.
