# Company interaction history — INT-007 in progress

Status: normal runtime/UI implemented; complete corrected-source local gate passes.
Serial extension and final hygiene pass; fresh exact hosted proof remains before this
checkpoint closes. Company source/salary/outcome relationships and full INT-007
remain open. The previous role checkpoint's hosted failure stays failed.

The next company relationship is recorded interaction history for jobs currently
linked to the explicitly viewed company. This is a current relationship query,
not evidence of an employer at the time of an interaction. A contact sharing the
company does not create history. Records with no contact, archived contacts or
contacts detached by deletion remain history of their actual job.

The read boundary binds the original vault/company/revision, independent company
and job archive scopes, and occurrence-descending/interaction-ID-ascending live
keyset order. Each continuation/reference includes the interaction and current
job versions and nullable contact identity. A moved/changed job, obsolete company
or contact detachment invalidates the original reference rather than silently
rebasing it. Refresh may then show the preserved record with its current links.

Pages contain bounded literal summary previews and minimal current job metadata,
not contact names/methods, job descriptions, company notes, source bodies, totals
or inferred outcomes. Deliberate full-summary reads use bounded UTF-8 BLOB slices
with the same viewed reference, preserving BOM, NUL and scalar boundaries.
All lookahead rows are validated. No writes, migration, dependency, permissions,
network, enrichment or sending are needed for this prerequisite.

Implement strict application contracts and the actual SQLite repository, then
prove scope/ordering/corruption/privacy/ownership and full literal reconstruction.
Shared Node/browser/native execution and normal runtime/UI composition follow;
this document alone is not completion proof. Existing indexes can serve the
current join; bounded output is not a reference-hardware latency claim. Any later
index change needs measured justification. INT-007 remains unchecked.

The published company-role checkpoint6fada7e has its own exact live
CI40182470910/original watcher98859; do not reuse that run for new source or
restart it on an observation timeout. Pending post-push proof/checklist receipts
remain with the next coherent verified implementation checkpoint.

## Implemented read boundary and adapter proof

`packages/application/src/company-interactions.ts` validates, copies and freezes
the company scope, current-job metadata, nullable contact, interaction key/version,
page and bounded summary contracts. It shares the established company owner and
UTF-8 rules without adopting contact employment as membership. The actual
`company-interactions-repository.ts` reads owner, anchor and page/summary in one
read snapshot (or existing transaction fallback), validates the lookahead too,
and uses BLOB lengths/slices and literal job-title decoding. No migration or
canonical write is added. Contact detachment explicitly invalidates old references
even though preserved interaction content and row version remain unchanged.

- Focused commanda03774 consumes exit0/COMPANY_INTERACTIONS_FOCUSED_EXIT=0:
  36 application and12 actual migrated SQLite cases (48 total).
- Complete9200 consumes terminal0/COMPANY_INTERACTIONS_TYPES_LINT_UNIT_EXIT=0:
  all35 types,22 lint plus tooling,232 files/3296 units before the shared addition.
- The first shared selector used two nonexistent aggregate/inventory filenames;
  Vitest only ran the two matching focused suites (48 cases). That successful
  exit is not shared-suite proof. Confirmed filenames in correctedc4bcf6 run
  four suites/90 cases, including the actual aggregate and execution inventory,
  terminal0/COMPANY_INTERACTIONS_SHARED_NODE_FINAL_EXIT=0.
- The shared manifest advances to v23/43 cases, preserving all42 earlier cases.
  Explicit browser/native/Firefox inventory assertions advance together; SQL and
  portable exports remain182. The new case executes actual owned paging, nullable
  contacts, current job membership, future imports, exact long-summary reconstruction,
  unchanged canonical rows, cross-scope rejection, contact detachment, changed/
  moved jobs and independent archives in every adapter.
- Serial93676 consumes terminal0 with both browser and native markers:
  COMPANY_INTERACTIONS_SHARED_BROWSER_EXIT=0 (20.2s/29.4s including setup),
  COMPANY_INTERACTIONS_SHARED_NATIVE_EXIT=0 (8.19s). Native intentionally filters
  the manifest case and skips22 unrelated cases; it is not a full native-suite run.
- Shared29659 passes all35 types but lint catches one redundant optional chain
  in the new assertion; units do not run in that failed chain. Removing it changes
  no assertion or budget. Corrected54204 consumes terminal0/
  COMPANY_INTERACTIONS_SHARED_FINAL_TYPES_LINT_UNIT_EXIT=0 with35 types,
  22 lint plus tooling and232 files/3296 units.

## Normal runtime and UI composition in progress

The selected-runtime API validates/copies input before awaiting database opening
and uses the actual same repository. An owned reader keeps one bounded page and
one deliberate summary, serializes flights, preserves exact failed requests,
blocks stale continuation, suppresses retired publication, and reconstructs summary
parts without duplicating retained text. Normal company detail now composes first/
next/archive/retry, literal previews, bounded full-summary inspection and privacy/
current-membership caveats. It does not create or send interactions or infer totals.

