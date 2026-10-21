# Native complete portable archive save verification

Date: 2026-10-21. Scope: INT-006 native save prerequisite and normal Settings
composition under ADR-0004. Status: original full local, extension and final policy
verification passed, but exact commit `6baab05` hosted verification failed. The
isolated repair is in progress; its full and hosted proof remain. INT-006 is not complete.

## Required behavior

The native save boundary must publish the exact complete ZIP prepared by shared
TypeScript, not the older database-only recovery format. Rust owns destination
selection; no caller path or browser fallback is allowed. Bound and correlate
vault/archive/length/hash, chunks, stage lifetime and acknowledgements. Preserve
existing targets before atomic replacement; after a possible publication report
uncertainty rather than “no file saved.” Never update reminder/history timestamps
from preparation, staging, cancellation or an unconfirmed save.

See the [version-4 contract](../design/coredrill-design-kit/native-portable-save-v4.md).
Shared runtime save preflight independently validates the complete version-1 ZIP,
all manifest entry checksums and vault/archive/schema identity. The application
command owns consent/byte snapshots and validates the correlated save result.
Rust independently owns session/vault checks, staged bytes, length/hash and
confined atomic file I/O. Native staging is one bounded memory buffer, not a new
canonical database or a plaintext temporary copy inside the managed vault.

## Iteration and focused proof

- `native-portable-save-before.log` first exposes a fixture serialization error
  for a long fixed-size byte array. The corrected slice fixture and one-statement
  SQL calls in `native-portable-save-before-corrected.log` fail at the actual
  missing `portable_save_begin` operation.
- `native-portable-save-first.log` exposes a missing initializer in the existing
  deletion-recovery session reconstruction; it now starts with no staged export,
  as do ordinary open and archive restore/recovery sessions.
- `native-portable-save-rust.log` passes 19 Rust core cases and one deliberately
  ignored platform-secret case, which the separate redacted secret harness owns.
  The five new save tests prove cancellation/replay rejection, strict bounded
  chunk decoding, offsets/identity/length and current-vault drift, exact external
  target replacement, global staging exclusion, expiry/close/retirement release,
  transaction rejection and pre-/post-publication faults. Fault tests use opaque
  synthetic ZIP-like bytes; they are not complete archive-content proof.
- `native-portable-save-types-corrected.log` passes all 35 types after a genuine
  `ArrayBufferLike`/`BufferSource` mismatch was fixed with a locally owned buffer,
  not a cast. Its following test run fails only on the old preparation-only API
  inventory, which now explicitly includes `save`.
- `native-portable-save-focused-corrected.log` passes all five focused files / 62
  cases after that inventory update: immutable byte/identity capture, chunking,
  foreign/progress/finish acknowledgements, old-version/path rejection, command
  consent and redacted uncertain results, strict full-ZIP preflight before the
  native port and absence of browser fallback. These mock acknowledgements do
  not independently prove Rust file publication.
- `native-portable-save-desktop-clippy.log` compiles/lints the actual desktop-shell
  OS-picker routing with warnings denied. The picker derives a ZIP filename from
  the validated archive UUID. This is compilation/code-boundary evidence, not an
  installed picker usability test.

## Native runtime proof boundary

The diagnostic storage probe is excluded from distributed packages. Its optional
host-selected save destination comes from process argv; a probe-only host control
can cancel the next selection. Neither control is part of the production
WebView/native protocol. The browser test still sends only the shipped path-free
operations, while real Rust code validates, publishes and rereads the selected
file. The ordinary Settings journey must prove cancellation then saving, exact
complete ZIP inspection including retained DOCX, unchanged SQLite/reminder state,
zero full-archive browser downloads and no OPFS fallback. That runtime run and
complete final-source regression remain pending at this checkpoint.

