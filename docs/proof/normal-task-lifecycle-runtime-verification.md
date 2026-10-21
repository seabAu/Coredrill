# Normal task lifecycle runtime verification

Status: runtime/controller and focused adapter proof passes. Subsequent normal task-list/completion controls, hardening and full local/extension verification are covered by [UI verification](normal-task-list-ui-verification.md); exact hosted UI proof remains and `INT-005` is open.

## Scope and implementation

`apps/web/src/stored-next-actions.ts` composes the existing application task query and completion command with lazy SQLite adapters. Validation and immutable input capture occur before awaiting database opening/migration. The runtime owns completion audit time, preserves typed conflicts, redacts private errors and never automatically retries a potentially committed completion. No implicit application binding, task deletion, completion undo, dismissal UI or scheduling converter is introduced.

`stored-status-controller.ts` uses the same single-flight lock for completion, status moves, creation and undo. It copies original job/task versions before asynchronous workspace preflight, rejects changed/foreign/archived owners, forwards the original versions to the transaction and returns a distinct completed outcome rather than inventing an undo token. Task version/owner/state validation remains authoritative inside the existing SQLite transaction.

## Evidence

- `test-results/task-lifecycle-runtime-before.log`: 14 tests fail before missing runtime composition is added; existing creation tests remain otherwise passing.
- `test-results/task-lifecycle-runtime-after.log`: 30 runtime-boundary tests pass, including default read bounds, no identities/writes during reads, invalid input before database access, copied completion intent, runtime-owned audit time, redacted opening failures, typed conflicts, forged acknowledgements and no automatic retry.
- `test-results/task-completion-controller-before.log`: 11 new controller tests fail before completion is connected.
- `test-results/task-lifecycle-runtime-controller.log`: both files / 57 cases pass after implementation, including completion lock contention against completion/creation/status/undo, preflight owner/version/archive checks, original intent, invalid task versions, error redaction, lock release and no implicit submission/undo work.
- `test-results/task-lifecycle-runtime-typecheck.log`: strict changed-source lint and all 35 workspace typecheck tasks pass.
- `test-results/task-lifecycle-runtime-browser-native.log`: all three actual runtime cases pass. The shared direct-command journey executes in an offline production browser root and the real Rust native SQLite process. It reads tasks, rejects stale task versions without change, completes once, rejects replay, invalidates an old cursor, preserves completed/dismissed history and application identity, recomputes the pending header to Not set, and proves identical task history after reload. This is actual runtime composition, not normal UI completion proof.

## Remaining work and constraints

The subsequent UI proof covers bounded root-owned task reading and deliberate completion through this controller, captured context and cross-job isolation, overlapping mutation prevention and acknowledged-write/readback-failure separation. Full final-source, extension, policy and exact hosted verification remain before claiming this slice complete. Dismissal/reminder semantics and scheduled form integration remain required follow-through. No schema, dependencies, permissions or Accepted decision changes; ADR-0009 remains Proposed.
