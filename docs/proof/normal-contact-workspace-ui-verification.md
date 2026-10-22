# Normal contact directory, selected details and owned forms — INT-007 in progress

## Starting checkpoint and authority

The runtime/application/storage prerequisites are pushed through
`f5e6868e2ba4b1593c74d77d9a5787a73404b7cb`. Its exact CI39706346305 is now terminal
success; watch76581 consumed exit0 with `NORMAL_CONTACT_RUNTIME_PROOF_WIRE_HOSTED_EXIT=0`.
That result does not prove this newer local source. The only starting dirt was our
three post-push result documents; preserve them and recovery stash2697.

This activates independent local UI implementation and explicitly supersedes the
prior result-documents-only freeze. Existing goal/design/Accepted decisions remain
authoritative: accountless/offline/AI-disabled operation; SQLite durable truth;
TypeScript application/UI composition, no UI SQL or new Rust operations; exact
field provenance and no silent confirmation overwrite; calm accessible language;
no enrichment, guessed methods, public/license inference, sending or surveillance.
No schema, dependency, permission, connector or Accepted decision changes.

## Inspected gaps

Normal Contacts currently shows an unconnected placeholder. Its initial route and
Back/Forward selection are still incorrectly restricted to catalog contact IDs;
company routing already distinguishes normal stored identities. Existing strict
directory/workspace APIs and manual-creation evidence are available but no normal
contact forms or selected-view lifetimes use them. Existing company owned-draft,
bounded page, mutation exclusion and guarded ready-commit focus patterns are the
baseline, not evidence that the contact path already works.

## Bounded implementation and required proof

1. Read one bounded contact identity page (25 rows) with immutable original
   vault/archive/optional company scope, First/Next/Retry, invalidated cursor
   recovery and honest loading/empty/unavailable/stale states. Never preload
   methods/notes/receipt hashes or infer a vault/relationship total. Changing
   owner hides prior facts before effect cleanup; retired reads cannot publish.
2. Read an explicitly selected contact and resolve current manual field basis
   locally, retaining the same read lifetime through asynchronous hashing.
   Archive state is visible/read-only. Only exact receipt-matching name/role/
   method values are shown in the selected detail; unknown populated values are
   explicitly withheld, not labeled absent or public/licensed. The accepted
   identity-only directory remains separate. No hash is shown as verification.
   Stale/failed reads retain visibly stale facts but disable editing; refresh is
   read-only and focus restoration waits for enabled committed controls.
3. Add one root-owned ephemeral contact draft above responsive/tab/route
   replacements. Creation owns a fixed vault/contact identity, original attempt
   context and optional captured company/version; notes own original contact
   version and cannot change methods, company or receipt. Preserve literal
   name/role/email/phone/profile/notes at existing full bounds; nullable methods
   remain nullable. Invalid/failed input is retained, never silently truncated.
4. Pending operations are single-flight/locked. An uncertain acknowledgement
   locks original intent and offers only explicit stored-state checking or
   warned discard, never automatic resubmission. Creation recovery requires exact
   scalar/operation/time/value-bound receipt correlation; notes recovery requires
   exact expected next version/notes and unchanged unrelated facts/evidence.
   Matching original notes state or missing fixed creation identity permits only
   an explicit retry. Acknowledgement and later view refresh remain distinct.
5. Render accessible explicit manual creation/notes forms with labels linked
   across responsive remounts, deliberate discard/keep choices, cancellable
   beforeunload protection, and owner-aware error/success focus. Foreign-vault
   draft fields are hidden; different-selection drafts offer explicit return.
   Export/restore/deletion use the existing captured-vault mutation exclusion and
   retire/disable stale owners. SQLite alone owns acknowledged data.
6. Connect normal deep links and Back/Forward without catalog clamping. Add
   explicit company-to-contact creation and bounded company-contact directory
   navigation plus contact-to-company navigation. Retain company-filter intent
   in local URLs/history/reload; never fall back to all companies for an invalid
   filter. Creation without a company is explicit; linking uses an actually
   viewed active company/version, not a guessed name or silent association.
7. Add focused controller/reader/route tests for scope/cursor rejection,
   asynchronous copies/disposal, lost or forged acknowledgement, exact receipt
   recovery, stale version/company, denied mutation ownership, literal bounds,
   unknown basis, failed readback and no repeat writes. Actual normal offline
   browser and real-Rust-process journeys must create through UI without fixture
   installation, reload exact saved facts, retain failed/pending/foreign drafts,
   preserve deliberate focus and prove 320px/forced-colors/reduced-motion/keyboard/
   automated accessibility behavior. Synthetic legacy/fault cases remain clearly
   distinct from unseeded normal creation and installed-WebView/manual proof.
