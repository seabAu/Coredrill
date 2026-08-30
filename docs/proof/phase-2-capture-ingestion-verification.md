# Phase 2 capture-ingestion idempotency verification

Date: 2026-08-30  
Branch: `main`  
Implementation commit: `40c377c53f87810fab5ba0eda3d68eb9a7acd206`

## Outcome

`CAP-002` is proven. Capture ingestion now distinguishes exact transport retries, fresh envelopes whose semantic content is already durable, and conflicting reuse of replay identity. It also returns deterministic, reason-coded saved-job suggestions by source ID, canonical URL, content hash, and conservative title/company similarity. Both duplicate classes remain suggestions or durable-receipt references only: this slice never merges jobs, promotes captured fields, or overwrites user-confirmed evidence.

## Durable idempotency

The existing schema-92 `capture_inbox` remains the durable receipt store. Its unique envelope ID, semantic content hash, nonce, and sender/sequence constraints support three explicit outcomes inside one SQLite transaction:

- `none`: insert the validated envelope, then acknowledge only after commit;
- `exact_retry`: return the existing receipt when the complete envelope, checksum, nonce, sender, and sequence match; and
- `content_hash`: return the original durable envelope ID when a new replay identity carries the same semantic evidence, without inserting a second receipt.

Reusing an envelope ID, nonce, or sender/sequence with different content remains a content-free `replay_conflict` failure. The Chromium E2E queues the same page snapshot again after the first item has been acknowledged and proves that the fresh envelope is acknowledged as `content_hash`, points to the original durable receipt, empties the extension outbox, and leaves exactly one inbox row. The Firefox JSON fallback retains the same transaction and duplicate-count behavior.

No migration was needed: SQLite remains canonical truth, and the transaction neither introduces hosted state nor promotes an inbox receipt into a reviewed job.

## Explainable duplicate suggestions

`@coredrill/application` owns a pure, bounded policy over a validated `CaptureEnvelopeV1` and neutral saved-job candidates. It aggregates these independent reasons:

- `source_id` for an exact connector/source-kind and external-ID pair;
- `canonical_url` after safe HTTP(S) parsing and fragment removal;
- `content_hash` from either a job source or one of its retained source snapshots; and
- `fuzzy_title_company` only when both normalized token components pass their exposed thresholds.

The current conservative fuzzy gate requires title Dice similarity of at least `0.75` and company similarity of at least `0.80`. Common title abbreviations normalize to their full forms, and common company legal suffixes are ignored. The policy exposes the separate title and company components, never an opaque aggregate probability. Exact reasons rank before fuzzy-only suggestions, job ID breaks ties deterministically, and output is capped at 20 suggestions after validating candidate/source/hash bounds.

The web receiver reads `job`, `company`, `job_source`, and `source_snapshot` through a parameterized query, groups adapter rows into neutral candidates, and runs the policy within the ingestion transaction. Listing durable receipts recomputes suggestions from current saved-job identity data. Neither path mutates the saved job or capture envelope.

## Fixture and property proof

`packages/application/test/fixtures/capture-duplicate-candidates.json` is synthetic and contains no third-party data. Its exact candidate accumulates all four reasons, a content-only candidate retains only `content_hash`, an abbreviation/legal-suffix candidate proves fuzzy-only matching with separate `1.0` components, and an unrelated job is excluded.

The focused suite passed 4 tests. It proves reason aggregation and ordering, fragment-free canonical URL matching, source/snapshot hash matching, conservative fuzzy matching, unrelated exclusion, immutability, invalid-input and limit failures, and result invariance under candidate reversal. A 100-run fast-check property varies external IDs and candidate rotations while proving exact source identity is always retained and output order remains deterministic.

## Local verification

The final real-browser command `pnpm test:extension-transfer` passed 2/2 tests:

