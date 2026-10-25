# Normal company relationships — INT-007 in progress

Date: 2026-10-25. Query, shared browser/native storage and normal runtime/UI
are implemented with focused proof; complete checkpoint gates remain pending.
No complete company-relationship requirement is claimed.

The normal selected-company scalar view currently loads company facts and notes
and can navigate to its scoped contacts, but explicitly leaves related jobs,
sources, salary observations, outcomes and interaction history unloaded. The
catalog Network model cannot substitute: its array lengths imply totals, its
empty arrays imply absence, and it assumes related identities are all preloaded.
The product journeys and interface system require those real local relationships.

The first coherent prerequisite is a validated company-linked saved-job page.
It binds the original viewed vault/company/version, explicit archived-company
and archived-job scopes, and a bounded keyset continuation. It returns current
stored job identity/title/status/audit metadata only, with no descriptions,
notes, contact methods, source bodies or aggregate totals. The selected company
and continuation anchor are revalidated in the same read transaction. A moved,
changed, archived or deleted anchor cannot silently skip or rebase a page.

The existing active-company job index orders by company/updated-time/job ID.
No schema/index/dependency/permission change is justified by this audit. Queries
are live views rather than immutable snapshots; bounds on output do not prove
reference-hardware latency. Future normal selection must open the actual stored
job through existing navigation and preserve honest loading/empty/error/retry,
foreign ownership and focus/reflow/offline behavior.

Following that prerequisite, complete normal runtime/UI composition and actual
browser/native contracts remain required. Contacts must retain the independent
field-use qualification now published at60081b9. Company interaction history
must specify its current linked-job/company ownership, preserve literal summaries
and avoid implying that a contact's current employer is historical employer
evidence. Source/salary observations must refer to actual stored evidence, and
outcome history must distinguish current status from past status events or
application attempts. No general employer facts, hiring statistics or contact
rights may be invented from unrelated tables. No enrichment, fetching or sending.

The exact60081b9 CI run40174098874 is independently live under original watcher 44614. That immutable published source is separate from this new prerequisite;
its results cannot verify newly uncommitted relationship code. Keep the existing
post-push receipts for the next fully verified implementation checkpoint.

## Implemented query prerequisite and proof

`company-jobs.ts` supplies strict version-1 request/page/cursor/current-status
contracts and safe query errors. Scope carries original vault/company/version
and separate archived-company/archived-job choices. Pages are1–25 records,
default10, ordered by current update time descending then ID ascending. Every
cursor repeats its exact scope and last job revision/time/ID. Payloads are
copied/frozen; foreign, reordered, duplicate, oversized, malformed or extra-field
responses reject. Current status is literal stored metadata, not normalized
vocabulary, an inferred application outcome or hiring probability. No totals.

`company-jobs-repository.ts` revalidates the sole vault, selected company revision
and canonical continuation anchor within one read snapshot, using the optional
read-only capability or existing transaction fallback. It validates the
lookahead row too. Job titles/status names use fatal UTF-8 BLOB decoding with
BOM preservation. Read projections exclude job descriptions, notes, contact
methods and source bodies; no acquisition, canonical writes or new schema/index.

- The initial application build catches an unsupported `String.isWellFormed`
  library API. A Unicode-aware lone-surrogate check keeps the existing target
  unchanged. Initial pure test expects uppercase UUID rejection incorrectly;
  the established domain constructor intentionally canonicalizes UUID case, so
  the invalid-input test now uses an actually malformed vault identity.
- Focused `company-jobs-focused.log`/COMPANY_JOBS_FOCUSED_EXIT=0 passes37 application and12 actual
  migrated SQLite cases (49 total). Scope, immutable-before-await copying,
  private-error redaction, exact continuation,26 equal-key linked roles,
  independent archives, missing versus empty owners, stale/moved/deleted anchors,
  corrupt overflow and read-only capability are exercised.
