# Capture-time source evidence — local verification

Date: 2026-10-19. Scope: a read-only prerequisite for `INT-001` structured Listing changes. This does not complete the semantic projection or comparison UI.

## Why this boundary exists

Current `field_value` and accepted requirement annotations are not an immutable capture-time projection. Manual corrections and later review can attach to an older snapshot. The original `capture_inbox.envelope_json` retains the original candidate set independently. Comparison must not silently treat current review state as a change in the external listing.

The new application query and SQLite adapter associate a snapshot with a receipt only through the same job, capture instant, content fingerprint, resolved review and exact promotion timestamp, plus the known `coredrill.capture-envelope` / `1.0.0` / `capture_review` profile. This is a derived association under existing promotion invariants, not a newly invented foreign key or a claim that hashes alone prove membership. Unlinked/legacy snapshots return an explicit `not_retained` result; a missing/foreign/archived snapshot is separately not found. A retained empty candidate set remains retained, not missing.

The original envelope is revalidated through the version dispatcher and checked against the receipt ID and snapshot capture instant/fingerprint. Runtime composition injects both the existing semantic-content verifier and canonical full-envelope checksum function; neither the application package nor shared UI imports a capture or storage adapter. No mutable field/requirement table is queried, no source is fetched and no values are confirmed/promoted. Incoming embedded confirmation claims remain original untrusted capture content, not trusted local confirmations.

## Bounds and failure behavior

SQLite conditionally returns the envelope only when its UTF-8 BLOB length is at most 2 MiB, preventing an oversized stored body crossing the adapter boundary. Application validation independently checks encoded bytes, then bounds iterative traversal to 20,000 values and 40 levels before recursive schema/hash traversal. These are explicit reader limits, not a change to the shipped capture format. Otherwise valid historical content outside these reader budgets is rejected visibly; it is not truncated, rewritten or described as an empty listing. Historical transfer expiry is deliberately not used to expire already-retained evidence. Hash mismatch, malformed/unsupported capture, invalid scope echoes, storage errors and verifier exceptions return content-free failures.

No integrity claim is made against an attacker able to rewrite the whole database and all hashes/associations. No schema, dependency, extension permission or Accepted decision changes.

## Focused evidence

- Application and actual Node SQLite tests pass 39 cases together, including existing capture-review regressions. They cover original-vs-unlinked/empty state, scope validation, ID/time/fingerprint/provenance/version checks, archive forwarding, missing/foreign existing jobs and snapshots, future snapshot creation, mismatched extractor/version/retention/promotion/capture/receipt times, redacted failures, historical expiry, hash rejection, invalid JSON, byte/character size distinction, nesting/value budgets and unchanged SQLite write count during reads. Log: `test-results/source-capture-focused.log`.
- Strict changed-production-source lint passes, with no suppressions.
- The production browser Source journey creates/merges captures through normal UI and reads the later capture's original title candidate, without mistaking the older confirmed canonical job title or newly created local confirmation for original ingress state. Runtime verification computes both actual hashes. Existing no-mutation/offline/reflow/axe assertions remain.
- The real-native-process normal journey retrieves the original title through the same query/runtime/hash composition. Existing zero browser fallback and Source reload assertions remain. This uses actual Rust SQLite through simulated Tauri IPC, not an installed-WebView claim.
- All three focused browser/native journeys pass, terminal `SOURCE_CAPTURE_BROWSER_NATIVE_EXIT=0`, log `test-results/source-capture-browser-native.log`. Adversarial SQL association cases above are fast Node SQLite proof; do not mislabel those as an identical negative-case browser/native manifest.

## Complete final-source gate

The complete unchanged-source `pnpm verify` process finishes with terminal `SOURCE_CAPTURE_VERIFY_EXIT=0`, log `test-results/source-capture-full-verify.log`. Both unit and coverage runs pass 152 files / 1,424 tests, all 34 typecheck tasks and strict lint/build pass, and browser suites pass seven UI-foundation, 76 shell, one diagnostic performance, 27 resilience, seven onboarding, thirteen document and nine storage cases. The full resilience run includes both real-runtime original-capture reads, not only their focused runs. Native adapter tests pass fourteen cases; Rust core passes fourteen with one intentionally ignored environment-specific case. Secure-store/archive/backup, schema, boundary, license, secret and dependency checks finish successfully. npm reports no known vulnerabilities; Cargo retains ten explicitly allowed warnings. No test assertion, timeout, policy or product budget was weakened.

The separate final-source extension suite also passes all nine cases, terminal `SOURCE_CAPTURE_EXTENSION_EXIT=0`, log `test-results/source-capture-extension-full.log`, including capture/correction/reload, durable retry/restart, hostile/oversized input and Firefox manual fallback.

Only documentation changes follow these full runs. Final formatting, boundary/foundation, license and secret checks pass, log `test-results/source-capture-final-doc-policy.log`. Implementation is committed locally as `5cc1cd6`; clean-commit hosted proof for this query remains pending. Source UI predecessor `8655ad1f159f9ab4eb81530830e8e89650b75b6e` passes every required job in [CI run 39362307044](https://github.com/seabAu/Coredrill/actions/runs/39362307044), terminal success; its result is independent of this new lookup. `INT-001` remains open for structured projection and normal field-by-field Listing changes.
