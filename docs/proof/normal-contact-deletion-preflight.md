# Normal selected-contact deletion preflight

Status: normal deletion UI implemented; full local verification, serial
extension transfer and final formatting/policy pass. Authorized checkpoint and
exact hosted closure pending. INT-007 remains unchecked.

## Authority and bounded scope

Continue from exact hosted-green2a438d9 and preserve the two fresh guard/recovery
closure receipts. The complete governing reads retained in the lifecycle proof
remain applicable: accountless/local-first/offline/AI-disabled operation, typed
application/UI boundaries, SQLite truth, explicit viewed-owner commands, no
unapproved contact acquisition and no automatic expiry deletion. Current AGENTS,
SECURITY, Git and relevant code/schema are inspected again. No Accepted decision,
dependency, permission, source, historical migration or archive change is proposed.

The target is an actual selected-contact deletion command and confirmation UI,
not another low-level deletion-only proof. It must bind original vault/contact/
version, retain ownership through navigation/reflow, fail atomically on stale or
foreign state, handle uncertain acknowledgement through read-only reconciliation
without automatic repeat deletion, and retire all removed-owner private views.
Browser/native offline, reload, navigation, keyboard/reflow/accessibility and
failure/lifetime proof are required before an implementation checkpoint. Full
field-use qualification/review and company relationships remain separate work.

## Current relationship findings before execution

The normal contact API has read/create/updateNotes, but no deletion operation.
Schema167 now permits only deleted-parent interaction detachment. Contact-owned
manual creation receipts and contact-point provenance links cascade. Shared job
sources, snapshots, provenance and interaction text remain.

Additional logical relationships need executed audit before implementation:

- `field_value` permits entity_type/contact and entity_id without a parent FK.
  Bare contact deletion cannot remove these candidate/value-history rows.
  Its self-reference uses ON DELETE RESTRICT, so clearing a whole contact-owned
  history may need an explicitly transactional strategy rather than assuming
  an arbitrary bulk-delete order is safe. Other entity kinds and shared source
  provenance must remain exact; an incoming external history reference must
  fail closed, not broaden deletion scope.
- Interview `contact_ids_json` is historical JSON, not a contact FK. The ordinary
  interview reader validates UUIDs without joining current contact existence.
  Deletion must not claim it removes these historical IDs, free-text mentions,
  shared source evidence or external archives, or silently rewrite interviews.

Next execute an isolated in-memory synthetic current167 graph audit under both
recursive-trigger modes: bare-delete residuals, value-history cleanup constraints,
scoped transactional candidate, unrelated/shared preservation and late failure
rollback. This authorizes no production deletion, UI, migration or real-vault
mutation. Only after actual results should the typed application/UI design be
finalized. Existing schema/guard remains unchanged during this preflight.

## Executed graph audit

`tooling/scripts/audit-normal-contact-deletion.mjs` applies the reviewed1–167 SQL
to fresh in-memory synthetic databases; it is explicitly not the migration
runner, a production command or a real-vault operation. The initial ten-scenario
run exits0 (`normal-contact-deletion-graph-audit.log`). The expanded run includes
confirmed history and cyclic replacement links, passes strict tooling lint and
12 scenarios across both recursive-trigger modes, exit0 with
`NORMAL_CONTACT_DELETION_GRAPH_AUDIT_EXPANDED_EXIT=0` in
`test-results/normal-contact-deletion-graph-audit-expanded.log`.

Actual assertions establish:

- Bare parent deletion succeeds at167 but retains contact-owned field-value
  history and historical interview JSON. A valid FK check alone therefore does
  not prove complete contact-owned cleanup.
- A plain bulk deletion of the replacement/history chain rejects with a foreign
  key error; no partial row changes remain. Do not rely on favorable row order.
- Inside one transaction, clearing only the target contact's internal replacement
  links, removing only its typed field-value history, then deleting its original
  parent removes confirmed/unconfirmed/cyclic target history, receipt and field
  links. Only interaction contact_id detaches. All other interaction columns,
  interview rows, another contact, the same-UUID company and its candidate rows,
  jobs, shared source/snapshot/provenance and audit fields stay exactly equal.
