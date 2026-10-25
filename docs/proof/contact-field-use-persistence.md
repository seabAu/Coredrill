# Durable contact field-use qualification

Date: 2026-10-25. Status: durable storage/runtime/read-display checkpoint is hosted-green at601a687. Normal qualification forms now pass complete final-source verification and serial extension proof; their exact new hosted checkpoint is pending.

## Pre-edit outcome, authority and scope

Continue INT-007 from the qualification contract at cf3c6b0 toward actual durable
qualification and explicit review, not another permanently unknown projection.
The governing goal, accepted relevant ADRs, decision register, data/source/UI/
runtime/security/technology/delivery specifications and entire living ledger
were read through EOF for this qualification effort. Current migration,
repository, export and recovery boundaries have now also been inspected. The
two initial dirty files are our exact cf3c6b0 hosted-watch receipts; no unrelated
work overlaps. Stash2697 is preserved. No Accepted decision changes are proposed.

The existing job-bound `source_snapshot` cannot represent independent contact
research without inventing a job. Add canonical independent contact-source
snapshots, separate explicit local source-use policy reviews and exact-value
field-use reviews. The baseline is manually supplied literal text only. There
is no fetch, extraction/enrichment, licensed-provider integration, extension
permission, source approval, hosted service or automatic overwrite. Existing
manual-creation evidence stays independent and legacy values are not backfilled.

The source-use record is a local user's explicit bounded review with retained
permission evidence and exact field/purpose/source scope. It is not a free-text
license note promoted on import, legal verification, a contact identity check,
or authorization of a network connector. The later normal flow must separate
reviewing source use from reviewing an exact current contact value; callers
cannot supply an arbitrary policy object as an assessment authority. Runtime
resolution must read the separately recorded reviewed policy. Provider APIs
still require their own separate product/privacy/legal review.

## Model and execution plan

1. Add new forward migrations only after167. Retain exact literal UTF-8 source
   text/hash and independent source metadata; retain policy terms snapshot/hash/
   pointer/excerpt, explicit permission kind, user-review acknowledgement and
   lifecycle metadata; retain exact field/value/source/policy/purpose/review/
   expiry and original operation identity for field reviews. Use ordinary strict
   tables and concrete foreign keys, not generic settings JSON or hidden jobs.
2. Source facts and review facts are immutable. Permit only explicit one-way
   policy disable and field-review revocation with increasing row versions;
   renewal creates a fresh review identity. Prevent replacement through any
   declared key even with recursive triggers off. Whole-contact deletion may
   cascade owned reviews while preserving shared sources/policy evidence and
   recorded interaction text; detached review deletion must reject.
3. Use an ordered field revision per contact/field, not wall-clock ordering, to
   select the latest review. Revoking/changing the latest value must not revive
   an older review. Record commands must bind the sole original viewed vault,
   current contact/value/version and latest review; independently hash retained
   source bytes and current values inside the transaction before effects. Source
   and permission excerpts must match retained bounded literal spans. Unknown,
   stale, foreign, archived, expired, disabled, revoked or changed bases withhold
   use; expiry never deletes a contact or changes canonical values.
4. First prove actual SQL upgrade/rollback, constraints, immutable/replacement
   guards, lifecycle and deletion over synthetic records. Then implement strict
   application commands/queries and the actual selected SQLite port with exact
   acknowledgement, redacted errors and no automatic retry. Add the identical
   repository contract to Node/browser/native execution and advance explicit
   verifier inventories coherently.
5. Include all three new canonical tables in complete JSON/CSV and SQLite export.
   Preserve every supported prior milestone and all existing archive bytes;
   create a separately named nonempty current fixture. Prove old/current browser/
   native restore/reopen, retained content/relationships/attachments, failure
   rollback and older-client refusal. Update migration and recovery notes.
6. Connect the normal owned review/revoke controls, current eligibility projection
   and independent source inspection. Prove pending/failed/uncertain/late/foreign
   ownership, literal input retention, source/privacy distinctions, offline/
   reload, keyboard/reflow/axe and actual browser/native behavior. The backend
   model alone does not complete this requirement or INT-007.

Each coherent checkpoint requires focused tests, full `pnpm verify`, serial
extension, policy/license/secret checks and exact committed hosted evidence.
The immutable cf3c6b0 run40147804029/watch65788 was independent and is now
terminal success; do not restart it or attribute it to later local sources.

## Initial compatibility baseline (before implementation)

Candidate migrations168–182 and the three complete export datasets now exist.
Historical migrations1–167, all six recovery fixture pairs, lockfiles, permissions
and Accepted decisions remain unchanged. No new runtime or UI proof exists.
Only182 is a new writer milestone;168–181 stay unsupported for export. Full
INT-007, company relationships, INT-008 Home and independent manual/reference-
hardware/Unix/security/release gates stay open. Do not commit this incomplete
integration as a completed migration/recovery checkpoint.

## Actual Node SQL and export proof

The first actual schema suite consumes `CONTACT_FIELD_USE_SCHEMA_BASELINE_EXIT=1`
in `test-results/contact-field-use-schema-baseline.log`: all27 cases fail against
the absent model/current167, including the required182 version and missing
rollback publications. After new SQL implementation,27 cases pass. Expanded
source-recording chronology, exact permission spans and revocation backdating
cases pass39; all replacement keys under both recursive-trigger modes and
explicit public/dataset/licensed/renewed-review cases then pass46. These are
actual isolated Node SQLite tests, not simulated storage or normal user flows.

The first export selector command fails before execution because Windows cmd
interprets the pattern pipe (`CONTACT_FIELD_USE_EXPORT_BASELINE_EXIT=255`);
that is not a behavioral failure. The full small suite then executes and
consumes `CONTACT_FIELD_USE_EXPORT_BASELINE_EXECUTED_EXIT=1` in
`test-results/contact-field-use-export-baseline-executed.log`:45 pass/two fail
because the unchanged writer rejects182. After the complete mapping and retained
167 compatibility, all47 pass. Existing export compatibility then finds one
schema164 test still comparing its58 available datasets with the now61-entry
global registry; preserve the exact58 assertion and compare only datasets
available at164, without changing old fixtures or weakening current inventory.
The corrected combined suite passes59 cases.

