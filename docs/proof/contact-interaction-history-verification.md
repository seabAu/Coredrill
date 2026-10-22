# Recorded contact interaction history — INT-007 in progress

## Authority, starting state and complete slice

The manual-contact checkpoint at160f031 passes exact CI39717538422 and all
required jobs; watch46181 is consumed exit0. Starting dirt is only our two
post-verification result documents. Preserve those documents and stash2697.
This plan activates the next local implementation slice and supersedes the
prior result-documents-only source freeze. New source needs new verification;
the closed run cannot prove it.

GOAL, the decision register, accepted ADRs and designs01/02/03/04/06/09/10
remain authoritative. The source-policy preflight finds only three reviewed
published-job connectors; no contact provider is thereby approved. Source-backed
field-use eligibility remains required independent work, never inferred from
source links, confirmation, confidence or a license note. This slice introduces
no source, permission, dependency, account, network, sending or AI behavior.

Implement recorded history end to end for an explicitly selected stored contact:

1. Add strict version-1 viewed-vault/contact/archive-scoped application page and
   full-summary-part queries. Default25/max100 live keyset pages order actual
   recorded occurrence descending then interaction ID ascending. Do not hide
   future-dated imported history behind an operation-time ceiling or claim an
   immutable snapshot. Copy/freeze scope before awaiting a port.
2. Return only interactions whose actual `contact_id` equals the selected
   contact. A shared company is not a conversation. Each interaction retains
   its job identity; joined job title/archive/version are current metadata,
   not historical employer facts. Explicit archive inclusion governs both
   selected contact and linked jobs. No totals, contact methods or notes are
   preloaded into history pages.
3. Keep summary previews bounded in UTF-8 bytes, with exact total byte length
   and explicit truncation. Offer separate bounded, scalar-safe literal parts
   for the full existing200,000-character summary; preserve BOM, embedded NUL,
   newlines and Unicode. Do not silently substitute a preview for the record.
4. Compose transactional parameter-bound SQLite reads. Recheck sole vault,
   contact ownership/archive state and scoped cursor anchor/version. Missing,
   ambiguous, replaced or stale owners must fail honestly. No history write,
   inferred relationship or canonical-store duplication is permitted. Measure
   query plans before deciding whether an additive index migration is needed.
5. Connect selected-contact history through the selected browser/native runtime
   with a disposable root-owned reader and explicit First/Next/Refresh/Retry and
   summary inspection. Retain read state through reflow, hide foreign/retired
   facts before publication and revoke stale asynchronous focus callbacks.
   Loading, empty, unavailable, stale and error states remain distinct.
6. Prove strict request/result/cursor and Unicode/byte-boundary failures;
   contact/job/archive/cross-vault isolation and late disposal; actual SQLite
   parity through Node/browser/native shared contracts; actual normal offline,
   reload, navigation,320px,keyboard/axe and real-Rust-process journeys.
   Seeded history fixtures must be disclosed separately from unseeded contact
   creation; this is not a claim that the normal recording composer exists.
7. Run complete final-source verification, serial extension, policy and an exact
   new committed hosted run before closing this slice. Update this proof and
   the living checklist with actual evidence, including failures and limits.

Normal recording commands/composer, remaining company relationships, source-backed
field-use/provenance and INT-008 Home remain required follow-through. This
read-history slice does not close full INT-007 or independent installed-WebView,
manual accessibility/usability, reference-hardware and release gates.

## Initial implementation order and risks

Start with the strict application contract and negative tests, then concrete
SQLite and actual adapter proof, then runtime/reader/UI and normal journeys.
An interaction's `job_id` is mandatory and `contact_id` is nullable in schema19;
the existing job timeline is not a viewed-vault/contact query and cannot be
reused by filtering one already-loaded job page. SQL text `length`/`substr`
cannot stand in for byte-safe summary inspection because embedded NUL changes
SQLite text-length behavior. Reuse the existing literal UTF-8 decoder instead.

The existing append-only interaction update guard and contact foreign key's
`ON DELETE SET NULL` also need an actual-SQL integrity check before any future
individual-contact deletion feature; inspection alone does not establish a
runtime failure or authorize rewriting history in this read-only slice.

## Results

### Exact hosted closure and read-history requirement disposition