`native-portable-save-normal-runtime.log` subsequently passes all six focused
normal browser/native/deletion cases. The final-source full regression repeats
the native Settings save at 320 CSS pixels with zero scoped axe violations and
zero page overflow. Its retained `resilience.json` attachment records normal
preparation/save, cancellation, no browser full-archive download, exact saved ZIP
SHA-256 `5457ce58f24f0a539b326aad3c822772c1f0d98efe84df76d731d752749bb2f1`,
all 114 data files, at least one retained DOCX attachment and unchanged SQLite.
The destination is selected by the test host, while publication/readback run in
real Rust. The 320-pixel native screenshot was visually inspected for wrapped
identity metadata and reachable save/discard controls. Installed OS-picker and
assistive-technology usability are not inferred from it.

## Hosted baseline finding

The preceding Settings session commit `f3af852` is not fully hosted-green:
Chrome 152 reached onboarding after all resilience cases passed but exceeded its
15-minute job execution budget. GitHub's annotation confirms the cutoff, and
every other required job passed. The Chrome budget is now 25 minutes; no suite,
assertion or individual test timeout is removed or weakened. The next exact-source
run must verify this native-save implementation and the retained session behavior.

## Full local and extension checkpoint

`native-portable-save-full-verify.log` passes terminal
`NATIVE_PORTABLE_SAVE_VERIFY_EXIT=0`: all 171 files / 1,805 unit tests plus
coverage, 35 typecheck/build tasks, lint, boundaries/records, UI foundations,
76 shell / 36 resilience, onboarding/documents, all 11 browser-storage / 18
native-adapter cases, Rust core, secure-store/archive/schema/license/secret/audit
and Changesets. The final native 320-pixel Settings cancellation/save journey is
part of that full run. npm reports no known vulnerabilities; Cargo retains ten
reviewed allowed warnings. Reference-device/manual gates are not closed.

`native-portable-save-extension.log` separately passes all nine Chromium/Firefox
extension cases, terminal `NATIVE_PORTABLE_SAVE_EXTENSION_EXIT=0`.

Only additional `cfg(test)` negative assertions and result documents follow the
full run; production behavior does not change. `native-portable-save-final-negative-rust.log`
repeats all Rust core tests: 20 pass / one secret lifecycle deliberately ignored
and exercised separately by the passing secure-store harness. It directly adds
corrupt staged-byte rejection, managed-root/directory/relative target rejection,
and foreign-session abort isolation rather than relying only on the older
database-export helper tests. Unix CI additionally exercises symlink rejection
and private output permissions; that Unix-only execution is not claimed locally.
`native-portable-save-final-policy.log` passes terminal
`NATIVE_PORTABLE_SAVE_FINAL_POLICY_EXIT=0` after the final negative test rerun:
whole-workspace formatting, 19 boundaries, 51 dependencies / three toolchains /
16 execution targets / ten accessibility cases, 520 npm / 498 Cargo licenses and
secrets. Diff whitespace checks are clean. Only result documentation follows;
exact committed hosted proof remains.

## Still required

Exact hosted proof; persistent correlated verified-export
evidence; export handoff from the deletion warning; normal restore inspection,
conflict preview, confirmation, stale/replay rejection and atomic clean recovery.
No Accepted decision, dependency, SQLite schema or Tauri permission changes.

The 544 MiB ceiling is an enforced upper bound, not a demonstrated reference-device
peak-memory/performance guarantee. Shared ZIP inspection and owned-byte snapshots
can retain multiple bounded buffers; representative large-vault memory/latency
and interrupted-process drills remain part of the release reliability gates.

## Exact hosted regressions and repair