- An incoming reference from another entity kind causes the candidate to fail
  and roll back everything. A synthetic late parent-delete failure also restores
  the complete prior state, including replacement links. No broad cleanup or
  silent unrelated mutation is used to force success.

Seven existing focused application/storage/runtime/editor regression files pass
248 tests, exit0/`NORMAL_CONTACT_DELETION_PREFLIGHT_REGRESSION_EXIT=0`, retained as
`test-results/normal-contact-deletion-preflight-regression.log`. These tests and
the audit do not prove a new application or UI operation. Product source, schema,
archives, lockfiles, permissions and Accepted decisions remain unchanged.

## Next coherent implementation and proof

1. Add a strict viewed-vault/contact/version-bound application operation and
   transactional repository method. Validate original scope inside the write
   transaction and verify the whole acknowledged deletion postcondition. Never
   replace original-owner checks with the audit's synthetic hardcoded IDs.
2. Provide a read-only reconciliation result for uncertain acknowledgement.
   Missing contact alone cannot imply complete deletion because the audit proves
   owned candidate values can remain. Present original/changed/absent-complete/
   unresolved state honestly; never automatically repeat a write or purge orphans
   after a missing-parent lookup. An observed absence is not proof this attempt
   caused it, so do not invent an operation receipt or deletion timestamp.
3. Compose explicit selected-contact confirmation with accurate removal/retention
   scope and original owner. Prevent pending repeat effects, keep failures private,
   suppress stale/cross-vault publication, and retire selected detail/history/
   evidence/editor state only from actual canonical outcomes. Do not silently
   rewrite interviews, free text, shared sources or external archives.
4. Add malformed/stale/foreign/concurrent, rollback, uncertain-acknowledgement,
   ownership/focus and actual normal offline browser/native/reload/reflow/keyboard/
   accessibility proof. Preserve all existing assertions and test/time budgets;
   assess narrow aggregate headroom as execution evidence, not permission to skip
   tests. Full local/serial extension/policy/exact hosted verification precedes
   the next ordinary implementation checkpoint with both pending closure receipts.

No new owner decision is identified by this audit. The next work is implementation,
not another baseline experiment or full INT-007/INT-008/goal completion claim.

## Preflight checks and handoff boundary

Policy22756 consumes exit0/`NORMAL_CONTACT_DELETION_PREFLIGHT_POLICY_EXIT=0`:
19 boundaries,52 direct dependencies/three toolchains/16 targets/ten accessibility
records,831 npm/23 manifest roots/498 Cargo licenses and workspace secrets pass.
Formatting/whitespace pass; all audit/regression/policy handles are terminal.
Only the two guard closure receipts plus this new preflight/script differ from
exact2a438d9; stash2697 and product/schema/fixtures/locks remain intact. No full
new-source pnpm verify, new hosted run, commit-ready implementation or normal
deletion feature is claimed. Next is the typed application/UI implementation
with the exact obligations above, preserving these results and both receipts.

## Application and repository implementation in progress

The next continuation activates the documented typed implementation, superseding
only the audit's scratch-only restriction. The application target is a strict
version1 copy of original vault/contact/version, creation/update/archive times,
company and manual-creation operation identity, with no retained private fields.
Only exact `DELETE CONTACT` confirmation dispatches a remove. Read observations
are original_present/changed/absent_complete/unresolved, never attributed write
receipts; only a validated write acknowledgement may say deleted. Malformed,
foreign or expanded acknowledgements and private exceptions fail safely.

New application tests first stop at missing-module collection (zero executed
tests), exit1 in `normal-contact-deletion-application-before.log`; this is not28
executed behavioral failures. The first implementation runs28 cases with27 pass/
one failure: the general domain ID parser normalizes uppercase, allowing a
noncanonical target to reach the port. The destructive target now rejects
noncanonical serialized IDs/times explicitly without changing global ID rules.
That28-case rerun passes (`normal-contact-deletion-application-canonical.log`,
`NORMAL_CONTACT_DELETION_APPLICATION_CANONICAL_EXIT=0`). An additional original
workspace-copy/private-field exclusion test brings the application suite to29.

