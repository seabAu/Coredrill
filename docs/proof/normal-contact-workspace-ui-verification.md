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