Latest `test-results/contact-field-use-schema-all-publications.log` consumes
`CONTACT_FIELD_USE_SCHEMA_ALL_PUBLICATIONS_EXIT=0`:64 new actual-SQL/export
cases plus12 existing export cases,76 total. It proves:

- Independent sources retain literal BOM/NUL/Unicode text and permission/value
  byte spans without creating any job or job-source row.
- Separate explicit local source-use review and exact current-value review
  produce synthetic public/compatible-dataset/licensed positive assessments;
  mismatched scope, bytes, source hashes, policy revisions, field/version,
  review dates and implicit acknowledgements reject insertion.
- Immutable evidence cannot be rewritten. Replacement through primary,
  operation and contact/field/revision keys rejects with recursive triggers both
  off and on; all three tables have no hidden rowid.
- One-way policy disable and field revocation preserve evidence. Revoking the
  latest review does not revive an older review; a deliberate new reviewed
  identity can qualify again. Backdated renewal rejects. Explicit field revision
  wins over equal timestamps/opposite lexical UUID order.
- Changing the current contact value withholds the old review without rewriting
  it or private notes/confirmation flags. Whole-contact deletion cascades only
  owned reviews; shared source/policy evidence remains and detached deletion
  rejects. Expiry assessment does not delete a contact.
- Every publication point168–182 rolls back tables/triggers/indexes, ledger and
  `user_version` to167 on an injected post-publication failure. A populated167
  vault upgrades with every prior canonical export row and ledger entry intact.
- Actual nonempty182 export includes61 datasets/122 paired files with all source,
  permission, purpose, lifecycle, exact hashes and field revisions. JSON retains
  the exact literal source.167 remains58 datasets/116 files; intermediate
  168/171/175/181 export rejects and an older167 migration inventory rejects
  182 without downgrading or changing stored evidence.

Final session29584 consumes exit0 and
`CONTACT_FIELD_USE_SCHEMA_FINAL_TYPES_EXIT=0`,
`CONTACT_FIELD_USE_SCHEMA_FINAL_LINT_EXIT=0`,
`CONTACT_FIELD_USE_SCHEMA_FINAL_FORMAT_EXIT=0` and
`CONTACT_FIELD_USE_SCHEMA_FINAL_POLICY_EXIT=0` in the corresponding
`test-results/contact-field-use-schema-final-*.log` files. Expanded source/test
types, strict production source lint, root formatting,19 boundaries, foundation
records,831 npm/23 roots/498 Rust license checks and secret scanning pass.
This is not a full workspace/runtime/recovery gate. The assessor
in these tests reads canonical rows through an explicitly test-only query; it
does not substitute for the required actual application query/port. Raw source
and value hash recomputation, sole original-vault/current-version/latest-review
guards, exact acknowledgement and safe uncertain recovery must be implemented
through production commands before this feature can grant normal field use.
This first path binds an exact user-selected literal span; normalized source
mappings cannot be asserted without their own reviewed versioned transform.

At that model-only stage, remaining work was application commands/ports, deletion reconciliation's new owned-row
postcondition, shared browser/native contract/inventory pins, separately named
nonempty182 fixture, all prior/current browser/native/normal restore/reopen,
normal owned review/source-inspection/revocation UI, full final-source/extension/
policy/secret/license/audit/exact hosted proof. The previous cf3c6b0 contract run
is now fully hosted-green with original65788 and full-log71511 consumed exit0;
its proof does not cover this newer working tree. No new source acquisition,
provider, permission, dependency or Accepted decision changes are introduced.

Normal integration must keep the historical job-bound field-evidence projection
separate: its `not_established` label describes that read's scope, not an override
of a new canonical reviewed-use query. Resolve only the latest field revision;
never search backward for an older eligible record after revocation/value change.
Unqualified contact methods must remain withheld outside deliberate source/value
inspection. Qualified UI wording must describe the user's reviewed basis, not
verified identity, deliverability, legal entitlement or sending authorization.
Source-use review must never enable any connector or broaden extension access.

HEAD/origin remain cf3c6b0; stash2697 is unchanged. These newer model/export files
are intentionally uncommitted pending production ports and complete integration
verification, not an owner-decision blocker or a completed goal.

## Strict commands and actual SQLite integration

The application now exports separate source retention, permission-review and
exact-field record actions, lifecycle control, metadata-only field-state reads
and original-operation inspection. All inputs are versioned, bounded, scalar
UTF-8, strictly copied/frozen and bound to the operation-owned clock before
input accessors or asynchronous hashing can mutate caller state. Unknown
exceptions are redacted. No action automatically retries, rebases a target or
claims an unchanged vault after an uncertain acknowledgement.

The actual SQLite repository checks current182, sole original vault, original
contact version, latest review and current literal value in transactions. It
independently hashes retained sources and current field values, validates
retained permission/value byte spans, and checks exact canonical readback before
commit. Literal text is read as bounded BLOB bytes with fatal UTF-8 decoding
and BOM retention, avoiding NUL-truncated SQLite TEXT getters. Final target/root
checks reject late identity changes. Reads use a read-only snapshot capability
when available; missing-review reads do not preload raw contact methods or hash
them. Lifecycle inspection reports retained state, not proof that a particular
control-operation nonce caused it (that nonce is not stored).

Normal deletion now includes owned field-review residuals in its postcondition.
Actual tests prove parent cascade retains shared source/permission records and
unrelated contacts; a damaged store with an orphaned review reports unresolved
absence without purging it. Latest-revision revocation never revives an older
eligible review. Explicit archived inspection is separate from default reads
and new-review writes. Expiry changes eligibility, not contact retention.

Failure lineage and consumed results:

- Missing application/repository module baselines failed collection (zero
  executed cases), not behavioral tests. The initial sandbox Vite `spawn EPERM`
  also ran no cases; scoped child-process permission allowed the actual run.
- `contact-field-use-context-baseline.log` fails the input-accessor/context
  mutation regression. Snapshotting context first corrects it;
  `CONTACT_FIELD_USE_CONTEXT_CORRECTED_EXIT=0` proves102 then-current cases.
- `contact-field-use-inspection-baseline.log` fails one of59 cases: a port could
  claim matching lifecycle completion on an unchanged row. The parser now
  requires row version2 for matching disable/revoke observations. An unchanged
  row may only be observed as original-present or changed, not completed.
