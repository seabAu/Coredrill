# Normal Source listing-comparison controls

Date: 2026-10-20. Scope: `INT-001`, explicit normal Source comparison controls and
bounded complete-value inspection. Full final-source and separate extension verification pass;
exact hosted verification also passes at the checkpoint below. The `INT-001`
scope audit is complete; independent human/release gates remain open.

## Implementation

The normal stored Source view invokes the existing read-only application query
only after a user chooses two retained snapshots and explicitly activates Compare.
It discloses chronological baseline/current capture times, original capture
identity, current analysis version/time, uncertainty and per-fact provenance.
Requirements, compensation, deadline and locations are presented separately.
Missing or incomplete data is not an empty set or an unchanged result; requirement
counts describe retained slots, not fuzzy semantic identities. No opaque total
score, fetch, write or user-confirmation inference is added.

The root-owned reader retains a comparison result plus one literal value part.
Comparison/source/raw inspection uses the shared fatal scalar-safe UTF-8 decoder
with a 32 KiB limit, exact byte offsets and First/Next controls. Absent raw data,
JSON null and serialized empty string remain distinct. Selection/reset/disposal
clear obsolete results; errors retain stale data with content-free retry text.

## Focused evidence

The three focused unit files pass 54 tests, including explicit-empty-array
absence-evidence inspection and mismatched scope/version/read-only echo rejection;
log `test-results/listing-comparison-controls-focused.log`. The earlier 48-case checkpoint and 35-task strict
typecheck matrix passed before that additional test. Existing Source SSR tests and
ten comparison SSR cases cover inert hostile-looking values, unknown versus known
empty, exact decimal/date precision, provenance and bounded rendering.

The initial browser/native run fails two tests at the observer's null result:
`test-results/listing-comparison-controls-browser-native.log`. The runtime API is
frozen; assigning its pipeline property did not install the observer. Repair only
the test observer by replacing the top-level runtime reference with an equivalent
delegating wrapper, matching the existing Source fault-test pattern. No product,
assertion or timeout is changed to repair that failure.

The repaired production run passes all four cases, terminal
`LISTING_COMPARISON_CONTROLS_REPAIR_EXIT=0`, log
`test-results/listing-comparison-controls-browser-native-repair.log`. Actual browser
OPFS and real Rust SQLite journeys use ordinary saved-file capture/review, invoke
the real comparison controls, preserve the canonical workspace projection, inspect
complete large Unicode JSON in bounded parts, survive 320px responsive replacement,
have zero scoped axe violations in forced colors/reduced motion, and reproduce the
same field results after offline reload. The ordinary Source incomplete-evidence
journey and native unavailable-IPC case also pass. Full-page 320px screenshots are
generated; their scaled overview was inspected for layout, not claimed as readable
manual accessibility validation.

The first expanded lifetime run fails at a test-only focus locator for absent
plain-text content in this JSON-only capture, log
`test-results/listing-comparison-controls-lifetime.log`, terminal
`LISTING_COMPARISON_LIFETIME_EXIT=1`. The error context confirms no retained text
bytes, rather than a missing focus implementation. Choose the existing native
snapshot metadata summary as the deliberate focus target; no product, assertion
or timeout relaxation. The corrected expanded browser journey passes, terminal
`LISTING_COMPARISON_LIFETIME_REPAIR_EXIT=0`, log
`test-results/listing-comparison-controls-lifetime-repair.log`. It proves stale
results remain visible after redacted failure, retry clears the warning with
owned fallback focus, responsive replacement does not duplicate a held query,
deliberate connected focus survives completion, and closing the job suppresses
the late result and late focus. Existing ordinary Source tests separately cover
cross-job late content isolation; this new comparison case proves disposal on
close, not a comparison-specific cross-job switch.

## Independent pushed query checkpoint

