# Normal requirement-review ordering — verification in progress

Date: 2026-10-19. Checklist `Q3-005` and all milestone gates remain open.

## Observed failure and regression

Hosted canonical run [39344803133](https://github.com/seabAu/Coredrill/actions/runs/39344803133) fails at the explicit manual Partial assertion in both exact Chrome lanes and aggregate. Evidence selection is followed immediately by coverage selection. Normal review previously issued independent asynchronous commands/readbacks while leaving dependent controls enabled; each readback could replace the displayed same-job review. The canonical assertion is retained, not replaced with automatic Partial.

A deterministic local regression holds the actual evidence-selection command before it writes. The unchanged production UI fails `toBeDisabled` for the dependent coverage selector (`test-results/evidence-pending-red.log`, terminal 1). This proves missing pending protection; it does not reconstruct the exact ordering of every hosted transaction.

## Repair and trust boundary

A root-owned per-job gate holds requirement actions through the command **and** acknowledged SQLite readback. A named fieldset disables requirement controls and narrates pending work. Duplicate same-job programmatic actions are rejected before execution; another job may progress independently. Completion/failure releases only that job. The refreshed result still uses the existing same-job state guard, and focus restoration uses the shared ownership-aware helper with a job-scoped named fallback.

The strengthened normal-root journey separately holds write and readback, asserts dependent controls stay disabled in both windows, verifies one selection call, injects a failed coverage command, retries explicitly, and retains the original manual Partial assertion. It additionally checks the actual durable `user-confirmed` decision identity/state and equality after application preparation, immutable submission and reload. No positive write API shortcut creates journey data; wrappers delay real operations or inject a negative result only. Unit tests cover single flight across both awaits, independent jobs and failure/retry. The two-case focused canonical/source suite passes at `test-results/evidence-pending-focused.log` (terminal 0) before the final durable-decision witnesses are added; final-source verification remains.

No dependency, schema, permission or Accepted decision changes. A web patch Changeset records the user-visible ordering/focus repair. Existing optimistic concurrency and application validation remain unchanged. No timeout, assertion, coverage or policy gate is relaxed.

## Independent extension transport investigation

The same old CI run independently fails `route.fetch: socket hang up` for a development-server SQL-module request, followed by disposal errors during cleanup. Root cause is not established. Extension E2E now builds and serves the production bundle through the existing exact-origin forwarding harness. All nine existing Chromium/Firefox cases pass (`test-results/extension-production-transfer.log`, terminal 0), including unchanged held-response teardown proofs which explicitly do not ignore real fetch errors. Source/header/auth/permission/handshake, malicious-page, restart/outbox and idempotent fallback assertions remain intact. No retry or error-swallowing logic is added. This strengthens the tested production asset boundary; a successful run is not causal proof about the old socket failure.

## Final local proof and remaining hosted verification

The durable-decision focused suite passes (`test-results/evidence-pending-durable-focused.log`, two cases, terminal 0), including exact equality of the confirmed coverage DTO after reload. Final `pnpm verify` then exits 0 with marker `EVIDENCE_REVIEW_VERIFY_EXIT=0` in `test-results/evidence-review-full-verify.log`: 145 files / 1,168 unit tests plus coverage; seven UI foundations, 76 shell, one diagnostic performance, 24 resilience, seven onboarding, 13 documents and nine storage cases; native core 14 passed / one intentionally ignored, 14 native adapter cases, secure storage/archive/backup checks; formatting, typecheck, lint, build, generated/architecture/foundation records, license/secret/audit checks and Changesets. npm reports no known vulnerabilities; ten previously allowed Cargo warnings remain. Process-local `VITEST_MAX_WORKERS=4` affects scheduling only. Source/fixtures remained frozen throughout the final run.

The final run covers the held-readback 320-pixel frame replacement and return to wide layout without a duplicate selection call; dependent controls remain disabled and the document has no horizontal overflow. The original-size `requirement-review-pending-320.png` is inspected: visible local pending feedback, neutral disabled controls, source excerpts and long labels wrap. Automated final axe assertions pass. This is not manual assistive-technology acceptance. `phase-3-unseeded-canonical.json` retains the exact user-confirmed decision and the fault-window witnesses.

Commit/push alongside the locally verified Overview/Company checkpoint `a11dd0f` and observe clean-commit hosted verification before closing `Q3-005`. Do not retry or relabel the old failed run as green. Keep representative-user/manual-assistive-technology/reference-device and public-distribution gates independent. Unexpected write/readback failures retain the existing reload guidance; this slice does not claim exhaustive normal-workspace recovery composition.