- Focused actual repository run passes22 cases with
  `CONTACT_FIELD_USE_REPOSITORY_FOCUSED_EXIT=0`. Expanded rollback/deletion/
  read-only/latest/archive coverage passes241 cases across six files. The final
  expanded run adds separately retained public-dataset/licensed terms and late
  contact/root-change rollback:245 cases, all pass,
  `CONTACT_FIELD_USE_PORT_EXPANDED_FINAL_EXIT=0` in
  `test-results/contact-field-use-port-expanded-final.log`.
- Workspace types35 tasks pass in66404 and workspace lint22 tasks plus tooling
  passes in83857, both consumed exit0 with their PORT_WORKSPACE markers0.
  These precede the last current-metadata/test additions; the final repeat is below.
- First whole Node suite13081 fails10 of3076 cases in two files because current
  archive/root/contract checks still pinned167. Intermediate72416 reduces this
  to two failures: a historical deletion-guard case accidentally migrating to
  latest and a future-root test using168, now an old version. The guard case is
  explicitly pinned to its historical167 publication with all old assertions
  retained; the future-root refusal now uses183. Current archive tests assert
  182/61datasets/122files without weakening corrupt-byte or source-change checks.
  Session58140 consumes exit0 and
  `CONTACT_FIELD_USE_PORT_WORKSPACE_UNIT_FINAL_EXIT=0`:224 files/3076 passes.
  Final-source repeat36528 consumes exit0 with
  `CONTACT_FIELD_USE_PORT_FINAL_TYPES_EXIT=0`,
  `CONTACT_FIELD_USE_PORT_FINAL_LINT_EXIT=0` and
  `CONTACT_FIELD_USE_PORT_FINAL_UNIT_EXIT=0`:35 type tasks,22 lint tasks plus
  tooling,224 files/3080 unit passes including the four later focused cases.
  Corresponding logs are `test-results/contact-field-use-port-final-{types,lint,unit}.log`.
- Final52182 consumes exit0 with FORMAT and POLICY markers0: whole-workspace
  formatting,19 import boundaries,52 dependency/3 toolchain/16 target/10
  accessibility foundation records,831 npm packages/23 roots/498 Rust licenses
  and secret scanning pass. Whitespace check passes. These targeted checks are
  not full `pnpm verify`, cross-runtime recovery or exact-new-commit hosted proof.
- Post-receipt formatting passes. The first post-receipt secret-scan attempt
  cannot list files because sandbox blocks `spawnSync git.exe` (EPERM), not a
  detected secret. Scoped repeat consumes exit0 with
  `CONTACT_FIELD_USE_PORT_POST_RECEIPTS_SECRETS_EXIT=0` in
  `test-results/contact-field-use-port-post-receipts-secrets.log`. All check
  processes are terminal; whitespace passes and HEAD/origin remain cf3c6b0.

No shared182 qualification contract/inventory or browser/native execution is
claimed yet. The historical deletion guard remains explicitly167; the existing
contact-workspace contract's latest export checks are182/61/122. Preserve every
old fixture and prior SQL checksum. Next: advance the shared adapter contract
with actual new operations, produce a separately named nonempty182 fixture,
prove old/current restore/reopen, then connect normal owned review/source/revoke
UI and run full final-source/serial extension/policy/audit/exact hosted gates.
Normal UI, cross-runtime recovery and full INT-007 remain open. There is no
owner-choice blocker, dependency, source approval, permission or Accepted change.
The partial integration is intentionally uncommitted; both pending prior proof
receipts travel with the next genuinely verified coherent checkpoint.

## Shared adapter qualification plan

Add one reviewed component with two production-operation cases, manifest v21/41
total cases. The first upgrades preserved167 canonical data and ledger to182,
then records independent public/dataset/licensed material, separate permission
snapshots and exact field reviews; it checks metadata-only qualification,
expiry, latest revocation/renewal, policy disable and complete nonempty export.
The second checks original target/hash/span/latest conflicts, actual late-write
and readback failure rollback, read-only original-operation observations and
whole-contact deletion retaining shared evidence. Execute the identical cases
through Node, browser SQLite and real Rust/native SQLite, serially. Do not call
test registration proof or overwrite old fixture/checksum identities. Recovery
fixtures/normal restore/reopen, normal review UI and full-source gates remain.

### Actual shared Node/browser/native results

The v21 manifest has41 ordered cases and the complete ordered component list
is explicitly pinned in the Chromium execution test. Firefox WebDriver and
native execution retain explicit version/case counts; the inventory test passes
against all three. The two new cases call the production application operations
and actual SQLite repository, not the earlier test-only assessor projection.
They preserve the original167 ledger prefix and canonical dataset rows on
upgrade, retain separate public/dataset/licensed terms with byte spans, keep
BOM/NUL/Unicode source text, return metadata without methods/terms/private
notes, and verify nonempty complete export. They exercise stale intent, late
actual insertion/readback rollback, original-operation read-only inspection,
expiry/disable/revoke/explicit renewal and normal owned-review deletion while
shared sources/permissions remain.

The latest-revision regression deliberately leaves a prior eligible row
unrevoked, creates another review, revokes only the newest, and requires the
newest denied state rather than reviving the retained older row. This is a
stronger witness than having every earlier row already revoked.

Retained failure lineage:

- Initial Node baseline fails one of33 tests because the synthetic renewal uses
  the earlier `at` clock after revocation at `later`. The production backdating
  guard correctly rejects it. The fixture now explicitly supplies `later` and
  requires renewed eligibility; no runtime clock rebasing or guard relaxation.
- Initial source types reject two direct accesses on the deletion port's unknown
  return. The shared proof now parses those exact replies through the existing
  strict deletion-result parser. Initial lint finds one void-arrow style error;
  braces correct it. No assertion suppression or unsafe cast is introduced.
- Corrected Node15979 consumes exit0,
  `CONTACT_FIELD_USE_SHARED_NODE_CORRECTED_EXIT=0`,33 tracker tests plus8 explicit
  execution-inventory tests. All41 shared cases execute within the tracker
  aggregate; the test-file count is not the repository case count.
- Initial Chromium39400 consumes exit0/BROWSER marker0; its single execution
  test runs the complete41-case manifest in19.1s. Actual native40699 consumes
  exit0 with BUILD/NATIVE markers0, using the unchanged confined Rust probe;
  one selected manifest test passes and21 other native tests are explicitly
  skipped, not claimed verified.