Run [`39567252550`](https://github.com/seabAu/Coredrill/actions/runs/39567252550)
for exact `6baab05c85fc0a479db087f29f4326a91ab68f0e` is terminal-failed,
not live or green. Both Firefox lanes, extension transfer and full-history secret
scan pass; native package, aggregate and both exact Chrome jobs fail.

- All native jobs reach a genuine no-feature `E0433` compile failure in
  `lint:desktop`: the session field names an archive type whose module is gated.
  The staging field and ordinary/deletion-recovery initializers now use the
  module's existing desktop-shell/native-storage-probe/test condition. Archive
  builds retain the staging field; no-feature library builds do not reference
  an absent module. Regular lint now also exercises no-feature/all-targets,
  rather than relying only on the probe and desktop-shell configurations.
  `native-save-feature-gate-before.log` reproduces the original error;
  `native-save-feature-gate-matrix.log` passes the exact two-leg desktop CI
  feature matrix, and `native-save-feature-gate-regular-lint.log` passes the
  strengthened ordinary lint gate.
- Aggregate unit verification times out the full-size transport snapshot test
  at five seconds. Replace the million-element deep comparison and complete
  request JSON rendering with an independent streaming Node SHA-256 over every
  transmitted chunk and per-request operation-key checks. Preserve the original
  greater-than-one-MiB input, caller mutation, exact chunk sizes/offsets/count,
  acknowledgement assertions and five-second test budget.
  `native-save-feature-gate-transport.log` passes both focused files / 24 tests.
- Both Chrome jobs reach the native runtime test's 120-second timeout after
  35 other resilience cases pass. The previously growing single case now becomes
  two isolated fresh-process cases: tracking/tasks/status/source/notes, and
  documents/complete archive cancellation/save. Both still begin with actual
  normal capture/review, create their own vault, and exercise abandoned-BEGIN
  session retirement. Every original workflow/assertion is retained; the document
  case retains real DOCX bytes, independent ZIP inspection, cancellation, exact
  file readback, unchanged SQLite, 320-pixel/axe and no browser fallback. No shared
  seeded vault, larger test timeout, removed assertion or retry substitutes for
  the normal workflow. Scoped proof attachments identify which journey ran.
  Chrome CI also retains failure-only resilience/onboarding diagnostics with the
  existing pinned artifact action instead of skipping all uploads after failure.

The in-progress persistent verification model is separately preserved in a
recoverable scoped Git stash while the repair is validated. Neither that work nor
the split-test intent constitutes final regression or hosted success evidence.

`native-save-repair-runtime.log` passes all seven focused normal native,
browser-export and deletion cases, terminal `NATIVE_SAVE_REPAIR_RUNTIME_EXIT=0`.
The tracking case runs in 34.8 seconds and documents/archive in 28.9 seconds on
the local Windows browser, each under its unchanged 120-second limit. Both own
independent real Rust processes and UI-created vaults. These local timings are
not exact Chrome CI or reference-hardware performance claims.

`native-save-repair-full-verify.log` subsequently passes complete `pnpm verify`,
terminal `NATIVE_SAVE_REPAIR_VERIFY_EXIT=0`: 171 files / 1,805 units and coverage,
35 type/build tasks, strengthened lint, 76 shell / 37 resilience, onboarding,
documents, all 11 browser-storage / 18 native-adapter cases, Rust core (20 pass /
one separately exercised secret case ignored), secure-store/archive/schema,
520 npm / 498 Cargo licenses, secrets, audits and Changesets. Native tracking and
document/archive cases repeat in 35.1 / 28.5 seconds. npm has no known advisories;
Cargo retains ten reviewed allowed warnings. No production changes follow this
full run. Exact repaired-commit hosted verification still remains.

The separately launched concurrent extension run
`native-save-repair-extension.log` is terminal-failed: seven cases pass, the
Chromium durable-transfer case reports local `route.fetch` ECONNRESET, and Firefox
reports unavailable WebAssembly compilation during initialization. The failure
is retained, not counted as success. The isolated repeat after the full gate
stops passes all nine cases, terminal
`NATIVE_SAVE_REPAIR_EXTENSION_ISOLATED_EXIT=0`, in
`native-save-repair-extension-isolated.log`, without a source change. The two
failures do not reproduce in isolation; concurrency as the specific cause is an
inference, not independently proven. Preserve both outcomes and run these local
suites serially in the shared checkout/build output.

`native-save-repair-final-policy.log` passes final whole-workspace formatting
and policy, terminal `NATIVE_SAVE_REPAIR_FINAL_POLICY_EXIT=0`: 19 boundaries,
51 dependencies / three toolchains / 16 targets / ten accessibility cases,
520 npm / 498 Cargo licenses and secrets. Diff whitespace is clean. Only result
documentation follows these checks; commit and exact hosted proof remain.
