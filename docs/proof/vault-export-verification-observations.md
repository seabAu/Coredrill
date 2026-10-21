# Vault export verification observations — in-progress proof

Date: 2026-10-21. Scope: INT-006 persistent verified-byte observations.
Status: exact commit `b2bfeae` passes full local, separate extension, final policy
and all required hosted jobs for normal browser/native history integration.
INT-006 is unchecked; normal restore and
deletion-warning handoff remain separate unfinished requirements.

## Contract and intended boundary

See [version-1 scope](../design/coredrill-design-kit/vault-export-verification-v1.md).
The strict path-free model binds one vault, at most 20 immutable observations,
and exact archive identity/creation/schema/length/SHA-256/verification/method.
It is historical byte-match evidence, not restore, possession, freshness or
encryption evidence. Existing SQLite settings and export inventory suffice;
there is no dependency, schema, archive-version or permission change.

## Current executable evidence

- `vault-export-verification-model-before.log` first fails the mutable duplicate
  retry regression. Returning the validated frozen copy instead of caller input
  repairs that alias. A separate initial typecheck rejects a readonly array as
  mutable `JsonValue`; serialization now returns a new JSON array without a cast
  while parsed application models remain deeply frozen.
- `vault-export-verification-model.log` passes 23 application/reminder cases and
  application source/test types. Strict shape/limits/times/method, canonical
  ordering/retention/conflicts, immutable input/results, original-vault returned
  view checks, exact record acknowledgement, safe errors and disabled-reminder
  preservation are exercised.
- `vault-export-verification-storage.log` passes nine tests against actual Node
  SQLite with all current reviewed migrations. The port checks exactly one
  original current vault and reads history/preferences inside one transaction.
  Missing settings read without writes; malformed or foreign values are not
  reset. History and reminder writes commit/read back atomically. Injected
  second-write failure rolls back the first. Exact retry causes no writes and
  cannot undo a later deliberate snooze; older valid observations cannot move
  success time backward. Wrong/multiple/absent identity, conflicting archive
  tuples, evidence outside retention, and future observations reject without
  partial settings changes. These are in-memory Node adapter tests, not normal
  browser/native reload or persisted-file proof.
- `vault-export-verification-focused.log` repeats all three files / 32 cases
  after the canonical tuple/lint corrections. Application and storage package
  lint pass; source and test types pass for both packages.
- `vault-export-verification-runtime-api.log` passes 16 composition cases.
  The API exposes explicit read/record/reminder operations lazily over the
  selected runtime database, never attachment storage. Invalid inputs reject
  before opening storage, private adapter errors are redacted, original scope
  remains captured, and browser/native evidence methods cannot be interchanged.
  Preparation does not call recording. Mock composition acknowledgements do not
  prove an actual saved-file observation; SQLite semantics are tested separately.
  Web source typecheck passes.
- `vault-export-verification-types.log` passes all 35 workspace typecheck tasks
  before session recording changes. Subsequent web source types/lint also pass.
- `vault-export-verification-session.log` passes 25 existing/new controller
  cases. An optional recording port runs only after exact selected-copy hash or
  correlated native acknowledgement. Record failure retains `saved_copy_verified`
  and a distinct private record error; explicit retry reuses the immutable
  original evidence/instant without a file read, resave or new clock capture.
  Pending recording blocks save/verify/discard/deletion; a later mismatched copy
  clears old retry evidence, and disposal suppresses late UI/record initiation.
  Forged/missing returned observation does not turn file success into save
  failure. Subsequent integration connects this port in the normal React hook.

## Focused normal runtime integration

`vault-export-verification-normal-runtime.log` first passes eight of nine cases
but fails the browser history's 320-pixel page-width assertion after reload.
Unlike the export panel, history had no long-hash wrapping and inherited list/
definition indentation. Dedicated history wrapping/min-width/list/definition and
bounded button styles fix the actual overflow; no assertion is removed.

`vault-export-verification-normal-runtime-reflow.log` repeats all nine cases
successfully, terminal `VAULT_EXPORT_VERIFICATION_REFLOW_RUNTIME_EXIT=0`.
Real Rust-backed native Settings cancel without history/SQLite changes, then
save/read back the complete ZIP, record its exact archive/schema/length/hash,
preserve a disabled reminder and retain one native-readback observation through
reload. Native history and save controls pass scoped axe and 320-pixel page-width
checks. Destination selection remains simulated host IPC; this is not installed
OS-picker or manual assistive-technology proof.

The browser journey proves no history/SQLite writes from preparation, handoff or
wrong-copy rejection, records one exact selected-copy observation, retains a
disabled reminder through verification and reload, and includes that exact
history in the next normal downloaded archive. Every non-settings dataset's
rows match the preceding archive. The 320-pixel history screenshot was visually
inspected: full identity/hash/time text wraps and reminder/refresh controls stay
reachable. It is not a manual accessibility conformance claim.

