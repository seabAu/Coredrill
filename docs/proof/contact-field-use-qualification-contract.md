# Contact field-use qualification contract foundation

Date: 2026-10-24. Status: scoped contract foundation passes complete local,
serial extension, final policy and exact committed hosted verification.

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

## Exact pushed checkpoint — hosted verification in progress

Ordinary eight-file commit `cf3c6b0ac98c3d8f76433395b2764af2da798407`
(`feat: define exact-value contact field-use qualification`) is pushed normally
from9025d46 to origin/main. Both refs match and the immediate post-push worktree
is clean. The prior deletion hosted closure receipts are included, not left
behind. Stash2697 remains preserved; no force/history rewrite occurs.

[Foundation CI40147804029](https://github.com/seabAu/Coredrill/actions/runs/40147804029)
is confirmed for that exact SHA. One retained watch65788 writes
`test-results/contact-field-use-contract-hosted-watch.log` and must consume
terminal `CONTACT_FIELD_USE_CONTRACT_HOSTED_EXIT`. Never restart it solely on an
observation timeout or supersede the live run with another push. The initial
watch snapshot shows the full-history secret job121032798827 successful; all
other required aggregate/browser/extension/native/package jobs are progressing.
PR-only dependency review121032799593 skips on push, as intended. This is not a
whole hosted success claim or proof of later sources. Only fresh result records
follow this pushed checkpoint; exact completed job evidence and the scoped
requirement disposition remain before foundation hosted closure. Full INT-007,
durable qualification, normal review controls and the overall goal stay open.

## Exact hosted closure and contract requirement disposition

Exact `cf3c6b0ac98c3d8f76433395b2764af2da798407` passes
[CI40147804029](https://github.com/seabAu/Coredrill/actions/runs/40147804029).
All ten required jobs are completed/success; PR-only dependency review skips on
push. Original watch65788 is consumed exit0 with
`CONTACT_FIELD_USE_CONTRACT_HOSTED_EXIT=0`, not live. Completed full-log download
71511 consumes exit0/`CONTACT_FIELD_USE_CONTRACT_HOSTED_COMPLETE_LOG_EXIT=0`.
All nine direct job-log downloads (aggregate, both Chrome, both Firefox, three
native platforms and extension) also consume their explicit log markers0.

| Actual completed job          | Job ID       | Duration |
| ----------------------------- | ------------ | -------- |
| Aggregate                     | 121032798820 | 29m44s   |
| Chrome151.0.7922.138          | 121032798963 | 20m55s   |
| Chrome152.0.7977.54           | 121032798854 | 14m08s   |
| Firefox153.0                  | 121032798844 | 1m39s    |
| Firefox154.0                  | 121032798834 | 1m38s    |
| Extension                     | 121032798742 | 3m30s    |
| Windows                       | 121032798884 | 13m49s   |
| macOS26                       | 121032798853 | 6m46s    |
| Ubuntu26.04 diagnostic native | 121032798933 | 8m14s    |
| Full-history secrets          | 121032798827 | 10s      |

Aggregate logs explicitly show the new `contact-field-use.test.ts`61 cases
passing in both unit and coverage runs (49ms/42ms), not merely a matching total.
The full suite is221 files/2923 passed plus one Windows-only packaging skip,
repeated under83.98/77.78/84.98/86.58 coverage.35 types/22 lint/build tasks and all
remaining gates pass: seven foundations,76 shell4.4m,85 resilience10.5m, seven
onboarding,13 documents,14 browser-storage,21 native plus one Windows-only skip,
archive/recovery/generated-schema/license/secret/audit/Changesets. npm audit is
clean; the same11 reviewed Cargo warnings remain. Prepared secret lifecycles
pass separately on Windows, macOS Keychain and FreeDesktop Secret Service;
aggregate's unprepared secret-store environment is not relabeled a real pass.

Exact Chrome logs execute the complete schema167/sharedv20/39 and Career parity
contracts, all13 document/seven foundation/76 shell/85 resilience/seven onboarding
cases and old/current recovery. Both Firefox logs report actual153.0/154.0,
SQLite3.53.0 Worker/OPFS, schema167,58 datasets/116 files, full sharedv20/39 and
Careerv3/four cases. Their scheduling witness is seven scenarios/13 invalid
literals with unchanged globals: compatibility-module proof, not a Firefox
production-UI claim. Extension's actual Chromium149.0.7827.55/Firefox151 fallback
passes nine cases32.1s, exact manifests/package inspection and offline source
rebuild. No permission, remote-code, credential or production source approval is
added by this contract checkpoint.

Windows actual22 native cases, macOS/Ubuntu21 plus one Windows-only skip and each
Rust24 passes/one deliberate direct-secret ignore retain all six archives and
exact current167 semantic content/relationships/attachments. Current native
archive witnesses report `databaseMatchesArchive:false`: canonical content, not
physical cross-adapter SQLite bytes, is proven. Prepared secure-store/archive/
backup/lint and package checks pass. Diagnostic Windows NSIS is4332791 bytes,
SHA256`2c17e03a14da08086f796380fd7347919128001bd8a700a660e2df14b188d50b`,
20 launches/p95885.1ms/working-set p95381464576 bytes; uninstall preserves app
data. macOS app19867678 bytes and Ubuntu AppImage87067128 bytes exclude the probe
and remain alive after five seconds. All package targets are
`targetConformant:false`; signing/manual/reference-hardware/Unix release risks
remain open.

The aggregate succeeds under the unchanged30-minute job budget, but29m44 leaves
only16 seconds headroom, versus23m30 for the preceding checkpoint and29m19 for
its predecessor. Retain this observed variance risk; no production/per-test
timeout, assertion or infrastructure limit is changed here and no bottleneck
cause is inferred from these durations alone.

| Scoped contract requirement                                                                | Actual evidence                                                                                                                           | Disposition                                                            |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Independent source/exact field review/versioned bounded input                              | Public exported types/parsers;61 named cases in exact aggregate unit and coverage                                                         | Proven for infrastructure contract, not durable storage                |
| No URL/note/confirmation/confidence shortcut                                               | Extra-field rejection; separately resolved exact vault/source/hash/field/revision policy; unknown/job-shaped/stale/disabled policy denial | Proven at contract boundary; no production resolver approved           |
| Real public/licensed positive states                                                       | Explicit synthetic independently resolved public/licensed/dataset cases                                                                   | Proven contract behavior, not legal verification or source acquisition |
| Purpose, exact current value, review/expiry/revocation                                     | Named mismatch/time-boundary/revocation/earliest-expiry cases and pure source with no mutation capability                                 | Proven pure assessment; no automatic deletion                          |
| Owned copied evidence and content-free failures                                            | Freeze/scalar/size/mutation/throw/unresolved-resolver cases                                                                               | Proven contract behavior                                               |
| Complete regression/security/recovery checkpoint                                           | Full local/serial extension/final policy plus all ten exact hosted required jobs and retained logs above                                  | Proven for cf3c6b0 only                                                |
| Durable SQLite records, transactional source/current-value hashing and selected runtime/UI | Later local schema/export work has separate in-progress proof; absent from this commit                                                    | Not complete; remains required under INT-007                           |

This closes the bounded contract foundation only. Later uncommitted schema182
work is not covered by this run. Full INT-007/INT-008/goal and independent manual/
reference-hardware/security/release gates remain open. Do not restart65788 or
71511, rerun this workflow, or push receipt-only updates to create another CI
cycle; retain the fresh closure receipts with the next verified implementation.
