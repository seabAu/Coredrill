# Deletion warning to portable export — verification

Date: 2026-10-21. Scope: INT-006 non-destructive warning handoff and associated
strict native request validation. Status: full local, separate extension and
focused desktop feature-matrix and final policy proof pass; commit and exact hosted
proof remain. INT-006 stays open for normal restore.

## Required behavior

Selecting Export in the destructive warning closes it and retires its UI preview.
It never submits deletion, grants consent, prepares an archive or invokes a
save boundary. Existing prepared bytes/identity remain root-owned. Focus goes
after rendering to consent or snapshot review only while the same owner still
owns the interaction; navigation, disposal or a new deliberate focus wins.
Later deletion requires fresh review and an exact phrase. Another pending
vault/export operation disables the trigger and destructive/export controls.

Both browser/native warning metadata read the canonical recorded export instant
through the strict vault-bound application query, rather than presenting native
preview's legacy unknown value as absence of known history. Missing time is
explicitly unavailable. Historical/imported times never prove current file
possession, freshness or restore. There is no requirement to export before a
user may deliberately delete their private data.

## Findings and repairs

- `deletion-export-handoff-before.log` fails because the old callback only writes
  a message behind the still-open modal. The new callback unmounts the preview
  and asks the existing ownership-aware focus restorer to resolve the current
  export control lazily. It does not introduce a new export controller.
- `deletion-export-handoff-browser.log` first catches contrast analysis during
  the dialog fade. Awaiting actual settled opacity before running unchanged axe
  rules resolves the transient measurement; no color token or axe rule changes.
- `deletion-export-handoff-runtime.log` exposes unsupported native-vault preview
  routing in the diagnostic host. The probe now composes the real existing Rust
  vault service over the same storage service and routes only preview requests.
  Normal inventory and identity are not simulated. This binary remains excluded
  from packages, and no shipped permission or vault-delete command is added.
- `deletion-export-handoff-focused-runtime.log` catches a genuine mixed-request
  defect: a full vault-delete shape is accepted as the legacy database-delete
  operation because nested operation fields were not denied. The new Rust
  regression first fails in `native-storage-strict-fields-before.log`.
  Strict operation/value enum decoding fixes the mixed operation. The remaining
  null-unit-variant exception is identified as case 3 in
  `native-storage-strict-null-before.log`; a strict empty-struct variant fixes
  it without changing `{ "type": "null" }`. The exact valid wire round trip
  and rejected extra operation/scalar/null fields pass in
  `native-storage-strict-fields-fixed.log`.
- The deliberate-focus race is modeled after modal unmount, not by trying to
  focus an aria-hidden trapped shell. The regression retains the real lifecycle
  ordering and confirms a new user focus is not overwritten by the later frame.

## Focused executable proof

`deletion-export-handoff-strict-runtime.log` passes 11 normal browser/native,
history and deletion cases. The following final warning-metadata source repeats
all 11 in `deletion-export-handoff-recorded-warning-runtime.log`, terminal
`DELETION_EXPORT_HANDOFF_RECORDED_WARNING_RUNTIME_EXIT=0`: cold keyboard handoff
focuses unchecked consent, warm handoff retains exact prepared identity, later
warning starts with empty confirmation, deliberate new focus is not stolen,
SQLite bytes do not change, and no implicit prepare/save/delete/download occurs.
Held preparation disables an already rendered deletion trigger; after navigation
and failure a fresh review is required. Existing actual deletion and cleanup
warning cases remain passing.

Real native SQLite additionally previews actual stored inventory, hands off
without a selected output file or DB changes, rejects a complete vault-delete
payload through the diagnostic dispatcher, then retains the existing complete
archive cancellation/save/history/reload proof. Both runtime previews return the
exact canonical verification instant and native warning displays the historical
time and limitations. OS-picker selection remains simulated host selection;
installed WebView/picker and manual assistive-technology proof are not inferred.

Web source types/lint and nine UI/focus unit cases pass.
`deletion-export-handoff-desktop-matrix.log` passes
`DELETION_EXPORT_HANDOFF_DESKTOP_MATRIX_EXIT=0` for the exact no-feature/all-targets
and all-feature desktop lib/bin Clippy legs. Valid legacy storage operations are
retained; this slice does not claim a complete native capability audit or close
SEC-003. No dependency, schema, wire version or Accepted decision changes.

## Still required

Commit/push and exact hosted proof. Normal restore preview/confirmation/commit,
stale/replay/failure and clean-content recovery still prevent INT-006 closure.

## Full local and extension checkpoint

`deletion-export-handoff-full-verify.log` passes complete `pnpm verify`, terminal
`DELETION_EXPORT_HANDOFF_VERIFY_EXIT=0`: 174 files / 1,850 unit and coverage cases,
all 35 type/build tasks, lint/policy foundations, seven UI foundations,
76 shell / 41 resilience, seven onboarding / 13 document-browser, all 11
browser-storage / 18 native-adapter, 21 Rust core passes plus one separately
exercised ignored secret case, secure-store/archive/schema/license/secret/
audit/Changesets. Final-source normal cold/warm/native handoff, focus ownership,
pending trigger, canonical historical warning time and mixed-request denial are
all included. npm has no known advisories; Cargo retains ten reviewed allowed
warnings. No source changes follow this run; only result documentation.

`deletion-export-handoff-extension.log` separately passes all nine extension
cases serially after the full gate, terminal `DELETION_EXPORT_HANDOFF_EXTENSION_EXIT=0`.
No reference-device, manual assistive-technology or public-release gate is closed.

`deletion-export-handoff-final-policy.log` passes whole-workspace formatting and
policy, terminal `DELETION_EXPORT_HANDOFF_FINAL_POLICY_EXIT=0`: 19 boundaries,
51 dependencies / three toolchains / 16 execution targets / ten accessibility
cases, 520 npm / 498 Cargo licenses and secrets. Diff whitespace is clean. Only
result documentation follows; no production change follows the passing full gate.