90219 consumes terminal0/COMPANY_INTERACTIONS_UI_TYPES_LINT_EXIT=0 with all35
types/22 lint plus tooling for the initial UI. Focused runtime/reader commandd4e27b
consumes exit0/COMPANY_INTERACTIONS_RUNTIME_READER_EXIT=0 with11 cases covering
lazy/foreign storage, original ownership, unread versus confirmed empty, page and
summary single flight/exact retry, disposed late publication, stale references,
literal reconstruction and malformed output. These fake-port boundary tests do
not substitute for actual browser/native UI proof. New normal UI journeys are
running; complete final-source/serial extension/policy/new exact hosted proof
remain. No complete company relationship or INT-007 claim.

## Focused normal browser/native results

Initial89767 ends1 pass/1 failure. The actual paging/retry/archive/summary journey
passes6.8s; manual entry stops on a test selector asking for Timeline as a tab when
the existing control is a button. Correcting the selector preserves its assertions
and30-second budget. Serial81815 consumes exit0 for both normal browser and native
markers: two browser cases25.6s, identical native journey10.7s (27.3s with setup).

82188 passes product types/lint but tooling lint finds an unused test owner and
unqualified TextEncoder; units do not run. Remove the unused binding/import and
qualify the existing global, without suppressions. Corrected41131 consumes
terminal0/COMPANY_INTERACTIONS_UI_CORRECTED_TYPES_LINT_UNIT_EXIT=0:
35 type tasks,22 lint plus tooling,233 files/3307 unit cases.

Visual inspection exposes excessive page height for a long summary. The retained
summary now has a bounded keyboard-focusable scroll region rather than growing
the entire page. Expanded25946 consumes both terminal0 markers: all3 browser
cases28.5s and identical real-Rust journey14.2s (44.4s with setup). The third actual
browser case holds a real summary result, selects another company's confirmed
empty history and proves no late body publication or focus theft. Primary proof
covers UI-only manual capture/recording/reload; disclosed synthetic archive paging,
independent archives, exact failed-page/part retry, literal BOM/NUL reconstruction,
held read/reflow,320px/axe and unchanged SQLite hash across the read segment.
These are simulated-IPC native proofs, not installed WebView acceptance.

The previous company-role checkpoint's two hosted Chrome failures are retained
in its own proof. Deterministic note-probe setup and complete component-wise
browser execution are follow-up verification changes, not permission to reuse old
CI or weaken assertions. Initial repair typecheck14199 catches a literal-union
Set rejecting an arbitrary case-name string; explicit `Set<string>` fixes the
internal membership lookup. Corrected checks58241 and serial component/note/UI
checks79449 are running. Full final-source/extension/policy/new exact hosted gates
remain before commit; SQL/export182 and Accepted decisions remain unchanged.

## Complete final-source local verification

Original93255 consumes terminal exit0/`COMPANY_INTERACTIONS_COMPLETE_VERIFY_EXIT=0`.
Retained log: `test-results/company-interactions-complete-verify.log`. Source/tests
are frozen; only result records follow. Complete `pnpm verify` passes:

- Whole-workspace formatting,19 boundaries, foundation records,35 type tasks,
  22 lint tasks plus tooling;233 unit files/3308 cases repeated under coverage.
  Coverage:84.34% statements/77.87% branches/85.58% functions/86.97% lines.
- Builds and contrast/extraction/extension artifacts;7 UI foundations,76 shell,
  1 diagnostic performance,106 resilience (9.2m),7 onboarding and13 document cases.
  The normal native company-history journey repeats in9.8s. All3 normal browser
  journeys and the repaired note-lifetime case repeat with their assertions intact.
- All33 browser-storage tests, including every one of19 reviewed components and
  all43 repository cases under the original per-test timeout;23 native-storage
  cases with the identical complete v23/43 aggregate; Rust core24 passes plus the
  secure-store lifecycle intentionally delegated to its separately passing harness.
- Windows Credential Manager store/read/delete with `secretExposed:false`, native
  archive fault/recovery proof, generated schemas,831 npm packages/23 roots and498
  Rust license checks, secret scan, dependency audits and Changesets status.

No npm vulnerabilities are reported; the same11 reviewed allowed Cargo warnings
remain. No lockfile, audit exception, schema/export182, existing recovery fixture,
permission, account/network/AI requirement or Accepted decision changes. Local
Chromium156 and simulated-IPC real Rust proofs do not establish exact hosted
Chrome151/152, installed WebView/manual accessibility, reference-hardware latency,
signing or release acceptance. The previous40182470910 run is terminal failure
and original98859 is closed. New exact hosted evidence is still required.

Keyboard-scroll52380 passes all3 cases27.1s before the full gate, proving End
scrolls the labeled body and its height stays at most384px. The narrow forced-color
screenshot was visually inspected after bounding the body. Full-gate repetition
retains these assertions; no case budget is raised. Serial extension34189 is
now terminal0/`COMPANY_INTERACTIONS_EXTENSION_EXIT=0`, all9 cases34.2s, retained
in `test-results/company-interactions-extension.log`. All local suite handles are
terminal. Final proof/checklist hygiene and authorized commit/push follow.

Final hygiene11550 consumes terminal exit0/
`COMPANY_INTERACTIONS_FINAL_HYGIENE_EXIT=0`: whole-workspace formatting,19 boundaries,
foundation records,831 npm/498 Rust license policies and secret scan pass. Whitespace
checks are clean. All36 implementation/test/design/Changeset/proof files belong
to this checkpoint; stash2697 remains unchanged. Only result documentation follows
frozen source/tests before the authorized normal commit/push and fresh exact CI.