The repository tests likewise initially fail missing-module collection with zero
executed cases (`normal-contact-deletion-repository-before.log`, exit1). The new
repository validates original context inside its transaction, performs only
typed contact-owned field-history cleanup and parent deletion, then verifies
contact/receipt/field-links/candidates/interaction-link absence before commit.
Any failed postcondition, stale original, external history reference or injected
late failure rolls back the whole operation. Inspection uses the read-snapshot
capability when available, or a query-only transaction fallback; it never purges
orphans or treats missing parent alone as complete cleanup.

The first combined run passes42 tests (28 application/14 real-Node SQLite), then
read-snapshot dispatch and legacy-contact cases bring the repository suite to16.
Expanded focused execution passes293 tests/nine files:45 new cases plus248 existing
contact application/migration/runtime/editor regressions, exit0 with
`NORMAL_CONTACT_DELETION_FOCUSED_EXIT=0`, retained as
`test-results/normal-contact-deletion-focused.log`. Literal history, interview
JSON, same-UUID company candidates, other contacts and shared source rows remain
exact in repository snapshots; confirmed/cyclic history cleanup and full rollback
are actual SQL execution. This does not substitute for real browser/native proof.

Application build, two-package typechecks and strict implementation lint pass.
The full workspace types/lint/unit sequence19763 consumes terminal exit0, logs
`test-results/normal-contact-deletion-checkpoint-{types,lint,unit}.log`:35 typecheck
tasks,22 lint tasks plus tooling and218 unit files/2,843 cases pass. All three
`NORMAL_CONTACT_DELETION_CHECKPOINT_*_EXIT=0` markers are observed. No new schema, dependency, privilege,
source or Accepted change. A scoped application/storage Changeset is added.

Still required: add the new repository behavior to identical real-adapter/shared
manifest proof, selected normal runtime API, owned confirmation/reconciliation
controller and UI, actual offline browser/native/lifetime/reload/reflow/keyboard/
accessibility proof and complete final-source/serial extension/policy/exact hosted
checkpoint. INT-007/INT-008/goal remain open; no commit-ready or normal UI deletion
claim. Preserve both prior guard closure receipts and the audit in that change.

Core policy73873 consumes exit0/`NORMAL_CONTACT_DELETION_CORE_POLICY_EXIT=0`:
boundaries/foundation/licenses/secrets pass at the current application/repository
source. Full types/lint/unit19763 is terminal; all current handles are terminal.
Formatting and whitespace are checked without changing old SQL/recovery files,
locks or stash2697. The next work is actual shared-adapter execution and normal
runtime/controller/UI composition, not more baseline probes or another closed
guard CI watch. This intermediate result is not full pnpm verify or a commit-ready
checkpoint; no new hosted run exists for the uncommitted deletion core.

## Identical adapter proof and selected-runtime API

One new shared case advances only the internal execution inventory v19/38 to
v20/39, not durable schema167 or any serialized/archive version. All eight
existing inventory guards first fail on stale browser/Firefox/native pins,
suite name and ordered component list (`normal-contact-deletion-manifest-before.log`,
exit1). Explicit pins/order are aligned together; the new case is composed into
the same manifest and exact completed-case equality checks. No assertion/budget
or native SQL/pragma permission is weakened.

Actual shared execution passes:

- Node:41 outer tests/two files (33 tracker tests plus eight inventory checks),
  nested39-case aggregate, `normal-contact-deletion-shared-node.log`,
  `NORMAL_CONTACT_DELETION_SHARED_NODE_EXIT=0`.
- Browser: actual configured Worker/OPFS, one outer test/nested39 reviewed cases,
  18.9s (30.9s total), then native runs serially on original97561. Log
  `normal-contact-deletion-shared-browser.log`, SHARED_BROWSER marker0.
