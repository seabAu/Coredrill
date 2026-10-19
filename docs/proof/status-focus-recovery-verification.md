# Status focus recovery — local verification

Date: 2026-10-19. Checklist: `Q3-005` remains open.

## Scope and boundaries

Restore a connected, named keyboard context after status controls disappear, without stealing deliberate focus movement during asynchronous work. No schema, dependency, permission, source-policy or Accepted decision changes. No canonical write or command policy changes; focus state stays ephemeral.

The shared `restoreFocusAfterChange` helper captures the initiating element at action time, checks ownership after rendering and resolves the current target lazily. A Table searches by job identity before its field label, never by title alone. If that origin is absent it falls back to its named Table section, which is programmatically focusable without adding a sequential Tab stop. Board moves and reopen cancellation use current status feedback if the Board/control no longer exists. Error/undo focus uses the same ownership guard. Table success has one restoration owner, so shell feedback cannot compete with the Table's editor teardown.

The normal Pipeline currently searches title/company; this slice does not invent a status-filter feature. Removed-row proof is an explicitly labeled component presentation model with no vault/runtime. Normal offline SQLite journeys separately prove cross-view reopening and a delayed acknowledgement that must leave focus in search.

## Failure reproduction and focused evidence

- Before implementation, the removed-row browser case fails its named-Table focus assertion while a same-title sibling remains. Log: `test-results/status-focus-presentation-red.log`.
- Both normal stored cases then fail their exact focus assertions: cross-view cancellation leaves feedback inactive; a delayed save pulls focus away from search. Log: `test-results/status-focus-stored-red.log`.
- The initial guard exposed competing shell/Table success restorers. Three normal/native cases passed and Table success focus failed; assigning successful editor teardown to the Table fixes that coordination issue. Logs: `test-results/status-focus-stored-green.log` and `test-results/status-focus-stored-final.log`.
- The final focused normal/native run passes all four cases, preserving real Rust SQLite/no-OPFS behavior, explicit Applied/reopen review, durable undo and immutable submitted identities.
- Two presentation browser cases pass, including removed-row fallback, a visible keyboard ring, Tab continuation, unchanged read-only capabilities, zero axe violations, no external requests and no storage runtime. Log: `test-results/status-focus-presentation-green.log`.
- Initial unit run passes three files / 20 tests, including six focus-ownership cases. A seventh null-active-element case, retained Board-only cancellation assertions and expanded forced-color/narrow screenshot proof are included in final verification.

## Hosted predecessor

Exact baseline `1aa4d093c93a866b32557ed9819c706c8352049c` passes every required job in [run 39323540428](https://github.com/seabAu/Coredrill/actions/runs/39323540428), including aggregate, exact Chrome/Firefox, extension, Windows/macOS/diagnostic Linux and secret checks. That evidence verifies the status/undo integration checkpoint, not this subsequent focus refinement. The earlier local aggregate timeouts remain documented in [status actions verification](stored-status-actions-verification.md).

## Final local evidence

The full `pnpm verify` log (`test-results/status-focus-verify.log`, process-local `VITEST_MAX_WORKERS=4`) records 139 unit files / 1,126 passing tests and passing coverage, build, typecheck and lint. All browser suites pass: seven UI foundations, 76 shell, one performance, 21 resilience, seven onboarding, 13 documents and nine storage cases. Native core reports 14 passed / one intentionally ignored, and all 14 native adapter cases pass. Secure-store, checksummed archive replacement/recovery and managed backup proofs pass. Contract schemas, licenses (520 npm packages / 498 crates), secret checks and dependency audits reach the final Changesets stage. npm reports no known vulnerabilities; Cargo retains ten allowed warnings. No timeout, assertion or threshold was weakened. The process handle was no longer available on resumption, so its numeric exit code was not recovered; these claims derive from the recorded stages, not a newly observed terminal code.

The final suite includes all seven ownership unit cases, original Board-only cancellation, cross-view cancellation/confirmation and delayed successful saves preserving search focus. The 320-pixel forced-colors screenshot `table-focus-fallback-320.png` was visually inspected: the named Table retains a visible outline, controls wrap and the same-title remaining row does not receive focus. Automated overflow/axe checks and keyboard Tab continuation pass. This is not manual assistive-technology acceptance.

## Remaining proof

After the full run, only proof/ledger text and the helper's usage comment changed. Final formatting, `pnpm check:policy`, `pnpm changeset:status` and `git diff --check` pass (exit 0).

Clean-commit hosted verification remains. No fresh native package benchmark is claimed for this DOM-only refinement; prior package evidence belongs to its own checkpoint. Do not close `Q3-005`, a manual assistive-technology row or a milestone gate on this focus-only refinement.