- Strict type runs catch missing concrete-port contextual typing and an optional
  test capability that explicitly included undefined under exact optional
  properties. The production port uses its explicit interface; the test adapter
  uses an absent-or-present non-null capability. Lint then rejects non-null
  assertions, an optional-chain opportunity and unused rest destructuring.
  Explicit descriptor/row iteration and projected scope fix these without
  suppressions.25015 consumes terminal exit0 with
  COMPANY_JOBS_FINAL_TYPES_LINT_UNIT_EXIT=0:35 type tasks,22 lint plus tooling,
  all229 unit files/3224 cases. This result precedes the shared-manifest addition.
- One real shared repository case now checks empty/foreign owner,27 active roles
  including a valid future-dated role, equal-key paging, literal BOM/NUL/Unicode,
  private-body exclusion, changed/moved/archived/deleted anchors, company revision,
  independent archives and unchanged canonical data. The internal manifest is
  version22/42 cases; SQL/export schema remains182. Explicit Node/browser/native/
  Firefox execution inventory pins advance together, preserving all41 old cases.
- Shared Node `company-jobs-shared-node.log`/COMPANY_JOBS_SHARED_NODE_EXIT=0 passes91 cases across
  application, actual repository, aggregate contract and execution-inventory tests.
- Browser55565 consumes terminal exit0/COMPANY_JOBS_SHARED_BROWSER_EXIT=0:
  identical v22/42 manifest passes real browser SQLite/OPFS in25.7s (41.6s setup).
- Native91479 consumes terminal exit0/COMPANY_JOBS_SHARED_NATIVE_EXIT=0: identical
  v22/42 manifest passes real Rust SQLite in10.23s. The enclosing test filter
  deliberately skips22 unrelated native tests; it is not full native-suite proof.

After the shared-manifest addition,38766 passes types but lint catches two
numeric fixture interpolations; units do not run. Explicit `String(n)` preserves
those exact synthetic labels and satisfies the rule. Corrected93834 consumes
terminal exit0/COMPANY_JOBS_SHARED_FINAL2_TYPES_LINT_UNIT_EXIT=0: all35 types,
22 lint plus tooling and229 files/3224 units pass. Log:
`test-results/company-jobs-shared-final2-types-lint-unit.log`.

No full new `pnpm verify`, normal runtime/UI, local Firefox WebDriver, exact
hosted or release proof yet. Do not attribute60081b9 CI results to this
uncommitted source. Keep the prerequisite and pending receipts with the next
complete verified relationship checkpoint. Next compose selected-runtime reads
and an owned normal related-role page with explicit selection, loading, empty,
error, exact retry, archive, keyboard/focus/reflow/offline/reload and retirement
proof, then run complete final-source/serial extension/exact hosted gates.

Final prerequisite policy69730 consumes terminal exit0 and
COMPANY_JOBS_PREREQUISITE_POLICY_EXIT=0:19 boundaries, foundation records,
831 npm/498 Rust licenses and tracked/unignored secret scan pass. All15 selected
changed/new source/proof files pass formatting, and whitespace checks pass.
All local test/policy handles are terminal; only published60081b9's original
CI watcher44614 remains live, with nine required jobs green and aggregate still
running at this observation. No blocker prevents the next normal runtime/UI work.

## Normal related-role UI composition begins