`vault-export-verification-history-lifetime.log` additionally passes all five
browser cases, terminal `VAULT_EXPORT_VERIFICATION_HISTORY_LIFETIME_EXIT=0`:
real history commit followed by a deliberately lost acknowledgement keeps file
success; explicit keyboard record-only retry reuses exact original evidence,
performs no second file read/download, changes no SQLite bytes and preserves a
subsequent disabled preference. Pending recording blocks discard/deletion across
Settings navigation and reflow. Held/private read failure shows neither fake
empty history nor raw error, explicit refresh reads canonical state, seven-day
snooze survives reload, re-enable remains deliberate, and an abandoned old read
cannot replace the newer Settings view. These extra lifetime cases follow the
nine-case runtime run and must be repeated in final full verification.

## Full local checkpoint

`vault-export-verification-final-focused.log` passes all six final focused files /
74 cases, including an invalid device clock: file verification stays acknowledged
but no historical instant is invented and no invalid record-only retry is offered.

`vault-export-verification-full-verify.log` passes complete `pnpm verify`, terminal
`VAULT_EXPORT_VERIFICATION_VERIFY_EXIT=0`: 174 files / 1,849 unit tests plus
coverage, all 35 type/build tasks, lint and policy foundations, seven UI
foundations, 76 shell / 40 resilience, seven onboarding / 13 document-browser,
all 11 browser-storage / 18 native-adapter cases, 20 Rust core passes plus the
separately exercised ignored secret case, secure-store/archive/schema/license/
secret/audit/Changesets gates. This final-source run repeats every new normal
history, lifetime, reminder and record-only-retry case. npm has no known
advisories; Cargo retains ten reviewed allowed warnings. No reference-device,
installed-picker, manual assistive-technology or human usability gate is closed.

The final full-run native 320-pixel history screenshot was also visually
inspected: complete ID/hash/time content wraps and native-readback method,
disabled-reminder state and controls remain legible/reachable. Only result
documentation follows the full run. The separate extension suite is running
serially afterward. `vault-export-verification-extension.log` passes all nine
Chromium/Firefox cases, terminal `VAULT_EXPORT_VERIFICATION_EXTENSION_EXIT=0`.

`vault-export-verification-final-policy.log` passes final whole-workspace
formatting and policy, terminal `VAULT_EXPORT_VERIFICATION_FINAL_POLICY_EXIT=0`:
19 boundaries, 51 dependencies / three toolchains / 16 targets / ten accessibility
cases, 520 npm / 498 Cargo licenses and secrets. Diff whitespace is clean. Only
result documentation follows these checks; no production change follows full
verification.

## Still required

Normal restore and deletion-warning export handoff still require independent
proof before INT-006 closes. No dependency/schema/permission or Accepted decision
change occurs in this history slice.

## Pushed checkpoint

Commit `b2bfeaee0a1d5785a3376772dfd97b182e808f26` is pushed to origin/main from a
clean worktree. Exact [Foundation CI run 39578927520](https://github.com/seabAu/Coredrill/actions/runs/39578927520)
is confirmed live. One retained watch writes
`vault-export-verification-hosted-watch.log`; no hosted success is inferred.
Normal restore and deletion-warning export handoff remain unfinished INT-006
requirements and are not covered by this feature's local success.

## Exact hosted history closure

Exact `b2bfeaee0a1d5785a3376772dfd97b182e808f26` passes
[Foundation CI run 39578927520](https://github.com/seabAu/Coredrill/actions/runs/39578927520).
Every required aggregate/Chrome 151/152/Firefox 153/154/extension/Windows/macOS/
diagnostic Ubuntu/secrets job succeeds; PR-only dependency review is skipped.
The one retained watch ends `VAULT_EXPORT_VERIFICATION_HOSTED_EXIT=0`.
Aggregate job `119151381507` output is retained in
`vault-export-verification-hosted-aggregate-success.log`: 1,848 passing / one
platform-skipped unit and coverage case (1,849 total), 40 resilience, all 11
browser-storage, 17 native-adapter plus one Windows-only skip, 20 Rust core plus
the separately exercised ignored secret case, secure-store/archive/audits and
final Changesets. Local Windows covers every unit/native case. Real-native
tracking and document/history cases run in 1.0 minute / 55.2 seconds, under the
unchanged 120-second budgets. This source does not include the later handoff,
warning-metadata or strict-decoder changes, which need their own proof.
Normal restore and deletion-warning export handoff remain separate unfinished
INT-006 requirements.
