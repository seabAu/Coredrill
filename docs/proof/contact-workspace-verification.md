# Viewed-vault contact workspace prerequisite — INT-007 in progress

## Starting checkpoint and authority

This scope is activated in the living ledger before product edits. Independent
local implementation supersedes the prior result-documents-only checkpoint;
it cannot change the immutable commit being verified. This plan is not completion proof. The
contact-directory/company-focus/security checkpoint remains `ed5d73332ea397025ae63d53012579486877e575`;
its exact hosted run39689728116 is independently in progress. No successor push
may supersede that live run. Only our post-push proof records are dirty; preserve
them and recovery stash2697. Full INT-007 and INT-008 remain unchecked.

The product remains accountless, local-first, offline-capable and useful without
AI. Accepted D-030 explicitly permits storage representation to evolve through
migration while retaining field provenance and durable confirmation. This plan
does not replace an Accepted decision, activate a connector/provider, broaden a
permission or add a dependency. SQLite remains canonical; SQL owns migrations,
TypeScript owns validated application contracts and storage adapters, and Rust
remains the existing thin boundary.

## Inspection findings

The existing APP-004 contact creation boundary distinguishes explicit manual
input from source-backed input and hashes every populated extracted field. The
stored contact scalar row, however, does not retain that manual-input decision.
Neither `user_confirmed`, null confidence nor absent source links proves that a
legacy value was manually entered. Existing `contact_point_provenance` links
retain genuine capture provenance and must not receive fabricated manual source
snapshots. The minimized directory deliberately excludes methods, notes and
origin labels; it cannot substitute for a selected contact workspace.

A selected workspace therefore needs explicit value-bound manual-creation
evidence before it can honestly label newly entered methods. Unknown legacy
basis stays unknown. User-entered is not verified, public, licensed, consent to
outreach, or authority to automate anything. Hashes of contact values remain
sensitive local records, not anonymous data suitable for diagnostics.

## Bounded implementation and required proof

1. Add strict version-1 selected-contact read, explicit manual creation and
   optimistic notes-update contracts. Every request binds the viewed vault;
   creation uses one caller-owned fixed contact identity and original operation
   context. A selected company requires its captured identity/version. Parse,
   copy and freeze literal input before asynchronous hashing or persistence.
   Reject unknown keys, guessed methods, source metadata on a manual command,
   malformed context and mismatched acknowledgements. Reuse existing field
   validation without weakening the APP-004 boundary.
2. Persist one immutable manual-creation receipt per newly created contact,
   containing operation identity/time and hashes of the exact canonical name,
   role, email, phone and profile values. Nullable values have nullable hashes.
   This records only the initial explicit creation, not a generic future field
   edit or a backfilled origin flag. A current value receives a manual basis only
   when its hash matches its receipt. Changed or legacy values remain unknown.
   Store no duplicate raw contact values or invented public/license metadata.
3. Add contiguous SQL migrations for the receipt table and insertion/update/
   deletion guards. Validate live contact ownership, initial manual confirmation,
   nullable-field presence and creation audit correlation; prevent detached
   receipt removal while allowing whole-contact/vault deletion. Application and
   concrete adapter independently validate hashes against exact values in the
   creation transaction. No migration classifies existing rows as manual.
4. Implement the concrete SQLite workspace port: check the sole physical vault
   root and selected company/contact state in the same transaction; reject stale,
   archived, missing, replaced or ambiguous context before effects. Atomically
   create contact plus receipt and validate exact readback before commit. Notes
   updates require the captured row version and monotonic audit time and cannot
   change methods, confirmation, confidence, company or receipt. Selected reads
   use one bounded receipt lookup, not unbounded provenance/history preload.
5. Extend human-readable export with the receipt dataset and a new fully guarded
   schema milestone, retaining every previously supported milestone including
   schema160. Preserve the old158/159/160 recovery fixtures; prove forward
   migration leaves their basis unknown. Update current schema/file-count pins
   only where they mean current state, not historical fixtures or unrelated
   numeric UI limits. Prove JSON/CSV, SQLite backup/restore and deletion retain
   or remove receipts consistently with their contacts.
6. Add application rejection/copy/redaction tests and shared actual-SQLite
   contract cases for nullable/exact fields, manual-value binding, legacy
   unknowns, root/company/contact lifetime, rollback, stale notes, immutable
   evidence, export/restore and cascade deletion. Advance all shared inventory
   pins together and prove identical browser/Firefox/native execution. Run
   focused types/lint/contracts and full `pnpm verify`, serial extension/final
   policy, then a separately identified exact commit/hosted run. Attach actual
   terminal results before claiming this prerequisite complete.

