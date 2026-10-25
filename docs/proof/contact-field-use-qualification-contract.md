# Contact field-use qualification contract foundation

Date: 2026-10-24. Status: complete local, serial extension and final policy
verification pass; exact committed hosted verification pending.

## Outcome and scope

INT-007 requires durable exact-value public/licensed qualification and explicit
review controls. This bounded infrastructure contract is its next prerequisite,
not a replacement for persistence or normal UI. Independent contact evidence
must not create a hidden job to satisfy the existing job-source foreign keys.
Existing manual-creation receipts and historical source inspection stay unchanged.

The contract separates an independent user-supplied source snapshot, a field's
exact hash and provenance pointer/excerpt, an explicit job-search purpose and
review/expiry record, and a separately resolved reviewed policy. The assessment
may qualify synthetic public/licensed cases only when every scope and time bound
matches. A URL, source class, license note, confidence or confirmation flag alone
cannot grant use. Policy comes from a runtime-owned resolver, not an incoming
qualification's assertion. No production contact policy or connector is added.
Expiry/review due/revocation withholds the use basis; it never deletes a contact.
Outputs describe reviewed basis, not verified identity, deliverability, legal
advice, permission to send, or automated outreach.

## Execution and required proof

1. Add failing contract tests using only synthetic UUIDs, hashes and `.example`
   source URLs. Cover positive public/licensed assessments and each independent
   scope, hash, purpose, review, expiry, revocation and policy-denial condition.
2. Implement strict version-1 bounded scalar-safe parsers that copy/freeze input,
   reject extra/unknown fields and expose no raw contact values. Resolve policy
   independently and validate its exact source/hash/version/field/purpose scope.
3. Prove deterministic boundaries (including equality at expiry), malformed and
   unsupported input, absent/disabled/stale policy, immutable output and no
   resolver invocation for invalid input. Run focused tests, workspace checks,
   full `pnpm verify`, serial extension checks and final policy before commit.
4. Carry the two pending exact9025d46 hosted closure receipts into the next
   verified implementation checkpoint. Require exact new hosted evidence; do not
   attribute previous CI to these new sources.

## Compatibility and remaining integration

No dependency, lockfile, SQLite schema/archive, acquisition permission or Accepted
decision changes. Application contracts are additive, with integer version 1.
SQLite remains canonical; the pure assessor is not a cache or storage substitute.
The runtime-owned policy resolver is an authority port, not approval of arbitrary
serialized policy input. Durable source/qualification records, transactional
original-vault/value guards, export/restore, explicit review/revocation UI and
normal browser/native proof remain required before field-use integration or full
INT-007 closure. Company relationships and INT-008 Home remain afterward.

## Verification

The initial sandbox invocation stops at Vite child-process `spawn EPERM`, before
tests execute. The scoped-permission baseline then consumes exit1 in
`test-results/contact-field-use-contract-baseline.log`: the new module is absent,
so the suite cannot collect. This is missing-implementation proof, not a claim
that behavioral assertions ran against a previous assessor.

After implementation, the first 56 new cases pass. Application source and test
TypeScript checks pass. An extra direct ESLint invocation over the test file
fails because the repository project service does not discover application test
files; no ESLint/project configuration is changed. Separate strict production
source lint passes. The expanded final run consumes
`CONTACT_FIELD_USE_CONTRACT_FINAL_FOCUSED_EXIT=0` in
`test-results/contact-field-use-contract-final-focused.log`: three files / 186
cases, including 61 new qualification cases and existing field-evidence/manual
workspace regressions. Additional cases cover all five fields, public datasets,
independent policy vault binding, review-time equality, future capture,
resolver-side input mutation and asynchronous/unresolved policy rejection.

Final product source/tests are frozen for complete `pnpm verify`, followed by
serial extension and final policy checks. No complete or hosted success is yet
claimed. No production field eligibility or persistence/UI behavior changes.

## Complete local verification

The preceding pending paragraph records the historical start, not the terminal
outcome. Full session22619 consumes exit0 and
`CONTACT_FIELD_USE_CONTRACT_FULL_VERIFY_EXIT=0` in
`test-results/contact-field-use-contract-full-verify.log`. Pinned observed tools
are Node24.19.0, pnpm11.22.0 and Rust1.98.0. Results:

- Formatting,19 import boundaries,52 dependency/three toolchain/16 execution
  target/ten accessibility records,35 typecheck tasks,22 package lint tasks plus
  tooling,221 unit files/2924 cases and the matching coverage repeat pass.
- Coverage:83.98% statements,77.78% branches,84.98% functions,86.58% lines.
- All22 builds, current contrast/extraction reports, production extension
  manifest/CSP/remote-code/secret/package/source-rebuild inspection pass.
- Seven foundations,76 shell, one diagnostic performance,85 resilience, seven
  onboarding,13 document and14 browser-storage cases pass. Browser recovery
  retains158/159/160/164/165 archives and current167 content/attachments. Normal
  old/current restore, contact/evidence/history/interaction/deletion regressions
  stay unchanged; this is not a new qualified-field UI journey.
- Actual native storage passes22 cases; Rust core passes24 with one deliberate
  direct-secret ignore. The separately prepared Windows Credential Manager
  lifecycle actually stores/retrieves/deletes without exposing its secret.
  Archive cancellation/corruption/atomic failure recovery and managed backup
  verification/rotation pass. No installed WebView/manual/reference-hardware or
  physical cross-adapter SQLite-byte equality claim is added.
- Generated schemas are current. License checks pass831 npm packages across23
  roots and498 Rust crates. Secrets pass; npm audit reports no known
  vulnerabilities. The same11 previously reviewed allowed Cargo warnings,
  including the Unix glib/Tokio risks, remain. No exclusion or threshold changes.
  Changesets status passes.

Separate serial extension session65032 consumes exit0 and
`CONTACT_FIELD_USE_CONTRACT_EXTENSION_EXIT=0` in
`test-results/contact-field-use-contract-extension.log`: all nine cases/29.2s.
Actual Chromium149.0.7827.55 proves capture/review/correction/reload and boundary
regressions; Firefox151 manual fallback imports idempotently at schema167.
These are not substitutes for exact Chrome151/152 and Firefox153/154 hosted jobs.

Only result/design/checklist documents follow the full source/test gate. Refreshed
origin/main remains aligned with HEAD9025d46 and stash2697ebcec53351a052d8c5c19e2b8e2a52056a70
is retained. All historical SQL/archive/lock/permissions/Accepted ADRs remain
unchanged. Final policy and new exact committed hosted proof remain required.

## Ready for the authorized checkpoint

Final session30365 consumes exit0 with
`CONTACT_FIELD_USE_CONTRACT_FINAL_FORMAT_EXIT=0` and
`CONTACT_FIELD_USE_CONTRACT_FINAL_POLICY_EXIT=0` in the respective
`test-results/contact-field-use-contract-final-format.log` and
`test-results/contact-field-use-contract-final-policy.log`. Formatting, all19
boundaries, foundation records,831 npm/23 roots/498 Rust license checks and secret
scanning pass. Diff whitespace is clean. No source/test changes follow full
verification; these terminal-result notes do not rewrite historical failures.

The next ordinary commit includes the two pending prior deletion hosted-closure
receipts, additive contract/source/test/export/Changeset and their specification
and proof updates. Exact new hosted verification remains required; no full
INT-007 or production qualification/review completion is claimed.