- Native: complete22 tests/22.38s total plus Rust24 passes/one deliberately ignored
  direct OS-secret test. All six recovery archives remain covered.97561 consumes
  exit0 with SHARED_BROWSER and SHARED_NATIVE markers0; native log
  `normal-contact-deletion-shared-native.log`. This is not installed-WebView or
  prepared OS-secret lifecycle acceptance for the new source.

The identical new case invokes the actual application/repository on every adapter:
exact original/confirmation rejection, literal BLOB byte equality, stale/foreign
guards, fault after actual parent deletion with complete rollback, external
history-reference rollback, confirmed/cyclic owned-history cleanup, retained
same-UUID company/other contact/interview/shared-source rows, absent-complete
observation and replay rejection. A separately simulated disappearance leaves
owned candidates; reconciliation returns unresolved without purging them.
Core types/strict harness lint11245 also consume exit0. The already retained
v19 guard case remains distinct and unchanged.

The selected-runtime `contactDeletion` API is now composed in the normal entry.
Its begin action copies validated original target metadata but opens no storage
and allocates no operation clock. Exact confirmation fixes the first write context;
explicit read-only observation uses a fresh query context without replacing it.
Later calls cannot rebind the original vault/contact/version or turn observed
absence into an attributed deletion receipt. Storage/clock/port failures remain
content-free. Single-flight UI/lifetime enforcement still belongs to the pending
controller, not an unimplemented claim about the API facade.

Runtime tests initially stop at missing-module collection/zero executed cases
(`normal-contact-deletion-runtime-before.log`, exit1); implementation passes
seven tests (`normal-contact-deletion-runtime-after.log`, exit0). The first full
refresh15654 passes35 typechecks then fails strict lint on a redundant null check
because the clock validator's input was typed already trusted; units do not run
on that failed chain. The validator now accepts unknown and retains its runtime
checks, with no suppression. Corrected52959 consumes exit0 with all
`NORMAL_CONTACT_DELETION_RUNTIME_{TYPES,LINT,UNIT}_CORRECTED_EXIT=0` markers:
35 type tasks,22 lint tasks plus tooling,219 unit files/2,850 cases pass. Logs
are `test-results/normal-contact-deletion-runtime-{types,lint,unit}-corrected.log`.
The Changeset now includes the selected web runtime as well as application/storage.

Still missing: owned normal confirmation/reconciliation controller and visible
deletion UI, deliberate original-owner result/focus/retirement, actual normal
offline browser/native/lifetime/reload/reflow/accessibility proof and complete
final-source/serial extension/policy/new exact hosted checkpoint. No new commit,
schema/dependency/permission/source/Accepted change or full INT-007/INT-008/goal
completion. Preserve both guard closure receipts and all retained failures.

Runtime policy14998 consumes exit0/`NORMAL_CONTACT_DELETION_RUNTIME_POLICY_EXIT=0`:
boundaries/foundation/licenses/secrets pass. All current original test/browser/
native/type/lint/unit/policy handles are terminal. Stash2697 remains intact;
old recovery artifacts and SQL/locks are unchanged. No full new-source verify,
serial extension, normal confirmation UI or new hosted checkpoint is claimed.

The next owned UI/controller must block repeat pending effects, hide private
old-owner state across context changes, retire on restore/vault lifetime changes,
and publish/focus only in the deliberate current context. Explicit observation
may enable an identical retry only for the unchanged original. Absent-complete
is not attributed deletion; unresolved must never auto-purge. Confirmation must
name actual original scope/retained copies without inventing counts or exposing
canonical fields still withheld for unknown use basis. Construction metadata
already excludes name, methods and notes. Preserve unrelated contact/edit/
interaction drafts and actual mutation exclusion; this API alone is not that UI
behavior or its executable lifetime/accessibility proof.

## Owned confirmation and normal UI implementation

The root now composes a metadata-only deletion review, independent of responsive
workspace mounting. The controller captures the original API action, enforces
exact typed `DELETE CONTACT` consent, sets synchronous single-flight busy state,
and distinguishes dispatch from a refused mutation boundary. Once dispatched,
an unknown acknowledgement locks consent and forbids another write until an
explicit read observes `original_present`. Only then is the identical original
action eligible for an explicit retry. `changed` and `unresolved` never permit
rebasing or automatic cleanup. `absent_complete` remains observational; it is
not a claim that the attempted deletion caused absence.