- Chromium `149.0.7827.55` proved SQLite-before-ack storage, attempt-2 exact retry, fresh semantic-content deduplication, zero duplicate receipts, and hostile-origin/oversize/wrong-ID/replay rejection.
- Firefox `151.0` proved idempotent checksummed JSON fallback import, checksum rejection, and schema version 92.

The complete local `pnpm verify` gate also passed:

- formatting, 19 package-boundary policies, and 49 dependency/foundation records;
- typecheck, lint, and build across 22 packages;
- 61 unit files and 550 tests;
- 81.86% statements, 74.41% branches, 81.52% functions, and 84.51% lines;
- generated-contract drift, extension build/package inspection, UI/application/onboarding/document/resilience/storage browser suites, 12 native Vitest cases, 11 Rust tests plus one intentional secure-store harness exclusion, and native secure-store/archive/backup proofs;
- 520 npm license records, 498 Rust crate license records, workspace secret scanning, no known npm vulnerabilities, and the existing 15 explicitly allowed Rust warnings.

## Hosted clean-commit proof

The exact implementation commit completed [Foundation CI run 33310644346](https://github.com/seabAu/Coredrill/actions/runs/33310644346) successfully. The [aggregate quality job 99254951856](https://github.com/seabAu/Coredrill/actions/runs/33310644346/job/99254951856) reran the full gate and reproduced 61 passing unit files, 550 passing tests, the same coverage totals, license checks, secret scan, dependency audit, and 15 accepted Rust warnings.

The dedicated [extension-transfer job 99254951810](https://github.com/seabAu/Coredrill/actions/runs/33310644346/job/99254951810) rebuilt and inspected both production extension targets, rebuilt the Firefox package from its source-review ZIP, and passed the two real-browser tests in 11.6 seconds. Its machine output recorded `semanticContentDeduplicated: true`, `duplicateReceipts: 0`, attempt-2 retry, all hostile-boundary rejections, Firefox idempotency, and durable schema version 92.

GitHub retained artifact [`coredrill-extension-transfer-40c377c53f87810fab5ba0eda3d68eb9a7acd206`](https://github.com/seabAu/Coredrill/actions/runs/33310644346/artifacts/9731898046), artifact ID `9731898046`, 1,205,722 bytes, with archive digest `sha256:4f373f9dc8e56e1c75fbb3794601639e7815c6031d1878640da586c0296496e4`. The aggregate lane retained [`coredrill-chromium-extension-40c377c53f87810fab5ba0eda3d68eb9a7acd206`](https://github.com/seabAu/Coredrill/actions/runs/33310644346/artifacts/9732030363), artifact ID `9732030363`, 400,636 bytes, with archive digest `sha256:7fb51e829d66b8cd0de8e583306030662fe14aac1856019774c61ef833972de3`.

## Reviewed files

- `packages/application/src/capture-ingestion.ts` and `packages/application/src/index.ts` — bounded deterministic suggestion policy and public contract.
- `packages/application/test/capture-ingestion.test.ts` plus its synthetic fixture — exact, fuzzy, failure, immutability, and property proof.
- `apps/web/src/extension-transfer.ts` — transaction classification, saved-job candidate query, durable receipt reference, and suggestion composition.
- `e2e/extension-transfer.spec.mjs` — real Chromium retry and fresh semantic-content duplicate proof.
- `docs/design/coredrill-design-kit/02-runtime-architecture.md` and `04-capture-extraction-sources.md` — implemented runtime and capture semantics.
- `.changeset/clear-captures-suggest.md` — application/web release record.

## Scope and decisions

This slice adds no dependency, lockfile change, database migration, connector, crawler, background surveillance, account, hosted service, AI integration, or automatic merge. It realizes the accepted capture, provenance, SQLite-truth, and human-review decisions without changing one, so no ADR is required.

`CAP-003` is the next smallest unblocked slice: manual form, pasted text/URL, saved HTML/text, and JSON capture paths with end-to-end proof. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