8. Run complete final-source `pnpm verify`, serial extension/final policy, then an
   independently identified exact commit/push/hosted run. Update this proof and
   the ledger with actual results. Do not mark full INT-007 complete from this
   manual-contact UI slice.

Source-backed field provenance/public/license evidence, further relationship
projections and recorded interaction history remain required follow-through;
Interactions stays honestly unconnected, never an invented empty history. INT-008
and all participant/manual assistive-technology/reference-hardware/installed-
WebView/release gates remain open. No owner choice is needed for this slice.

## Results

### Exact hosted closure and manual-contact slice audit — 2026-10-22

Exact commit `160f031e2cfd070e016b6ae78370b08f35223ebb` passes
[Foundation CI39717538422](https://github.com/seabAu/Coredrill/actions/runs/39717538422).
Original watch46181 is consumed exit0 with
`NORMAL_CONTACT_UI_CORRECTED_HOSTED_EXIT=0`; never resume or restart it.
Workflow, all ten required jobs and parent check suite107639151524 independently
report completed success at that same commit. Pull-request-only dependency
review is intentionally skipped for the push. Aggregate119623154082 finishes
in28m10s without changing its30-minute budget.

The retained `normal-contact-ui-corrected-hosted-aggregate.log` proves the
unchanged complete `pnpm verify` chain reaches successful Changesets status:
2448 unit cases pass with one intentional platform skip (2449 total), and the
same disposition passes coverage. All63 resilience cases pass, including the
company-focus regression, four contact workspace cases and four real-Rust
normal-runtime journeys. npm audit reports **No known vulnerabilities found**.
Cargo audit retains exactly the same ten reviewed warnings (nine unmaintained
and the glib unsoundness finding), with no new exception. License checks pass
831 npm records across23 roots and498 Cargo crates; secret scanning passes.
The pinned-browser/platform logs below supply independent exact-version proof.
Earlier local audit timeouts, selector/fixture failures and the failed5d81586
hosted run remain retained failures, not reclassified successes.

The eight requirements in this manual-contact slice now have engineering proof:

| Requirement                        | Evidence and disposition                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded owned directory            | Scoped application/repository contracts and normal26-record paging, retry and route journeys pass; no methods/notes/totals are preloaded.                                                                      |
| Selected manual-basis details      | Workspace/hash-validation tests and actual normal browser/native reads pass; unknown populated fields remain withheld rather than invented as absent/public/licensed.                                          |
| Root-owned literal drafts          | Controller and normal creation/notes journeys retain original vault/contact/company/version intent through reflow, navigation and failure.                                                                     |
| Acknowledgement and recovery       | Exact receipt/notes recovery and held-write journeys prove explicit read-only checking, no automatic repeat write and independent canonical readback.                                                          |
| Privacy, focus and retirement      | New early-disabled-blur, cross-selection late acknowledgement, foreign-owner hiding, actual browser deletion and restore/reopen tests pass under unchanged assertions.                                         |
| Actual local navigation            | Normal company/contact creation, company filter, deep links, Back/Forward and reload journeys pass without catalog contact identities.                                                                         |
| Browser/native and accessibility   | Full local and both exact Chrome runs pass normal offline,320px,forced-colors/reduced-motion,keyboard/axe and real-Rust-process journeys; simulated-host and manual acceptance limits remain explicit.         |
| Complete final-source verification | Local3626, extension76212, format2675, policy33144 and this exact terminal hosted run pass. Result-only follow-up policy29013 also passes with `NORMAL_CONTACT_UI_CORRECTED_HOSTED_OBSERVATION_POLICY_EXIT=0`. |

This closes the manual-contact UI/focus/lifetime engineering checkpoint only.
Full INT-007 still requires source-backed field-use/provenance evidence,
remaining relationship projections and recorded interaction history; INT-008
Home integration is separate and unfinished. Installed native-WebView, manual
assistive-technology/usability, reference-hardware and release gates remain open.
No dependency, schema, permission or Accepted decision changed in this closure.
The immutable checkpoint needs no further source correction; a subsequent slice
must have its own pre-edit plan and new-source proof. Preserve stash2697 and the
two result documents for that next coherent change instead of pushing a
documentation-only successor over this proof.

### Exact pinned browser and platform proof; aggregate still pending

The same CI39717538422 at exact160f031 now has nine required jobs completed
successfully: both Chrome151/152 and Firefox153/154 lanes, extension transfer,
Windows/macOS/Linux package/storage lanes and full-history secrets. The
pull-request-only dependency review is intentionally skipped on this push.
Aggregate119623154082 still reports `Run foundation gate` in progress; watch46181
remains live. No whole-gate or hosted dependency-audit success is claimed.

Completed-job logs are retained as
`normal-contact-ui-corrected-hosted-{chrome151,chrome152,firefox153,firefox154,windows,macos,linux,extension}.log`.
Both Chrome logs explicitly pass all63 resilience cases, including the original
company creation/notes focus journey, all four contact workspace cases, and all
four real-Rust-process normal runtime journeys. Chrome151 passes resilience in
9.2 minutes and its complete lane in17m27s; Chrome152 passes resilience in
7.7 minutes and its lane in14m9s. Neither budget nor assertion was increased.
Both Firefox `STG_FIREFOX_PROOF` records show schema164, identical v14/32
repository contracts, career v3/4,58 datasets/116 files and explicit successful
restore/corruption/stale/deletion checks. Windows passes20 native cases; macOS
and Linux each pass19 with the one intentional platform skip. All three retain
Rust24 passes/one intentional ignored case. Extension transfer passes9 cases
in30.9s. These logs do not turn simulated UI-host evidence or package startup
diagnostics into installed-WebView/manual assistive-technology acceptance.

Additional read-only relationship inspection finds
`migrations/0019_interaction.sql` requires a job and allows a nullable contact
reference; `0063_interaction_timeline_index.sql` indexes job chronology. Contact
history must follow explicit `contact_id`, not infer an interaction from a
shared company. Any company/job relationship projection must identify joined
facts as current stored relationships rather than historical employer evidence.
This inspection activates no new feature, schema or mutation.

### Read-only provenance follow-through audit while exact CI runs

Inspection of `migrations/0012_contact_point_provenance.sql`,
`migrations/0010_provenance.sql`, `ContactRepository.linkProvenance` and
`ProvenanceRepository` in `packages/storage-core/src/tracker-repositories.ts`
finds an existing contact/field/value-hash/provenance relationship and retained
snapshot, method, pointer, excerpt, confidence, capture time and nullable
free-text license note. These facts support source tracing; they do not encode
an explicit public-contact or licensed-use eligibility decision. A nonempty
license note, public-looking URL, extraction method, confidence or confirmation
bit cannot supply that missing basis. The manual-creation receipt remains a
separate exact-value basis, not a source-policy authorization.

The next provenance slice must cover both bounded source inspection and an
explicit legitimate field-use basis before source-backed methods become
displayable. It must preserve unknown legacy classification, exact current-value
hash binding, nullable values and independent confidence/confirmation labels.
Any new durable evidence needs the normal migration, export, recovery and
cross-adapter proof; a read-only projection alone cannot close that requirement.
No new connector, extraction, licensed provider or network acquisition is
authorized by this audit. In particular, the existing USAJOBS adapter's deliberate
exclusion of contact fields remains unchanged.

This is read-only follow-through evidence, not an activated implementation plan,
new Accepted decision, schema change or completion claim. Exact CI39717538422
remains live under watch46181; the existing source/tests/helpers freeze and
result-documents-only boundary remain in force until its terminal result.

### Corrected successor pushed; hosted proof in progress

Commit `160f031e2cfd070e016b6ae78370b08f35223ebb`
(`fix: preserve contact read focus and owner lifetimes`) contains9 reviewed files,
746 insertions/17 deletions and is pushed normally to origin/main from a clean
tree. No force/history rewrite; stash2697 is retained. A final secret scan after
the result-only documentation update also passes. Complete local3626, serial
extension76212, format2675 and policy33144 are consumed successes; never resume
them. No dependency/lockfile/schema/permission/Accepted decision changed.

Exact [Foundation CI39717538422](https://github.com/seabAu/Coredrill/actions/runs/39717538422)
is **in progress**, not success. Watch46181 writes
`normal-contact-ui-corrected-hosted-watch.log`; require
`NORMAL_CONTACT_UI_CORRECTED_HOSTED_EXIT`. Observe the same handle without
restarting for observation timeout or superseding the run with a newer push.
Only result documents follow frozen source/tests/helpers. Aggregate119623154082
runs the unchanged full gate; both exact Chrome lanes must prove the corrected
focus/owner/restore paths. Initial pinned pnpm activation now succeeds in the
observed aggregate/macOS/Firefox lanes; this is not yet whole/audit success.
Old5d81586 failure and all earlier local failures remain retained, not reclassified.
Full INT-007/INT-008 and source-backed provenance/relationships/interactions/Home,
release/external-evidence gates and the overall goal remain open.

Subsequent observation of the same live watch and exact job metadata confirms
terminal success for Firefox154/153, extension transfer, full-history secrets,
macOS7m12s, Windows9m39s and Linux9m30s. Aggregate and both Chrome jobs remain
live; no whole-gate, audit or corrected-Chrome success is inferred. The
read-only provenance audit above changes only result records. Their Prettier
check and diff-whitespace check pass. Secret scanning initially cannot spawn
Git under the sandbox (`spawnSync git.exe EPERM`); the scoped-permission retry
passes without changing the scanner. Source/tests/helpers remain frozen,
HEAD/origin/main160f031 and stash2697 remain unchanged, and watch46181 must be
observed to terminal before a successor push.

### Corrected checkpoint ready for exact commit and hosted proof

Serial extension76212 is consumed exit0, nine cases/28.5s,
`NORMAL_CONTACT_UI_CORRECTED_EXTENSION_EXIT=0` in
`normal-contact-ui-corrected-extension.log`; Firefox fallback durable schema164.
Final root format2675 and policy33144 are consumed exit0:
`NORMAL_CONTACT_UI_CORRECTED_FINAL_FORMAT_EXIT=0` and
`NORMAL_CONTACT_UI_CORRECTED_FINAL_POLICY_EXIT=0` in corresponding corrected-final
logs. Boundaries/foundation,831 npm/498 Cargo licenses and secrets pass; diff
whitespace is clean. Full3626 remains a consumed success, including normal npm
audit and unchanged reviewed Rust warnings. No source/test/helper changes follow
that full result; only this result record and the ledger are updated.

Reviewed pending scope is the three read-view focus corrections, contact owner/
restore integration helper and browser/native cases, patch Changeset and two
progress/proof documents. HEAD/remote remains5d81586 until the authorized normal
commit/push; recovery stash2697 retained. New exact hosted proof is still required
and older5d81586 failure cannot prove the successor. No Accepted decision,
dependency/lockfile/schema/permission change or full INT-007/INT-008 closure.

### Complete corrected-source local gate passes

3626 is consumed **exit0**, `NORMAL_CONTACT_UI_CORRECTED_FULL_REFORMATTED_EXIT=0`
in `normal-contact-ui-corrected-full-verify-reformatted.log`. This is the complete
unchanged `pnpm verify` chain against the corrected frozen source, not a targeted
test substituted for it. Format/boundaries/foundation,35 types,22 lint/build,
201 files/2449 cases in both unit and coverage,7 UI foundations,76 shell,
1 performance,63 resilience,7 onboarding,13 document-browser,12 browser storage,
20 native SQLite and Rust24/1 intentional ignored all pass. OS secure-storage,
native archive/automatic backup, contract schemas,831 npm/498 Cargo licenses,
secrets and Changesets pass. The normal npm audit request now completes with
no known vulnerabilities; same10 reviewed Cargo warnings remain unchanged.
No security exception, mirror, TLS/signature bypass or persistent network change.
Old local audit timeouts and old5d81586 hosted failure remain failures.

Full native attachments are retained in
`normal-contact-ui-corrected-full-native-observation.log`: Network2403 actual
Rust IPCs/6 retired documents; legacy1125/2. All fallback/external counters zero,
packaged-WebView proof explicitly false. Legacy review1050.6ms preserves its
original five-second assertion; same/empty656.0/625.3ms. Actual contact ownership,
foreign observed-vault privacy, deletion/restore and early-blur regressions pass
within the full sequence, not only in isolation. Product/tests/helpers remain
frozen for serial extension/final policy and new exact commit/hosted proof. No
full INT-007/INT-008, release/external gate or goal completion claim.

### Fresh corrected-source whole gate restart after formatting failure

Fresh run3626 is live in `normal-contact-ui-corrected-full-verify-reformatted.log`;
require `NORMAL_CONTACT_UI_CORRECTED_FULL_REFORMATTED_EXIT`. Observe the same
handle without restarting for observation timeouts. Product source/tests/helpers
are frozen; only result documents follow. Serial extension/final policy and a
new exact normal commit/push/hosted run still follow a terminal result. HEAD and
origin/main remain5d81586 (its old CI is consumed failure), stash2697 retained.

26371 consumed exit1, `NORMAL_CONTACT_UI_CORRECTED_FULL_VERIFY_EXIT=1`, at
formatting only: the newly extended restore test needs formatting. No later
stage ran and no semantic failure is inferred. Format that file and immediately
check it with the pinned formatter; direct check and diff whitespace now pass.
Retain `normal-contact-ui-corrected-full-verify.log`. A fresh full run must start
against the corrected final source; this restart follows an actual terminal
failure, never an observation timeout. Source/tests then freeze; only result
documents may change. No whole/audit success yet.

### Corrected focus and owner/restore proof; fresh full gate next

Exact5d81586 CI39712953183 is **terminal failure**; watch73063 consumed exit1,
`NORMAL_CONTACT_UI_HOSTED_EXIT=1`. Extension, Windows package/storage, Firefox153,
Chrome152 and history secrets pass; aggregate/macOS/Linux/Firefox154 stop during
Corepack activation on official npm HTTP503. Chrome151 reaches resilience and
fails only the two company late-focus assertions (58 others pass). This is not
an npm-only workflow failure or hosted whole/audit success. Preserve the full log,
immutable Chrome151 artifact and every prior local timeout failure.

Controlled early-disabled-blur regressions fail unchanged contact detail52647
and directory45093, respectively
`NORMAL_CONTACT_UI_EARLY_DISABLED_FOCUS_BEFORE_EXIT=1` and
`NORMAL_CONTACT_UI_DIRECTORY_DISABLED_FOCUS_BEFORE_EXIT=1`. Product correction
separates stale revision from active read busy state in company/contact details
and contact pages. Stale edits/company-linked creation/continuations remain
disabled; First/Refresh stays enabled only until the read effect captures focus
before its ordinary busy transition. Same-owner enabled origin is preferred on
read completion; live-owner/read guards and deliberate-focus checks remain.
Original five-second focus/restore assertions and test budgets are unchanged.

42488 consumes exit0, six original/new browser/native cases35.6s,
`NORMAL_CONTACT_UI_READ_FOCUS_OWNER_AFTER_EXIT=0`; focus types and strict lint
also pass (`NORMAL_CONTACT_UI_FOCUS_TYPES_EXIT=0`,
`NORMAL_CONTACT_UI_FOCUS_LINT_EXIT=0`). This includes both before-failing early-
blur contact regressions, original company focus cases and normal contact paging.

Initial restore-owner54844 consumes exit1 on two incorrect test assumptions,
not new product failures: archive selection is explicitly read-only and remains
available during a contact write; after successful restore, the root removes all
workspace navigation/views until reopen (stronger than a disabled contact form).
Keep those failures. Correct the tests to the existing contract, never relax the
product guard: observe zero actual restore commits during a held contact update,
require explicit fresh target review after that update, then perform actual
same-vault restore from a freshly UI-downloaded archive. The old contact form,
private fields and navigation must all be absent until explicit warned reopen;
after reload, no draft remains and exact archived contact/manual basis read back.

48329 consumes exit0, native Network10.0s/offline restore2.7s/offline owner+actual
deletion2.6s (three cases26.0s),
`NORMAL_CONTACT_UI_RESTORE_COMMIT_OWNER_CORRECTED_EXIT=0`. Final new-source/helper
strict lint passes `NORMAL_CONTACT_UI_FOCUS_RESTORE_FINAL_LINT_EXIT=0`. The
synthetic observed foreign owner and early-blur model are disclosed separately
from actual UI-created contacts, SQLite writes/archive restore/deletion; this is
not a multi-vault feature or installed-WebView/manual accessibility proof.

Current product/test source is ready to freeze for a fresh complete local gate,
then serial extension/policy and a new exact candidate/hosted run. No dependency,
lockfile/schema/permission/Accepted decision change. No current whole/npm-clean
or full UI-slice/INT-007/INT-008 completion claim. Source-backed contact provenance,
relationships/interactions/Home and release/external evidence still follow.

### Focus regression isolated; guarded correction plan

New owner-lifetime run5099 consumed exit1: both cases wait for Settings under
Primary navigation, but the captured DOM places Settings outside that nav.
Correct only those three selectors; retain120-second test and five-second
assertion budgets. Corrected82607 consumes exit0, native Network9.7s/browser
owner+actual deletion2.6s (two cases/23.0s),
`NORMAL_CONTACT_UI_OWNER_LIFETIMES_CORRECTED_SELECTOR_EXIT=0`. New helper/spec
strict lint passes in `normal-contact-ui-owner-lifetimes-lint.log`. Browser owner
case now runs from the cached offline shell and observes zero external requests.
No product change was needed for these ownership/deletion cases.

Hosted Chrome151119608328118 is terminal failure with58/60 resilience cases
passing. Both failures are the original company late-acknowledgement focus
assertion at `company-workspace-journey.mjs:330`, not the new contact screen or
registry setup. Full log `normal-contact-ui-hosted-chrome151-job-log.log`; immutable
failure artifact12397932047, SHA256
`d18ca4d059fd864ee4495ceb2a0b4e0c8f7be3ac07641acad552005e939591c5`.
Remaining Chrome152 is still live; watch73063 remains authoritative. Preserve
original five-second focus assertions, original restore budgets and all evidence.

Source inspection isolates a candidate-introduced change: company `busy` now
includes revision mismatch, so a previously focused Refresh control can be
disabled by the revision render before the read effect captures its origin.
The same pattern exists in the new contact detail/page. Correct this without
allowing stale edits: distinguish stale revision from active read busy state;
keep notes/company-linked creation/continuation actions disabled when stale,
while leaving the read-refresh control enabled only until the read effect can
capture focus before its ordinary busy transition. Different-owner facts remain
hidden synchronously. Add a deterministic early-disabled-blur contact regression
and retain ready-commit/deliberate-focus guards; never force focus onto a new
owner or remove a stale-value guard just to pass. This is same-slice correctness,
not a new architecture/dependency/permission decision. Fresh final-source proof
and exact successor hosted verification remain required; no completion claim.

### Requirement audit follow-through and hosted setup failure

CI39712953183 remains live/watch73063, but aggregate119608327972,
macOS119608328017, Linux119608328294 and Firefox154119608328378 are terminal
failures before product tests: Corepack receives HTTP503 from the official
`https://registry.npmjs.org/pnpm/11.22.0` metadata endpoint while activating the
unchanged pinned package manager. Direct completed-job API logs are retained as
`normal-contact-ui-hosted-{aggregate,macos,linux,firefox154}-job-log.log`.
The CLI `run view --log` probes only report that the whole run is still live;
those are observation failures, not additional workflow failures. No substitution,
mirror, signature/TLS bypass, dependency update or successful audit is inferred.
Extension, Firefox153 and full-history secrets pass; remaining jobs still run.

The current completion audit identifies stronger contact-specific integration
proof still needed even if remaining candidate jobs pass:

| Requirement                                                                       | Existing evidence                                                                                  | Remaining direct proof                                                                                                                                              |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foreign-vault draft fields stay hidden and retained                               | Controller rejects foreign IDs; render-time hook owner guard                                       | Drive an explicitly synthetic changed observed vault through normal Settings refresh, inspect hidden fields, then restore original observed owner and exact draft   |
| Late notes acknowledgement cannot replace another selected contact or steal focus | Captured controller intent and retired digest tests; company-specific late acknowledgement journey | Hold a contact notes write, select a different actually UI-created contact, release original write, retain new selection/focus, explicitly return to original draft |
| Vault mutation/deletion retire or block contact owners                            | Shared mutation session tests and company-specific deletion journey                                | Pending contact save excludes actual vault deletion/export work; explicit actual browser deletion clears the retained private contact draft                         |

This activates bounded contact-lifetime integration proof under the existing UI
plan, including actual same-vault restore/reopen with an unsaved contact draft:
prove commit submission exclusion during a held contact mutation, removal of
stale workspace views after commit, then draft retirement after explicitly warned
reload of a freshly UI-downloaded actual archive. It supersedes the result-
documents-only freeze for independent local test work. At activation,5d81586
source remains immutable in hosted CI; do not push over
the live run or use its result to prove newer tests. Inspect/fix product code only
if a new regression demonstrates a specific same-scope bug; no new feature,
dependency/schema/permission/Accepted decision change is authorized by this audit.
Record every failure and new final-source proof before a successor commit. No
full UI-slice/INT-007/INT-008 completion claim; contact provenance follows this
required proof, not ahead of it.

### Exact candidate pushed; hosted whole/audit proof in progress

Candidate `5d8158699678861ae22ace2bd2b562b279680be7`
(`feat: connect owned offline contact screens`) contains25 reviewed files,
3385 insertions/20 deletions and is on origin/main after a normal non-force push
from a clean tree. Stash2697 remains intact. Final root format39404 consumed
exit0, `NORMAL_CONTACT_UI_FINAL_FORMAT_EXIT=0`, and staged diff check passes.
No dependency/lockfile/schema/permission/Accepted decision changed.

Exact [Foundation CI39712953183](https://github.com/seabAu/Coredrill/actions/runs/39712953183)
is **in progress**, not success. Watch73063 writes
`normal-contact-ui-hosted-watch.log`; require `NORMAL_CONTACT_UI_HOSTED_EXIT`.
Observe that same handle without restarting for observation timeouts. Do not
supersede this run with another push; only result documents follow the frozen
candidate. Its aggregate119608327972 runs unchanged full `pnpm verify`, including
the npm audit which timed out locally; both Chrome lanes exercise the new contact
journeys, and the matrix includes Firefox, extension and native packages/storage.
Predecessor f5e6868 success cannot prove this candidate. Local90307/86829 remain
retained timeout failures; no npm-clean/local-whole-success or slice-complete
claim is made. Full INT-007/INT-008 and release/external evidence gates remain open.

Activated before product edits. Directory reader/editor plus existing application
contracts pass119 focused cases after correcting two test fixtures (empty phone
must be null; equal-time cursor IDs order ascending). Initial failing runs remain
in `normal-contact-ui-editor-focused.log` and
`normal-contact-ui-reader-editor-focused.log`; corrected run
`normal-contact-ui-reader-editor-corrected.log` ends
`NORMAL_CONTACT_UI_READER_EDITOR_CORRECTED_EXIT=0`. This is controller/contract
proof, not UI, real-SQL or native proof. New views/root routing/company links are
implemented locally; fresh types pass in `normal-contact-ui-views-types.log`
(`NORMAL_CONTACT_UI_VIEWS_TYPES_EXIT=0`). Initial strict UI lint errors were
corrected without suppressions; `normal-contact-ui-views-final-lint.log` ends
`NORMAL_CONTACT_UI_VIEWS_FINAL_LINT_EXIT=0`. A direct lint command also inspected
the old native proof harness beyond its repository lint scope and reports eight
pre-existing baseline issues there; no unrelated harness cleanup is claimed.

Actual initial browser58570 consumed exit0 (two company/contact cases), focused
67776 consumed exit0 (real-Rust Network, original26-company directory and offline
contact UI), then expanded57049 consumed exit0 (real-Rust Network,26-contact
directory and offline contact UI). Expanded log
`normal-contact-ui-browser-native-expanded.log` ends
`NORMAL_CONTACT_UI_BROWSER_NATIVE_EXPANDED_EXIT=0`, three cases/26.5s. Successful
writes use normal UI and actual selected-runtime SQLite; no contact fixture
installer. The shared journey proves a literal512-character name plus exact role/notes,
nullable phone, company version capture, withheld unsupported values, archived
read-only state, failed readback/stale edit denial, asynchronous basis disposal,
lost creation/notes acknowledgements and explicit recovery without duplicate
writes, retained draft across tabs/routes/reflow, company links and scoped
Back/Forward/reload, ambiguous cohort rejection, cancelled beforeunload,320px
forced-colors/reduced-motion keyboard/focus/axe. The page test creates26 contacts
through UI, proves25+1 distinct identities, retries the exact failed cursor,
retains a stale page, and retires a delayed archive owner without stealing focus.

Unknown-basis/archive responses are explicit synthetic display faults over a
real stored record, never persisted facts or legacy-SQL provenance proof. Native
journey uses actual Rust SQLite with simulated host/picker, not installed WebView
or manual assistive-technology proof. Browser/native contact detail and notes
screenshots were visually inspected; literal markup stays text, long values wrap
and controls remain labeled at320px. Existing installed-package/release/external
evidence gates are not closed. The focused helper lint then found an unqualified
`structuredClone` in the new page test; qualify it with `globalThis` with no
behavior change. Complete final-source verification, serial extension/policy and
exact new commit/hosted proof remain. Full INT-007 stays unchecked.

### Complete final-source gate in progress

Source/tests/helpers are frozen for whole `pnpm verify`, session90307,
`normal-contact-ui-full-verify.log`; require `NORMAL_CONTACT_UI_FULL_VERIFY_EXIT`.
Observe the same handle; do not restart for an observation timeout. Added-test
strict lint passes separately in `normal-contact-ui-added-tests-lint.log`,
`NORMAL_CONTACT_UI_ADDED_TESTS_LINT_EXIT=0`. Current whole-run format/boundaries/
foundation,35 types,22 lint and both unit/coverage passes (201 files/2449 cases)
are partial stages, not a final success. Only result documents may change during
this checkpoint; later serial extension/policy and exact commit/hosted proof are
still required. No full INT-007/INT-008 or goal closure.

Whole90307 has now passed7 UI-foundation,76 shell,1 performance,60 resilience,
7 onboarding,13 document-browser,12 browser-storage and20 native SQLite cases;
Rust24 pass/1 intentional ignored, OS secure-storage, native archive/backup,
contract schemas,831 npm/498 Cargo licenses and secrets also pass. Native full-run
attachments are decoded to `normal-contact-ui-full-native-observation.log`:
Network2012 actual Rust IPCs/6 retired documents, all capability-fallback and
external counters zero. Legacy restore review1031.9ms retains the original
five-second assertion. This remains simulated host/picker proof, not installed
WebView proof. The remaining dependency audit is retrying the npm advisory bulk
endpoint (error23); same90307 is still live. No final audit or whole-gate success
is claimed, and no source/test/check was weakened or restarted.

Whole90307 is now consumed **exit1**, `NORMAL_CONTACT_UI_FULL_VERIFY_EXIT=1`:
only npm advisory bulk request timed out after its built-in retries; Cargo audit
and Changesets did not run because the command chain stopped there. Preserve that
failure. Unchanged targeted dependency-audit retry86829 writes
`normal-contact-ui-dependency-audit-retry.log`, requiring
`NORMAL_CONTACT_UI_DEPENDENCY_AUDIT_RETRY_EXIT`. A separate empty advisory POST
reachability probe14222 has a20-second timeout and submits no dependency or user
data. No success, dependency substitution, suppression or security exception is
claimed. Final-source whole success, serial extension/policy, exact commit/push/
hosted proof remain required.

### External-audit failure retained; exact hosted candidate proof required

Targeted86829 also consumed exit1,
`NORMAL_CONTACT_UI_DEPENDENCY_AUDIT_RETRY_EXIT=1`, on the same advisory timeout.
Probe14222 consumed exit1. Basic registry GET succeeds; only one empty
IPv4/HTTP1 advisory POST returned200 and was not reproducible. Default curl,
IPv4 curl, a repeated IPv4/HTTP1 request and Node IPv4-first all time out. No
resolver/TLS/proxy configuration was changed; no transport fix or global outage
is established. Avoid repeated blind requests. These are local reachability
failures, not evidence of either vulnerable or clean npm dependencies.

Independent serial extension72441 consumed exit0, nine cases/26.1s,
`NORMAL_CONTACT_UI_EXTENSION_EXIT=0` in `normal-contact-ui-extension.log`.
Unchanged Cargo audit passes separately, `NORMAL_CONTACT_UI_RUST_AUDIT_EXIT=0`
in `normal-contact-ui-rust-audit.log`: same ten reviewed warnings (nine
unmaintained, glib unsoundness); no new exception or dependency change. Initial
Changesets status hit sandbox `spawn EPERM` in
`normal-contact-ui-changeset-status.log`; rerun with scoped process permission,
preserving that diagnostic rather than treating it as a product failure.

The pre-edit sequence is explicitly adjusted because two complete npm request
retry cycles fail locally: after final format/policy/Changesets, use the standing
normal commit/push authorization for an exact **candidate** and obtain independent
hosted `pnpm verify` with the unchanged dependency audit. This is not a security
exception, a weakened gate or a local whole-gate success. Local90307 remains
failed; candidate/hosted proof is pending. The slice cannot be declared verified
until the exact hosted whole gate (including npm audit) succeeds. Keep source/
tests frozen, preserve all prior failures and stash2697, and leave full INT-007/
INT-008 unchecked.

Final policy70420 consumed exit0,
`NORMAL_CONTACT_UI_FINAL_POLICY_EXIT=0` in `normal-contact-ui-final-policy.log`:
boundaries/foundation,831 npm/498 Cargo licenses and secrets pass. Scoped-permission
Changesets retry passes,
`NORMAL_CONTACT_UI_CHANGESET_STATUS_PERMITTED_EXIT=0` in
`normal-contact-ui-changeset-status-permitted.log`; initial EPERM remains
retained. Final root formatting/diff review precedes the authorized candidate
commit/push. No existing dependency/version/lockfile/schema/permission/ADR changed.
