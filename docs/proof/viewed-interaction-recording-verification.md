# Viewed interaction recording — work in progress

Date: 2026-10-22. Checklist: INT-007; not complete.

## Inspected starting state

HEAD is d3950dc. Seven existing dirty documents contain our prior read-history
closure notes; they are preserved. The generic RecordInteractionCommand validates
activity values and rejects future occurrences, but the concrete SQLite port only
appends/readbacks; it does not bind the viewed vault or job/contact versions.
Normal recording must not expose that unguarded seam. Existing local quick notes
remain distinct, bounded note-only operations.

## Bounded execution and proof plan

1. Add a version-1 viewed expectation to the existing command/port, optional only
   for trusted compatibility callers. Validate exact guarded request keys and copy
   the expectation before asynchronous effects. Explicit contact absence requires
   a null contact version; actual contact links require a positive version.
2. Guarded SQLite composition revalidates the complete immutable input, checks the
   sole vault inside the transaction, and rejects stale/archived/missing job or
   explicit contact before inserting. No company equality requirement: a contact
   may legitimately discuss another employer's job; no inferred link is added.
3. A fixed interaction identity with exact original row values can be read back
   without another insert after acknowledgement loss. A changed tuple is a
   conflict, never a replacement. Exact reconciliation can return a previously
   committed row after later job/contact edits; it cannot authorize a new write.
   The normal runtime must own one fixed identity/context/literal tuple across
   explicit retry, not generate another ID or automatically resubmit uncertainty.
4. Add executable negative application and actual SQLite tests for malformed,
   copied, foreign/ambiguous vault, stale/archived/missing owners, exact retry,
   collision and rollback. Run focused tests/types/lint while iterating. Extend
   identical browser/native contracts and run full verify/policy/serial extension
   and new exact hosted proof before claiming this prerequisite verified.
5. Follow through with strict normal-runtime composition and a root-owned
   composer covering note/call/logged email/meeting/referral/follow-up, job context
   and optional explicit contact selection. Preserve drafts, independent canonical
   readback, offline/reload/reflow/accessibility, late-owner/focus isolation and
   uncertainty semantics. Global Add/Network entry remains part of that audit,
   not silently replaced by an easier selected-contact-only form.

No dependency, schema, native IPC, extension permission, network source, sending,
enrichment or Accepted decision change. Source-backed contact field eligibility,
remaining company relationships, Home and release/manual gates remain open.

## Results

The optional guarded expectation, strict copied adapter input and mandatory-scope
SQLite port are implemented. Generic callers supplying an expectation delegate to
that guarded seam; malformed/omitted scope cannot downgrade at the interactive
port. Existing trusted generic callers without an expectation remain compatible.

- `viewed-interaction-application-before.log`: eight new regressions fail against
  the unchanged command (scope dropped and malformed scope reaches storage).
- `viewed-interaction-application-after.log`: all 64 application cases pass.
- `viewed-interaction-focused-initial.log`: 93 application/actual SQLite cases
  pass, including exact tuple, foreign/ambiguous/missing vault, stale/archive/
  missing job/contact, no-contact, retry, collision and forced wrong readback
  rollback. This was not a pre-fix storage failure run.
- `viewed-interaction-focused-hardened.log`: 94 pass after adding actual held
  transaction input-copy and omitted-scope-before-effects assertions.
- `viewed-interaction-shared-fast.log`: 100 cases/three files pass, including
  the identical new shared recording contract in actual Node SQLite and explicit
  reviewed browser/native/Firefox inventory pins. Manifest is v16/35; durable
  schema remains165. This does not substitute for concrete browser/native runs.
- Initial workspace typecheck37917 consumes exit0, all35 tasks. Later shared
  harness changes still require fresh full-source typecheck.
- `viewed-interaction-lint-initial.log` retains failure: three strict source
  optional-chain preferences and two test files outside ESLint's project-service
  scope. Source expressions are corrected without suppression; normal test
  TypeScript coverage remains. `viewed-interaction-lint-corrected.log` consumes
  exit0 for all changed production sources including the new shared harness.

Prior d3950dc CI does not prove these subsequent sources. Normal runtime/composer,
concrete browser/native, complete final-source/extension/policy and exact hosted
verification remain. No checkbox completion, commit or push claimed.

