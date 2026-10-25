# Company recorded stage and outcome history — INT-007 in progress

## Current-state audit and exact scope

The published source checkpointccc342d is verified locally and pushed. Its exact
CI40209913081 remains live through original watcher11165; do not restart or
supersede it. Only two post-push receipt files are dirty before this next slice.
Stash2697 and unrelated work remain preserved.

The existing `status_event` table retains append-only local stage transitions,
with optional application identity. `status_definition` supplies the current
name, semantic category and terminal flag; those definitions are mutable and
cannot establish what a label meant at event time. `mutation_undo_token` records
whether the original status change has been reversed. Current job status alone
cannot replace this history, and an event is not employer receipt or verification.

Implement a bounded read-only company page of actual status events for jobs
currently linked to the viewed company. Include all stage transitions so ordinary
moves, closing changes, reopenings and reversals are not silently omitted or
misclassified from a current terminal flag. Distinguish current stage definitions,
current job/company membership and optional current application archive state
from the immutable event identity/time. Preserve job-level events with no
application; retain archived application references rather than erasing history.
Company and linked-job archive choices remain explicit and independent.

Bind original vault/company/revision and archive scope, occurrence-descending/
event-ID-ascending live keysets, and canonical event/job/application/stage/undo
versions. A changed anchor must reject rather than rebase. New/undone events or
renamed/reclassified stages are live facts, not an immutable report. Validate
lookahead, duplicates and coherent shared identities too; do not hide valid
future-dated imports using a wall-clock ceiling.

Return bounded literal job/stage metadata and content-free event/application/
undo references only. Exclude event notes, application notes, job descriptions,
contact methods, retained source bodies, totals and invented outcome rates.
Bound metadata bytes before transport and reject malformed UTF-8/oversized data.
No query writes data or grants undo/reopen permission.

First prove strict copied/versioned contracts and actual migrated SQLite
ownership/order/archive/corruption/privacy/read-only behavior, then run identical
shared adapters and compose owned normal UI with explicit first/next/exact retry,
stale/empty/error/late-owner handling and offline/reload/reflow/accessibility.
Retain recorded reversals honestly. No schema/index/dependency/permission or
Accepted decision change is needed; SQL/export182 remains. Full INT-007, salary
prerequisites, Home and independent release/manual gates remain open.

## Strict queries and actual adapter proof

Version-1 contracts copy and freeze original scope, all nested metadata and
content-free continuation references before awaits. They reject hidden/accessor/
symbol fields, wrong owners, malformed pages, repeated event/undo identities and
incoherent current job/application/stage facts. The actual SQLite port independently
validates sole vault/company revision, current job membership, optional application
job, both stage definitions and exact undo event/job/application/from/to chain in
one read snapshot. Metadata uses bounded BLOB slices with fatal UTF-8 and preserved
BOM/NUL, rejecting oversized hidden tails rather than truncating them into success.
Lookahead receives the same validation; no private notes or bodies are selected.

Initial contract typecheck finds a non-exported text helper, query-name suffix
and invalid stable-error-code name; these are corrected. Initial focused run
passes29/fails11: constructing a cursor from the full already-validated request
incorrectly rejects its limit/after keys, producing unavailable. The cursor builder
now accepts that typed full request while still validating every original scope
field and rejecting unknown/getter fields. Corrected focused repeat passes40 cases.
Typed malformed fixture assertions and branded scope identities are corrected;
lint then identifies unused scope destructuring and a control-character regex,
replaced with explicit scope copying and code-point checks. A duplicate undo-ID
projection regression is added. Final46832 passes35 types/22 lint plus tooling,
238 files/3416 units before the subsequent shared harness addition.

The identical actual-adapter contract adds companyOutcomes to the complete manifest
25/45, preserving every prior case and original budgets. Shared Node repeat passes
84 cases in4 suites, including the complete repository aggregate and execution
inventory. All21 explicit Chromium components pass42.1s (original1331 terminal0);
selected actual Rust native61738 passes the full45-case aggregate8.42s, with22
other native tests skipped. This is not complete native/runtime/full-source proof.
Two harness lint findings (redundant boolean comparison and already-narrowed
optional chain) are corrected; no assertion is removed.