Normal contact forms/directory selection, source-backed field provenance paging,
relationship navigation and interaction history remain subsequent required
INT-007 work. This prerequisite is not full Network completion. It must not show
unknown methods as approved, preload private contact details in directory pages,
infer totals or license basis, or seed demonstration records. Installed WebView,
manual assistive-technology/usability, reference-hardware and release gates remain
separate from automated engineering proof.

## Results

### Corrected successor pushed — exact hosted proof passed

Normal contact runtime plus lossless simulated-host correction is now pushed as
`f5e6868e2ba4b1593c74d77d9a5787a73404b7cb`, with complete local61038, serial
extension9483 and final policy54501 consumed success. Exact new CI39706346305 is
terminal success; watch76581 consumed exit0 with `NORMAL_CONTACT_RUNTIME_PROOF_WIRE_HOSTED_EXIT=0`.
[Exact successor scope and run](normal-contact-runtime-verification.md#exact-pushed-checkpoint--hosted-verification-in-progress).
This closes hosted proof only for f5e6868;74131a1/39701516359 remains failed and all discarded-trial
evidence is retained. No original assertion or production IPC/restore validator
was weakened. Full INT-007/INT-008 remain open.

### Corrected normal-runtime graph passes the whole local gate

Newer normal-contact composition and lossless simulated-host transport pass
complete61038, `NORMAL_CONTACT_RUNTIME_PROOF_WIRE_FULL_VERIFY_EXIT=0`:199 files /
2383 unit and coverage cases, all58 resilience and every supported full-gate
stage. Full-sequence legacy review is1026.1ms at the unchanged five-second
assertion; production restore/core/IPC remain as74131a1. [Exact new-source proof](normal-contact-runtime-verification.md#complete-final-source-local-verification--2026-10-21).
Serial extension9483 passes all9 cases/28.3s, consumed exit0; final policy/new
exact commit/hosted execution remain. The old74131a1 run39701516359/watch76891 is
consumed failure, not closure.
Only result docs follow frozen source/tests/helpers; full INT-007 stays open.

### Lossless proof-host correction — focused verification

The single-inspection trial below is **not retained and is not the fix**. Its119
focused cases,35 types/lint and five normal browser/native journeys pass, but
legacy review remains3949.7ms versus3829.2ms before: no demonstrated timing gain.
Retain `contact-workspace-single-preview-*` logs as abandoned-trial evidence.
Remove only our trial's core/coordinator API/types/tests via scoped apply_patch;
those five tracked files now match74131a1, and rebuild storage-core before new
proof. No existing product validator, schema, protocol or fixture is changed.

Inspection identifies the asymmetric simulated-host transport: responses already
cross Playwright as JSON strings, but requests still cross as nested objects
containing millions of individual byte-array elements. Extract that existing host
setup into `e2e/native-proof-host.mjs`; a regression against its unchanged request
path fails because the exposed function receives three recursive arguments,
`CONTACT_WORKSPACE_PROOF_REQUEST_WIRE_BEFORE_EXIT=1` (five other cases pass).
Serialize the complete JSON argument tuple as one string and decode to the exact
original command/request/document identity **before** actual Rust dispatch. This
does not change production Tauri IPC or remove any production protocol validator.
Six VM wire/fallback tests plus original restore/contact/timing contracts pass116
cases, `CONTACT_WORKSPACE_PROOF_REQUEST_WIRE_AFTER_EXIT=0`. Final lint-clean
constructor/global qualification retains every forbidden fallback; the same116
cases pass again, `CONTACT_WORKSPACE_FINAL_PROOF_WIRE_CONTRACTS_EXIT=0`, and direct
strict new-file lint passes `NORMAL_CONTACT_RUNTIME_FINAL_DIRECT_LINT_EXIT=0`.
No suppressions or policy changes are used.

Actual serial51589 passes five targeted normal browser/native journeys in54.2s,
`CONTACT_WORKSPACE_PROOF_WIRE_BROWSER_NATIVE_EXIT=0`: normal contact APIs, native
current-archive same-vault/clean-target save/restore, preserved160 native review/
commit/reopen and offline clean-browser160 restore. Original five-second review
and120-second journey budgets remain. Measured review becomes638.1ms same-vault,
703.1ms empty-target and1020.1ms legacy; legacy Rust inspection421.6ms/target30.1ms
remains comparable, with unchanged source160/reopened164, explicit different-vault
confirmation and no receipt backfill. Retained
`contact-workspace-proof-wire-native-observation.log` records1117 legacy IPCs,
1549 Network IPCs, zero OPFS/persistence/SW/Worker fallback and zero external
requests. These are local synthetic diagnostics, not a reference-hardware or
installed-WebView performance claim. Only new hosted execution can close the
original Chrome regression.

Freeze runtime source/tests/proof helpers after final review for a fresh complete
gate; only result documents follow. Exact failed74131a1/watch76891 remains
terminal failure. Full verification, serial extension/final policy/new exact
commit/hosted proof and full INT-007/INT-008 remain open.

### Exact hosted run terminal failure and measured correction plan

Watch76891 is consumed **exit1**, `CONTACT_WORKSPACE_HOSTED_EXIT=1`; do not resume
it. Exact74131a1 CI39701516359 is terminal failure only in Chrome151/152's native
legacy restore review. Aggregate, all native package jobs, both Firefox jobs,
extension and full-history secrets pass; PR-only review is skipped. This is not
hosted prerequisite closure.

Local diagnostic28672 is consumed exit0,
`CONTACT_WORKSPACE_LEGACY_NATIVE_STAGE_OBSERVATION_EXIT=0`. The unchanged
five-second assertion sees reading at33.1ms, inspecting at436.4ms and review at
3829.2ms. Native inspection takes439.3ms, target30.4ms and selected read/release
about190.8ms. This proves a small local margin and substantial work outside the
Rust operations, not a precise hosted CPU attribution. The source visibly runs
complete ZIP/path/manifest/checksum inspection in both the normal coordinator and
core preview. A same-assertion real-digest regression fails against unchanged
coordinator with two archive-sized digests instead of one,
`CONTACT_WORKSPACE_DUPLICATE_PREVIEW_BEFORE_EXIT=1`.

Before product correction, activate the bounded plan: let core preview accept an
explicit reviewed older-source list and either its existing port or a lazy port
factory. Validate/copy the full archive once **before** invoking that factory;
give it only frozen validated source identity/schema/database hash. Bind the
resolved port and exact actual source schema to the private preview capability.
Normal composition can then build its original target-owner guard and DTO from
that validated metadata without a separate complete inspection. Defaults remain
exact-schema; all entry/path/size/checksum and SQLite integrity/schema/vault checks
remain; commit still revalidates retained bytes, exact target and confirmation.
Do not accept caller-fabricated inspected archives or introduce a cache/skip flag.
Prove lazy ordering, malformed/tampered input rejection before port creation,
source-list/byte/callback copies, source160 commit identity, exact one-pass digest,
existing lifetime/target/rollback behavior and actual normal browser/native
restores at unchanged budgets. No schema, permission, dependency or Accepted
decision change. Fresh whole/serial extension/policy/new exact hosted proof is
required after correction; failed74131a1 remains failed.

### Hosted Chrome legacy-restore failure — investigation in progress

Exact74131a1 run39701516359 remains live under watch76891. Chrome152 job
119571599961 and Chrome151 job119571600091 are terminal **failure**: each passes
56 resilience cases and fails only the new native schema160-to164 restore path,
waiting five seconds for `Review exact restore changes`. Preceding storage/shared
manifest, document, UI and shell stages pass. Native Windows/Linux/macOS package,
Firefox153/154, extension and full-history secret jobs pass; aggregate remains
running. Do not mistake those job results for overall success.

Terminal job logs are retained as
`contact-workspace-hosted-chrome152-terminal.log` /
`contact-workspace-hosted-chrome151-terminal.log`. The152 synthetic diagnostics
artifact12393916751, SHA-256
`d54d81f9d375836ec2a0c351bb881e8f1ec6fa55130ff815cb69ea1971199073`, is downloaded
under `contact-workspace-hosted-chrome152-failure`. Its exact UI snapshot shows
the restore still **inspecting archive contents and the current target** at the
assertion failure, not an invalid/unsupported response. Timing/resource cause is
not yet established; no budget, checksum, compatibility or target guard is waived.

The newer independent normal contact runtime composition separately passes its
focused tests and actual normal browser/native API/reload journeys; it does not
change this immutable failed Chrome source. Freeze that newer product source
while extending existing allowlisted content-free native restore observation to
the `legacy_source` path with the original click/assertion unchanged. Local probe
28672 is live, requiring `CONTACT_WORKSPACE_LEGACY_NATIVE_STAGE_OBSERVATION_EXIT`.
Observe the existing workflow/watch to terminal and retain every failure.

### Exact pushed checkpoint — hosted verification in progress

Commit `74131a1816498b36e6df33a9f5c391f9f8598294`
(`feat: persist scoped contact workspaces and manual-entry evidence`) contains
54 reviewed implementation/test/migration/fixture/Changeset/proof files. Normal
push advances origin/main from ed5d733 to74131a1 without force; the working tree
was clean after commit and recovery stash2697 remains intact. No unrelated files
are included. Local full52897, extension82245 and final policy62932 are consumed
successes; they must not be resumed.

Exact [Foundation CI39701516359](https://github.com/seabAu/Coredrill/actions/runs/39701516359)
verifies this SHA, not the predecessor. It is **in progress**, not success.
Watch session76891 writes `contact-workspace-hosted-watch.log`; require
`CONTACT_WORKSPACE_HOSTED_EXIT`. Observe that same handle without restarting for
an observation timeout. No successor push may supersede this run. Only result
documents follow the frozen source; full INT-007, INT-008 and release/external
evidence gates remain open.

### Locally verified checkpoint ready for exact commit

Final formatting and policy session62932 is consumed **exit0**,
`CONTACT_WORKSPACE_HARDENED_FINAL_POLICY_EXIT=0` in
`contact-workspace-hardened-final-policy.log`. Root formatting,19 boundary
policies, foundation inventory (52 direct dependencies,3 toolchains,16 execution
targets,10 accessibility cases),831 npm /498 Rust license checks and the final
workspace secret scan pass. `git diff --check` passes. Remote main still equals
the predecessor `ed5d73332ea397025ae63d53012579486877e575`; recovery stash
`2697ebcec53351a052d8c5c19e2b8e2a52056a70` is unchanged. No old158/159/160 fixture,
package manifest/lockfile or Accepted ADR changes are present.

The complete hardened full gate52897 and serial extension82245 are consumed
successes on the unchanged product source/tests/SQL/fixtures. Only these result
records follow. Normal non-force commit/push remains authorized; the next exact
commit and new hosted run must be identified and observed separately. This is
not yet hosted closure, full INT-007 completion or release readiness.

### Complete hardened local verification — 2026-10-21

Session52897 is consumed **exit0**, with
`CONTACT_WORKSPACE_HARDENED_FULL_VERIFY_EXIT=0` in
`test-results/contact-workspace-hardened-full-verify.log`. This supersedes its
live status below; never resume it. The complete frozen hardened graph passes:
197 unit files /2318 tests in both unit and coverage runs,35 typecheck tasks,
22 lint/build tasks,7 UI foundations,76 shell,1 diagnostic performance,
57 resilience,7 onboarding,13 document-browser and12 browser-storage cases.
Actual native storage passes20 tests; Rust core passes24 with one intentional
secure-storage exclusion exercised separately by the redacted harness. Native
credential lifecycle, atomic archive/backup recovery, contract schemas,
831-package /498-crate license policies, secrets, dependency audit and Changesets
status all pass. npm reports no known vulnerabilities; Cargo retains the same
10 reviewed allowed warnings (nine unmaintained, one glib unsoundness warning).
Existing build chunk/import and terminal color warnings are not hidden.

Retained `contact-workspace-hardened-full-native-observation.log` decodes the
actual normal runtime attachments. The prior-schema journey performs1125 real
Rust IPCs, keeps explicit different-vault confirmation, restores source160 and
deliberately reopens164 without receipt backfill; OPFS/persistence/service-worker/
worker calls and external requests are zero. Its source archive is synthetic;
the host selection is simulated, not an installed picker/WebView claim.

Serial extension session82245 is consumed **exit0**, all9 cases pass in26.6s,
`CONTACT_WORKSPACE_HARDENED_EXTENSION_EXIT=0` in
`contact-workspace-hardened-extension.log`. Chromium capture/review/transfer,
hostile-page bounds and the Firefox manual fallback all pass; fallback durable
schema is164. Source/tests/SQL/fixtures remain unchanged; only result docs follow.
Final policy, exact commit/push and new hosted proof remain. Full INT-007 and
INT-008 remain unchecked; earlier failed candidate results remain failed, not
superseded into success.

### Hardened receipt checkpoint — renewed complete gate required

Fresh hardened full verification is live under session52897 /
`contact-workspace-hardened-full-verify.log`; require
`CONTACT_WORKSPACE_HARDENED_FULL_VERIFY_EXIT`. Observe this exact handle without
restarting on an observation timeout. Corrected source/tests/SQL/fixtures are
frozen; only result docs follow. Closed76626 stays failed and must not resume.

Both executable regressions fail against unchanged original SQL,
`CONTACT_WORKSPACE_ALTERNATE_KEY_BEFORE_EXIT=1` (two failures), and pass after the
narrow correction, `CONTACT_WORKSPACE_ALTERNATE_KEY_AFTER_EXIT=0` (two passes).
The same tests explicitly disable recursive triggers; no pragma/policy setting
is broadened. SQL161 now uses `STRICT, WITHOUT ROWID`; SQL162 rejects either an
existing contact or operation key before insertion/replacement. Shared v14/32
also exercises alternate operation-key replacement, absence of rowid and exact
unchanged snapshots while retaining whole-contact cascade deletion. No previous
committed migration changes. Updated161/162 hashes are
`f7aa85d0d30b98a6a83f791c6893e1f04ed268f1ab357fba6be44b6b8ac82d6c` /
`102b4d81955beb649425e43be2de567c93c256263977e6761bd00e1d8122b29f`.

The browser's explicit dataset name list/counts now include the new receipt,
retaining exact equality rather than relaxing it. All12 browser-storage cases
pass in55.0s, `CONTACT_WORKSPACE_HARDENED_BROWSER_STORAGE_EXIT=0`; all20 native
storage cases plus24 Rust-core passes/one intentional ignore pass,
`CONTACT_WORKSPACE_HARDENED_NATIVE_STORAGE_EXIT=0`. Both execute the complete
v14/32 inventory, preserved158/159/160 upgrades and exact new164 receipt recovery.
Fast integrity/repository/inventory tests pass all23 cases,
`CONTACT_WORKSPACE_HARDENED_FAST_SQLITE_EXIT=0`. Current storage production/test
types and strict source lint pass. Both normal browser/native160-to164 restore/
reopen journeys repeat successfully in32.4s with unchanged budgets and exact
canonical/CSV/attachment/migration checks,
`CONTACT_WORKSPACE_HARDENED_NORMAL_RESTORE_EXIT=0`.

Only the new164 fixture is regenerated after retaining the initial candidate.
Final candidate archive is1,850,514 bytes, SHA-256
`e970b4237c9b69f9d72a48fd4e603cafbae13303c2c46e8fb35f7d3ed0171027`,
SQLite SHA-256`37b73a64658dfdbc88a58fdafc5e88154820133ab7febf57acb83f63e0869704`.
Canonical content SHA-256 remains
`de0cdadec230b30433bb68e99f06b143d8eea31b1faf39984fc2dfe6fc281ac1`:
the reviewed physical/key guard change does not change user dataset values.
The old158/159/160 archives and JSON remain unchanged. This closes only the new
receipt's observed alternate-key paths, not a general audit of every older
immutable table or an installed-runtime/release security claim.

Freeze corrected product source/tests/SQL/fixtures for a **new** complete gate;
only result docs follow. Closed76626 is consumed failure before hardening and is
not final-source proof. Serial extension/final policy/new exact commit/hosted
verification remain. Full INT-007/INT-008 remain unchecked.

Candidate gate76626 is now consumed **exit1**,
`CONTACT_WORKSPACE_FINAL_FULL_VERIFY_EXIT=1`. It passes196 files/2316 unit cases
and coverage,35 types,22 lint/build tasks,7 UI foundations,76 shell,1 performance,
57 resilience,7 onboarding and13 document-browser cases. Browser-storage has11
passes and one stale assertion: the correct58 datasets/new receipt name and58
JSON/CSV projections are compared with old57 inventory expectations. Later gates
are not run by this command. Do not call it full success or resume its handle.
The actual JSON/error snapshot and initial164 archive/metadata are retained in
`test-results/contact-workspace-candidate-full-failure` before regeneration.
The source freeze ends on this terminal result; add the required receipt
regressions/hardening and exact dataset correction before fresh complete proof.

### Alternate-key receipt replacement finding — do not ship current candidate

During live candidate gate76626, source remains unchanged. An isolated in-memory
Node SQLite probe applies the actual SQL1–164, creates two synthetic initial
manual contacts and one receipt, and disables recursive triggers explicitly to
match ordinary SQLite behavior. Direct receipt deletion rejects correctly.
However, `INSERT OR REPLACE` using the other contact with either the existing
unique operation ID or the hidden rowid deletes the old receipt while its contact
still exists. Actual observations:

```json
[
  {
    "mode": "operation_unique",
    "directDeleteRejected": true,
    "replaceRejected": false,
    "oldContactRetained": true,
    "oldReceiptRetained": false
  },
  {
    "mode": "hidden_rowid",
    "directDeleteRejected": true,
    "replaceRejected": false,
    "oldContactRetained": true,
    "oldReceiptRetained": false
  }
]
```

The [official conflict semantics](https://www.sqlite.org/lang_conflict.html)
explain that replacement deletion invokes delete triggers only with recursive
triggers enabled. The existing insertion guard catches only contact-key
replacement, not the other unique key or hidden rowid. Normal application commands
already reject duplicate identities and never use REPLACE; no released/user-data
incident is established. The uncommitted storage-level immutability promise is
nevertheless incomplete, so this candidate must not ship even if76626 succeeds.

Observe76626 to terminal result without changing its sources or relabeling it as
proof for a future correction. Then add executable alternate-key regressions
against the unchanged candidate, preserve the failures, and harden the insertion
guard for both declared unique identities. Use the natural contact primary key
without a hidden rowid; [WITHOUT ROWID](https://www.sqlite.org/withoutrowid.html)
and [STRICT tables](https://www.sqlite.org/stricttables.html) are supported by the
already selected SQLite engines. This is internal storage representation within
D-030, not a dependency/platform/permission or Accepted decision replacement.
No previously committed migration changes: SQL161–164 are still this task's
unreleased candidate. Regenerate only the new164 synthetic fixture after retaining
the earlier candidate, update its reviewed hashes and rerun focused concrete/
recovery/normal-restore plus a fresh complete final-source gate. Preserve all
158/159/160 fixtures and original checks/budgets. No final prerequisite completion
or new hosted success is claimed.

### Final-source freeze and review

Complete final-source verification is live under session76626 /
`contact-workspace-final-full-verify.log`; require
`CONTACT_WORKSPACE_FINAL_FULL_VERIFY_EXIT`. Observe this same handle; do not
restart an observation timeout. Source/tests/SQL/fixtures stay frozen. Serial
extension/final policy and new exact commit/hosted evidence follow only after
terminal results. Predecessor watch73420 is consumed success, not a live handle.

Product source/tests/SQL/fixtures are frozen for a fresh full `pnpm verify`.
Only result documentation follows unless a terminal failure requires a scoped
correction and another complete gate. No complete final-source or new hosted
pass is claimed. The earlier2298-unit pass predates the final compatibility tests.

Final review adds shared raw nullable/audit/UUID receipt rejection, exact original
160-ledger checksum preservation, archived/future-company rejection, foreign/
missing/replaced-root selected reads and unchanged canonical snapshots. The
reviewed full fast v14/32 inventory passes,
`CONTACT_WORKSPACE_FINAL_REVIEWED_FAST_CONTRACT_EXIT=0`. All35 current workspace
types pass, `CONTACT_WORKSPACE_FINAL_REVIEW_TYPES_EXIT=0`. Regular22-package plus
tooling lint passes, `CONTACT_WORKSPACE_FINAL_REVIEW_LINT_EXIT=0`; root formatting
passes `CONTACT_WORKSPACE_FINAL_REVIEW_FORMAT_EXIT=0`. Full verification repeats
those checks and actual concrete contracts against final source.

An extra direct lint invocation outside the regular e2e scope finds13 existing
native-file and7 existing browser-file issues plus one new helper's unqualified
TextDecoder. The helper now imports the Node utility explicitly and passes strict
lint. Both original HEAD files independently reproduce the same13/7 baseline
counts (`contact-workspace-head-native-runtime.spec.mjs-lint.json` and
`contact-workspace-head-stored-vault-restore.spec.mjs-lint.json`). Those pre-existing
out-of-workflow issues are not a newly passing gate or silently suppressed;
regular lint/configuration and unrelated old source remain unchanged.

### Reviewed normal legacy restore correction — focused proof

The inspector now accepts at most15 unique explicitly reviewed older source
versions in addition to the expected current version. It copies them before
hashing, rejects malformed/current/future/duplicate/unbounded values and retains
all default exact-schema, checksum/path/size/entry/database guards. Normal runtime
composition activates only160 alongside current164. Preview and commit retain
the validated160 source; the deliberate reload applies161–164 and normal root
operational metadata refresh. This does not activate every historical export
milestone or reinterpret stored contact values.

Core/composition focused proof passes41 cases,
`CONTACT_WORKSPACE_LEGACY_RESTORE_CORRECTED_CONTRACT_EXIT=0`. The first run has39
passes/two fixture expectation failures and is retained under
`CONTACT_WORKSPACE_LEGACY_RESTORE_BOUNDARY_EXIT=1`: public application errors map
unsupported archives to `unavailable` with explicit compatible-build wording,
and the existing commit payload carries source schema in `database.schemaVersion`,
not a nonexistent public `expectedSchemaVersion` field. Tests now assert the exact
existing public contracts; no product guard was changed for those corrections.

The first normal UI attempt is consumed failure,
`CONTACT_WORKSPACE_NORMAL_SCHEMA160_RESTORE_EXIT=1`. Native reaches an incorrect
test selector for Settings nested inside Primary navigation and exhausts the
unchanged120s case budget before restore. Browser completes restore/reopen/export,
then the new helper incorrectly expects the preserved vault root stamp to be160;
the archived root actually retains1 while SQLite/manifest migration level is160.
Its original JSON and both error snapshots are retained separately in
`test-results/contact-workspace-normal160-first-failure` before the next resilience
run. The selectors and reviewed root-stamp comparison are corrected, with no
product change, timeout increase or assertion removed.

Both actual normal browser/native journeys then pass in30.3s,
`CONTACT_WORKSPACE_NORMAL_SCHEMA160_CORRECTED_FIXTURES_EXIT=0` in
`contact-workspace-normal-schema160-corrected-fixtures.log`. Exact160 source
review/commit, deliberate164 reopen, every old JSON record/column/metadata and
non-root CSV byte, reviewed root metadata CSV changes, exact added migration
names/checksums/stamps, both unchanged attachment payloads and the empty receipt
JSON/CSV are checked. Browser starts clean/offline without setup/account;
native uses the normal distinct different-vault warning and confirmation. The
separate same-schema helper is unchanged. Native source is honestly a preserved
synthetic archive, not a fully unseeded source-creation journey or installed
picker/WebView proof.

Retained `contact-workspace-normal160-native-observation.log` decodes the actual
native attachment before later resilience runs overwrite it:1117 real Rust IPC
invocations, source160/reopened164, explicit different-vault confirmation,
no receipt backfill, one held-BEGIN retirement, two retired documents, zero
OPFS/persistence/service-worker/Worker fallback calls and zero external requests.
Full final-source checks and exact new hosted evidence remain.

### Normal restore compatibility finding — scope refinement before commit

Current browser recovery passes all four preserved158/159/160/new164 cases,
`CONTACT_WORKSPACE_BROWSER_RECOVERY_SCHEMA164_EXIT=0`; the separately named new
fixture is1,858,706 bytes, archive SHA-256
`cd8556fa7e34e884dfa1239189436b8c7dc0365d010e509091112ccbaea11f23`,
database SHA-256`dc3c22e593e91ebe3efdb6e3056b4666edb64b85b148b9f5a62f5dc92d81198e`,
content SHA-256`de0cdadec230b30433bb68e99f06b143d8eea31b1faf39984fc2dfe6fc281ac1`.
Every canonical dataset/ledger compares exactly across new164 restore, including
the nonempty manually created contact/receipt; legacy upgrades add only an empty
receipt dataset. All three old archive/JSON files remain unchanged. Full native
storage then passes20 cases plus24 Rust-core passes/one intentional ignore,
`CONTACT_WORKSPACE_SCHEMA164_NATIVE_DECLARED_BOUNDARY_EXIT=0`. Its earlier attempt
`CONTACT_WORKSPACE_SCHEMA164_NATIVE_FULL_EXIT=1` fails module resolution before
tests because the test tried to import an undeclared application package. Rather
than adding a production dependency for an assertion, recovery now independently
compares the exact contact/receipt values and SHA-256s in native SQLite through
the already declared storage boundary. All archive/content/row assertions remain.

The complete unit suite passes196 files /2298 cases,
`CONTACT_WORKSPACE_SCHEMA164_UNIT_EXIT=0`. The actual browser v14/32 inventory
passes in17.2s, `CONTACT_WORKSPACE_BROWSER_CONTRACT_EXIT=0`; filtered actual-native
v14/32 passes its selected suite (18 other wrappers not selected) plus24 Rust-core
passes/one intentional ignore, `CONTACT_WORKSPACE_NATIVE_CONTRACT_EXIT=0`.

Read-only inspection of `stored-vault-restore.ts` then finds the normal workflow
still inspects only its current schema, unlike the explicit recovery harness.
Without a correction, this upgrade would reject the immediately preceding
schema160 user backup in normal restore. Add a bounded, copied explicit older-
schema inspection allowlist, keep default exact-schema behavior and every
checksum/path/size/database/target/commit guard, and compose only reviewed160
alongside current164 in the normal runtime. Preview/commit must retain the
validated source schema; deliberate reopen runs the ordinary forward migrations.
Do not activate every historical export milestone or retry decompression against
a guessed list. Prove strict/default rejection, explicit compatibility, malformed/
mutated lists and corrupt payloads, then normal browser/actual-native legacy
restore/reopen with no receipt backfill. This is a necessary migration-compatibility
refinement of this slice, not permission, dependency, connector or Accepted
decision expansion. Do not claim normal legacy UI success from the harness pass.

### Schema164 local checkpoint

SQL161–164 and the concrete selected-contact port are implemented locally, with
one immutable manual-creation receipt, independent in-transaction hash validation,
same-root rechecks before write acknowledgement and guarded notes-only mutation.
The complete shared inventory is advanced together to v14/32 /11 components across
Chromium, Firefox and actual-native explicit pins. All six inventory guards pass.
Schema164 adds58 datasets /116 files; schema160 remains57/114 with no receipt query.
Earlier158/159/160 export fixture comparisons remain;161–163 reject as incomplete.
The migration README records exact hashes, and no prior SQL file changes.

Expanded application proof passes123 cases (79 new /44 existing),
`CONTACT_WORKSPACE_APPLICATION_EXPANDED_FOCUSED_EXIT=0`; the first expanded test
typecheck catches missing annotations/intentional unsafe fixture casts and is
retained as `CONTACT_WORKSPACE_APPLICATION_EXPANDED_TYPES_EXIT=2`. Corrected
fixture annotations pass `CONTACT_WORKSPACE_APPLICATION_FINAL_TYPES_EXIT=0`.
Initial production lint reports four strict issues; explicit unknown-boundary
validation, projection and narrowing corrections pass
`CONTACT_WORKSPACE_APPLICATION_CORRECTED_LINT_EXIT=0`, with no rule suppression.
The complete schema164 workspace typecheck passes all35 tasks,
`CONTACT_WORKSPACE_SCHEMA164_TYPES_EXIT=0` in `contact-workspace-schema164-types.log`.
New storage sources also pass strict scoped lint after fixing a no-await test
wrapper and redundant narrowing; no policy/configuration changes.

The first fast shared run fails an older index test's implicit latest migration
followed by its unchanged schema160 assertion. Explicitly targeting160 preserves
that historical migration/ledger/index test rather than relabeling it164.
The second attempt reaches the new contact case and exposes the synthetic fast
adapter's deliberately unsupported portable export. The adapter now performs a
real bounded temporary SQLite backup using the [pinned Node24.19 API](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html#sqlitebackupsourceDb-path-options),
reads/checksums its bytes, and removes only its own known file/empty directory;
no dependency/runtime implementation or assertion is replaced. Both failures
remain in `contact-workspace-fast-sqlite-contract.log` /
`CONTACT_WORKSPACE_FAST_SQLITE_CONTRACT_EXIT=1` and
`contact-workspace-fast-sqlite-explicit-160-stage.log` /
`CONTACT_WORKSPACE_FAST_SQLITE_EXPLICIT_160_STAGE_EXIT=1`.

The unchanged full v14/32 inventory then passes in real fast SQLite:
`CONTACT_WORKSPACE_FAST_SQLITE_BACKUP_CONTRACT_EXIT=0` in
`contact-workspace-fast-sqlite-backup-contract.log` (one selected suite wrapper;
14 unrelated wrapper tests are not selected, not platform skips). The new two
shared cases prove schema160 compatibility/legacy unknowns, exact scoped creation,
selected-company versions, contact/receipt/root/acknowledgement rollback, independent
hash rejection, original-intent replay rejection, read-only selected facts,
current paired exports, actual SQLite backup metadata, immutable evidence,
notes/method tamper rollback, archive/stale/backwards/foreign rejection, changed
method unknowns and whole-contact cascade deletion.

Initial portable-data focused run has13 passes/one failed old158 expectation that
incorrectly equates a historical dataset count with the new global current list.
Retain `CONTACT_WORKSPACE_PORTABLE_DATA_FOCUSED_EXIT=1`. Freezing the existing158
count at57, keeping114 files and adding explicit receipt absence plus new164
receipt JSON/CSV/transaction and161–163 rejection tests passes all18 export/
inventory cases: `CONTACT_WORKSPACE_PORTABLE_DATA_SCHEMA164_EXIT=0` in
`contact-workspace-portable-data-schema164.log`. No old fixture is overwritten.

Concrete browser/native v14/32 execution, all current-schema runtime/recovery
assertion updates, separately named164 recovery fixtures with nonempty receipt
roundtrip proof, final full verification, serial extension/policy and exact new
commit/hosted run remain. No complete new-source or normal contact UI success is
claimed. The earlier application-only checkpoint below is historical.

The strict application contracts and reused contact scalar/manual-field rules
are implemented locally. Application and test typechecks pass. The first focused
run has113 passes and one fixture failure: the expected creation-port object
incorrectly includes `rowVersion: undefined`, while the real input correctly
omits that storage-owned field. Correcting the fixture to exact equality without
the field, plus explicitly asserting its absence, passes all114 cases (70 new,
44 existing APP-004), with no product change for that correction.

Retain `contact-workspace-application-focused.log` /
`CONTACT_WORKSPACE_APPLICATION_FOCUSED_EXIT=1` and
`contact-workspace-application-corrected-fixture.log` /
`CONTACT_WORKSPACE_APPLICATION_CORRECTED_FIXTURE_EXIT=0`. Tests exercise strict
scope/shape, exact/null methods, selected-company version, input/context copy
before hashing, malformed hashes, creation/notes acknowledgement, immutable
receipt copies, archive visibility, content-free failures and changed/legacy
value basis. They are adapter-neutral proof, not transactional SQLite evidence.

Predecessor ed5d733 CI39689728116 subsequently passes all required jobs;
watch73420 is consumed exit0 and must not restart. That immutable run predates
these contracts and cannot prove them. Receipt SQL migrations/storage adapter,
portable recovery changes, full final-source checks and normal contact runtime/
UI remain unimplemented. Record final migration numbers and executable evidence
here before claiming this prerequisite complete.