## Complete prerequisite verification start (superseded by terminal results below)

Final source/tests/shared manifest are frozen under process2826, retained log
`test-results/viewed-interaction-boundary-full-verify.log`; require terminal
`VIEWED_INTERACTION_BOUNDARY_FULL_VERIFY_EXIT`. Resume the same handle rather
than restarting on an observation timeout. Formatting, boundary/foundation
records, all35 typecheck tasks,22 lint tasks and2,609 unit cases pass so far;
coverage/build/runtime/recovery/security remainder is not yet a terminal result.
Separate extension and final policy remain after the full gate, serially for
shared browser output. Prior closure documents and stash2697 remain preserved.

Read-only follow-through inspection identifies a separate normal-runtime need:
retain one identity and copied original context/fields per explicit recording
intent, plus an uncertainty check that reads that exact identity without an
insert when acknowledgement is lost. A same-ID idempotent writer is useful
protection, not by itself a proof of read-only uncertainty recovery or owned UI.
No subsequent runtime source is implemented or attributed to this running gate.

## Complete local prerequisite gate passed

Process2826 is consumed exit0 with terminal
`VIEWED_INTERACTION_BOUNDARY_FULL_VERIFY_EXIT=0`. No source/test changes followed
the full gate; subsequent edits record results only.

- All35 workspace typecheck tasks and22 strict lint tasks plus tooling pass.
- All207 unit files /2,609 cases pass, then the same counts pass coverage.
- Build/report/extension package checks pass;7 UI,76 shell,1 diagnostic
  performance,70 resilience,7 onboarding and13 document-browser cases pass.
- All13 browser-storage cases pass, including the exact v16/35 manifest and all
  preserved158/159/160/164→165/current165 recovery cases. Local browser is Edge
  155.0.4283.62, not the exact hosted Chrome/Firefox floors.
- All21 actual Windows native-adapter cases pass, including that same v16/35
  manifest, plus24 Rust core passes and one intentionally ignored OS-secret case
  separately executed through the redacted secure-store harness. Secure-store,
  native archive and automatic-backup proofs pass. This is not installed-WebView
  or OS-picker usability/release acceptance.
- Schema drift,831 npm licenses across23 roots,498 Cargo license records,
  secrets, audits and Changesets pass. npm retries its ordinary advisory request
  once after error23, then reports no known vulnerabilities. Cargo retains the
  same10 reviewed allowed warnings (nine unmaintained and the glib unsoundness
  warning); no exclusion or dependency change is introduced.
- Current source whitespace is clean; remote fetch succeeds and HEAD/origin/main
  remain d3950dc before this new commit. Stash
  `2697ebcec53351a052d8c5c19e2b8e2a52056a70` is unchanged.

Separate extension is live as28811 in
`test-results/viewed-interaction-boundary-extension.log`; require
`VIEWED_INTERACTION_BOUNDARY_EXTENSION_EXIT`. Final result-doc format/policy,
ordinary commit/push and new exact hosted proof remain. Full INT-007/INT-008,
normal fixed-intent runtime/read-only uncertainty lookup/composer, source-backed
field qualification, remaining company relationships and independent release
gates remain open. No completion or new hosted success is inferred.

## Serial extension passed; final policy next

Process28811 is consumed exit0: all9 cases pass in36.3s, terminal
`VIEWED_INTERACTION_BOUNDARY_EXTENSION_EXIT=0`. Local Chromium149.0.7827.55 and
Firefox151.0 fallback are diagnostics, not exact supported-floor evidence. The
fallback explicitly reopens durable schema165. No production/test changes
follow full/extension success. Final formatting/policy and exact committed
hosted verification remain; no normal composer or full INT-007 closure.

## Final local checkpoint ready for exact commit

Formatting19948 and policy52988 are consumed exit0, terminal
`VIEWED_INTERACTION_BOUNDARY_FINAL_FORMAT_EXIT=0` and
`VIEWED_INTERACTION_BOUNDARY_FINAL_POLICY_EXIT=0`. Policy passes19 boundaries,
52 dependency/three toolchain/16 execution-target/ten accessibility records,
831 npm records across23 roots,498 Cargo licenses and secrets. Refreshed
HEAD/origin/main have zero ahead/behind commits. All10 preserved recovery
ZIP/JSON files match their HEAD Git objects; stash2697 remains unchanged.
No product/test changes follow full/extension verification. The reviewed
21-file change includes the seven carried read-history closure documents;
it contains no lockfile, migration, Rust, permission or Accepted ADR changes.

