# Source-snapshot history query prerequisite — verification in progress

Date: 2026-10-19. `INT-001` remains open. This prerequisite does not connect the normal Source UI or read/render snapshot bodies or field provenance.

## Scope and semantics

`ListJobSourceSnapshotsQuery` validates a job, explicit archive scope, bounded limit (default 25, maximum 50) and optional job/archive/as-of-bound keyset cursor before storage access. Each immutable snapshot metadata row retains its exact identity, capture/creation times, extractor/version, content hash, retention class and raw-text/retained-markup/structured-data presence flags. The query returns no bodies or generated evidence.

`currentSource` explicitly names current stored source identity, connector/external ID, URLs, observation times and primary flag. These mutable source fields are not historical snapshots and are not frozen by pagination's `asOf`. A future source capture clock is not discarded: membership is bounded by immutable local creation time, while ordering is captured-at descending and UUID ascending for ties. Later locally appended captures do not enter an older page's creation ceiling; an explicit new first-page read includes them.

The application boundary copies/freezes DTOs and validates IDs, safe URLs, hashes, booleans, source/job ownership, observation chronology, creation ceiling, page size, duplicates, strict ordering and exact continuation. Missing jobs are distinct from existing jobs with no retained snapshots. Scope/cursor/operation-context failures occur before the port call; stored-result failures are content-free. The shared SQLite adapter uses bound values, one read transaction, archive visibility, a limit-plus-one keyset read and an exact anchor existence/ownership check. A foreign or missing anchor fails closed. No network request, policy bypass, refresh acquisition, confirmation, canonical mutation, schema/dependency/permission or Accepted decision change is introduced.

## Local iteration and focused proof

All 34 typecheck tasks pass. The first shared fixture attempts correctly fail existing snapshot-content and connector/external-identity uniqueness constraints; separate synthetic captures/source identities are then supplied rather than weakening those invariants. Changed-source lint and 45 focused application/real Node SQLite tests pass (34 query cases plus 11 tracker tests).

The existing `persistSourceAggregate` shared contract adds identical metadata-query assertions without changing its manifest case IDs. It checks exact snapshot/extractor/hash/source identities, deterministic tie pagination, no cross-job leakage, empty history, no body disclosure, unchanged job/source/snapshot/provenance/field tables after reads, stable membership after a later append, explicit new-read inclusion, forged/missing anchors, explicitly current primary-state metadata and archive visibility. The same assertions must run in browser OPFS and native SQLite before full proof is claimed.

An additive minor Changeset covers both application/storage package APIs. `INT-001` is explicitly recorded as normal-runtime follow-through: content detail, paged field provenance, retained comparison, loading/retry/offline UI and browser/native composition remain required.

## Full local verification and remaining hosted proof

Complete final-source `pnpm verify` exits 0, directly observed with marker `SOURCE_SNAPSHOT_HISTORY_VERIFY_EXIT=0` in `test-results/source-snapshot-history-full-verify.log`: 146 unit files / 1,202 tests plus coverage; seven UI foundations, 76 shell, one diagnostic performance, 24 resilience, seven onboarding, 13 documents and nine storage cases; Rust core 14 passed / one intentionally ignored, all 14 native adapter cases, secure storage/archive/backup checks; formatting, strict typecheck, lint, build, generated/architecture/foundation records, licenses, secrets, audits and Changesets. npm reports no known vulnerabilities; ten previously allowed Cargo warnings remain. The shared tracker contract with the new source-query assertions passes in real browser OPFS and native SQLite as well as Node. Source/fixtures remained frozen; process-local `VITEST_MAX_WORKERS=4` changes scheduling only. Final documentation/policy checks and clean-commit hosted verification remain. Do not mark `INT-001` complete on the basis of this query.

Predecessor repair `9ffc13e1f0ecc3300f597f4b92769e544b9047c7` passes every required job in [run 39348202319](https://github.com/seabAu/Coredrill/actions/runs/39348202319). Inspected exact Chrome/aggregate logs verify the strengthened canonical journey, closing `Q3-005`; `GATE-3` remains open for human validation. That run does not verify this subsequent query. Earlier canonical run `39344803133` remains failed and is not rewritten as green.