- After strengthening the retained-older-row witness, installed Playwright
  Firefox12350 consumes exit0/FIREFOX marker0: one complete41-case execution
  test in29.3s (41.2s including setup). This is local Playwright Firefox, not
  proof of exact supported153/154 WebDriver releases.
- Final serial Chromium/native41439 consumes exit0 with
  `CONTACT_FIELD_USE_SHARED_BROWSER_FINAL_EXIT=0` and
  `CONTACT_FIELD_USE_SHARED_NATIVE_FINAL_EXIT=0`. Chromium runs41 cases in28.5s
  (37.8s with setup); native runs41 cases in the one selected test in10.54s
  (14.70s including load), with21 other native tests still skipped.
- Final workspace73675 consumes exit0 with SHARED_FINAL TYPES/LINT/UNIT
  markers0:35 type tasks,22 lint tasks plus tooling,224 files/3080 unit passes.
  Exact logs are `test-results/contact-field-use-shared-final-{types,lint,unit}.log`;
  serial runtime logs use `contact-field-use-shared-{browser,native}-final.log`
  and Firefox uses `contact-field-use-shared-firefox.log`.

All these original handles are terminal. No limits, assertions or confinement
were broadened. Browser default30s has little measured headroom (Firefox0.7s,
final Chromium1.5s); variance remains a verification risk, not a reason to
silently increase a timeout. The independent earlier hosted aggregate's16s
headroom remains recorded as well. Firefox WebDriver current export counts now
expect61/122, but that complete release-specific runner is not executed locally
by these selected adapter tests and still requires exact hosted proof.

Git inspection confirms no changes to tracked historical migration SQL, any
recovery fixtures, pnpm/Cargo locks or stash2697. HEAD/origin remain cf3c6b0.
Still required: separately named nonempty182 archive and no-update replay, all
old/current browser/native restore/reopen, normal owned review/source/revoke UI,
full `pnpm verify` and serial extension/policy/audit/exact-new-commit hosted
evidence. Selected shared-contract success is not complete native-suite,
recovery, normal-UI, INT-007 or commit-ready proof. No owner blocker or Accepted
decision/dependency/permission/source-approval change exists.

Final shared-contract policy/format88168 consumes exit0 with
`CONTACT_FIELD_USE_SHARED_FINAL_FORMAT_EXIT=0` and
`CONTACT_FIELD_USE_SHARED_FINAL_POLICY_EXIT=0`. Whole-workspace formatting,
19 boundaries, foundation records,831 npm packages/23 manifest roots/498 Rust
licenses and secret scanning pass. Logs:
`test-results/contact-field-use-shared-final-{format,policy}.log`. All local
adapter/unit/hygiene/policy handles for this step are terminal. Whitespace and
historical-file/lock preservation checks pass. These receipts remain with the
uncommitted integration for the next complete checkpoint, not a receipt-only
push or a claim that broader recovery/UI/full verification has run.

## Schema182 recovery execution plan

Preserve six existing archive/JSON pairs. Derive a new separately named182
fixture from an actual restore of167, migration to182 and explicit production
commands retaining synthetic source/permission/field review and lifecycle rows.
Do not reseed or rewrite prior career/document/manual-contact evidence. Compare
all prior canonical rows and ledger identities, installed guards, exact retained
bytes, complete61-dataset/122-file export and both old attachments. Require
generation followed by no-update byte comparison, clean browser/current restore
and all prior browser/native upgrades, then normal source-schema-preserving
restore/commit and deliberate current reopen. Fixture-only harness capabilities
remain separate from normal contact workflows. Full verify/UI/hosted proof is
still required before a commit-ready feature claim.

### Schema182 fixture, restore and reopen results

The new fixture is `fixtures/recovery/phase-1-vault-schema-182-v1.coredrill.zip`
with adjacent JSON. It restores the unchanged167 archive, migrates only forward,
then appends synthetic qualification through actual application commands. No
prior career, document, contact/manual receipt, application or attachment rows
are reseeded. All six older fixture pairs and SQL1–167 retain their tracked
identities; pnpm/Cargo locks and stash2697 remain unchanged.

The archive has2,011,433 bytes,
SHA-256`1f94ee83c44c9dacba62bcaae298ed0c517fc5342e7dd1cd400ff5c77d4e13db`;
SQLite SHA-256`dafa76d777edaf08043a2233cb80236a6989c3d17fe26cfba11bc510918f8ab9`;
canonical content SHA-256`bf3d797ea80588deafbde25bf223fc5e3a82eb2855207c3f5b07300120517459`.
It contains61 datasets/122 files,6 source snapshots (separate retained permission
snapshots),3 permission policies,4 exact-value reviews and the same2 attachments.
One policy is disabled. The latest email review is revoked while its older
eligible review remains unrevoked; licensed profile use remains current. The
fixture is invented evidence, never a real source acquisition/use approval.

Failure lineage and actual verification:

- Browser19558 fails the new case on a test comparison of SQL integer1 against
  the established human-readable boolean`true`; six legacy upgrade cases pass.
  The comparison now applies only the registry's explicit boolean/JSON mapping
  and still compares every exported column/row exactly. It does not normalize
  away arbitrary record changes.
- Browser98869 then exposes a real defect: the actual SQLite source bytes keep
  a leading BOM, while exported `raw_text` loses it through the browser TEXT
  bridge. New literal evidence fields (`raw_text`, `terms_excerpt`,
  `source_excerpt`, `purpose_note`) now read BLOB bytes and use fatal UTF-8 with
  BOM retention. The correction is limited to the new182 columns; older fixture
  exports/CSV bytes are not rewritten. Node22301 consumes exit0/LITERAL_EXPORT
  marker0:78 cases, including new TEXT-bridge BOM/NUL/Unicode and malformed UTF-8
  rejection regressions.
- The next original63441 records a30s timeout for the new case and partial
  legacy progress. After tool/session continuity reset its handle is missing;
  it has no consumed success or zero-exit claim. No root cause is established
  and no timeout was increased. Its generated candidate is preserved in
  `test-results/contact-field-use-recovery182-initial.{coredrill.zip,json}`;
  its archive hash is identical to the final fixture. A read-only check finds
  no listener on4173 before the fresh run.