Exact pushed query checkpoint `ee95f361d48f27af2a655a4b111159610af31461` passes all
required jobs in [Foundation CI 39367958347](https://github.com/seabAu/Coredrill/actions/runs/39367958347),
terminal success. That proves the query/runtime predecessor, not these subsequent
uncommitted controls. Human usability, manual accessibility/reference-device and
publication gates remain independently open. No Accepted decision changes.

## Complete local verification

Unchanged implementation and fixtures pass the complete `pnpm verify` run, terminal
`LISTING_COMPARISON_CONTROLS_VERIFY_EXIT=0`, log
`test-results/listing-comparison-controls-full-verify.log`. Unit and coverage each
pass 154 files / 1,492 tests. All 35 typecheck tasks, lint and builds pass. Browser
suites pass seven UI-foundation, 76 shell, one diagnostic performance, 28 resilience,
seven onboarding, thirteen document and nine browser-storage cases. The full
resilience run includes normal Source, structured comparison lifetime and actual
Rust SQLite UI journeys. Native adapter tests pass fourteen cases; Rust core passes
fourteen with one intentionally ignored environment-specific case. Secure storage,
archive/backup recovery, schema, boundary, license, secret, extension build/package,
dependency audits and Changesets finish successfully. npm reports no known
vulnerabilities; Cargo retains ten explicitly allowed warnings.

All nine separate extension cases pass on the same implementation and fixtures,
terminal `LISTING_COMPARISON_CONTROLS_EXTENSION_EXIT=0`, log
`test-results/listing-comparison-controls-extension.log`. This includes the normal
extension capture/correction/reload journey, durable transfer/restart, hostile and
oversized input, and Firefox checksummed manual fallback. Only documentation
changes follow the successful implementation runs. Final whole-repository
formatting and boundary/foundation/license/secret checks pass, terminal
`LISTING_COMPARISON_CONTROLS_POLICY_EXIT=0`, log
`test-results/listing-comparison-controls-final-policy.log`; `git diff --check` is
clean. Exact clean-commit hosted proof remains.

## `INT-001` scope audit

- Normal stored Source uses validated same-job snapshot/history/content/evidence
  queries; the separate original capture query binds retained receipts rather than
  reading later mutable review state. Their linked prerequisite proofs remain
  authoritative for storage scope, continuation and historical/corruption cases.
- UI pages and literal parts replace bounded state rather than accumulating it.
  Complete original/normalized/raw values remain reachable; current source metadata
  and current review annotations are explicitly labeled, not historical facts.
- Explicit selected-pair comparison now uses the real runtime query with per-field
  uncertainty and provenance, not reference-catalog sources or empty helper arrays.
- Focused and full production browser/native journeys prove normal controls,
  loading, retained stale error/retry, offline reload, read-only job projection,
  inert hostile-looking values, responsive lifetime and bounded complete inspection.
  Comparison disposal on close and generic Source cross-job isolation have distinct
  tests; neither is mislabeled as the other.
- No viewing action fetches a source, executes markup, promotes a candidate or
  overwrites a user-confirmed value. AI/account/network are not required.
- Exact clean-commit hosted proof subsequently passes as recorded below, completing
  the integration scope. Human/manual/reference-device and publication gates remain
  open independently of `INT-001`.

## Hosted controls checkpoint and integration completion

Exact commit `5a34d29b4b8fdafab7200ec1524b087d186c13f4` passes every required job in
[Foundation CI 39371142252](https://github.com/seabAu/Coredrill/actions/runs/39371142252),
terminal success. Aggregate job `118459051497` explicitly witnesses normal Source
inspection, structured comparison controls/lifetime and actual native-runtime UI
journeys, with all 28 resilience cases passing. The retained aggregate log is
`test-results/listing-comparison-controls-hosted-aggregate-success.log`. Both exact
Chrome, both Firefox, extension, Windows/macOS/diagnostic Ubuntu, aggregate and
full-history secret lanes succeed; the pull-request-only dependency review is
correctly skipped on this main push.

Together with the audited prerequisite/query/value and normal Source proofs,
this completes `INT-001`. It does not prove the subsequent uncommitted Timeline
note work, manual assistive technology, installed-WebView usability, exact reference
hardware, public distribution, or any milestone gate.