Read-history engineering closes at
`d3950dcdeb31bfb86c044f8f897c78e6e6669b44`, exact
[Foundation CI39732550313](https://github.com/seabAu/Coredrill/actions/runs/39732550313).
Workflow, all ten required jobs and parent check suite107679410806 are inspected
terminal success at that complete SHA. The eleventh, PR-only dependency review,
is intentionally skipped on push. Watch79664 is consumed exit0 with
`CONTACT_HISTORY_EXACT_HOSTED_WATCH_EXIT=0`; log collection70039 also finishes
exit0. No live handle remains to resume. Final authoritative state is retained
in `contact-history-exact-hosted-final.json` and
`contact-history-exact-hosted-parent.json`.

Complete job logs are retained as
`contact-history-hosted-{aggregate,chrome151,chrome152,firefox153,firefox154,windows,macos,linux,extension}.log`.
Inspection confirms:

- Aggregate unit and coverage each pass2,585 cases with one pre-existing
  platform skip,207 files. The full gate includes76 app-shell and70 resilience
  cases. Aggregate job119670672693 finishes in28m42s, inside the unchanged30m
  budget. npm has no known vulnerabilities; the same10 reviewed Cargo warnings
  remain. No check, timeout or dependency selection is weakened.
- Exact Chrome151.0.7922.138 and152.0.7977.54 each pass all76 app-shell and70
  resilience cases, including new populated history, exact retry, late-page and
  late-summary retirement, actual-Rust history and both160/164→165 normal
  restore/reopen journeys. Both original selected-contact/company focus
  regressions remain in the successful run.
- Exact Firefox153/154 each explicitly return schema165, repository manifest
  v15/34, career manifest v3/4,58 datasets/116 files, preserved restore guards
  and unchanged global schedule behavior. Their runner retains exact case-list
  equality and explicit reviewed version/count assertions.
- Windows passes21 native cases; macOS/Linux each pass20 plus the existing
  platform skip. All use the same new34-case repository inventory. Secure-store
  lifecycles pass against Credential Manager, Keychain and FreeDesktop Secret
  Service without secret exposure; native backup/package/launch proofs pass.
  Extension transfer/source-package proof passes all nine cases.

Requirement disposition for this bounded read-history slice:

1. Strict versioned page/summary boundaries, own keys, copied scope, exact live
   cursor and complete literal-byte invariants: covered by focused application/
   reader/runtime cases and final unit/coverage gates.
2. Actual contact links, current-job identity/labels, archive scope, no inferred
   conversations/totals or private contact-field prefetch: covered by shared
   Node/browser/native actual-SQL contracts and normal populated/empty journeys.
3. Bounded previews plus scalar-safe complete BOM/NUL/Unicode text and distinct
   empty/missing/error states: actual shared adapters and normal UI readback.
4. Transactional bound reads and justified index165: actual migration/rollback/
   older-runner tests, preserved recovery milestones, all canonical rows and
   receipts, normal source160/164 reopen, unchanged eight older archives/files.
5. Root-owned reader/view lifetimes, explicit first/next/refresh/retry, archive
   inclusion, full-summary inspection and safe focus: repeated local15-case
   runs and both exact hosted Chrome70-case resilience suites.
6. Offline/local reload, same-owner Back/reflow,320px/keyboard/axe and real-Rust
   execution: normal browser/native journeys, with synthetic populated archives
   disclosed separately from unseeded contact creation and empty-history proof.
7. Full final-source local gate, serial extension, final format/policy, ordinary
   reviewed commit/push, exact required hosted jobs and parent suite: all above.

This does not close full INT-007 or release acceptance. Recording interactions,
source-backed field qualification/provenance and remaining company relationships
remain required; INT-008 Home is separate. Installed WebView/manual AT/usability,
public signing/update and reference-hardware gates remain open. In particular,
the current Windows package diagnostic still reports `targetConformant:false`
(startup p95=571.7ms, working-set p95=381,169,664 bytes), as the predecessor also
did. NAT-007 requires an artifact and recorded measurements, not substitution
for Windows11/HW-WIN-REF release acceptance. Do not infer that the release
performance targets were met from a green package job.

No Accepted decision, dependency, provider or permission changes. The next
unblocked implementation preflight is scoped interaction entry. Read-only
inspection finds an existing `RecordInteractionCommand` and generic SQLite port,
but that generic port is not a viewed-vault/contact/job-version write boundary
and its command allocates an identity per execution. Do not expose it directly
or silently resubmit after uncertain acknowledgement. Read the governing
documents before choosing the fixed-intent/retry/recording UI plan. Only closure
documents change after d3950dc's verified implementation.

Post-closure whole-workspace formatting66349 and policy59547 are consumed
exit0: `CONTACT_HISTORY_CLOSURE_FORMAT_EXIT=0` in
`contact-history-closure-format.log` and `CONTACT_HISTORY_CLOSURE_POLICY_EXIT=0`
in `contact-history-closure-policy.log`. Boundaries, foundation records,831 npm/
498 Cargo licenses and secret scanning pass. Diff whitespace is clean; only
the seven inspected design/checklist/proof/runbook/recovery-README result
documents are dirty, to carry forward without overwriting them. HEAD remains
d3950dc and stash remains `2697ebcec53351a052d8c5c19e2b8e2a52056a70`.

### Exact pushed source and hosted verification — live

Historical in-flight checkpoints below are superseded by the terminal closure
above. Do not resume consumed79664 or re-run CI based on their pending wording.

The reviewed60-file change commits as
`d3950dcdeb31bfb86c044f8f897c78e6e6669b44` (`feat: read scoped contact interaction history`)
and pushes normally from160f031 to origin/main. The checkout is clean after
push; stash2697 is unchanged. No force push, history rewrite or dependency/
permission/source-provider change occurs.

Exact Foundation CI [39732550313](https://github.com/seabAu/Coredrill/actions/runs/39732550313)
is confirmed live at that complete SHA, not the predecessor. Watch79664 polls
at30s and writes `contact-history-exact-hosted-watch.log` with final marker
`CONTACT_HISTORY_EXACT_HOSTED_WATCH_EXIT`. It is still live; poll this exact
handle and do not restart on observation timeout. Workflow, parent suite and
every required job must be terminal success before read-history closure.
PR-only dependency review is intentionally skipped on push. All remote exact
browser/native/aggregate outcomes remain unclaimed until observed.

The parent check suite is107679410806. The compact exact-source snapshot in
`contact-history-exact-hosted-snapshot.json` identifies ten required jobs plus
the intentional PR-only skip. Both exact Firefox153/154 storage jobs and the
full-history secret scan are terminal success in that snapshot; the other seven
required jobs and the workflow are still in progress. These early successes do
not prove the complete run or its parent suite terminal conclusion.

A later exact-source progress snapshot in
`contact-history-exact-hosted-progress.json` confirms five of ten required jobs
terminal success: Firefox153/154, full-history secret scan, macOS package and
extension transfer. Chrome151/152, Windows/Linux packages and the aggregate
foundation gate are still live; no required job has failed in that snapshot.
Watch79664 remains live. This is partial hosted evidence, not closure.

Subsequent watch output confirms Windows and Linux packages and both exact
Chrome jobs terminal success as well: Chrome151 in18m2s and Chrome152 in19m0s,
including their PWA/resilience and first-run steps. Nine of ten required jobs
are now successful. Only aggregate119670672693 remains live; the workflow and
parent suite are not yet closed. Keep following the same watch without changing
timeouts, source or required checks.

Only result documents may change while this source is frozen. Do not start
the recording/source-qualification slice or attribute these newer facts to the
old39717538422 run. Full INT-007/INT-008 and external release gates remain open.

### Complete local gate and serial extension pass — 2026-10-22

Full final-source `pnpm verify`61518 is consumed exit0 in
`contact-history-final-verify-initial.log`,
`CONTACT_HISTORY_FINAL_VERIFY_INITIAL_EXIT=0`. No implementation changes occur
during this run. Types35 tasks, strict lint, all2,586 unit cases/207 files and
the same2,586 coverage cases pass, followed by build, contrast/extraction
reports, extension build/source-package review, seven UI-foundation cases,
76 app-shell cases, one performance case,70 resilience cases, seven onboarding,
13 document-browser and13 browser-storage cases. The latter includes preserved
158/159/160/164 upgrades, deterministic165 recovery and exact v15/34 parity.
Normal resilience includes both prior-schema165 reopen paths and all history
browser/native/late-owner/focus cases. Local primary browser is Edge155, not
an exact supported Chrome/Firefox hosted-floor claim.

Real-native storage passes21 cases plus24 Rust cases and the existing one
intentional core secure-store ignore. The separate redacted Windows Credential
Manager lifecycle proof then stores, retrieves inside Rust and deletes its
synthetic secret with no exposure. Native archive and managed backup recovery,
all generated contracts,831 npm/498 Cargo license checks, secret scan, npm
advisories and Changesets pass. npm reports no known vulnerabilities; Cargo
retains exactly the same10 reviewed warnings (nine unmaintained and one glib
unsoundness), not a newly clean Rust advisory graph or new release approval.

Separate serial extension62200 is consumed exit0/all nine cases28.1s in
`contact-history-final-extension.log`, `CONTACT_HISTORY_FINAL_EXTENSION_EXIT=0`.
The observed local extension engines are Chromium149.0.7827.55 and Firefox151;
exact hosted supported-version proof still remains. Current165 migration and
durable fallback expectations advance without permissions or manifest changes.

All eight old recovery ZIP/JSON hashes match the pre165 capture again:
`CONTACT_HISTORY_FINAL_OLD_FIXTURES_UNCHANGED=8` in
`contact-history-final-old-fixtures.log`. Stash2697 remains intact. Final
policy75207 and whole-workspace format9340 are consumed exit0 in
`contact-history-final-policy.log` / `CONTACT_HISTORY_FINAL_POLICY_EXIT=0` and
`contact-history-final-format.log` / `CONTACT_HISTORY_FINAL_FORMAT_EXIT=0`.
Diff whitespace is clean. Only result documents update after the full gate;
implementation stays unchanged. Origin/main is still exactly the reviewed
160f031 baseline. Reviewed staging/ordinary commit/push remain before
dispatching exact new hosted verification. Read-history closure
still requires that hosted run; full INT-007/INT-008 and external release gates
remain open. No dependency, permission, source provider or Accepted decision changes.

### Repeated normal history proof and final-source gate activation

Process10021 is consumed exit0/all15 serial executions in
`contact-history-ui-browser-native-repeated.log`,
`CONTACT_HISTORY_UI_BROWSER_NATIVE_REPEATED_EXIT=0`. Each of three repetitions
runs the actual-Rust populated journey and four browser cases: populated offline
history, exact continuation retry, late-page retirement and late full-summary
retirement. The two late-read cases preserve the newer contact's one actual
interaction, hide the retired owner's facts/summary and leave focus on the
newer contact's refresh control. The original focus assertions and time budgets
are unchanged. The corrected320px layout is visually inspected; the earlier
failure screenshots/reports remain separate, not overwritten or reclassified.

Freeze this coherent read-history implementation for complete final-source
`pnpm verify`, separate serial extension, final policy, then a reviewed ordinary
commit/push and new exact hosted proof. Do not infer a new hosted success from
the older160f031 run. A failed final gate must retain its diagnostics and be
corrected before claiming closure. No full INT-007, external release gate,
source-backed eligibility, recording composer or INT-008 completion is implied.

### Normal history UI browser/native execution and focus correction

The first browser run57733 finishes exit1 at30s after complete literal summary
and320px overflow/axe checks: its test incorrectly requests a direct mobile
Network link. Preserve `contact-history-ui-browser-initial.log` and the complete
`contact-history-ui-browser-initial-failure` directory/report. The corrected
mobile-menu run25082 also fails: top-level Network deliberately clears the
selected contact and company scope. Its expected retained summary therefore
contradicts the existing owner contract. Preserve
`contact-history-ui-browser-mobile-corrected.log` and
`contact-history-ui-browser-mobile-failure`. Do not change navigation to keep
retired-owner data. Browser Back returns to the same selection; that journey
35245 passes in `contact-history-ui-browser-owner-corrected.log`,
`CONTACT_HISTORY_UI_BROWSER_OWNER_CORRECTED_EXIT=0`, one case12.8s overall.

Expanded56675 finishes exit1/three pass/one fail in
`contact-history-ui-browser-native-expanded.log`,
`CONTACT_HISTORY_UI_BROWSER_NATIVE_EXPANDED_EXIT=1`. Real-native populated
history, actual browser failed-continuation retry and late-page owner retirement
pass, but browser exhausted-page focus sometimes restores before React commits
the re-enabled fallback control. Preserve the complete output/report under
`contact-history-ui-browser-native-expanded-failure`; do not weaken its original
five-second focus assertion. Move focus restoration to a post-render layout
effect, retaining mounted/current-owner checks and adding a per-interaction
generation that revokes older deferred callbacks.

Corrected52986 finishes exit0/all four cases26.7s in
`contact-history-ui-browser-native-focus-corrected.log`,
`CONTACT_HISTORY_UI_BROWSER_NATIVE_FOCUS_CORRECTED_EXIT=0`. Actual browser and
real-Rust native roots now pass the same synthetic populated-history journey:
actual explicit links, future/tied pages, archive inclusion, full BOM/NUL/Unicode
literal readback, no executable markup, same-owner Back/reflow retention,
keyboard focus,320px overflow/axe and canonical reload. Browser runs with its
cached service worker and emulated offline mode; native uses the disclosed
simulated host over real Rust SQLite, denies external requests and proves no
OPFS/Worker/service-worker fallback, not an installed WebView/manual picker.

The full unit sweep31535 passes all2,586 cases/207 files in
`contact-history-reader-ui-units.log`, `CONTACT_HISTORY_READER_UI_UNITS_EXIT=0`.
This precedes the focus-layout correction and does not substitute for its
final-source rerun. A new late-summary-owner case and three repetitions of
the five browser/native cases are observed separately. Full source, serial
extension, policy and new exact hosted verification still remain; no full
INT-007 completion, dependency, source/permission or Accepted decision change.

### Owned readers and normal panel — focused implementation checkpoint

The normal app shell now owns disposable history and full-summary readers
above destination/reflow rendering. The existing explicitly selected contact
read confirms vault/contact/company and current contact version before history
starts; no second methods/notes fetch or unfiltered company fallback is added.
Changed/failed confirmations hide prior facts synchronously and retire readers.
Page refresh/continuation closes an inspected summary. A selected summary binds
the complete viewed record/job/contact tuple and appends only validated bounded
literal parts. A new strict decoded-text DTO parser enforces exact fields,
scope, byte progress, scalar-safe size and truthful completeness. There is no
new durable representation or integrity-certificate claim.

The panel exposes first/refresh, next, retry, explicit archive inclusion,
current-job labels, bounded previews and separate summary byte progress with
continuation/close. It does not infer conversations or offer sending/recording.
Focus restoration is guarded by the mounted view and current reader lifetime.

Initial focused reader run fails3/76 because its synthetic decoded DTO omits
the required `nextByteOffset`; retain `contact-history-reader-focused.log`,
`CONTACT_HISTORY_READER_FOCUSED_EXIT=1`. Correct the fixture, not the decoder.
Corrected reader/runtime/contact-page regressions pass all76 cases/three files
in `contact-history-reader-focused-corrected.log`,
`CONTACT_HISTORY_READER_FOCUSED_CORRECTED_EXIT=0`. Cases include malformed/
foreign/version-shifted DTOs, exact failed-page/byte retry, empty versus missing,
BOM/NUL/Unicode reconstruction, single flight and late/reentrant disposal.

Initial workspace types fail on unbranded view scope IDs; the next run exposes
an extra `specVersion` property not belonging to the existing workspace-decoder
scope. Retain `contact-history-reader-ui-initial-types.log` and
`contact-history-reader-ui-types-corrected.log`, both exit2. Correct only that
scope's exact shape and branded IDs. Final types pass all35 tasks in
`contact-history-reader-ui-types-final.log`,
`CONTACT_HISTORY_READER_UI_TYPES_FINAL_EXIT=0`. Initial lint fails one confusing
void expression in a checkbox handler; braces fix it without suppression.
Retain `contact-history-reader-ui-lint.log`, exit1, and corrected
`contact-history-reader-ui-lint-corrected.log`,
`CONTACT_HISTORY_READER_UI_LINT_CORRECTED_EXIT=0`.

A separate populated-history test archive is generated only in test output
by cloning the verified165 recovery database, inserting disclosed synthetic
interactions and rebuilding every canonical JSON/CSV envelope and archive
checksum with the reviewed writer. The original recovery input has no
interactions and is never overwritten. This adds no product fixture installer,
storage API, source, permission or new dependency. Actual browser/native UI,
owner/focus/failure/reload/320px/axe results remain separately required, as do
full final-source/extension/policy/exact-hosted gates. No full INT-007 closure.

### Owned reader and normal UI implementation plan — 2026-10-22

Continue the existing end-to-end history slice with disposable page and literal
summary readers. Revalidate returned DTOs; retain only bounded ephemeral read
state, never canonical rows. Root ownership includes selected runtime, vault,
contact, company filter and contact revision, independent of route/reflow.
The existing explicit selected-contact lookup must confirm that company scope
before history begins; do not perform an unfiltered fallback or fetch private
methods again merely to page history. A changed/failed owner hides prior facts
before effect cleanup, disposes pending readers and revokes late focus callbacks.

Provide explicit first/next/refresh/retry, archive inclusion, current-job labels
and separate full-summary inspection with byte progress and bounded parts. Empty,
missing, loading, stale and unavailable states remain distinct. No composer or
inferred conversation is introduced. Add negative/lifetime/byte-boundary tests,
then actual normal offline/navigation/reload/320px/keyboard/axe and real-native
journeys, disclosing synthetic populated-history fixtures separately. These
steps do not close the slice before its complete final-source and hosted gates.

### Normal archive regression and lazy runtime composition — 2026-10-22

All12 normal browser export/restore regressions6438 finish exit0/39.4s in
`contact-history-schema165-normal-archive-regression.log`,
`CONTACT_HISTORY_SCHEMA165_NORMAL_ARCHIVE_REGRESSION_EXIT=0`. This includes
both prior-schema reopen cases plus existing offline, same/different-vault,
exact selected-copy verification, stale target, navigation/reflow, lost
acknowledgement and explicit record-only retry guards. It is not a new history
screen or installed native-WebView claim.

The normal root now composes `contactHistory.page` and `summaryPart` through
the selected runtime's lazy database/migration provider. API construction does
not open storage or read a clock. Application validation/copying precedes
awaited storage; there is no alternate adapter, fallback, inferred conversation
or write. Focused runtime/contact-reader regressions pass97 cases/three files
in `contact-history-runtime-focused.log`,
`CONTACT_HISTORY_RUNTIME_FOCUSED_EXIT=0`. Mock-port cases cover malformed inputs
before opening, exact selected adapter, complete literal summary decoding,
scope mutation during open, foreign results and redacted failure/no fallback.
All35 workspace type tasks pass in `contact-history-runtime-types.log`,
`CONTACT_HISTORY_RUNTIME_TYPES_EXIT=0`.

The initial full unit sweep78543 finishes exit1:2 failed/2,548 passed,
`CONTACT_HISTORY_RUNTIME_UNITS_EXIT=1`, retained in
`contact-history-runtime-units.log`. The unchanged execution-inventory guard
catches Firefox WebDriver's stale explicit14/32 pins. Advance only those pins
to15/34, retaining exact case-name/count equality. Corrected6355 finishes
exit0/all2,550 cases/206 files in `contact-history-runtime-units-corrected.log`,
`CONTACT_HISTORY_RUNTIME_UNITS_CORRECTED_EXIT=0`. This is a corrected inventory
check, not an executed exact-version Firefox browser claim.

Initial runtime lint finishes exit1 on the new test's missing explicit Node
`TextEncoder` import: retain `contact-history-runtime-lint.log`,
`CONTACT_HISTORY_RUNTIME_LINT_EXIT=1`. Add the import without suppression or
rule changes. Corrected workspace/tooling lint passes in
`contact-history-runtime-lint-corrected.log`,
`CONTACT_HISTORY_RUNTIME_LINT_CORRECTED_EXIT=0`. Policy84427 finishes exit0,
`CONTACT_HISTORY_RUNTIME_POLICY_EXIT=0`, in
`contact-history-runtime-policy.log`: boundaries, foundation records,831 npm/
498 Cargo license inventory and secret scanning pass.

Normal browser/native runtime journeys now also exercise honest empty history,
missing versus empty summary, foreign-vault rejection, exact unchanged database
hashes and reload. Process44619 is consumed exit0/two cases21.9s in
`contact-history-normal-runtime.log`, `CONTACT_HISTORY_NORMAL_RUNTIME_EXIT=0`.
One case uses the normal offline browser root; the other includes existing
company/contact owned-lifetime UI regressions and the actual-Rust native root.
Both use an explicitly created synthetic contact with no seeded interaction,
not a populated history fixture or recording-composer claim.
Whole-workspace formatting72435 finishes exit0 in
`contact-history-runtime-format.log`, `CONTACT_HISTORY_RUNTIME_FORMAT_EXIT=0`.
Final checkpoint policy3190 also finishes exit0 in
`contact-history-runtime-final-policy.log`,
`CONTACT_HISTORY_RUNTIME_FINAL_POLICY_EXIT=0`. Diff whitespace is clean and
the preserved stash remains `2697ebcec53351a052d8c5c19e2b8e2a52056a70`.
Disposable page/full-summary readers and visible history UI remain unimplemented.
No full final-source, extension or exact new hosted success is claimed; do not
commit/push or close the incomplete history slice or full INT-007.

### Normal prior-schema reopen and shared history parity — 2026-10-22

Normal app restore/reopen now explicitly covers both preserved160 and164
archives at current165. The shared exact comparison checks the original
migration prefix, checksums of only the known added SQL, every canonical
dataset/field, attachment and CSV byte. Only the known source-schema/generated-
time envelope fields and existing operational vault-open stamp may advance.
Source160 must still have no invented manual receipt; source164 must retain
its one complete existing receipt, including every hash. No hash algorithm or
source/target integrity guard changes. Historical input paths/versions stay
literal160/164; current runtime/export expectations advance to165.

An initial Windows command selector fails before Playwright starts: the pipe
inside the regular expression is interpreted by the package-manager command
shim. Retain `contact-history-schema165-normal-restore-initial.log`,
`CONTACT_HISTORY_SCHEMA165_NORMAL_RESTORE_INITIAL_EXIT=255`; this is not an app
test failure or a pass. Use the equivalent pipe-free `schema16[04]` selector.
Corrected26029 finishes exit0/four cases30.8s in
`contact-history-schema165-normal-restore-corrected.log`,
`CONTACT_HISTORY_SCHEMA165_NORMAL_RESTORE_CORRECTED_EXIT=0`. Both archives pass
through normal offline clean-browser restore/reopen and normal native Settings
different-vault confirmation/reopen. The native path uses actual Rust SQLite
with the disclosed proof host, not an installed WebView or manual file-picker
claim. Existing native review-stage timing guards remain unchanged.

The shared repository manifest advances additively from v14/32 to v15/34.
Exact component ordering and completed-case equality remain enforced. Two
history cases run through the actual migration runner and the same application/
repository code on every adapter: bounded explicit-contact pages, tied/future
chronology, job/contact archive scope, no inferred company conversation, bound
SQL projections, no read writes, stale job continuations, and complete literal
summary parts with BOM/NUL/Unicode/markup-shaped text, empty versus missing,
foreign-scope isolation, exact byte length, scalar boundaries and owner drift.
The summary fixture is synthetic; no normal recording composer is claimed.

- Focused actual Node SQLite:33 Vitest cases/two files pass in
  `contact-history-shared-initial-node.log`,
  `CONTACT_HISTORY_SHARED_INITIAL_NODE_EXIT=0`. One of those cases executes
  all34 exact shared contracts, not merely a mock manifest comparison.
- Real Edge155 browser SQLite: the exact v15/34 manifest plus current-schema
  storage/export/restore proof pass, two cases21.0s in
  `contact-history-shared-browser.log`, `CONTACT_HISTORY_SHARED_BROWSER_EXIT=0`.
- Full real-native suite42516 finishes exit0:21 cases, including the same34
  shared contracts and all preserved recovery milestones, plus24 Rust cases
  and the existing one secure-store ignore. See
  `contact-history-shared-native.log`, `CONTACT_HISTORY_SHARED_NATIVE_EXIT=0`.
- Workspace typecheck42095 finishes exit0/all35 tasks in
  `contact-history-shared-initial-types.log`,
  `CONTACT_HISTORY_SHARED_INITIAL_TYPES_EXIT=0`. Strict lint finishes exit0/all22
  workspace tasks plus tooling in `contact-history-shared-initial-lint.log`,
  `CONTACT_HISTORY_SHARED_INITIAL_LINT_EXIT=0`.

These handles are consumed. Full normal-browser archive regressions and final
checks remain separately observable; runtime/owned-reader/UI integration and
complete final-source/extension/exact hosted verification remain required.
No full INT-007 closure, source/permission/dependency or Accepted decision change.

### Recovery follow-up static and unit checks — 2026-10-22

The latest recovery-source workspace typecheck passes all35 tasks in
`contact-history-schema165-recovery-types.log`,
`CONTACT_HISTORY_SCHEMA165_RECOVERY_TYPES_EXIT=0`. The full unit suite passes
all2,535 cases in `contact-history-schema165-recovery-units.log`,
`CONTACT_HISTORY_SCHEMA165_RECOVERY_UNITS_EXIT=0`.

The separate direct recovery-script lint fails on two uses of Node's
`TextDecoder` without an explicit import. Retain
`contact-history-schema165-recovery-direct-lint.log`,
`CONTACT_HISTORY_SCHEMA165_RECOVERY_DIRECT_LINT_EXIT=1`. Add only the explicit
`node:util` import, with no suppression or rule change. The corrected direct
check passes in `contact-history-schema165-recovery-direct-lint-corrected.log`,
`CONTACT_HISTORY_SCHEMA165_RECOVERY_DIRECT_LINT_CORRECTED_EXIT=0`.
The runbook now reflects the executed browser/native recovery results rather
than its earlier pending status. These checks do not close the remaining
normal-app/history integration or substitute for final-source full verification.

Recovery follow-up policy and whole-workspace formatting checks also finish
exit0 in `contact-history-schema165-recovery-policy.log` and
`contact-history-schema165-recovery-format.log`, with respective markers
`CONTACT_HISTORY_SCHEMA165_RECOVERY_POLICY_EXIT=0` and
`CONTACT_HISTORY_SCHEMA165_RECOVERY_FORMAT_EXIT=0`. Boundaries, foundation
records,831 npm licenses,498 Cargo licenses and secret scanning pass. Diff
whitespace is clean. No full INT-007 or new exact hosted success is claimed.

### Schema165 browser and real-native recovery pass — 2026-10-22

Corrected generation54304 consumes exit0,
`CONTACT_HISTORY_SCHEMA165_BROWSER_GENERATION_CORRECTED_EXIT=0`, all five
cases/16.2s. The separate no-update replay77211 consumes exit0,
`CONTACT_HISTORY_SCHEMA165_BROWSER_REPLAY_EXIT=0`, all five/15.0s. Logs are
`contact-history-schema165-browser-generation-corrected.log` and
`contact-history-schema165-browser-replay.log`. Local Edge155.0.4283.62 proves
158/159/160/164 exact legacy restore and165 upgrade, preserved nonempty164
receipt, current165 clean restore, deletion and deterministic archive bytes.
This is not yet exact supported Chrome/Firefox hosted proof.

The new independently named165 fixture is1,858,934 bytes, archive SHA-256
`5b91a75978356e52bbc1b118de9f918d082277d6037470727c71094dccdd0260`, SQLite SHA-256
`a3b595dc27b65db933eed4c1bd8007c8a0a8645bd4d48bf0ad2d5a17a2164d5a`, and schema-bound
content hash `e9ec9e72dcee225d1f99a6e78a4eedefd950533db7f439fa252098775754e2ee`.
Every canonical dataset, prior migration identity, attachment and CSV byte
matches164; complete JSON envelopes differ only in source-schema metadata.
The165 index is present, and58 datasets/116 files remain. No content-hash
implementation/version or other integrity check changed. Original3717 failure
and its artifacts remain failures, not reclassified.

The full real-Rust native storage98234 suite consumes exit0,
`CONTACT_HISTORY_SCHEMA165_NATIVE_STORAGE_EXIT=0`, in
`contact-history-schema165-native-storage.log`:21 cases pass, plus24 Rust
cases/one intentional secure-store ignore. Current expectations advance to165;
all158/159/160/164/165 fixture cases remain explicit. Each verifies the source
archive and source-schema hash before migration, original ledger prefix and
every canonical dataset after upgrade, original receipt hashes for164/165,
new index presence, attachments and clean target restore. Only the intentional
source-version metadata advances in the cross-schema data comparison. Existing
v14/32 shared repository cases also execute under165; this does not yet add the
new history-specific shared cases or prove its normal UI.

All eight old ZIP/JSON hashes still match the pre165 capture:
`CONTACT_HISTORY_SCHEMA165_OLD_FIXTURES_UNCHANGED=8` in
`contact-history-schema165-old-fixture-check.log`. The recovery README now names
only165 as current output and explains the changed schema-bound hash.
All test handles above are consumed. Remaining work includes other current-
schema browser/extension witnesses, normal160/164→165 app restore/reopen,
history-specific shared contracts/runtime/reader/UI and complete final-source/
extension/policy/exact hosted verification. Do not commit or close INT-007.

### Initial browser failure and corrected comparison scope — 2026-10-22

Generation3717 is consumed exit1,
`CONTACT_HISTORY_SCHEMA165_BROWSER_GENERATION_EXIT=1`, in
`contact-history-schema165-browser-generation.log`:158/159/160 upgrade tests
pass,164 is rejected by the fixture harness's older source allowlist, and the
new fixture case fails before file publication on an incorrect cross-schema
content-hash expectation. Preserve the complete original output directory and
JSON report under `contact-history-schema165-browser-generation-failure`.

Add only164 to that fixture restore allowlist, retaining all identity/checksum/
schema/target/commit guards. The normal restore configuration already retains
160/164 separately. Inspection of the unchanged version1 hash implementation
and its normative record proves that schema and complete JSON envelopes are
explicit hash inputs. Therefore the prior plan's claim that the164 hash must
survive165 is incorrect; it is superseded, not an Accepted algorithm change.
Do not normalize or change the hash implementation to force equality.

The corrected fixture witness validates the preserved164 archive and compares
all58 canonical datasets exactly, every prior ledger entry, every attachment,
every CSV byte and every JSON field (only `sourceSchemaVersion` advances to165).
It independently calculates the current165 descriptor from inspected bytes and
requires it to equal the browser-generated165 hash. Later same-schema clean
restore must still match that exact new165 hash; deterministic archive bytes and
the new165 manifest remain mandatory. This strengthens cross-schema row proof
without inventing a schema-independent interpretation of hash version1.
No new fixture write or corrected browser success is claimed yet.

### Schema165 browser fixture/recovery execution activated — 2026-10-22

The generator's only committed fixture output paths now name165, verified
before setting its update flag. Preserve all old ZIP/JSON inputs against the
pre165 hash capture. The browser recovery witness now includes158/159/160/164:
older sources must gain only an empty receipt dataset, while164 must preserve
every dataset and its existing nonempty receipt exactly. Before/after snapshots
also inspect the new history index and unchanged prior index identities/ledger.
The separately generated165 archive must contain the index and retain the
original canonical content hash. Execute this one file serially with the update
flag scoped only to the child test process, then re-run without that flag to
prove deterministic comparison/recovery. No passing browser result is claimed
by activation; actual results follow below.

### Schema165 core migration/export implementation — 2026-10-22

Migration165 and its runbook are now present. The current export writer advances
to165 while explicitly retaining164; the164 minimum for manual-creation evidence
is unchanged. Normal restore configuration retains160 and previous-current164.
The three current shared contact-workspace assertions advance to165, without
changing their historical160 comparisons or contract case list. The synthetic
query diagnostic now removes the production index only inside its isolated
in-memory fixture, then applies the actual165 SQL for the before/after plan.
The original schema164 measurement copy and hash remain preserved.

Four actual-SQL migration cases prove164→165 export/canonical-row/receipt
preservation, exact index directions and query plan, idempotence, transactional
rollback after an injected post-index ledger failure, and older-runner refusal
without downgrade. Together with export/history/generic migration regressions,
38 cases/four files pass in `contact-history-index-initial-focused.log`,
`CONTACT_HISTORY_INDEX_INITIAL_FOCUSED_EXIT=0`. Storage build and production/test
types pass, `CONTACT_HISTORY_INDEX_STORAGE_BUILD_EXIT=0` and
`CONTACT_HISTORY_INDEX_STORAGE_TYPES_EXIT=0`.

The first unchanged full unit sweep79577 consumes exit1 in
`contact-history-index-first-unit-sweep.log`,
`CONTACT_HISTORY_INDEX_FIRST_UNIT_SWEEP_EXIT=1`:2526 pass and9 fail in two files.
Fresh archive test bytes are schema165 while their stale fixture metadata still
claims164, so the unchanged export guard correctly rejects source drift; two
bootstrap assertions also still expect current164. Correct only fresh fixture
metadata/current expectations to165 and the future-root rejection fixture to166.
Keep the export guard, failure cases and historical164 tests unchanged. The fresh
corrected full sweep35368 consumes exit0 in
`contact-history-index-corrected-unit-sweep.log`,
`CONTACT_HISTORY_INDEX_CORRECTED_UNIT_SWEEP_EXIT=0`:all2535 cases/205 files pass.
The first sweep remains a retained failure, not full-verification success.

Workspace types19936 and lint consume exit0:35 type/build prerequisites and22
lint tasks plus tooling pass, `CONTACT_HISTORY_INDEX_WORKSPACE_TYPES_EXIT=0`
and `CONTACT_HISTORY_INDEX_WORKSPACE_LINT_EXIT=0` in their respective
`contact-history-index-workspace-{types,lint}.log` files. Format92361 and
policy36559 also consume exit0, `CONTACT_HISTORY_INDEX_FORMAT_EXIT=0` and
`CONTACT_HISTORY_INDEX_POLICY_EXIT=0`;831 npm/498 Cargo license checks and
secrets pass. The eight original recovery ZIP/JSON hashes still match the
pre-edit capture (`CONTACT_HISTORY_PRESERVED_FIXTURES=8` in
`contact-history-index-preserved-fixtures.log`). No process remains live at
this checkpoint. These results still do not prove the pending recovery/runtime
consumers or the complete final-source gate.

This does not complete migration compatibility. Browser/native/extension and
normal restore current-schema assertions still need review/update; a separately
named165 recovery fixture has not yet been generated. **Do not run the fixture
update flag while `e2e/storage-recovery.spec.mjs` still names164 output paths.**
First change current output paths to165 and add preserved164 upgrade/readback
coverage without replacing its receipt or archived bytes. Then prove new165
recovery plus normal160/164 restore and deliberate165 reopen. Actual shared
history cases, normal runtime/reader/UI and the new full/hosted gates remain.
No dependency, source permission or Accepted decision changed; do not commit or
push the partial index/history implementation.

### Additive schema165 implementation plan — 2026-10-22

Adopt the measured contact-history index as one forward-only SQL migration:
`0165_interaction_contact_history_index.sql`, on
`interaction(contact_id, occurred_at DESC, id ASC)`. This is an accepted-pattern
index addition, not a different storage platform or Accepted decision. It may
change SQLite/index/ledger/schema metadata, never canonical rows or datasets.
Keep export version1 and58 datasets/116 files, explicitly retaining164 as a
supported source milestone while current advances to165. Normal restore must
retain160 and additionally accept the previous current164; unreviewed and
partially guarded161–163 sources remain unsupported by the export writer.

Before implementation, existing recovery-file hashes are captured in
`contact-history-pre165-fixture-hashes.log`. Preserve every old fixture,
including the164 manual receipt and the original158/159/160 archives. Produce a
separately named165 fixture; never regenerate164 in place. Update only current-
schema consumers, keeping historical164 assertions and the164 minimum schema
for manual-creation data. The web loader already discovers numbered SQL; the
migrator validates contiguous checksummed definitions, applies SQL/ledger and
user_version transactionally, and refuses a later schema through older source.

Required proof includes actual164→165 migration, exact canonical/export row
preservation, index shape/query plan, injected post-index ledger failure rollback,
older-client refusal, fresh current165 exports, preserved archive upgrades and
new165 recovery in both adapters. Update current shared-contract expectations
and actual normal restore/reopen witnesses coherently, without widening source
permission or weakening archive/target/integrity checks. After this migration
work, wire the history cases into the shared manifest, then runtime/reader/UI.
No migration or successful165 check is claimed by this pre-edit plan itself.

### Concrete transactional SQLite and measured index candidate — 2026-10-22

`createContactInteractionHistoryRepository` now composes both read ports over
one actual SQLite transaction per operation. Sole-vault identity and selected
contact/archive/version checks precede the bounded page or summary read. Exact
contact links determine membership; a LEFT JOIN preserves a dangling job as an
invalid state instead of discarding it into false empty history. Scoped anchors
also recheck interaction occurrence/version and current job identity/version.
All values, limits and offsets are bound. No complete summary is selected into
page rows: BLOB byte lengths and bounded BLOB slices preserve content after NUL.

Concrete Node SQLite tests apply all164 SQL migrations to isolated synthetic
in-memory databases. Initial8 cases, expanded17 and measured18 cases all pass.
The final combined run passes260 cases in seven files, including both new
application boundaries, prior contact commands/directory/workspace and manual
receipt integrity regressions:
`contact-interaction-history-storage-final-focused.log`,
`CONTACT_HISTORY_STORAGE_FINAL_FOCUSED_EXIT=0`. Final storage production/test
types and strict lint pass in `contact-interaction-history-storage-final-types.log`
and `contact-interaction-history-storage-final-lint.log`, with their matching
`CONTACT_HISTORY_STORAGE_FINAL_TYPES_EXIT=0` and
`CONTACT_HISTORY_STORAGE_FINAL_LINT_EXIT=0` markers. The prerequisite application
build also passes. All those processes are consumed; none must be resumed.

Real SQL proof covers tied and future-imported chronology; no inferred shared-
company conversation; literal long-summary reconstruction; empty/missing scope;
archive inclusion; contact/job/deleted-anchor drift; body ownership; request
copying before awaited reads; no transactional execute calls; invalid UTF-8;
dangling jobs; and an oversized NUL-bearing legacy row that SQLite's ordinary
text-length check accepts but the new read correctly rejects. These failure
fixtures are deliberate isolated corrupt-data tests, not production incidents
or evidence that normal commands accept their contents.

The20,000-row/10,000-selected-contact diagnostic measures12 reads per variant.
The preserved generated
`test-results/contact-interaction-history-query-baseline-schema164.json`
records the unindexed scan/temp-sort plan at p95=1.885ms and a **test-only**
`(contact_id, occurred_at DESC, id ASC)` candidate at p95=0.354ms, replacing both
scan and temporary sort with indexed search. This is a small local diagnostic,
not a reference-hardware, browser/native or release-performance acceptance.
Default/explicit-console test runs pass but omit stdout from the reporter;
the run in `contact-interaction-history-storage-measured-artifact.log` writes
the generated JSON. Its separately preserved baseline JSON is the actual
measurement, not an inference from the passing test.
The preserved baseline has SHA-256
`355bb1b6494299781181eb3e3a4dd0ae6f61cba652a9fe61afc32fa0ea639c1f`;
its content and successful hash observation are retained in
`contact-interaction-history-query-baseline-observation.log`. The first
observation helper printed the JSON but failed to compute its optional hash
because of shell quoting/module resolution; the corrected scoped pwsh hash
read succeeds without changing the baseline or product source.

Whole-workspace format4643 and policy68821 are consumed exit0,
`CONTACT_HISTORY_STORAGE_FORMAT_EXIT=0` and
`CONTACT_HISTORY_STORAGE_POLICY_EXIT=0` in
`contact-interaction-history-storage-{format,policy}.log`. Boundaries,
foundation records,831 npm/498 Cargo licenses and secret scanning pass. No
local process or newer hosted CI remains live at this checkpoint.

No production index/schema change has been made yet. The measured candidate
justifies reviewing a single additive contact-history index next, together with
actual migration loading, current-version consumers and preserved164 recovery
fixtures, before shared-adapter proof. Do not rewrite old fixtures or infer
export/migration success from these fresh direct-SQL tests. Browser/native shared
contracts, normal runtime/owned reader/UI, full final-source verification and a
new exact hosted run remain required. Existing source-backed field eligibility,
recording composer and full INT-007/INT-008 remain open.

### Application page and literal-summary boundaries — 2026-10-22

Two application modules and their public exports now implement the page query
and separate summary-part query. Requests/results/cursors reject extra or
malformed fields and are copied/frozen before asynchronous publication. Pages
default to25/max100 rows; each preview is at most1,024 UTF-8 bytes, with explicit
total length/truncation and no contact methods/notes/totals. Continuation binds
vault/contact/archive scope, contact revision, occurrence/interaction identity
and revision, and the anchor's current job identity/revision. Repeated current-job
metadata must agree within a page. Actual explicit contact links, not company
membership, are part of every returned interaction's validated scope.

Full summary parts use the same fixed viewed reference and expected byte length,
default16,384/max65,536/min4 bytes per read and an800,000-byte retained-summary
ceiling covering the nominal200,000-scalar bound's maximum UTF-8 expansion.
This is not proof that every legacy row satisfies that bound: SQLite's NUL
behavior can defeat a text-length check, so an oversized retained value must
fail visibly rather than be silently truncated into a successful full read.
The shared literal decoder computes scalar-safe progress and rejects changed
references, invalid UTF-8, middle-scalar offsets, wrong byte lengths and foreign
fields. Tests reconstruct the complete literal string including BOM, NUL,
newlines, emoji and markup-shaped text; no markup is executed. Empty summary,
missing record, stale reference and unavailable read remain distinct. The tuple
is record/version continuity, not a newly computed integrity certificate.

Focused evidence (all processes consumed):

- Initial page-only40 cases pass in
  `contact-interaction-history-application-initial.log`,
  `CONTACT_INTERACTION_HISTORY_APPLICATION_INITIAL_EXIT=0`.
- Expanded page/summary and existing company/contact/directory/workspace
  regressions pass239 cases in five files in
  `contact-interaction-history-application-expanded.log`. Final ordering and
  repeated-job consistency tests increase this to240 passing cases in
  `contact-interaction-history-application-final.log`,
  `CONTACT_INTERACTION_HISTORY_APPLICATION_FINAL_EXIT=0`.
- Production and test types pass in the initial/expanded/final type logs;
  final `CONTACT_INTERACTION_HISTORY_APPLICATION_FINAL_TYPES_EXIT=0`.
- Initial strict lint fails on one preferred optional-chain expression in the
  new page decoder; retain
  `contact-interaction-history-application-lint.log`,
  `CONTACT_INTERACTION_HISTORY_APPLICATION_LINT_EXIT=1`. Correct only the
  expression, without suppression or rule changes. Final unchanged application
  lint passes in `contact-interaction-history-application-lint-corrected.log`,
  `CONTACT_INTERACTION_HISTORY_APPLICATION_LINT_CORRECTED_EXIT=0`.
- Whole-workspace formatting94849 and policy39918 are consumed exit0:
  `CONTACT_INTERACTION_HISTORY_INITIAL_FORMAT_EXIT=0` and
  `CONTACT_INTERACTION_HISTORY_INITIAL_POLICY_EXIT=0`, in their respective
  `contact-interaction-history-initial-{format,policy}.log` files. Boundaries,
  foundation records,831 npm/498 Cargo licenses and secret scanning pass.
  Diff whitespace is clean; stash remains exactly
  `2697ebcec53351a052d8c5c19e2b8e2a52056a70`.

These are application/mock-port proofs, not SQLite, runtime, screen, actual
browser/native, performance or full final-source proof. No new query is wired
to the normal app yet. Next implement transactional concrete reads and shared
actual-adapter tests, then the planned runtime/reader/UI and normal journeys.
The minor application Changeset records this additive API. No dependency,
permission, schema, data-source or Accepted decision changed. Do not commit,
push, mark the history slice complete or attribute this newer code to the old
closed CI run before the complete slice and its new-source gates are ready.