- Fresh6837 consumes exit0 with
  `CONTACT_FIELD_USE_RECOVERY_BROWSER_GENERATION_FINAL_EXIT=0` and
  `CONTACT_FIELD_USE_RECOVERY_BROWSER_REPLAY_EXIT=0`. Generation passes7 cases
  in20.6s, then explicit update flag0 replay passes7 in19.9s. The new case takes
  3.5/3.6s, checks deterministic archive/metadata bytes, exact prior datasets and
  ledger, all7 installed qualification guards, raw source/value/terms hashes
  and spans, complete JSON/CSV, both attachments, clean current restore, close/
  reopen and whole-vault deletion. All six preserved158/159/160/164/165/167
  browser restore/upgrade cases also pass with empty new qualification rows.
- Initial native test types reject undeclared direct application/domain test
  imports. The corrected test uses the already declared storage-core adapter
  and its strict read request directly; no package/lock/dependency change.
  Corrected native source/test types pass. The existing identical41-case shared
  suite separately exercises the complete application wrappers.
- Complete native75795 consumes exit0/NATIVE_COMPLETE marker0:24 Rust unit
  passes/one explicitly ignored secure-store lifecycle case, followed by23
  native tests passing. All seven preserved/current archives restore and
  upgrade, retain every prior canonical export row/ledger and both attachments,
  compare installed guard SQL, close/reopen, and require exact new qualification
  datasets. Actual metadata resolution after reopening182 observes revoked
  email, disabled name basis and current licensed profile basis. This verifies
  canonical content, not cross-engine physical SQLite-byte equality.
- Initial normal32009 consumes exit1: all10 journeys fail. Eight stop on the
  old116-file test expectation although actual preparation reports182/122.
  The two167-source journeys expose a genuine normal-runtime compatibility
  omission: the old current167 had not been added to the explicit prior-source
  list after advancing to182. Normal composition now retains167 alongside
  160/164/165; the exact source-schema review/commit boundary is unchanged.
- Corrected normal89239 consumes exit0/NORMAL_REOPEN_CORRECTED marker0: all10
  browser/real-Rust native source160/164/165/167/182 journeys pass in59.0s.
  Source review/commit preserves its schema; deliberate normal reload advances
  to182. Exact ledger additions/checksums, unchanged prior JSON/CSV/attachments,
  empty legacy qualification (no backfill), current182 nonempty evidence and
  only permitted root schema/last-opened stamp changes are compared. Native UI
  uses a simulated Tauri IPC host backed by the real Rust process, not an
  installed packaged WebView/picker claim.
- Workspace4269 consumes exit0 with RECOVERY_FINAL TYPES/LINT/UNIT markers0:
  35 type tasks,22 lint tasks plus tooling,224 files/3082 unit passes. This
  precedes the last normal167 compatibility/current-metadata edits, so final
  hygiene must repeat at the checkpoint.
- Complete browser86310 consumes exit1:14 cases pass (including all recovery,
  actual41-case shared manifest, benchmarks, concurrency/failure and Career
  contracts); one test's ordered dataset-name list omits the3 new names despite
  correct61/122 counts. The explicit list now includes all3 in the registry's
  exact order. Its original failure remains in the log; complete repeat and
  subsequent serial extension proof must be consumed before claiming success.

Current-runtime metadata assertions are aligned to182/61/122 in storage,
extension, shell, supplied-capture and archive/runtime helpers. This never
changes an old fixture or deliberately historical167 guard assertion. Selected
recovery and normal reopen are now proven; complete final-source/serial
extension/policy/audit/hosted proof and normal owned qualification/source/
revocation UI remain open. Pending proof/checklist receipts remain uncommitted
with the integration; no owner-choice blocker or Accepted decision change.

Complete browser repeat/serial extension35767 consumes exit0 with
`CONTACT_FIELD_USE_RECOVERY_BROWSER_COMPLETE_CORRECTED_EXIT=0` and
`CONTACT_FIELD_USE_RECOVERY_EXTENSION_EXIT=0`. All15 browser storage cases pass
(1.0m), including v21/41 actual production contracts, current/old recovery and
benchmarks/failure/concurrency. All9 subsequent extension cases pass27.3s;
Firefox fallback reports durable schema182. Existing extension permissions,
transport/retry/privacy assertions and budgets are unchanged. Final source
repeat41385 consumes exit0 with RECOVERY_FINAL2 TYPES/LINT/UNIT markers0:
35 type tasks,22 lint tasks plus tooling,224 files/3082 unit passes. Policy/
format and final proof receipt checks remain before handing off this partial
feature; full `pnpm verify`, exact new hosted evidence and normal qualification
UI are not inferred from these focused successes.

Final recovery43362 consumes exit0 with
`CONTACT_FIELD_USE_RECOVERY_FINAL_FORMAT_EXIT=0` and
`CONTACT_FIELD_USE_RECOVERY_FINAL_POLICY_EXIT=0`:whole-workspace formatting,
19 boundaries, foundation records,831 npm/23 roots/498 Rust licenses and secret
scan pass. All recovery/runtime/unit/hygiene/policy handles are terminal.
Whitespace and tracked prior migration/archive/lock preservation checks pass;
HEAD and origin remain cf3c6b0 and stash2697 is unchanged. The next unblocked
slice is actual normal owned qualification/source-review UI and its deliberate
literal inspection/lifecycle/lifetime/privacy journeys, not more recovery-only
receipts. Full final-source/exact hosted proof and the complete product goal
remain open. No partial-feature commit, owner blocker or decision change.

## Normal reviewed-use runtime and UI plan

Compose the existing strict record/control/read/inspection operations behind the
selected normal browser/native database provider, with no eager open/hash/clock
at construction. A user action owns a copied payload and first operation
context; a lost acknowledgement retains that exact request for read-only stored
inspection, never automatic replay, target rebase or a newer nonce/clock. Then
connect root-owned source retention, explicit permission and exact current-value
review forms, metadata eligibility and one-way lifecycle controls. Keep source
capture distinct from allowed use, manual-entry basis independent, unknown raw
values withheld outside deliberate inspection, and old job-bound provenance
clearly scoped. Deliberate canonical source/terms/excerpt inspection and bounded
source selection/resumption must be real reads, not a caller-provided policy or
reconstructed claim. Prove ownership across vault/contact/company/version,
navigation/restoration/deletion, pending/failed/uncertain/late results, focus,
keyboard/reflow/axe, offline/reload and actual browser/native storage. No new
schema, dependency, source acquisition/permission or Accepted decision change is
needed. Until normal journeys and full-source/hosted gates pass, keep the whole
feature and pending proof/checklist receipts uncommitted and INT-007 unchecked.

