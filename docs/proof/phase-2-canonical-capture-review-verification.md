# Phase 2 canonical capture/review verification

Date: 2026-09-27  
Checklist item: `Q2-005`  
Implementation commit: `12fb880ea2178b5f39141c2870c54a5a08266d72`  
Hosted run: [Foundation CI 36302873394](https://github.com/seabAu/Coredrill/actions/runs/36302873394)  
Status: complete

## Outcome

One deterministic persistent-browser journey now composes the production-packaged Chromium extension, its durable outbox and acknowledgement protocol, the local SQLite Inbox review flow, immutable changed-source evidence, the read-only snapshot comparator, and an explicit confirmed-title correction. The journey uses the real application and extension boundaries rather than a fixture-only substitute.

The changed capture deliberately retains two different title candidates. The Inbox exposes that unresolved conflict and does not silently select either candidate. Merging the new evidence leaves the previously confirmed title unchanged. A separate explicit correction then appends user provenance, confirms the replacement, supersedes the prior confirmed value, updates the current job projection in the same transaction, and preserves both source snapshots and both field-value records.

No connector, host permission, account, AI dependency, hosted service, background surveillance, source refresh, submission automation, or new external request was added.

## Retained journey

`e2e/extension-canonical-journey.spec.mjs` proves the following sequence against `apps/extension/.output/chrome-mv3` and the production web composition root:

1. Queue a validated extension capture in the packaged extension outbox.
2. Pull it through the exact HTTPS app origin, durably store it, acknowledge the exact envelope, and empty the outbox.
3. Open the real Inbox UI, accept the eligible high-confidence fields, and save the reviewed capture as a local job.
4. Queue a second capture for the same canonical URL with changed retained text and conflicting detected/user title candidates.
5. Show `Source content changed` and the unresolved two-candidate conflict in the Inbox.
6. Merge the changed evidence into the existing job without accepting or overwriting the confirmed title.
7. Compare the first and latest immutable snapshots through `compareListingSnapshotsV1`; the result reports one retained-content change and explicitly reports that no refresh or trusted-field mutation occurred.
8. Apply an explicit manual title correction in one local transaction, retaining user provenance and linking the superseded confirmed value to its confirmed replacement.
9. Reload the application origin and verify the corrected job projection, two immutable snapshots, and complete field-value history from SQLite.
10. Assert zero unapproved network requests for the complete journey.

The Playwright JSON reporter retains the attached `phase-2-canonical-capture-review.json` artifact, a screenshot of the visible saved-source diff and successful manual correction, and the machine-readable `Q2_CANONICAL_CAPTURE_REVIEW_PROOF` console record. The extension-transfer CI artifact retains that reporter together with the exact packaged Chrome and Firefox extension outputs.

## Local verification

The focused production-browser run passed in Chromium `149.0.7827.55` and emitted:

```json
{
  "extensionCaptureQueued": true,
  "outboxAcknowledged": true,
  "inboxConflictExposed": true,
  "savedAndMerged": true,
  "sourceDiffChangeCount": 1,
  "confirmedFieldPreservedBeforeCorrection": "Canonical Platform Engineer",
  "explicitManualCorrection": "Principal Canonical Platform Engineer",
  "priorConfirmedValueSuperseded": true,
  "finalRecordSurvivedReload": true,
  "sourceSnapshotCount": 2,
  "unapprovedNetworkRequests": 0,
  "accessibilityViolations": 0
}
```

Command:

`pnpm exec playwright test --config=playwright.extension.config.mjs --project=chromium-extension-transfer e2e/extension-canonical-journey.spec.mjs`

The complete local `pnpm verify` gate also passed. It covered formatting, architecture boundaries, foundation records, 33 typecheck tasks, 22 lint tasks, 87 unit-test files with 744 tests, coverage, 22 builds, extension build/package inspection, browser UI/application/performance/resilience/onboarding/document/storage suites, native SQLite/secure-storage/archive proof, contract schemas, 520-package JavaScript and 498-crate Rust license inventories, tracked/unignored secret scanning, and dependency audits. npm and Rust reported zero known vulnerabilities; Rust retained the same seven reviewed warnings.

The separate complete extension-transfer matrix also passed all seven tests: the new canonical journey, extension preview/correction, adversarial and huge-page capture, acknowledged Chromium transfer/restart/retry, storage-failure preservation, and Firefox manual fallback.

## Hosted clean-commit verification

Foundation CI run 36302873394 passed from the exact implementation commit. All ten required lanes completed successfully: the aggregate frozen-install build/static/test/policy gate; the production Chromium/Firefox extension-transfer matrix; Chrome `151.0.7922.138` and `152.0.7977.54`; Firefox `153.0` and `154.0`; Windows, macOS 26, and Ubuntu 26.04 native package builds and startup proof; and the full-history secret scan. The push-only pull-request dependency-review lane was skipped by design.

The dedicated extension-transfer job rebuilt and inspected both production extension targets, rebuilt Firefox from its source-review ZIP, passed all seven browser tests, and uploaded immutable artifact [`coredrill-extension-transfer-12fb880ea2178b5f39141c2870c54a5a08266d72`](https://github.com/seabAu/Coredrill/actions/runs/36302873394/artifacts/10926421862). Artifact `10926421862` is 1,501,170 bytes with archive digest `sha256:625cbf42b4c4db81136c73543fc9e632a2f6876dc934aaf0c2a5816f39b2ba77`; it retains the Playwright JSON report, canonical-journey JSON witness, visible correction screenshot, and exact packaged Chrome and Firefox outputs.

## Decision review

No Accepted decision changed, so no ADR is required. The journey composes and proves the existing local-first, explicit-review, immutable-snapshot, provenance, confirmed-value replacement, least-privilege, and offline-capable decisions.
