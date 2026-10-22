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