### Normal runtime and read/display integration

`stored-contact-field-use.ts` composes the existing strict application actions
and actual selected SQLite port. Construction/binding does not open storage,
hash, allocate record IDs or read a clock. Explicit ID allocation is validated.
Each bound action copies/freezes its payload and captures its first operation
context once. It retains the actual original parsed request, distinguishes
pre-dispatch opening failures from a dispatched command, and offers read-only
original-operation inspection. A later differing digest cannot replace that
original request. No automatic retry or target/clock rebase is added. Main now
provides this API through the normal browser/native database provider; the API
is not an alternate database, SQL or provider surface.

Normal contact details independently read reviewed-use metadata for populated
fields, bound to the selected vault/contact/current row version. Replies are
revalidated against that scope and the view's current time. A current active
reviewed basis can display the exact stored field without inventing manual
origin. Pending/stale/unconfirmed, expired, archived or future-review-clock
projections withhold that reviewed basis. Expiry and visibility timers update
only the view; long timers reschedule without canonical writes. A failed or
foreign reviewed read clears the reviewed projection but does not erase valid
independent manual-entry basis or contact facts. Normal manual notes/edit/delete
and historical job-bound source evidence remain separate. The latter's scoped
`not established by this evidence read` is not a veto of canonical reviewed use.

Actual proof and limits:

- New normal runtime focused test passes21 cases,
  `CONTACT_FIELD_USE_NORMAL_RUNTIME_FOCUSED_EXIT=0`. Regression with existing
  deletion and historical-evidence composition passes61 cases across3 files,
  `CONTACT_FIELD_USE_NORMAL_RUNTIME_REGRESSION_EXIT=0`. Tests cover no-eager-IO,
  capability/input/ID validation, frozen payload, original first context and
  one-read accessors across awaits, retained differing-digest identity,
  uncertainty/read-only inspection and redacted pre-dispatch failures.
- Source/test types pass. Initial local lint rejects an unnecessary optional
  access; corrected lint passes. A later full hygiene94575 stops at a redundant
  null check in the stricter clock guard, so that run does not execute units.
  Removing the logically redundant condition changes no guard or assertion.
- Actual normal offline browser94080 passes the new current-use display
  journey in3.7s (18.3s with build/setup). It uses disclosed synthetic normal
  runtime-command prerequisites, not completed normal write controls. Source
  retention and permission review alone leave the value withheld. Explicit
  exact-value review enables the actual normal detail field, with public-review
  wording and no identity/legal/outreach claim. Inspecting the old job-bound
  history does not override it. Advancing the test clock withholds expiry
  automatically and preserves the exact SQLite export hash. A forged foreign
  metadata reply cannot qualify a field or hide independent manual values.
  320px reflow and axe pass; external requests/page errors are zero.
- Actual normal regression22830 consumes exit0/DISPLAY_REGRESSION marker0:
  all14 historical-evidence/read-owner/privacy/focus/contact-editor/restore/
  deletion and current-use display journeys pass in59.0s. After the final
  active-contact guard, repeat11143 consumes exit0/DISPLAY_FINAL marker0,
  new display journey3.6s (17.1s including setup). These are browser UI results,
  not new native UI qualification proof.
- Complete final48211 consumes exit0 with NORMAL_FINAL3 TYPES/LINT/UNIT
  markers0:35 type tasks,22 lint tasks plus tooling,225 files/3103 unit passes.
  Exact logs: `test-results/contact-field-use-normal-final3-{types,lint,unit}.log`;
  runtime/display logs use `contact-field-use-normal-runtime-{focused,regression}.log`
  and `contact-field-use-normal-display-{browser,regression,final}.log`.

The source/permission/exact-value write forms, root-owned pending/uncertain/
late/foreign lifecycle controller, canonical literal evidence inspector and
bounded retained-source selection/resumption are still required. Do not infer
them from API-prerequisite writes or a display test. Native normal qualification
UI, full final-source/hosted verification, company relationships and INT-008
Home remain open. Existing182 recovery and six old fixtures/locks/SQL remain
unchanged. No dependency, acquisition, permission or Accepted change; no owner
blocker. Keep pending proof/checklist receipts with the unfinished integration,
not a receipt-only commit or a full INT-007/goal claim.

### Exact selected-value fidelity and bounded checkpoint

The follow-up audit finds a real join risk: qualification independently hashes
canonical contact BLOB bytes, while selected contact details previously used a
TEXT bridge that can consume a leading BOM. Selected workspace reads now decode
the six literal contact columns from BLOBs with fatal UTF-8 and `ignoreBOM:true`
inside the existing scoped transaction. Invalid bytes fail closed rather than
displaying a replacement string under the canonical value's reviewed basis.
No stored contact, migration, legacy archive mapping or source permission changes.
The existing shared manual-contact case now includes BOM name/role/email and
asserts exact values and hash-bound manual basis. A new malformed-UTF-8 Node
regression checks explicit rejection. Node passes34 cases and actual browser
Worker/OPFS passes the complete v21/41 manifest in15.2s (22.4s total).
The initial sandbox run failed to spawn Vite with EPERM; the scoped approved
local-helper retry executes the tests and exits0.

The next verified commit is deliberately bounded to completed durable storage,
recovery, normal runtime and current-basis read/display behavior, including the
pending prior proof receipts. This supersedes the earlier plan to keep all work
uncommitted until every normal qualification form is finished. Full verification
and serial extension checks are still required before committing. The normal
write controls/controller, literal evidence inspector, retained-source selection,
resumption and native qualification UI are the next slice. None is represented
as complete by API prerequisites or read/display tests. INT-007 remains unchecked.

### Complete local checkpoint verification

The final literal-read native run7716 consumes exit0 and
`CONTACT_LITERAL_NATIVE_EXIT=0`:24 Rust core cases pass with the one separate
secure-store lifecycle case explicitly ignored, then all23 actual native
storage cases pass, including the complete v21/41 manifest and recovery suite.

Full checkpoint84117 stops at formatting for the new browser test; formatting
is corrected. Full68869 then stops in typecheck: the new malformed-UTF-8 unit
request omitted required `includeArchived`. Supplying explicit `false` corrects
the test contract; no production guard, assertion or budget is relaxed.