The normal selected-contact UI now offers the review for a freshly read active
or archived contact. It displays only original contact ID/version, not canonical
name/methods/notes that may lack display basis. It explains the actual scoped
cleanup and retained interaction text, interview IDs, shared sources, external
archives and free-text mentions. Review closure does not claim cancellation or
undo. Contact and interaction drafts are not replaced; a retained review blocks
new competing contact/interaction editing. Navigation hides original review
fields without changing the target; vault/restore lifetime changes dispose the
controller, and late results cannot rebind a new owner.

Thirteen new controller cases pass. They cover exact consent and bounded input,
duplicate calls while pending, pre-dispatch exclusion, delayed exclusion after
owner loss, uncertain acknowledgement/locked input, explicit original-present
observation and identical retry, changed/unresolved/absent-complete outcomes,
foreign and malformed observational acknowledgements, retained foreign-context
intent, disposal before completion and explicit uncertain-review closure.

The first integrated refresh72958 passes typecheck but fails strict lint on
closure-flow narrowing and void-expression handlers. Those are corrected with
explicit live-state readers and block handlers, not suppressions. Corrected87535
consumes exit0:35 type tasks,22 lint tasks plus tooling,220 unit files/2,863
cases pass. Earlier failures above remain historical evidence, not successes.

The first actual offline browser run29789 fails only at the test's preservation
oracle after the real deletion and observational reconciliation already ran:
the expected timeline mistakenly retained the deleted contact's links and the
previous query's `asOf`. The corrected oracle compares all timeline facts
exactly, allowing only this contact's interaction `contactId` to become null
and a fresh monotonically later query timestamp. It also requires typed
`not_found`, not just an unsuccessful read. Log:
`test-results/normal-contact-deletion-ui-browser-first.log`, FIRST marker1.

Second24543 consumes exit0/SECOND marker0, one normal browser journey9.5s,
24.8s total. It exercises normal exact-consent/keyboard writes, 320px reflow,
forced colors, zero scoped axe violations, a held acknowledgement after an
actual committed delete, pending navigation/hidden consent, explicit read-only
absence without causal overclaim, exact retained timeline, offline reload,
ordinary acknowledged deletion and existing notes-draft protection.
Log:`test-results/normal-contact-deletion-ui-browser-second.log`.

The identical journey14120 consumes exit0/NATIVE_FIRST marker0 over actual Rust
SQLite through the existing simulated IPC host:one native Network journey30.4s,
48.0s total, no OPFS or external-request fallback. This is not installed/package
WebView proof. Its 320px forced-colors screenshot was visually inspected; the
long review wraps without horizontal overflow and distinguishes observed
absence from acknowledged deletion. Log:
`test-results/normal-contact-deletion-ui-native-first.log`.

The delivery fault is explicitly test-only at the typed runtime action's
acknowledgement boundary **after the actual underlying deletion returns
success**, not a claim of a real OS crash or lost native IPC packet. Production
contains no fault probe, retry effect, automatic deletion or new telemetry.
The final expanded serial browser/native check adds typed unsaved notes and
interaction-draft protection plus preservation of deliberate focus outside the
pending form. Full verification/serial extension/policy/exact new hosted closure
remain pending; no commit-ready or complete INT-007/INT-008/goal claim yet.

## Complete local checkpoint verification

The final expanded serial81277 run consumes exit0 with
`NORMAL_CONTACT_DELETION_UI_FINAL_EXIT=0`:actual native Network26.7s and offline
browser8.9s,51.1s total. Both protect typed unsaved notes/interaction drafts and
preserve deliberate focus outside the pending form. Before the full run, the
hook additionally checks the live enabled/restore/API/vault lifetime before
publishing a removed-owner callback; effect cleanup is not assumed to have
already run in that narrow interval. No production source changes follow that
guard during the full run. An attachment-only count label is clarified before
the affected full-suite tests load:one fault-wrapper write plus one ordinary
acknowledged write, two normal UI deletions total. No assertion is removed.