The previous prerequisite turn is progress: strict query/actual adapters and
3224-unit proof exist. Published60081b9's original watcher44614 now closes
terminal0, all10 required CI jobs succeed, and its complete-log retrieval exits0.
That exact closure is [recorded separately](normal-contact-source-use-workflow.md#exact-hosted-closure)
and must not be attributed to this newer uncommitted source.

Selected runtime and an owned normal company-linked page are now composed.
The page waits for validated selected-company scope, preserves visibly stale
results on failures, retries the identical request, rejects foreign/retired
publication, and exposes explicit first/next/archive choices without totals.
Current job statuses remain distinct from historical application outcomes.
Role navigation opens the actual stored job without requiring membership in
the loaded Pipeline page, preserving only scoped IDs/cursor/scroll in browser
history. The full-page close control names the company return; Back/Forward,
reload, stale-return behavior and deliberate focus still require actual proof.
An obsolete return scope requires a fresh explicit first-page choice, not rebasing.

All35 UI type tasks pass14374. Runtime/reader/navigation unit command consumes
exit0/COMPANY_JOBS_RUNTIME_READER_UNIT_EXIT=0 with23 cases, covering lazy opening,
original scope before await, private-error redaction/no fallback, single flight,
disposed late results, exact retry, repeated identity/stale owner rejection and
content-free scoped history metadata. Strict lint and actual browser/native UI
proof are still pending; no new checkpoint commit yet.

## Normal runtime/UI focused verification

The normal selected-company view now contains actual bounded role pages. Raw
descriptions, company notes, contact methods and source bodies stay outside the
list. A deliberate role selection opens the actual stored job. The validated
stored-detail read supplies the frame even when an archived role is absent from
the active Pipeline and comparison loader; failed/pending lookup remains visible
with read-only retry and a company return instead of silently showing Pipeline.
The company page and selected job focus return after job reload/Back/Forward,
using validated IDs/cursor/scroll plus the existing navigation coordinator stamp.
No display bodies enter history. Obsolete company revisions require an explicit
first-page choice. Row revisions remain contract metadata rather than list copy.

Initial strict lint20608 stops at redundant render-narrowed conditions and an
optional boolean chain. An explicit navigation handler and narrowed guard fix
them without suppressions;98966 consumes exit0/COMPANY_JOBS_UI_LINT_FINAL_EXIT=0.
The runtime/reader suite gains a coordinator-stamp case (24 total). Complete99009
consumes terminal exit0/COMPANY_JOBS_UI_FINAL_TYPES_LINT_UNIT_EXIT=0 with all35
types,22 lint plus tooling and230 files/3248 units.

Initial normal browser93997 passes the full paging/return and foreign-late-read
cases but fails an incorrect test assumption: closing a saved creation draft
returns to the directory rather than automatically selecting its company. The
test now uses the existing normal Select company control; assertions and
budgets stay. Corrected88356 consumes terminal0 and
COMPANY_JOBS_NORMAL_BROWSER_FINAL_EXIT=0: all3 cases pass25.3s including setup.

Expanded70741 consumes terminal0/COMPANY_JOBS_NORMAL_BROWSER_EXPANDED_EXIT=0:
all5 browser cases pass28.3s. Actual normal UI proves:

- A UI-created empty company reports honest absence; a manually captured and
  reviewed job appears under its actual stored company, with literal title,
  keyboard opening and exact return/reload.
- An explicitly restored synthetic165 archive provides paging prerequisites,
  while ordinary controls perform all reads. Exact failed-continuation retry,
  a held real result across320px reflow, axe, later-page role opening, job reload,
  Back/Forward, archived-role opening outside active Pipeline and exact cursor/
  checkbox/focus return pass. Read-only paging leaves the exact SQLite hash
  unchanged; this hash claim covers the read segment, not archive restoration.
- A held original-company result cannot publish after another company's empty
  page is confirmed or steal deliberately moved focus.
- An actual scoped concurrent company-notes command is a disclosed prerequisite:
  return rejects its obsolete version with no role read until an explicit First
  uses the freshly viewed revision. No read response is fabricated.
- An actual archived-job detail result is held, then a private failure is thrown.
  The selected lookup stays visible without body publication, does not retry
  automatically and recovers after one explicit read-only retry.

Native81618 consumes terminal0/COMPANY_JOBS_NORMAL_NATIVE_EXIT=0: the identical
primary paging/return/archived-job journey passes real Rust SQLite in9.9s
(32.6s with setup) through simulated Tauri IPC, with no OPFS fallback or external
requests. This is not installed WebView acceptance. All browser external request
and page-error arrays are empty; preserved recovery bytes are checked unchanged.

The last source-only adjustment simplifies list copy and keeps revision/category
internals out of rows. Normal frame creation dates are labeled Saved, preserving
the catalog's Captured label rather than implying a stored save is source-capture
freshness. The normal journey asserts that truthful label. The full final-source gate will repeat the browser/native
journeys and all regressions before commit/push with the pending60081b9 hosted
receipt. No schema/dependency/permission/Accepted decision changes. Other company
relationships, full INT-007, Home and independent release gates remain open.

## Retained full-gate failure and save-date correction

Initial full gate9577 consumes terminal1/COMPANY_JOBS_COMPLETE_VERIFY_EXIT=1.
Formatting/boundaries/foundation,35types/22lint+tooling,3248 units repeated under
coverage, builds/artifacts,7 UI foundations,76 shell and diagnostic performance
pass. Resilience completes100 passes and2 failures: the new identical browser/
native primary role journeys both expect Saved2026-10-25 but show Save time unknown.
Later onboarding/document/storage/native/policy stages do not execute in this
failed chain and are not counted as full-gate proof.

The presentation adapter intentionally sets `capturedDate:null`; inferring a
save date from that field was incorrect. The normal frame now reads the actual
validated selected-job `createdAt` and labels its full timestamp Saved with an
explicit UTC zone. Catalog capture labels stay separate, and no capture-freshness
or inferred timestamp is manufactured. The existing date assertion and all case
budgets remain. Corrected targeted browser/native and complete-source reruns
must pass before commit; keep this failure record.

## Complete corrected-source local checkpoint

Corrected targeted logs `company-jobs-save-date-browser.log` and
`company-jobs-save-date-native.log` show all5 browser cases31.7s and the identical
native journey11.5s (25.7s including setup), with the original Saved-date assertion.
The scoped web type/lint log contains both successful commands without diagnostics.
The complete final-source run below repeats these checks and supplies terminal proof.

Full `pnpm verify`, original37601, consumes terminal exit0 and
`COMPANY_JOBS_COMPLETE_VERIFY_FINAL_EXIT=0`; retained log:
`test-results/company-jobs-complete-verify-final.log`. It passes:

- Whole-workspace formatting,19 import policies, foundation records,35 type tasks,
  22 lint tasks plus tooling,230 unit files/3248 cases repeated under coverage.
  Coverage is84.19% statements/77.69% branches/85.47% functions/86.79% lines.
- Builds, contrast/extraction reports and extension artifact/package checks;
  7 UI foundations,76 shell,1 diagnostic performance,102 resilience (9.3m),
  7 onboarding,13 document-browser and15 browser-storage cases.
- All5 normal company-role browser journeys and the matching real-Rust journey
  inside resilience (10.2s). Actual browser/native repositories execute the shared
  v22/42 contract inventory. Current SQL/export schema stays182.
- Rust core24 passes plus the intentionally separately exercised secure-store
  lifecycle skip; all23 native-storage cases; Windows Credential Manager
  store/read/delete with `secretExposed:false`; native archive fault/recovery proof;
  generated schemas,831 npm licenses/23 roots,498 Rust licenses, secret scan,
  dependency audits and Changesets status.

No known npm vulnerabilities are reported. The existing11 reviewed allowed Rust
warnings remain; this slice changes no dependency versions or audit exceptions.
The first failed full run is retained above rather than reclassified as successful.
These are automated synthetic-fixture/local adapter proofs, not installed WebView,
manual accessibility, reference-hardware performance, signing or release acceptance.
Serial extension7030 consumes terminal exit0/`COMPANY_JOBS_EXTENSION_EXIT=0`:
all9 transfer/Firefox manual-fallback cases pass35.8s, retained in
`test-results/company-jobs-extension.log`. All local suite handles are terminal.
Final documentation hygiene follows before commit/push. The
previous60081b9 hosted closure remains separate from this uncommitted source; its
fresh exact hosted checkpoint is still required. INT-007 remains unchecked for
company interaction/source/salary/outcome projections, with INT-008 Home separate.

Final hygiene90886 consumes terminal exit0/`COMPANY_JOBS_FINAL_HYGIENE_EXIT=0`:
whole-workspace formatting,19 boundaries, foundation records,831 npm/498 Rust
license policies and secret scan pass. Staged and unstaged whitespace checks
are clean. All36 changed files belong to this coherent implementation/proof
checkpoint; the existing export-work stash remains untouched. Only this result
record follows frozen product/test source, before normal authorized commit/push.