Full62624 consumes exit0 and
`CONTACT_FIELD_USE_CHECKPOINT_VERIFY_FINAL2_EXIT=0`. The complete required
`pnpm verify` chain passes: formatting,19 boundaries/foundation records,
35 type tasks,22 lint tasks plus tooling,225 files/3104 unit cases repeated
under coverage, build/contrast/extraction/extension/schema artifacts,7 UI
foundation/76 shell/1 diagnostic performance/88 resilience/7 onboarding/
13 document/15 browser storage and23 native storage tests. Coverage is84.09%
statements,77.68% branches,85.32% functions,86.68% lines. The full chain separately
executes the prepared Windows Credential Manager lifecycle without exposing the
synthetic secret, native archive recovery/backup,831 npm/23 root and498 Rust
license policy, secret scan, dependency audits and Changesets status. npm audit
reports no known vulnerabilities; Rust audit exits0 with11 allowed warnings,
including the existing unmaintained/unsound advisories. This is not a claim that
those warnings, independent release gates or Unix/manual/reference-hardware
obligations are resolved.

Exact complete log: `test-results/contact-field-use-checkpoint-verify-final2.log`.
The earlier formatting/type failures remain in the adjacent `verify.log` and
`verify-final.log`. Historical SQL, six old recovery fixture pairs, both locks,
permissions and Accepted decisions remain unchanged; stash2697 is preserved.
Serial38893 consumes exit0 and `CONTACT_FIELD_USE_CHECKPOINT_EXTENSION_EXIT=0`:
all9 Chromium transfer/Firefox fallback cases pass in35.7s. Final30323 consumes
exit0 and `CONTACT_FIELD_USE_CHECKPOINT_FIREFOX_EXIT=0`: the complete v21/41
repository contract passes installed Playwright Firefox in29.5s (38.7s total).
That leaves0.5s local margin against the unchanged30s case budget; retain this
headroom risk rather than claiming performance/release-matrix closure. Logs are
`test-results/contact-field-use-checkpoint-extension.log` and
`test-results/contact-field-use-checkpoint-firefox.log`. Final document hygiene
and the implementation commit/exact new hosted evidence follow. Normal
qualification write UI remains subsequent.

Final37982 consumes exit0 and
`CONTACT_FIELD_USE_CHECKPOINT_FINAL_HYGIENE_EXIT=0`: whole formatting and
complete boundary/foundation/license/secret policy pass after the proof and
Changeset updates. All local execution handles are terminal. The implementation
commit includes these results and the pending previous hosted receipts; exact
new hosted status must be recorded separately after publication. No feature,
INT-007, supported release-matrix or goal completion is claimed.

## Normal qualification controls and canonical research

