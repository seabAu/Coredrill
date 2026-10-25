# Normal selected-contact deletion preflight

Status: normal deletion boundary and owned standard UI verified at exact
9025d46/run40142763056; all ten required hosted jobs pass and the original watch
consumes terminal exit0. Full INT-007 remains unchecked.

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

## Checkpoint committed and exact hosted run active

Stage refresh46739 consumes exit0 with
`NORMAL_CONTACT_DELETION_STAGE_POLICY_EXIT=0`; the two receipt documents pass
formatting again and all boundaries/foundation/license/secret checks pass.
Log:`test-results/normal-contact-deletion-stage-policy.log`.

The authorized ordinary30-file commit is
`9025d46d61bf6e0300556529063f15a3630f41cc`,
`feat: add owned local contact deletion review` (3,277 insertions/22 deletions).
It includes both previously pending schema167 guard/hosted proof/checklist
receipts, application/repository/runtime/owned UI, identical manifestv20/39
proof, synthetic audit/tests and Changeset. Staged whitespace passes; working
tree is clean immediately after commit/push. Ordinary push advances main from
2a438d9 to9025d46; independent `ls-remote` confirms the exact full SHA at
origin/main. No force, reset, stash modification or unrelated work is involved.

The automatically triggered exact-SHA [Foundation CI run40142763056](https://github.com/seabAu/Coredrill/actions/runs/40142763056)
is in progress. Original watch40967 remains live,30-second interval,
`test-results/normal-contact-deletion-hosted-watch.log`; it must be consumed
through the terminal `NORMAL_CONTACT_DELETION_HOSTED_EXIT` marker. No duplicate
dispatch or workflow change is made. Required job identities:

- Windows native/package121017760463; macOS121017760539;
  Ubuntu121017760656.
- Firefox153121017760578; Firefox154121017760590;
  Chrome152121017760599; Chrome151121017760695.
- Extension121017760624; full aggregate121017760627;
  full-history secrets121017760691.

Initial compact exact-SHA receipt has only the full-history secret scan
successful; the other nine required jobs remain running. PR-only dependency
review121017761265 is intentionally skipped on push, not a required success.
Ten required jobs include the full aggregate. Retain all actual terminal logs,
exact supported-browser witnesses, prepared three-OS security/package results
and aggregate budget result before claiming hosted closure. Keep the unchanged
30-minute limit and previous41-second headroom risk; no optimistic inference
from local or partial hosted success.

These two fresh post-push proof/checklist receipt edits are deliberately carried
to the next verified implementation checkpoint, not a source change to9025d46.
No full INT-007/INT-008/goal, source-use qualification/review, company
relationships, Home, installed-WebView/manual/reference-hardware/Unix/public
release gate is closed. After exact hosted closure, the next bounded work is
the remaining durable exact-value field-use qualification/review requirements,
not another deletion baseline audit.

## Exact Firefox witnesses retained; hosted gate remains live

Original40967 is confirmed live on continuation. Exact9025d46/run40142763056
now has Firefox153121017760578 and Firefox154121017760590 successful (1m32s
and1m40s). Both completed job logs are retrieved directly and retained with
exit0/FIREFOX153_LOG and FIREFOX154_LOG markers0:
`test-results/normal-contact-deletion-hosted-firefox153.log` and
`test-results/normal-contact-deletion-hosted-firefox154.log`.

Their actual `STG_FIREFOX_PROOF` records identify153.0/154.0, official SQLite
3.53.0 Worker/VFS, all167 applied versions,58 datasets/116 data files,
schema167, exact phase-1 repository manifestv20/39 and career manifestv3/four
cases. Both show explicit persistence grant, reminder persistence, checksummed
same-vault restore and corruption/stale rejection, typed vault-deletion
preview/rejection/clean profile, seven local-time scenarios/13 invalid literals
with globals unchanged. Compatibility scheduling-module proof is not the
production scheduling bundle or installed WebView. These are actual new-SHA
manifest/lifecycle witnesses, not an inference from the local browser version.

Together with full-history secrets, three required jobs are successful in the
observed watch. Seven required jobs, including aggregate121017760627, remain
running; original40967 and its terminal HOSTED marker must still be consumed.
No duplicate run, source/helper/timeout change, full hosted/INT-007/INT-008/goal
or independent release closure. Only the same two fresh receipt documents
differ from the committed checkpoint.

## macOS native and package witness retained

Exact9025d46/run40142763056/macOS121017760539 succeeds5m29s. Direct completed
log retrieval consumes exit0/`NORMAL_CONTACT_DELETION_HOSTED_MACOS_LOG_EXIT=0`;
retained log:`test-results/normal-contact-deletion-hosted-macos.log`.

Actual evidence includes Rust24 passes/one deliberate direct-secret ignore,
native21 passes/one Windows-only canonical-journey skip (source guard remains
`it.runIf(process.platform === "win32")`),17.78s native total, and a passing
versioned shared manifest test. All six recovery archives retain expected
content hashes and attachments, including current167 content
`23d34240eaf9baee204a23ef5725a8537c85ec402b71d6ab2059e48d10999714`.
Physical database-byte equality is explicitly false on this platform; semantic
content/relationship/attachment restore is proven, not byte-identical SQLite
files across OSes.

The separately prepared macOS Keychain lifecycle stores/retrieves/deletes
without exposing secret material. Native archive checksum/cancellation/atomic
replacement/recovery, verified managed backup retention, and complete Tauri
lint pass. The19,867,678-byte diagnostic macOS app excludes the probe and stays
alive for the five-second launch check. `targetConformant:false`, skipped
notarization, installed interactive WebView/manual/reference-hardware/public
release acceptance and ADR-0004's Unix risk disposition remain unchanged.

Original40967 remains live after this new witness. Four of ten required jobs
are observed successful (both Firefox versions, macOS and secrets); Windows,
Ubuntu, both Chrome versions, extension and aggregate remain running. The
same exact hosted terminal-marker/full-log/budget requirements apply. This is
not full hosted/INT-007/INT-008/goal or release closure, and no committed source,
helper, dependency, permission or Accepted decision is changed.

## Hosted extension witness retained

Exact9025d46/run40142763056/extension121017760624 succeeds7m2s. Direct
completed log retrieval consumes exit0 and
`NORMAL_CONTACT_DELETION_HOSTED_EXTENSION_LOG_EXIT=0`; retained log:
`test-results/normal-contact-deletion-hosted-extension.log`.

Both production MV3 packages pass manifest/CSP/file/secret/remote-code inspection
with unchanged least-privilege permissions and zero host permissions. Chromium
keeps the single reviewed external app origin; Firefox retains manual JSON
fallback and no external origin. The57-file/187,990-byte source-review ZIP
passes its secret scan and frozen-lockfile **offline** rebuild, with production
directory and rebuilt store ZIP byte equality true. Source ZIP SHA:
`89c353badf9094e2e1f0902d1ee8087e2d51fc4163cd5a8f07afa3f11d972e32`.
The log includes a WXT source-stat ENOENT warning; the separate complete
source-review/rebuild/byte-comparison checks still pass. No warning suppression,
helper/source change or weaker assertion is introduced.

Nine transfer/security cases pass29.2s:actual Chromium149.0.7827.55 and
Firefox151 manual fallback into schema167. Exact identity/capability agreement,
durable-before-ack and restart recovery, attempt-two idempotency, rejected
origin/oversize/identity/replay, retained outbox on storage failure, inert hostile
prompt content/redirect/iframe/SPA/expiry bounds, original evidence/confirmed
field correction, exact source diff/reload and zero exfiltration/unapproved
requests are covered. Held forwarded responses drain before page/context
teardown without ignoring genuine fetch errors. The immutable uploaded
artifact digest is
`e260b7d098ae72f9855bbb1c510bb4034d27ba0f67748cef3b45eda896652732`.

Original40967 is confirmed live. Five of ten required jobs are observed
successful; Windows, Ubuntu, both Chrome lanes and aggregate121017760627 remain
running. Exact supported browser/native package/aggregate logs and terminal
HOSTED marker are still required. No full hosted/INT-007/INT-008/goal/public
release acceptance, duplicate dispatch, source/helper/permission/Accepted
change or weakening of the30-minute gate. Only two fresh receipt docs differ
from9025d46; the implementation remains frozen.

## Windows and Ubuntu native/package witnesses retained

Exact9025d46/run40142763056 adds successful Windows121017760463/12m3s and
Ubuntu121017760656/12m25s. Both direct completed-log downloads consume exit0
with WINDOWS_LOG and UBUNTU_LOG markers0. Logs:
`test-results/normal-contact-deletion-hosted-windows.log` and
`test-results/normal-contact-deletion-hosted-ubuntu.log`.

Windows passes native22 tests/42.69s total, Rust24/one deliberate direct-secret
ignore, separately prepared app-data resolution, Credential Manager lifecycle,
archive recovery/backup and complete Tauri lint. The actual six-case sampler/
cleanup process-race suite passes10.70s without suppressing unrelated failures.
Current-user NSIS install/20-run startup/uninstall preserves app data. Installer
bytes4,333,054 and SHA
`51ffb8e089cba93d1972016f422e4756ff6afdbc103b2935a9c5a71d08b5b46a`
are retained; diagnostic startup p95 is823.8ms and working-set p95
377,888,768 bytes. `targetConformant:false`:these measurements are not a
reference-hardware performance pass or installed interactive UI acceptance.

Ubuntu passes native21 tests/one Windows-only skip,28.78s total; Rust24/one
deliberate direct-secret ignore; prepared FreeDesktop Secret Service
store/retrieve/delete with no secret exposed; native archive/checksum/atomic
recovery, verified backup retention and complete boundary lint. Its87,067,128-
byte AppImage excludes the native probe and survives the five-second launch.
`targetConformant:false` and ADR-0004 Unix/manual/reference-hardware/signing/
public-release gates remain open.

Both native suites cover all six retained archives/current167 exact semantic
content and attachments. Their current archive/content hashes match the
reviewed7e979c94/23d34240 witness; physical database equality is false and is
not claimed. Source, lockfiles, archive bytes, helper/assertions and Accepted
decisions remain frozen. Together with macOS, prepared actual secure-storage
lifecycles now pass all three OSes for this SHA; this does not erase the
deliberate direct-secret test ignore or imply distribution acceptance.

Original40967 remains live; seven required jobs are observed successful.
Chrome151/152 and aggregate121017760627 are still running under the unchanged
30-minute aggregate limit. Complete exact hosted logs and original terminal
HOSTED marker remain mandatory; no full hosted/INT-007/INT-008/goal/release
closure. Only the same two fresh receipt documents are modified locally.

## Exact Chrome witnesses retained; aggregate remains live

Exact9025d46/run40142763056 adds successful Chrome152121017760599/19m30s and
Chrome151121017760695/20m27s. Both direct completed-log downloads consume exit0
with CHROME152_LOG and CHROME151_LOG markers0. Logs:
`test-results/normal-contact-deletion-hosted-chrome152.log` and
`test-results/normal-contact-deletion-hosted-chrome151.log`.

Actual setup/version and `STG_PROOF` records identify Chrome for Testing
152.0.7977.54 and151.0.7922.138, official SQLite3.53.0/opfs-sahpool/dedicated
Worker, schema167,58 datasets/116 data files, durable transaction rollback,
clean-profile and same-vault checksummed restore, corruption/stale rejection
and typed deletion preserving external archives. Each exact lane passes the
shared phase-1 manifestv20/39 and Career Profile parity,13 document cases,
seven UI-foundation cases,76 shell cases,85 resilience cases and seven
onboarding cases. Resilience durations are11.6m/12.0m respectively.

The successful resilience logs explicitly include the normal interaction/
contact-deletion browser journey and actual Rust-SQLite Network journey,
complete original summaries, historical160/164/165/current167 restore/reopen,
owned evidence/history privacy/lifetime cases and production offline strict
local-time scheduling. Both source-pinned normal deletion helper calls exercise
typed consent, pending navigation, held post-commit acknowledgement, explicit
observational absence without causal attribution, preserved timeline, ordinary
acknowledged deletion, typed unsaved notes/interaction draft protection,
deliberate focus, offline reload and320px/forced-colors/axe. This is not a claim
that every UI fault variant or installed WebView has been independently tested.

Original40967 remains live. Nine required jobs are now observed successful;
aggregate121017760627 remains in progress under the unchanged30-minute gate.
Its terminal result, original HOSTED marker and complete actual log are still
required before exact hosted closure. No duplicate run, source/helper/lock/
permission/Accepted change or full INT-007/INT-008/goal/release closure. Only
the same two fresh receipt documents differ from9025d46.

## Exact hosted closure and normal deletion requirement disposition

Exact commit`9025d46d61bf6e0300556529063f15a3630f41cc` has completed-success
[Foundation CI40142763056](https://github.com/seabAu/Coredrill/actions/runs/40142763056).
The final exact-SHA API receipt confirms every one of the ten required jobs
completed successfully. PR-only dependency review is intentionally skipped on
push. Aggregate121017760627 succeeds23m30s under the unchanged30-minute limit,
with6m30s current headroom. The prior41-second witness remains historical risk
evidence; this faster run is not a guaranteed runtime or a benchmark waiver.

Original40967 is consumed terminal exit0 with
`NORMAL_CONTACT_DELETION_HOSTED_EXIT=0`; do not restart or poll that completed
handle. Aggregate log download consumes exit0/AGGREGATE_LOG marker0; complete
workflow-log handle54649 consumes exit0/COMPLETE_LOG marker0. Retained outputs:
`test-results/normal-contact-deletion-hosted-watch.log`,
`test-results/normal-contact-deletion-hosted-aggregate.log` and
`test-results/normal-contact-deletion-hosted-complete.log`.

The actual unshortened aggregate`pnpm verify` proves35 type tasks,22 strict lint
tasks plus tooling,220 files/2,862 passing units plus one Windows-only packaging
skip, repeated under coverage. Coverage matches the local83.93/77.68/84.9/86.53
statement/branch/function/line percentages. All22 builds, seven UI foundations,
76 shell cases, diagnostic performance,85 resilience cases/8.6m, seven onboarding,
13 documents,14 browser storage and21 native cases/one Windows-only journey
skip pass. Aggregate's unprepared Secret Service check is explicitly skipped;
prepared actual secure-storage lifecycles pass in the three separately retained
OS jobs, not by pretending that aggregate skip was an executed lifecycle.
Native recovery/archive/backup, seven generated contract schemas, UI contrast/
extraction reports, extension build/package/source checks,831 package/498 crate
licenses, workspace/full-history secret scans, advisory and Changesets gates
pass. Cargo retains the same11 allowed warnings and Unix risk disposition.

Requirement-by-requirement disposition for this bounded deletion slice:

| Requirement                                                                                                | Authoritative evidence                                                                                                                                                                | Disposition                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Explicit original contact/vault/version and exact consent, including archived views                        | Strict nine-field application target parser, canonical-ID/timestamp tests, original metadata-only action, controller consent/scope tests and actual normal UI                         | Implemented; no name/method/notes retained as deletion metadata, inferred consent or new permission                      |
| Transactional contact-owned cleanup, confirmed/cyclic histories, unrelated preservation and late rollback  | Real Node/browser/native shared manifestv20/39; repository tests; current167 guard/recovery and actual archive witnesses                                                              | Implemented; preserves companies/jobs/shared sources, recorded text and historical interview IDs; not all-copies erasure |
| Read-only reconciliation without attributed absence or automatic repeat writes                             | Strict observational result states, actual post-commit lost-ack normal UI, controller original-present/changed/unresolved/absence tests and immutable runtime-context tests           | Implemented; only an explicit identical retry after observing the original version; no orphan purge                      |
| Root-owned review across reflow/navigation and preservation of competing drafts                            | Controller disposal/context tests, runtime binding tests, live restore/API callback guards and normal browser/real-Rust UI journeys                                                   | Implemented with scoped evidence; not a claim that every possible UI fault/restore permutation was separately exercised  |
| Ordinary usable confirmation/result UI, offline/reload, literal privacy, focus, keyboard and accessibility | Normal helper on actual local browser/native and exact Chrome151/152 resilience lanes;320px/forced-colors/zero scoped axe violations, acknowledged and uncertain flows                | Proven for the exercised normal journeys; installed interactive WebView/manual acceptance stays separate                 |
| Historical/current recovery and no undocumented decision/permission change                                 | All six archives, normal160/164/165/167 restore/reopen, unchanged historical SQL/archives/locks, full policy/security/license and exact hosted gates                                  | Proven; schema167 and all Accepted decisions remain unchanged                                                            |
| Complete INT-007 field-use qualification/review and company relationships                                  | Current evidence contract still explicitly returns public/licensed eligibility not established; no durable qualification/independent contact-source or relationship projections added | Not achieved; remains required next implementation work, not replaced by deletion                                        |
| Home and product/release completion                                                                        | INT-008 and independent living-checklist gates remain unchecked; diagnostic packages still targetConformant:false, Unix/signing/manual/reference-hardware gates remain                | Not achieved; full goal stays active                                                                                     |

This closes the scoped normal-deletion engineering checkpoint, not the full
INT-007 item or any distribution/performance/manual/Unix gate. No test,
manifest or green job is treated as evidence beyond the requirement it actually
exercises. All local/hosted/log/policy handles are terminal; no duplicate run,
source/helper/lock/permission/Accepted change or historical failure erasure.
Only these two fresh hosted proof/checklist receipt documents carry locally,
to be included with the next verified implementation checkpoint.

The next bounded work must define real durable exact-value public/licensed
qualification and purpose/review/expiry semantics with explicit normal review.
The existing evidence reader's constant `not_established` is not completion;
neither URL/license-note/confirmation metadata nor job-only connector policies
can grant contact-use rights. Existing job-bound snapshots cannot be made
independent by inventing a hidden job. Read and reconcile the governing
source/data/UI/policy records before selecting an additive representation;
no contact acquisition, provider, permission or Accepted-decision change is
implicitly authorized. Expiry withholds use basis, not automatic contact
deletion. Company relationships and normal Home remain afterward.
