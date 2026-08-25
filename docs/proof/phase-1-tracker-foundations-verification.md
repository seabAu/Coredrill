# Phase 1 tracker foundations verification

Date: 2026-08-25

Checklist scope: `DB-001`, `DB-002`

Packages: `@coredrill/storage-core`, `@coredrill/storage-browser`, `@coredrill/storage-native`

Decision changes: none

## Outcome

`DB-001` and `DB-002` establish the first product-record storage slice without adding an account, hosted database, network dependency, AI path, background capture, or opaque scoring. Shared forward migrations advance a version-2 database to schema version 13. Focused repositories expose parameterized operations for the vault/settings and company/contact/job/source/snapshot/provenance graph while keeping SQLite as durable truth.

Every extracted `field_value` references provenance. Candidates are append-only by default, and user-confirmation metadata is constrained as one complete unit. Ordinary supersession rejects confirmed values; `replaceConfirmedFieldValue` is the single named operation that confirms a replacement and links the old value inside one database transaction.

## DB-001 migration and settings proof

| Contract               | Enforced behavior                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared migration chain | Reviewed SQL files `0001` through `0013` are contiguous and checksum-bound in the migration ledger.                                           |
| Vault root             | UUIDv7-compatible ID, bounded name, schema version, and UTC timestamps persist through the focused repository.                                |
| Typed settings         | JSON settings round-trip as validated `JsonValue`; upserts increment `row_version`.                                                           |
| Adapter equivalence    | The same migration definitions and contract cases run against browser OPFS/SQLite, native rusqlite, and a fast in-memory SQLite unit adapter. |

## DB-002 entity and safety proof

| Contract              | Enforced behavior                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core graph            | Locations, companies, contacts, jobs, job sources, snapshots, provenance, aliases, and contact-point provenance use strict tables and focused repositories.                       |
| External values       | Repository SQL uses positional parameters; an adversarial company name is stored as data and cannot execute SQL.                                                                  |
| Source lineage        | Job sources own immutable snapshots; each provenance record points to one snapshot with method, pointer, confidence, and capture time.                                            |
| Candidate retention   | Multiple field candidates coexist with raw/normalized JSON and provenance rather than overwriting one another.                                                                    |
| Confirmation safety   | A confirmed candidate cannot be superseded through the ordinary API. Explicit confirmed replacement is atomic and leaves the prior candidate linked to the confirmed replacement. |
| Transaction integrity | An invalid aggregate with a missing job foreign key rolls back without leaving a partial job-source row.                                                                          |

All fixtures are synthetic and contain no resume, provider key, token, private page, or real applicant data.

## Reproducible local verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                        | Result                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run packages/storage-core/test/tracker-repositories.test.ts` | Passed: 1 file, 1 shared-suite test.                                                                                                                         |
| `pnpm test:coverage`                                                           | Passed: 27 files and 144 tests; 91.71% statements, 80.02% branches, 97.32% functions, and 93.35% lines overall.                                              |
| `pnpm test:storage-browser`                                                    | Passed: 5 browser tests, including the shared Phase 1 repository suite at schema version 13.                                                                 |
| `pnpm test:storage-native`                                                     | Passed: 10 TypeScript adapter tests; Rust tests passed with 6 executed and 1 intentionally ignored platform exercise.                                        |
| `pnpm test:extension-transfer`                                                 | Passed: 2 browser-extension transfer/fallback tests; Firefox fallback imported idempotently at schema version 13.                                            |
| `pnpm audit --audit-level=low`                                                 | Passed: no known vulnerabilities.                                                                                                                            |
| `pnpm check:licenses`                                                          | Passed: 351 npm and 498 Cargo package records reviewed.                                                                                                      |
| `pnpm verify`                                                                  | Passed the complete formatting, architecture, typecheck, lint, test, coverage, build, browser/native storage, security, license, audit, and Changesets gate. |

`pnpm install --frozen-lockfile` also passed against lockfile SHA-256 `446a16450701024d746081734224b3007940975511c7ab6a7a4a0b4dc6ebdf31`, reusing the reviewed local package graph without changing the lockfile. The full Rust audit reported zero vulnerabilities and the 15 already-reviewed allowed transitive Linux GTK maintenance/unsoundness warnings recorded in the dependency inventory. Hosted CI is added after the published commit completes.

## Implementation surfaces

- `migrations/0003_app_setting.sql` through `migrations/0013_field_value.sql` — strict forward schema.
- `packages/storage-core/src/tracker-records.ts` — adapter-neutral record types.
- `packages/storage-core/src/tracker-repositories.ts` — focused parameterized repositories and confirmed-value replacement transaction.
- `packages/storage-core/src/tracker-contract-harness.ts` — reusable cross-adapter repository proof.
- `packages/storage-core/test/tracker-repositories.test.ts` — fast SQLite execution of the shared contract suite for coverage.
- `e2e/storage-tracker-repositories.spec.mjs` — real browser SQLite execution.
- `packages/storage-native/test/native-database.test.ts` — native rusqlite execution.

## Boundaries and remaining work

- The schema is deliberately incomplete. `DB-003` is the next dependency-ordered slice for stages, applications, status history, interactions, next actions, interviews, and reminders.
- Index and FTS work remains reserved for `DB-007`; this slice does not imply benchmark acceptance.
- `DB-008` remains open until the repository suite has its dedicated browser/native CI proof at that checklist point.
- `Q-006` remains open, so this work does not choose or lock default display-stage terminology.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