Exact checkpoint ef351149db9f61d1d78b1d25d4dbac6d7cdfeaf9 is committed and
pushed, including the pending receipts; reinspection confirms a clean tree.
Its automatic [CI40164548638](https://github.com/seabAu/Coredrill/actions/runs/40164548638)
is live through original watcher79771. The first exact hosted witnesses are
Firefox154 and full-history secrets; that is not complete hosted closure.

The next implementation is the actual normal qualification workflow. Add strict
bounded source/permission metadata pages and deliberate canonical evidence
reads first: forms must choose and resume existing SQLite records without
treating typed IDs, retained input or local state as canonical authority.
Metadata pages exclude source/terms/contact bodies and excerpts, use deterministic
scoped continuation and no totals. Deliberate detail reads independently validate
retained source/terms hashes, byte spans, original records, current lifecycle and
selected field scope. Latest-review inspection also binds the viewed contact
version and explicit latest revision. These are observation only and do not
grant a basis or renew/revoke anything.

Then compose real source retention, separate permission and exact-value review,
canonical source/terms/purpose inspection, one-way disable/revoke and owned
pending/uncertain/late/foreign lifecycle in normal UI. Preserve copied input,
original IDs/context and read-only reconciliation; use the exclusive vault
mutation boundary and retire across restore/session changes. Prove actual
offline/reload and browser/native/a11y/reflow journeys. No new source acquisition,
dependency, schema, permission or Accepted decision is needed. Preparatory read
contracts do not stand in for the required write UI or INT-007 completion.

### Canonical research/runtime and owned action preparation

`contact-use-research.ts` adds strict copied/frozen versioned inputs and views for
bounded source and field/source-scoped permission pages, deliberate source/terms
inspection and current latest-review inspection. Continuations bind the vault,
read kind, source/hash/field and exact descending timestamp/ID anchor. Pages
exclude bodies/excerpts/notes and totals, reject duplicate/out-of-order/foreign
or skipped continuations and cap at20 records. Canonical detail replies retain
literal BOM/NUL/Unicode and independently rehash source/terms/excerpt values in
the application layer. Disabled and revoked history can be inspected without
granting eligibility, and there is no implicit observation clock renewal.

The actual SQLite repository exposes these reads through a separate `research`
port, reusing the existing canonical source/policy/review hash/span/lifecycle
validators. Metadata selects do not load raw text, terms excerpts or purpose
notes; deterministic keyset paging uses a single bounded lookahead. The actual
read-snapshot capability is used when available, with the existing transaction
fallback otherwise. Latest-review inspection checks the viewed current contact
version, field, latest ID and lifecycle version. Normal `readResearch` composes
this port without construction-time IO and redacts database failures.

`stored-contact-use-controller.ts` binds one original record/control action to
its copied vault/contact/version/company/field owner. It is single-flight,
rechecks ownership after waiting for the vault mutation boundary, validates
acknowledgements against the original payload/first context, preserves uncertain
outcomes and offers observation before explicit identical retry. Navigation does
not rebind the action; disposal ignores late publication without pretending to
cancel storage. Unresolved discard is explicit. This controller is not yet a
root-owned form, inspector UI or evidence-selection workflow.

Actual focused results:33 strict application research cases,47 actual SQLite
repository cases and25 selected-runtime cases pass105 total on76277 after
correcting one unnecessary optional chain. The new controller passes12 cases;
initial controller lint rejects optional-chain/closure-flow conditions, then
88572 consumes exit0 with all22 lint tasks plus tooling and117 focused cases
across four files. Closure-entry observation is read through a function after
the await; no ownership or uncertainty guard is removed. Complete64386 consumes
exit0 and `CONTACT_RESEARCH_CONTROLLER_TYPES_UNIT_EXIT=0`:35 type tasks and
227 files/3167 unit cases pass. Logs are `test-results/contact-research-types.log`,
`contact-research-lint{,-final}.log`, `contact-use-controller-lint{,-final}.log`
and `contact-research-controller-final-{types,unit}.log`.

All source changes above remain uncommitted for actual normal form integration.
No new schema/dependency/permission/Accepted change or real-vault mutation. The
new reads/controller still need identical adapter and actual normal UI proof,
root lifetime/restore/deletion coordination, explicit time/span/purpose inputs,
source/terms selection and resumption, complete verification and a fresh hosted
checkpoint. Do not substitute passing preparatory tests for these requirements.

### Published checkpoint timeout and isolated CI correction

The original exact ef35114 run40164548638 finishes with nine required successes
but its aggregate121082800801 exceeds the30m wrapper during final license checks.
Original watcher79771 consumes terminal exit1/HOSTED marker1. The authoritative
annotation explicitly identifies the30m job limit; no assertion failure or
manual cancellation is claimed. Complete diagnosis and preserved scopes are in
[the dedicated hosted proof](checkpoint-ef35114-hosted-verification.md).

Isolated CI-only commit `601a68704e98ba85a2d8e2b146be340b829fd964` is pushed.
It changes only the aggregate whole-job allowance30→35m plus that dedicated
proof; all product sources remain identical to ef35114 and every check,
individual test/performance budget, pin and permission remains unchanged.
Prettier/workflow parsing and complete policy75581 pass. The pending normal
research/controller changes are excluded from that commit. Its automatic
[run40166818736](https://github.com/seabAu/Coredrill/actions/runs/40166818736)
is confirmed live; exact full hosted closure remains pending.

Next normal UI composition must keep the full draft and selected canonical
source/terms/policy views in the AppShell-owned workflow across contact navigation
and reflow. A foreign selection shows only a return-to-original action, not its
private bodies. Coordinate with existing editor/interaction drafts, contact
deletion, the exclusive vault mutation boundary and restore/reopen retirement;
inspect the established hooks' exact restoration behavior before substituting
new disposal semantics. Each populated field gets a deliberate review entry;
archived contacts retain inspection/revocation but cannot receive new reviews.
Use canonical field metadata to capture the latest ID/version and research reads
for source/permission selection; never promote input-memory bodies to stored
evidence after acknowledgement. Explicit source/permission/field action reviews
remain separate, with retained original IDs/context and observational recovery.
Use the accepted lazy local-schedule resolver for capture/review/expiry clocks,
reject gaps and require an occurrence for overlaps. Derive literal UTF-8 spans
from deliberate whole-character text selection without trimming/normalization.
Pending/failed reads must retain the exact request, withhold unconfirmed changes
and suppress late/foreign publication. These obligations still require real
browser/native/UI proof; preparatory tests are not their completion evidence.

Final74840 consumes exit0 and
`CONTACT_RESEARCH_CONTROLLER_FINAL_FORMAT_POLICY_EXIT=0`: whole formatting,
19 boundaries/foundation records,831 npm/498 Rust license policy and secrets
pass after the focused/types/lint/3167-unit results above. All local test and
hygiene handles are terminal. Replacement exact CI40166818736 is confirmed live
through its single original quiet watcher19752; its log is retained in
`test-results/contact-checkpoint-ci-headroom-watch.log` and terminal marker will
be `CHECKPOINT_CI_HEADROOM_HOSTED_EXIT`. Do not restart the cancelled old run or
infer full hosted success from a live watcher. The form workflow remains the
next implementation; no owner decision is needed and INT-007 stays unchecked.

## Normal form composition and prior hosted closure

The published checkpoint now has exact601a687 / CI40166818736 full hosted
closure: original19752 and complete-log79364 consume exit0 and their terminal
markers. All ten required jobs pass with the PR-only dependency review skipped;
the aggregate completes20m56s under35m. The original ef35114 aggregate timeout
is retained, not relabeled success. Complete counts, platform skips, OS secure
storage receipts and remaining release limits are recorded in the
[dedicated hosted proof](checkpoint-ef35114-hosted-verification.md#exact-follow-up-hosted-closure).
Do not reopen either terminal watcher or attribute these logs to newer sources.

The subsequent uncommitted normal workflow now exists in
`stored-contact-use-workflow.tsx`, wired to populated selected-contact fields,
root draft/deletion/interaction guards and the exclusive vault mutation boundary.
It adds actual source/permission/exact-field forms, canonical metadata pickers,
literal inspectors, strict local clocks/spans, one-way controls and original-
action recovery. Six actual offline browser cases and the identical real-Rust
normal UI lifecycle pass; full types/lint/3173 units pass after retained lint/
test-locator failures. The latest metadata-page invalidation change and every
full-source regression still require the full gate. See the
[normal workflow implementation, focused evidence and limits](normal-contact-source-use-workflow.md).
No schema/dependency/permission/source-acquisition/Accepted change. Keep all
pending proof/checklist receipts with the next verified implementation commit;
INT-007, company relationships, Home and the product goal remain open.

## Complete normal-form local checkpoint

Final normal-form source now passes the entire required gate on74510, terminal
exit0/CONTACT_USE_NORMAL_FORMS_FULL_VERIFY_FINAL_EXIT=0, plus serial extension29959,
terminal exit0/CONTACT_USE_NORMAL_FORMS_EXTENSION_EXIT=0. This supersedes the
pending full-gate status above. The final audit fixes stored profile-URL
normalization so qualification and display refer to the same literal value;
explicit manual-entry normalization remains unchanged. All35types,22lint plus
tooling,227files/3175units repeated under coverage, complete builds/artifacts,
7 UI/76 shell/1 diagnostic performance/96 resilience/7 onboarding/13 documents/
15 browser storage/23 native adapter and9 serial extension cases pass, together
with secure storage/archive/schema/license/secret/audit/Changesets gates.
The96-case suite includes all7 normal form cases and the identical real-Rust
normal form journey. Retained initial regression-build/type failures, coverage,
actual case counts and limits are in the
[final-source proof](normal-contact-source-use-workflow.md#final-source-verification).
Commit the implementation and all pending proof/checklist receipts as one
checkpoint. Exact new hosted results remain required; the independent601a687
closure must not be attributed to these newer sources.
