# Phase 2 review actions verification

Date: 2026-09-26  
Checklist item: `REV-004`  
Status: complete

## Outcome

The capture Inbox now supports explicit Save new, Merge existing, Snooze/Return,
and Discard/undo actions. The immutable capture receipt remains durable evidence;
new schema-101 review state records lifecycle and resolution without repurposing
settings or deleting replay identity.

## Transaction contract

- Save new requires an explicitly accepted eligible title. One transaction
  creates the optional company, job, job source, immutable source snapshot,
  provenance for every retained candidate, confirmations only for explicitly
  accepted candidates, and the resolved review link.
- Merge checks that the selected unarchived job still exists, then attaches the
  same source/snapshot/candidate history and resolves the review. It never
  updates target canonical job fields.
- Receipt content hash, pending state, and row version are checked inside the
  promotion transaction. A stale row, missing target, constraint failure, or
  injected storage failure rolls back every write.
- Snooze persists a fixed one-week return instant. Wake restores pending state.
  Discard records the exact previous pending/snoozed state and row version in a
  durable single-use undo token. Replay, stale undo, arbitrary transitions,
  lifecycle deletion, and token deletion are rejected.
- Stored envelope JSON is strictly reparsed and its semantic content hash is
  recomputed before promotion. No review action fetches or refreshes a source.

## Recovery and export

Migrations `0093` through `0101` are documented with reviewed checksums. The
human-readable portable projection is pinned to schema 101 and includes
`capture_review_item` as its thirtieth canonical dataset. Short-lived discard
undo tokens are intentionally excluded from JSON/CSV but remain in the lossless
SQLite archive. The deterministic recovery fixture was regenerated and restored
into a clean browser profile with the same canonical content hash.

## Automated proof

Focused storage tests cover guarded snooze/discard/single-use undo, atomic Save
with confirmed and unconfirmed retained candidates, non-overwriting Merge,
missing-target rollback, and injected mid-transaction rollback. Focused
application tests cover eligible-ID enforcement, required-title enforcement,
confirmation hashing, canonical projection, and Merge without accepted fields.

```text
REV004_TRANSACTION_PROOF {"schemaVersion":101,"durableQueueTransitions":true,"singleUseUndo":true,"saveAtomic":true,"mergePreservesCanonicalTarget":true,"injectedFailureRolledBack":true,"missingTargetRolledBack":true,"provenanceRetained":true,"explicitConfirmationsOnly":true}
```

The real-browser flow creates durable captures through the shipped Add dialog,
uses the review controls for every action, checks resolved job links and durable
state through the public local API, runs axe, and records no external request:

```text
REV004_E2E_PROOF {"schemaVersion":101,"saveNew":true,"mergeExisting":true,"snoozeAndWake":true,"discardAndUndo":true,"networkRequests":0,"accessibilityViolations":0}
```

## Local verification

- Focused application, capture-core, storage-core, and UI suites: 4 files, 16
  tests, passing.
- Full unit suite: 81 files, 708 tests, passing.
- Full app-shell browser matrix: 64/64 passing, including REV-004, source
  preview, supplied capture, responsive, keyboard, and accessibility coverage.
- Browser SQLite schema/export/recovery: current schema 101, 30 datasets, 60
  files, deterministic clean-profile restore, passing.
- Native Rust storage core: 11 passed with one secure-store harness-only test
  intentionally ignored; native SQLite parity: 12/12 passing.
- Web build, TypeScript, and lint: passing.
- Implementation commit: `bcffdd137082119ffd9d920d0d47b442435f63bf`.
- Firefox proof-count alignment commit:
  `d5575191f38a58caa6eb96a590890881bb542932`.
- Hosted clean-commit verification:
  [Foundation CI run 36282127338](https://github.com/seabAu/Coredrill/actions/runs/36282127338),
  passing across the aggregate foundation gate, exact Chrome 151/152 and
  Firefox 153/154 browser-storage lanes, extension transfer, full-history
  secret scan, and Windows, macOS, and Ubuntu native package lanes.

## Decision impact

No accepted decision changes. The implementation follows the existing
local-first SQLite truth, provenance retention, confirmation precedence,
explicit mutation, undo, and no-hidden-network decisions. The one-week Snooze
duration is a visible versioned product rule, not a new architecture decision.
