# Phase 2 capture-envelope compatibility verification

Date: 2026-08-30  
Branch: `main`  
Implementation commit: `e7fae80a91d2dab4ffcb8edc68a43463f2b4f6b2`

## Outcome

`CAP-001` is proven. The existing strict `CaptureEnvelopeV1` shape now has enforceable source-snapshot linkage, expiry ordering, unique candidate identity, explicit version dispatch, and an independently reusable semantic content checksum. Existing outbox and transfer consumers use the dispatcher, while their separate complete-envelope checksum continues to protect replay metadata and transport integrity.

## Contract and source-snapshot invariants

The serialized V1 shape is unchanged. Before inbox ingestion creates a durable source row, the envelope UUID is the source-snapshot reference. Every included candidate must:

- use `sourceType: "capture"`;
- point `provenance.source.sourceId` to the envelope UUID;
- retain the envelope's exact `capturedAt`; and
- have an ID unique within the envelope.

The contract also requires `expiresAt` to be strictly later than `capturedAt`. Existing strict-object, safe URL, safe sequence, nonce, field-size, and 2 MiB encoded-envelope limits remain in force.

## Compatibility and checksum policy

`safeParseCaptureEnvelope` is the single transfer/persistence dispatcher. The accepted policy is current plus previous, and the generated JSON Schema publishes the same metadata. V1 is the only shipped version, so the accepted set is currently `[1]`; unsupported safe-integer versions receive a typed `unsupported_version` result. Non-serializable, oversized, and malformed data retain their existing typed failures.

`captureEnvelopeContentProjectionV1`, `createCaptureEnvelopeContentHashV1`, and `verifyCaptureEnvelopeContentHashV1` expose the canonical semantic checksum calculation already used by the extension builder. Candidate facts retain the original deterministic field-name order, so existing content hashes do not drift. The semantic hash deliberately excludes the random envelope/candidate IDs, capture time, nonce, and sequence so unchanged evidence deduplicates across captures. The outbox checksum separately covers the complete canonical envelope.

## Automated proof

Focused contract, builder, outbox, and transfer execution passed 38 tests. Fast-check generated 100 cases for each sequence/version property and 100 asynchronous builder cases spanning safe sequence values, positive retention periods, and deterministic entropy seeds. Regression cases prove equal/prior expiry rejection, source-ID and capture-time mismatch rejection, duplicate-candidate rejection, unsupported-version reporting, unchanged semantic deduplication, and checksum failure after source mutation.

The complete local `pnpm verify` gate passed:

- formatting, 19 package-boundary policies, and 49 dependency/foundation records;
- typecheck, lint, and build across 22 packages;
- 60 unit files and 546 tests;
- 81.78% statements, 74.28% branches, 81.19% functions, and 84.42% lines;
- generated-contract drift, extension build/package inspection, UI/application/onboarding/document/resilience/storage browser suites, 12 native Vitest cases, 11 Rust tests plus one intentional secure-store harness exclusion, and native secure-store/archive/backup proofs;
- 520 npm license records, 498 Rust crate license records, secret scanning, no known npm vulnerabilities, and the existing 15 explicitly allowed Rust warnings.

The same implementation commit completed [Foundation CI run 33307828579](https://github.com/seabAu/Coredrill/actions/runs/33307828579) successfully. The [aggregate quality job 99247413067](https://github.com/seabAu/Coredrill/actions/runs/33307828579/job/99247413067) reran the complete gate from the exact commit, and [extension-transfer job 99247413229](https://github.com/seabAu/Coredrill/actions/runs/33307828579/job/99247413229) rebuilt both production extension targets and reproved acknowledged Chromium transfer plus the Firefox fallback.

GitHub retained artifact [`coredrill-extension-transfer-e7fae80a91d2dab4ffcb8edc68a43463f2b4f6b2`](https://github.com/seabAu/Coredrill/actions/runs/33307828579/artifacts/9731074750), artifact ID `9731074750`, 1,205,787 bytes, with archive digest `sha256:1dcf4ed41437d575174decef92cee3fb493d8a293a02d6e4776bfda1038a528d`. The aggregate lane retained [`coredrill-chromium-extension-e7fae80a91d2dab4ffcb8edc68a43463f2b4f6b2`](https://github.com/seabAu/Coredrill/actions/runs/33307828579/artifacts/9731198402), artifact ID `9731198402`, 400,636 bytes, with archive digest `sha256:39991daec306c476bd368697d7dde1f11b95977b2e5bf6cc00e7d9e9b611abcd`.

## Reviewed files

- `packages/contracts/src/capture-envelope.ts` and its generated JSON Schema — invariants, compatibility metadata, and version dispatcher.
- `packages/contracts/test/capture-envelope.test.ts` — boundary and generated-version properties.
- `packages/capture-core/src/envelope.ts` — stable semantic projection and reusable hash verification.
- `packages/capture-core/test/capture-envelope-builder.test.ts` — builder properties and mutation detection.
- `packages/extension-bridge/src/outbox.ts` and `transfer.ts` — compatibility-dispatch consumers.
- `.changeset/capture-envelope-compatibility.md` — release and compatibility record.

## Scope and decisions

This slice adds no dependency, lockfile change, connector, crawler, background browser behavior, database migration, account, hosted service, AI integration, or user-interface feature. It realizes the accepted capture and current-plus-previous compatibility decisions without changing one, so no ADR is required.

`CAP-002` is the next smallest unblocked slice: ingestion idempotency and duplicate suggestions by source ID, canonical URL, semantic content hash, and fuzzy title/company. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their previously recorded external owners; none is reinterpreted as complete by this proof.