Normal non-force commit/push remains authorized, with new exact hosted evidence
required. Do not attribute earlier CI to these sources or close INT-007/INT-008.

## Exact pushed prerequisite — hosted verification live

The reviewed21-file change commits normally as
`00ff32aa0aa46b47421a0c0baac854e4d69e8d86` (`feat: guard viewed interaction
recording`) and pushes from d3950dc to origin/main without force or history
rewrite. Immediate post-push worktree is clean and both refs match the full SHA.

[Foundation CI39742333566](https://github.com/seabAu/Coredrill/actions/runs/39742333566)
is authoritatively in_progress for that exact SHA. Retain watch20227 in
`test-results/viewed-interaction-boundary-hosted-watch.log`; require terminal
`VIEWED_INTERACTION_BOUNDARY_HOSTED_EXIT` and inspect every required job/parent
suite before hosted closure. An observation timeout does not justify restarting
or superseding the run. Do not attribute prior d3950dc success to this commit.
Only post-push result records differ now; no successor implementation or push
is claimed. Subsequent runtime/composer work needs its own scoped activation
and proof. Full INT-007/INT-008 and the overall goal remain active/open.

## Fixed-intent runtime and read-only acknowledgement follow-through activated

This explicitly supersedes the result-documents-only freeze for independent local
follow-through. Exact00ff32a CI39742333566/watch20227 remains live and must not be
superseded or cited as proof of newer sources. Only the two inspected post-push
result documents are dirty at activation; prior governing INT-007 requirements
and Accepted decisions remain unchanged.

Add a strict version-1 read-only acknowledgement query carrying the owned original
interaction tuple. The SQLite transaction must check the sole original vault,
return absence distinctly, reject an identity collision without exposing other
content, and validate exact immutable facts before acknowledging a retained row.
It must expose no insert/update capability; later owner edits/archive do not erase
a historical acknowledgement. Extend executable shared browser/native parity.

Then compose a lazy normal-runtime capability with fixed identity and copied
first valid dispatch context/fields. Construction/invalid requests open no storage;
one operation may run at a time. A failed/uncertain write requires an explicit
read-only check before another explicit same-intent write; changed fields cannot
silently reuse that intent. A confirmed saved record is never submitted again.
Disposal prevents work that has not entered storage and cannot promise cancellation
of an already executing transaction. The UI must still own publication/focus and
the existing cross-feature vault mutation exclusion when the composer is wired.

Prove strict keys/version/tuple/absence/collision, before-await copying, no-write
checks, single flight, failed acknowledgement then check/retry, fixed identity/time,
and late disposal. Normal API/actual browser/native/reload proof and complete
final-source/extension/policy/new exact hosted verification are required. Global
Add/Network/job-context composer and all original INT-007 requirements remain
follow-through, not removed or replaced by this runtime prerequisite.

## Runtime checkpoint and retained leading-BOM failure (2026-10-24)

The new read-only query and fixed-intent runtime are composed at the normal root,
but no normal recording composer is exposed. Focused query/runtime/shared SQLite
checks pass 130 cases, workspace types pass, and corrected strict lint passes.
These are partial results, not final-source verification or INT-007 completion.

The first actual browser API journey fails at exact acknowledgement. Its retained
diagnostic isolates the leading-BOM meeting summary: saved=false, conflict,
phase=uncertain; native execution has not run. The smaller shared browser probe
also fails before repair, independently of the 200,000-character case:
`driverTextExact=false; blobExact=true`. Log
`test-results/recorded-interaction-leading-bom-browser-before.log` ends
`RECORDED_INTERACTION_LEADING_BOM_BEFORE_EXIT=1`. Thus stored UTF-8 bytes preserve
the mark while browser TEXT decoding does not. Preserve both failures and the
unchanged exact-text assertions. Repair the repository acknowledgement read using
literal BLOB decoding, then require browser/native/reload and complete verification.
No migration, dependency, permission, or Accepted decision change is needed.

## Exact prerequisite hosted closure (2026-10-24)

CI39742333566 is completed/success at exact
`00ff32aa0aa46b47421a0c0baac854e4d69e8d86`. All ten required jobs and parent
GitHub Actions check suite107705996767 are terminal success; PR-only dependency
review is intentionally skipped. The original watch log ends
`VIEWED_INTERACTION_BOUNDARY_HOSTED_EXIT=0`; its old process handle is gone and
must not be restarted. Complete logs are retained in
`test-results/viewed-interaction-boundary-hosted-complete.log` (collection exit0).

Both exact Chrome151/152 jobs pass76 shell/70 resilience cases. Both Firefox153/154
witnesses explicitly report v16/35, schema165 and58 datasets/116 files. Windows
native passes21; macOS/Linux pass20 with one platform skip. Aggregate units/coverage,
all remaining verification, nine extension cases and full-history secrets pass;
npm audit reports no known vulnerabilities. Native package diagnostics still
report targetConformant:false, not release/reference-hardware acceptance.
This closes only the pushed prerequisite; it does not cover newer local runtime
sources, full INT-007/INT-008 or the overall goal.

## Literal-summary correction and actual runtime journeys pass (2026-10-24)

The repository now reads summary BLOB bytes with fatal UTF-8 decoding and
ignoreBOM:true, checks the returned byte length, and handles the adapter's empty
BLOB null representation only for length0. No input normalization, limit increase,
schema change or exact-acknowledgement assertion is relaxed. Added Node SQLite
regressions cover leading BOM, empty text, malformed UTF-8 rollback and the
existing deliberately wrong readback. Query/runtime/SQLite focused63 pass in
`recorded-interaction-bom-focused-after.log`, terminal
`RECORDED_INTERACTION_BOM_FOCUSED_EXIT=0`.

Serial process25236 is consumed exit0, with all three unchanged actual journeys
passing and terminal markers in their respective logs:

- `recorded-interaction-leading-bom-browser-after.log`: shared v17/36,28.4s;
  `RECORDED_INTERACTION_LEADING_BOM_AFTER_EXIT=0`.
- `recorded-interaction-normal-browser-after.log`: offline selected-runtime API,
  six types, fixed identity, invalid/missing-owner rejection, read-only absence,
  duplicate prevention, reload and complete200,000-character BOM summary,17.7s;
  `RECORDED_INTERACTION_NORMAL_BROWSER_AFTER_EXIT=0`.
- `recorded-interaction-normal-native-after.log`: actual Rust SQLite root journey,
  including a targeted lost commit acknowledgement, explicit read-only recovery
  with unchanged export hash, no second insert and reload,32.8s;
  `RECORDED_INTERACTION_NORMAL_NATIVE_AFTER_EXIT=0`.

These are normal runtime API journeys, not composer UI or installed WebView proof.
The lost-ack injection exists only in the simulated native test host. No shipped
native command, permission or fallback is added. Strict production/helper lint
passes in `recorded-interaction-bom-lint-correct-scope.log`; the preceding direct
lint invocation included a TS test outside the configured project service and
fails for that invocation error, not a suppressed rule. Complete final-source
verify, serial extension, policy and new exact hosted proof remain required before
committing this follow-through. Normal composer, publication/focus/global vault
exclusion and all remaining INT-007/INT-008 requirements stay open.

## Final-source verification activated (2026-10-24)

Formatting of the reviewed source/test/change records completes before full
verification starts. Process52305 runs `pnpm verify` serially in
`test-results/recorded-interaction-runtime-full-verify.log`; require terminal
`RECORDED_INTERACTION_RUNTIME_FULL_VERIFY_EXIT`. Follow the same handle, not a
replacement run after an observation timeout. Source/tests/helpers are frozen;
only result records may change. A preceding formatter invocation failed to find
Node before formatting; the explicit reviewed runtime path succeeds. No test is
weakened, no stale success is attributed to newer code, and no commit/push or full
INT-007 completion is claimed. Serial extension and final policy follow a passing
whole gate, then reviewed ordinary commit/push and exact hosted verification.

## Whole-gate environment failure retained (2026-10-24)

Process52305 is consumed exit1, terminal
`RECORDED_INTERACTION_RUNTIME_FULL_VERIFY_EXIT=1`. Formatting, boundaries,
foundation records,35 type tasks and22 lint tasks pass. Units pass2,641 and fail
one unchanged native-packaging process-race case because `spawnSync pwsh ENOENT`:
the reconstructed explicit PATH omitted the bundled native PowerShell directory.
This is a real failed gate, not a product success. Restore the reviewed runtime
directory to PATH; do not change the test, timeout, assertions or product source.
Rerun that exact case and then a fresh complete gate with a separate retained log.

The unchanged native-packaging file passes all6 cases with the corrected PATH;
process99640 consumed exit0, `recorded-interaction-runtime-path-corrected.log`.
Fresh whole/serial-extension verification runs as process93577 with separate logs
`recorded-interaction-runtime-full-verify-path-corrected.log` and
`recorded-interaction-runtime-extension.log`; require terminal
`RECORDED_INTERACTION_RUNTIME_FULL_PATH_CORRECTED_EXIT=0` and
`RECORDED_INTERACTION_RUNTIME_EXTENSION_EXIT=0` independently. Source/test freeze
remains in force. A process handle being live or an earlier focused success is
not a substitute for either terminal result.

## Whole-gate UI failures and scoped correction plan (2026-10-24)

Process93577 is consumed exit1, terminal
`RECORDED_INTERACTION_RUNTIME_FULL_PATH_CORRECTED_EXIT=1`. All2,642 units and
coverage, builds, UI7, shell76 and performance checks pass. Resilience passes69
and fails two unchanged checks: job-details retry loses focus and narrow forced-
colors Timeline reports horizontal overflow. The new interaction runtime journey
passes. Extension does not start after whole-gate failure. Preserve original
resilience artifacts at `test-results/recorded-interaction-runtime-full-ui-failures`.

The source freeze is lifted only for diagnosing/correcting these gate failures:
capture content-free layout/focus evidence, retain the original assertions, and
bind details focus restoration to the completed React render and still-current
owner. Inspect the actual overflowing element before choosing a CSS correction.
Require focused before/after and repeated browser proof, then a fresh complete
gate. Do not classify the failures as harmless flakes or weaken timing/reflow
requirements; no commit/push or checklist closure is permitted from this result.

The isolated diagnostic9733 passes2, but repeated61467 fails the original
details-focus assertion once (9 pass). Post-render, reader/job/tab-bound focus
restoration then passes all20 repeated checks in46032 /
`recorded-interaction-ui-focus-after.log`, terminal
`RECORDED_INTERACTION_UI_FOCUS_AFTER_EXIT=0`. The unchanged full-gate failure
and repeated pre-fix failure remain failures.

For reflow, a test-only held JS breakpoint observation leaves actual viewport/CSS
at320px while the root still renders contextual mode. Process62122 deterministically
fails the same no-overflow condition, documentWidth956; the contextual640px
workspace starts at316px in the retained layout witness. No arbitrary sleep or
assertion budget change is used. CSS now independently stacks the contextual
layout below80rem, bounds workspace width and hides the desktop-only width control
while the existing JS mode transition catches up. Repeated corrected checks run
as22642 in `recorded-interaction-ui-reflow-focus-after.log`; require terminal
`RECORDED_INTERACTION_UI_REFLOW_FOCUS_AFTER_EXIT`. Complete final-source/extension/
policy/new exact hosted verification remains mandatory. Strict production/helper
lint passes after using explicit globalThis for browser globals in the touched
test; no lint suppression or config change is introduced.

Process22642 is consumed exit0: all10 corrected serial checks pass55.3s, terminal
`RECORDED_INTERACTION_UI_REFLOW_FOCUS_AFTER_EXIT=0`. The 320px forced-colors
Timeline image is inspected for bounded literal text/control wrapping. A fresh
complete gate and then serial extension run use new logs
`recorded-interaction-runtime-full-verify-ui-corrected.log` and
`recorded-interaction-runtime-extension-ui-corrected.log`; require terminal
`RECORDED_INTERACTION_RUNTIME_FULL_UI_CORRECTED_EXIT` and
`RECORDED_INTERACTION_RUNTIME_EXTENSION_UI_CORRECTED_EXIT`. Source/tests/helpers
are frozen again; only result records may change until the same process finishes.
No original failure is reclassified and no full INT-007/INT-008 completion is claimed.

## Final-source functional proof passes; advisory gate fails (2026-10-24)

Process72131 is consumed exit1, terminal
`RECORDED_INTERACTION_RUNTIME_FULL_UI_CORRECTED_EXIT=1`. All2,642 unit/coverage
cases,35 type tasks,22 lint/build tasks, UI7/shell76/resilience71/onboarding7/
documents13/browser-storage13/native21, Rust24 and separately executed secure
store/archive/backup/schema/license/secret checks pass. Shared Node/browser/native
inventory is v17/36, durable schema165 unchanged. Local browser156.0.4314.42 is
diagnostic, not exact hosted-floor proof. npm audit reports9 findings across five
existing packages; Cargo audit/Changesets and serial extension do not execute.
This is not a complete passing gate or permission to commit/push.

The [reviewed bounded security maintenance plan](dependency-security-maintenance-2026-10-24.md)
now supersedes the source freeze for compatible security updates only, preserving
all interaction/UI fixes and retained failures. It changes no Accepted technology
decision, native/extension permission, schema or source policy. A fresh complete
gate/serial extension/final policy/new exact hosted run remains mandatory before
closing this runtime prerequisite. Normal composer and full INT-007/INT-008 remain open.

## Complete patched local checkpoint (2026-10-24)

[Exact patched graph, failure lineage and remaining risk](dependency-security-maintenance-2026-10-24.md#complete-final-source-gate-and-serial-extension-pass):32515 consumes exit0
for complete final-source verification and all9 serial extension cases.211 unit
files/2,657 cases plus coverage,35 types/22 lint/build,76 shell/71 resilience,
all browser/native/recovery/schema/license/secrets/audit/Changesets checks pass.
npm is clean; Cargo retains11 informational warnings, including the newly recorded
Tokio Unix AsyncFd review requirement, without any exclusion or pin change.
All10 recovery files match HEAD; source/tests/lock remain unchanged after success.

This proves the runtime API/read-only acknowledgement prerequisite, literal BLOB
readback, render-owned details focus and breakpoint-independent reflow, including
the accepted compatible security fixes and explicit JSON ownership. It does not
prove the normal interaction composer, global mutation exclusion/publication/focus
composition, installed WebView or release acceptance. Final result-doc format/
policy, ordinary commit/push and new exact hosted proof remain. Full INT-007/
INT-008 and the overall goal stay open; every older failed run remains a failure.

## Exact runtime/security checkpoint pushed; hosted proof live

Reviewed41-file source commits/pushes normally as
`6e167f121f6355528f46c5d492b516e963cede0f`, clean immediately afterward and matching
origin/main. [Exact CI40082538495](https://github.com/seabAu/Coredrill/actions/runs/40082538495)
is in_progress; original watch50074 requires
`INTERACTION_RUNTIME_SECURITY_HOSTED_EXIT` in `interaction-runtime-security-hosted-watch.log`.
[Dispatch/source/failure scope](dependency-security-maintenance-2026-10-24.md#exact-pushed-source-and-hosted-verification-live)
keeps earlier failures and Tokio Unix follow-up explicit. Do not infer hosted
closure from local passes or restart/supersede the live run. Only result records
follow this push; normal composer and full INT-007/INT-008/goal remain open.

## Exact runtime prerequisite hosted closure (2026-10-24)

[Exact hosted witnesses and remaining scope](dependency-security-maintenance-2026-10-24.md#exact-hosted-checkpoint-closed-2026-10-24):
CI40082538495/all10 required jobs and parent108644371177 succeed for6e167f1.
Original watch50074 consumes exit0, terminal
`INTERACTION_RUNTIME_SECURITY_HOSTED_EXIT=0`; complete logs are retained.
Aggregate27m03s stays within unchanged30m budget. Hosted unit/coverage each
report2,656 pass/one Windows-only skip; local Windows executes all2,657.
Both exact Chrome lanes pass71 resilience/76 shell cases; prepared dedicated
native lanes prove actual OS-secret lifecycles rather than counting aggregate
Linux's explicit unprepared-session skip as execution.

The runtime prerequisite is engineering-verified, not normal interaction-entry
UI completion. Shared vault mutation exclusion, publication/focus and normal
recording controls remain next; full INT-007/INT-008/goal and release/manual gates
stay open. Cargo's11 informational warnings and required Tokio Unix review are
unchanged. Product/test/lock/inventory source remains the exact pushed checkpoint;
only three local result records follow it. No Accepted decision changes.
