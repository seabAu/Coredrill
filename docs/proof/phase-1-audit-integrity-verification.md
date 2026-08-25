# Phase 1 audit, identity, and integrity verification

Date: 2026-08-25

Checklist scope: `DB-006`

Packages: `@coredrill/storage-core`, `@coredrill/storage-browser`, `@coredrill/storage-native`, `@coredrill/web`

Decision changes: none

## Outcome

`DB-006` adds shared forward migrations `0032` through `0045`, advancing browser SQLite and native rusqlite from schema version 31 to 45. The slice establishes one strict UUIDv7 local-device identity with monotonic heartbeat/audit fields, validates historical audit and document integrity during upgrade, and installs database guards for selected application documents, immutable document versions and manifests, and append-only source/history records.

The existing `archived_at` fields remain Coredrill's local soft-delete representation. This slice deliberately does not choose final multi-device tombstone retention, conflict resolution, device authorization/removal, compaction, encryption, accounts, a server cursor, a CRDT, or a `sync_op` protocol. Those choices remain deferred by accepted decision D-052 and require the later sync ADR.

## Constraint and upgrade proof

| Contract                     | Enforced behavior                                                                                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit timelines              | Repository writes reject `updated_at < created_at`, archive times before creation, and backward device/saved-view updates. Property tests generate monotonic timelines and adversarial backward cases.                                                         |
| Local identity               | The strict `device` table accepts UUIDv7 IDs only, stores bounded label/platform values, and advances `updated_at`, `last_seen_at`, and `row_version` through optimistic writes. Stale heartbeats fail with a typed conflict.                                  |
| Local soft archive           | Every reviewed mutable aggregate retains `archived_at` alongside stable ID, audit timestamps, and row version where conflict detection may matter. Archive markers are not represented as a speculative network tombstone protocol.                            |
| Upgrade safety               | A version-31 database containing backward historical audit data rejects migration 34. The encompassing adapter transaction restores schema version 31 and leaves neither the new device table nor the temporary integrity probe behind.                        |
| Application documents        | Inserts and updates may select only a resume version for the resume slot and only a cover-letter version for the cover slot. A selected version cannot be deleted, and its owning document kind cannot be changed incompatibly.                                |
| Version lineage              | New versions must be consecutive and point to the preceding version of the same document. Every document-version row is immutable after insertion.                                                                                                             |
| Append-only/content identity | Source snapshots, status events, and interactions reject updates. Attachment-manifest identity facts reject mutation after content-addressed registration. Privacy/retention deletes remain governed by existing foreign keys and selected-version protection. |

Trigger-backed application integrity avoids rebuilding the already-referenced `application` table, which could otherwise cascade-delete child history while the parent table is replaced. All migration SQL is checksum-bound in `migrations/README.md` and applied in one adapter transaction.

## Shared adapter proof

The `phase-1-tracker-repositories` suite runs the same DB-006 cases in Node in-memory SQLite, browser SQLite/OPFS, and native rusqlite:

1. `persists a stable local device identity with monotonic audit fields`
2. `enforces document selection lineage and append-only integrity in SQLite`

The suite also verifies the required audit/future-conflict column matrix, local archive-marker coverage, raw non-UUIDv7 rejection, optimistic device conflicts, incompatible application selections, cross-document lineage rejection, selected-version deletion protection, document-kind protection, and immutable/append-only update guards. Fixtures are synthetic and contain no resume, credential, token, applicant data, employer contact, or private page content.

## Reproducible local verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                                                           | Result                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/storage-core/test/tracker-repositories.test.ts packages/storage-core/test/audit-integrity.test.ts` | Passed: 2 files and 7 tests, including generated monotonic timelines and invalid-upgrade rollback.                                                                                                      |
| `pnpm test:unit`                                                                                                                  | Passed: 29 files and 156 tests.                                                                                                                                                                         |
| `pnpm test:coverage`                                                                                                              | Passed: 29 files and 156 tests; 90.46% statements, 78.13% branches, 96.57% functions, and 92.95% lines overall.                                                                                         |
| `pnpm test:storage-browser`                                                                                                       | Passed: 8 Chromium tests at schema version 45, including the shared tracker/integrity contracts.                                                                                                        |
| `pnpm test:storage-native`                                                                                                        | Passed: 13 TypeScript adapter tests; Rust reported 6 passed and 1 intentionally ignored platform exercise.                                                                                              |
| `pnpm exec playwright test --config=playwright.extension.config.mjs --project=firefox-manual-fallback`                            | Passed the Firefox manual transfer/import fallback against durable schema version 45.                                                                                                                   |
| `pnpm check:foundation-records`                                                                                                   | Passed: 32 direct dependencies, 3 toolchains, 16 execution targets, and 10 accessibility cases.                                                                                                         |
| `pnpm check:licenses`                                                                                                             | Passed: 351 npm and 498 Cargo package records reviewed.                                                                                                                                                 |
| `pnpm audit --audit-level=low`                                                                                                    | Passed: no known vulnerabilities.                                                                                                                                                                       |
| `pnpm verify`                                                                                                                     | Passed the complete formatting, architecture, governance, typecheck, lint, unit, coverage, build, browser/native storage, recovery, security, license, audit, and Changesets gate.                      |
| [Foundation CI run 32867454853](https://github.com/seabAu/Coredrill/actions/runs/32867454853)                                     | Passed the aggregate gate, pinned Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native packages, extension transfer, and full-history secret scan for implementation commit `d0ab869`. |

The dependency graph and lockfile did not change. npm audit found no known vulnerabilities. The Rust audit reported zero vulnerabilities and the 15 already-reviewed allowed transitive Linux GTK maintenance/unsoundness warnings recorded in the dependency inventory. The pinned Firefox jobs retain the known non-blocking setup-action Node.js runtime notice. A local standalone real-Firefox WebDriver invocation remains unavailable because this workstation has no `geckodriver`; the hosted pinned-Firefox lanes supply that clean-run proof.

## Implementation surfaces

- `migrations/0032_device.sql` through `migrations/0045_attachment_manifest_update_guard.sql` — strict local identity, fail-closed upgrade validation, and cross-table/immutability guards.
- `packages/storage-core/src/audit-integrity.ts` — shared audit-timeline validation.
- `packages/storage-core/src/tracker-repositories.ts` — stable local-device repository and optimistic heartbeat writes.
- `packages/storage-core/src/tracker-contract-harness.ts` — reusable cross-adapter DB-006 constraint contracts.
- `packages/storage-core/test/audit-integrity.test.ts` and `tracker-repositories.test.ts` — property and failed-upgrade rollback proof.
- `apps/web/src/main.ts`, browser E2E specifications, and `packages/storage-native/test/native-database.test.ts` — real browser, Firefox, and native migration/contract execution.

## Boundaries and remaining work

- `DB-007` owns reviewed indexes plus FTS5 capability detection and a functional fallback, with a query/benchmark report.
- `DB-008` remains open for its dedicated whole-suite browser/native CI review even though the repository suites already execute in both adapters.
- Final sync tombstones and conflict semantics remain deferred; no sync API, account, hosted database, device key, server cursor, or background network process was introduced.
- `Q-006` remains open; no default display-stage or saved-view terminology was chosen or locked.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
- `GATE-0` remains blocked on owner-authorized representative human validation.
- No ADR is required because no Accepted decision changed.