Normal selected-runtime composition and the owned first/next/exact-retry/archive
panel now exist. Current-definition labels, nullable/archived applications and
recorded undo stay distinct from employer verification. The reader hides retired
results and retains stale/error/unread/empty states.53 focused query/actual SQLite/
runtime-reader cases pass, including pre-open validation, held original owner,
single-flight/exact retry, private-error redaction and disposal. Normal manual
preparation and synthetic browser/native UI proof are running as45205; full
final-source/serial extension/policy and fresh exact hosted proof remain required.
SQL/export182, original archive fixtures, locks/permissions/Accepted choices remain.

## Normal UI focused verification

Original45205 closes terminal0 with COMPANY_OUTCOMES_UI_BROWSER_EXIT=0 and
COMPANY_OUTCOMES_UI_NATIVE_EXIT=0: all3 normal browser cases20.7s and the matching
actual Rust SQLite journey9.5s pass. Ordinary manual capture followed by the
normal Documents preparation form creates the event; company history confirms
absence before the action and the retained application-linked transition after
Back/reload, without seeding or direct storage writes for that journey.

The separately disclosed synthetic archive preserves all original165 recovery
bytes and restores through normal UI. It supplies27 current-linked events plus
archived/foreign controls, a reopening, nullable previous stage/application,
archived application and a consumed undo. Normal first/next/archive/exact retry,
held actual read across320px forced colors/reduced motion, axe, unchanged export
hash through the read segment and fresh first-page reload pass. A late actual
page cannot publish or steal focus under a different company's confirmed empty
scope. No request fetches content or notes. Native uses simulated Tauri IPC over
the actual Rust SQLite process; packaged WebView acceptance is not established.

Final3889 passes35 types/22 lint plus tooling and239 files/3428 unit tests on
the normal UI/runtime and shared25/45 manifest. The first screenshot shows mostly
the panel explanation rather than records; capture is moved to the first actual
record, retaining the same functional/reflow/axe assertions.97455 passes that
journey15.5s. Visual inspection finds mobile navigation over the record's bottom
in the capture; the record is now centered in the viewport before its screenshot.
The complete gate will repeat this final capture. Source/tests freeze
for complete final-source verification, serial extension and policy, then the
next authorized coherent implementation/proof commit and fresh exact hosted run.
No full INT-007/goal or release acceptance claim is made.

The first complete gate is terminal before product tests: durable75660 and launch
15375 close with saved exit1/COMPANY_OUTCOMES_COMPLETE_VERIFY_EXIT=1 because
stored-company-outcomes.spec.mjs still needs formatting. The retained complete
log names that file; it is formatted and checked before a fresh final gate with
a separately named log/receipt. This is not complete verification success and
does not justify a timeout or assertion change.

## Complete final-source verification

Durable65056 is terminal with saved exit0/COMPANY_OUTCOMES_FINAL_VERIFY_EXIT=0;
launch8303 also closes exit0. Retained complete log:
test-results/company-outcomes-final-verify.log, saved receipt:
test-results/company-outcomes-final-verify.exit. No source/test changes follow
this final verification. Full `pnpm verify` passes:

- Whole-workspace formatting,19 boundaries, foundation records,35 type tasks,
  22 lint tasks plus tooling;239 files/3428 unit cases repeated under coverage
  84.62% statements/78.18% branches/85.79% functions/87.29% lines.
- Complete builds and contrast/extraction/extension artifacts;7 UI foundation,
  76 shell,1 diagnostic performance,115 resilience (9.0m),7 onboarding and13
  document-browser cases. All normal outcome/browser/native/manual entry/ownership
  journeys repeat; final centered320px screenshot is visually inspected and fully
  readable without fixed navigation obscuring the record.