Original51025 consumes terminal exit0 and
`NORMAL_CONTACT_DELETION_FULL_VERIFY_EXIT=0`. Complete retained output:
`test-results/normal-contact-deletion-full-verify.log` (the terminal marker is
also in the tool receipt). The required unshortened `pnpm verify` chain passes:

- Formatting,19 package import policies, foundation records,35 type tasks,
  22 strict lint tasks plus tooling and22 build tasks.
- 220 files/2,863 unit cases, repeated under coverage. Coverage:83.93% statements,
  77.68% branches,84.9% functions and86.53% lines; thresholds are unchanged.
- Seven UI-foundation cases,76 app-shell cases/3.1m, one diagnostic performance
  case/20.1s,85 resilience cases/7.1m, seven onboarding cases/15.4s and13 document
  cases/14.5s. Resilience includes the final new normal UI over both actual
  adapters and all existing native/browser restore/lifetime regressions.
- Fourteen browser storage cases/1.1m, including manifestv20/39;22 native tests
  /25.01s total and Rust24 passes/one deliberate direct-secret skip. The separate
  prepared Windows credential-manager lifecycle passes with no secret exposed.
- Native archive cancellation/checksum/atomic replacement/recovery and managed
  backup verification/retention, all six retained recovery archives, contract
  schema equality, UI contrast/extraction reports and extension build/package
  checks.
- 831 JavaScript package licenses/23 manifest roots and498 Rust crate licenses,
  content-free secret scan, JavaScript audit with no known vulnerabilities,
  Cargo audit and Changesets status. Cargo retains11 existing allowed warnings,
  including the recorded glib/Tokio risk; no waiver or dependency is changed.

The configured local browser reports engine156.0.4314.42 in diagnostic/storage
proof. This is not new exact supported-Chrome/Firefox hosted evidence, packaged
WebView proof, reference-hardware acceptance, public-release readiness or full
INT-007/INT-008/goal completion. Serial extension transfer, final policy/doc
refresh and the authorized coherent commit/push with exact hosted closure
remain. No durable schema/archive/lock/permission/source/Accepted change;
stash2697 and both pending schema167 guard receipts remain intact.

Serial extension97738 consumes terminal exit0 and
`NORMAL_CONTACT_DELETION_EXTENSION_EXIT=0`:nine cases/35.1s pass, including
actual Chromium149.0.7827.55 extension capture/transfer/correction/security and
Firefox151 manual JSON fallback into schema167. The unchanged historical
Firefox no-WASM-compiler failure remains retained in the guard proof; this
fresh run passes without changing the helper, source, timeout or assertions.
Log:`test-results/normal-contact-deletion-extension.log`.

All implementation/full/browser/native/extension handles are terminal; only
the final formatting/policy refresh and commit/hosted closure remain. Supported
exact Chrome/Firefox matrix and Unix/package/manual/reference-hardware/release
acceptance are not inferred from these local browser versions. Retain the
unchanged30-minute hosted budget and its previous41-second headroom risk.

Final97711 consumes exit0 with both
`NORMAL_CONTACT_DELETION_FINAL_FORMAT_EXIT=0` and
`NORMAL_CONTACT_DELETION_FINAL_POLICY_EXIT=0`:whole-workspace formatting,
19 import policies, foundation records,831 package/498 crate licenses and
tracked/unignored secret scan pass after the implementation and proof refresh.
Logs:`test-results/normal-contact-deletion-final-format.log` and
`test-results/normal-contact-deletion-final-policy.log`. `git diff --check`
passes; all30 changed files are the reviewed related implementation/tests/
Changeset/proof/checklist, including both pending guard receipts. No unrelated
changes or historical SQL/archive/lock edits are present. Stash2697 is unchanged;
`main` and remotely inspected `origin/main` still point to2a438d9. Stage checks
will refresh formatting/policy over these terminal receipt additions before
the authorized ordinary commit/push. No new exact hosted success is claimed.