- All35 browser-storage tests, including every one of21 reviewed components and
  all45 repository cases with original budgets/lifecycle;23 native storage tests
  execute the identical25/45 aggregate. Rust core24 pass with one secure-store
  lifecycle delegated to the separately passing harness.
- Windows Credential Manager store/read/delete with secretExposed:false, native
  archive/recovery/backup, generated schemas,831 npm/498 Rust license policies,
  secret scan, dependency audits and Changesets status. No known npm vulnerabilities;
  the same11 reviewed allowed Cargo warnings remain.

Serial extension, final documentation hygiene and authorized coherent commit/push
follow; fresh exact hosted evidence is still required for this source. Published
ccc342d/CI40209913081 all10-job success is separate and cannot prove the new
outcome implementation. Local Chromium156 and simulated IPC over actual Rust do
not establish exact hosted Chrome151/152/Firefox153/154, installed WebView/manual
accessibility, reference hardware, signing or release acceptance. SQL/export182,
old archives/locks/permissions/Accepted decisions and stash2697 remain unchanged.

Serial10968 consumes terminal0/COMPANY_OUTCOMES_EXTENSION_EXIT=0: all9 extension
cases28.3s, retained in test-results/company-outcomes-extension.log. All local
suite processes are terminal; only result documentation follows frozen source
and tests.33 known implementation/test/design/Changeset/proof files form this
checkpoint, including pending source-checkpoint hosted receipts. Final whole
formatting/policy/secret/whitespace hygiene precedes normal authorized commit/push.

Final79998 closes exit0/COMPANY_OUTCOMES_FINAL_HYGIENE_EXIT=0: whole formatting,
19 boundary policies, foundation records,831 npm/498 Rust license checks and
secret scan pass. Whitespace is clean; stash2697 unchanged. All33 known files
belong to this checkpoint. Only final result records follow before normal commit
and push, with no force/history rewrite; fresh exact hosted success remains.

## Exact published checkpoint

83da8b5344e27bf18724020529b061d757b488bc is committed and pushed normally to
origin/main:33 files,2992 insertions/35 deletions, including pending source
all10-job hosted closure and outcome-history implementation/proof. HEAD and
origin/main match; the tree is clean directly after push, and stash
2697ebcec53351a052d8c5c19e2b8e2a52056a70 is unchanged.

[Exact Foundation CI40214118395](https://github.com/seabAu/Coredrill/actions/runs/40214118395)
is running for this SHA. A single quiet watcher writes
test-results/company-outcomes-hosted-watch.log, saved .exit receipt and terminal
COMPANY_OUTCOMES_HOSTED_EXIT. Follow the original handle rather than restarting
on observation timeout. This is not hosted success. Previousccc342d/40209913081
is terminal success with closed11165/20477, not proof of this newer source.
Post-push receipts carry with the next coherent verified implementation rather
than a receipt-only push. Exact closure and an INT-007 requirement audit precede
normal Home integration; later salary/public facts and independent release gates
remain open. No full goal completion claim.

## Exact hosted closure

Original16250 closes exit1/COMPANY_OUTCOMES_HOSTED_EXIT=1; complete-log retrieval
25349 closes exit0/COMPANY_OUTCOMES_COMPLETE_EXIT=0. Exact83da8b5 CI40214118395
concludes cancelled, not green:9 required jobs succeed (aggregate foundation,
Chrome151, both Firefox versions, all3 native platforms, extension and secrets).
PR-only dependency review skips. Chrome152 job121231444360 runs25m14s and is
cancelled at the25-minute limit before artifact publication. Complete logs show
115 resilience cases pass16.2m and7 onboarding cases pass18.9s immediately before
cancellation. No outcome-history assertion failure is reported, but missing
artifact/job completion prevents exact hosted success. Preserve this run.

The next coherent Network checkpoint partitions existing Chrome suites into
storage/shell and resilience/onboarding lanes per exact version. Every suite,
per-test timeout,25-minute job limit and required artifact remains; failure
diagnostic names include the lane. Fresh exact-current hosted completion is
required. Olderccc342d green does not substitute; both original handles are closed.
