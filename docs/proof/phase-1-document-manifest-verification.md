# Phase 1 document and attachment-manifest verification

Date: 2026-08-25

Checklist scope: `DB-005`

Packages: `@coredrill/storage-core`, `@coredrill/storage-browser`, `@coredrill/storage-native`, `@coredrill/web`

Decision changes: none

## Outcome

`DB-005` adds shared forward migrations `0026` through `0031` and adapter-neutral repositories for document identity, immutable canonical-IR versions, explicit parent lineage, purpose-qualified document/job relationships, content-addressed attachment manifests, logical document-version attachment links, and version-scoped style-example selections. Existing databases advance from schema version 25 to 31 through the same checksum-bound migration chain in browser SQLite and native rusqlite.

The slice remains fully useful with AI disabled. It introduces no provider, prompt, generation, account, hosted database, network, background-browser, or automated-application behavior. Attachment bytes remain outside SQLite; the manifest stores only immutable content identity, media type, size, and logical relationships.

## Persistence and boundary proof

| Contract                 | Enforced behavior                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents                | Strict UUID-keyed records store the accepted document kinds, bounded title/source metadata, archive state, timestamps, and row version. Repository writes bind values rather than interpolating them.                                                                                                            |
| Immutable versions       | Strict records store a positive per-document version number, canonical IR version and bounded JSON, derived plain text, optional template/label metadata, creator, creation time, parent version, and lowercase SHA-256 content hash. No repository update or delete operation exists for version content.       |
| Canonical IR boundary    | Storage requires the JSON `specVersion` to equal `content_ir_version`, currently exactly 1. Complete Coredrill IR validation and deterministic normalization/plain-text derivation remain in the documents/application boundary; Tiptap JSON remains adapter-only.                                               |
| Lineage                  | SQL requires a null parent only for version 1 and a non-null parent thereafter, plus a unique document/version number. The repository requires the next consecutive version and a parent belonging to the same document; cross-document and mismatched-IR attempts fail closed.                                  |
| Job relationships        | A strict purpose-qualified junction has document/job foreign keys and a composite primary key, making exact repeated links idempotent.                                                                                                                                                                           |
| Attachment manifests     | `content_id` is the lowercase SHA-256. Registration requires `content_id === sha256`, bounded lowercase media type, and a nonnegative safe byte length. Exact re-registration is idempotent; different metadata for existing content receives a typed conflict. No bytes or filesystem paths enter storage-core. |
| Logical attachment links | A strict version/content/purpose relationship stores a path-free logical name, nonnegative order, and link time. Exact replay is idempotent; conflicting logical metadata fails closed.                                                                                                                          |
| Style examples           | A separate version-keyed relationship lets the user select or unselect a precise immutable version without mutating its content row.                                                                                                                                                                             |

Every repository fixture is synthetic and contains no resume, provider credential, token, private page, real employer contact, applicant data, or attachment bytes.

## Shared repository proof

The `phase-1-document-repositories` suite executes the same two cases in Node in-memory SQLite, browser SQLite/OPFS, and native rusqlite:

1. `persists canonical IR versions with explicit immutable lineage`
2. `links jobs and content-addressed attachment manifests without storing bytes`

The cases prove bound hostile text, two-document lineage, IR/spec-version agreement, style-example idempotency, document/job idempotency, content-ID/checksum identity, immutable manifest conflict detection, logical-link conflict detection, and foreign-key-backed relationships.

## Reproducible local verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/storage-core/test/tracker-repositories.test.ts`                | Passed: 1 file and 4 tests, including all four shared Phase 1 repository suites in fast SQLite.                                                                                                                                                         |
| `pnpm test:unit`                                                                              | Passed: 28 files and 153 tests.                                                                                                                                                                                                                         |
| `pnpm test:coverage`                                                                          | Passed: 28 files and 153 tests; 90.14% statements, 77.61% branches, 96.31% functions, and 92.58% lines overall.                                                                                                                                         |
| `pnpm test:storage-browser`                                                                   | Passed: 8 Chromium tests, including the shared document repository suite at schema version 31.                                                                                                                                                          |
| `pnpm test:storage-native`                                                                    | Passed: 13 TypeScript adapter tests; Rust reported 6 passed and 1 intentionally ignored platform exercise.                                                                                                                                              |
| `pnpm test:extension-transfer`                                                                | Passed: 2 Chromium/Firefox transfer tests with schema-version-31 migration compatibility.                                                                                                                                                               |
| `pnpm check:foundation-records`                                                               | Passed: 32 direct dependencies, 3 toolchains, 16 execution targets, and 10 accessibility cases.                                                                                                                                                         |
| `pnpm check:licenses`                                                                         | Passed: 351 npm and 498 Cargo package records reviewed.                                                                                                                                                                                                 |
| `pnpm audit --audit-level=low`                                                                | Passed: no known vulnerabilities.                                                                                                                                                                                                                       |
| `pnpm verify`                                                                                 | Passed the complete formatting, architecture, governance, typecheck, lint, unit, coverage, build, browser/native storage, recovery, security, license, audit, and Changesets gate.                                                                      |
| [Foundation CI run 32864602749](https://github.com/seabAu/Coredrill/actions/runs/32864602749) | Passed the aggregate gate, pinned Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native packages, extension transfer, and full-history secret scan for implementation `41f72f9` plus proof-harness corrections `4ff427e` and `36ad990`. |

The dependency graph and lockfile did not change. npm audit found no known vulnerabilities. The Rust audit reported zero vulnerabilities and the 15 already-reviewed allowed transitive Linux GTK maintenance/unsoundness warnings recorded in the dependency inventory.

The first hosted implementation run correctly exposed that the standalone Firefox WebDriver proof still asserted the previous hard-coded schema version 25 after both Firefox databases migrated to 31. Correction commit `4ff427e` derives the expected version from the reviewed contiguous migration filenames, preventing that proof lane from becoming stale on later forward migrations. A later hosted Windows Server 2025 package job built successfully but exceeded the discarded first-warmup 30-second page-load allowance while its installed process remained alive. Correction `36ad990` gives only that nonconformant hosted cold warmup 60 seconds; the other warmups, all 20 measured launches, local allowance, and release targets remain unchanged. The corrected pinned Firefox, Windows, macOS, Ubuntu, Chrome, extension, and aggregate lanes pass. A local real-Firefox WebDriver invocation remains unavailable because this workstation has no `geckodriver`; hosted Firefox supplies that clean-run proof. The setup action retains its non-blocking Node.js runtime notice documented by prior storage proofs.

## Implementation surfaces

- `migrations/0026_document.sql` through `migrations/0031_document_style_example.sql` — strict forward schema for documents, versions, relationships, content-addressed manifests, and style selections.
- `packages/storage-core/src/document-records.ts` and `document-repositories.ts` — adapter-neutral records and focused parameterized repositories.
- `packages/storage-core/src/document-contract-harness.ts` — reusable cross-adapter document/version/manifest contract proof.
- `apps/web/src/main.ts` and `e2e/storage-tracker-repositories.spec.mjs` — real browser OPFS/SQLite execution.
- `packages/storage-native/test/native-database.test.ts` — native rusqlite execution through the thin boundary.
- `tooling/scripts/run-storage-firefox-webdriver.mjs` — real pinned-Firefox migration/reopen/export/restore proof with migration-derived schema expectations.

## Boundaries and remaining work

- Storage-core intentionally validates JSON type, bounds, and matching IR version without importing the documents/editor package. Full IR semantics remain at the documents/application boundary.
- This slice records attachment metadata only. Native/browser binary attachment writes, archive assembly, garbage collection, and recovery UX remain later work.
- Existing application resume/cover-letter selections remain validated nullable IDs. `DB-006` owns fail-closed trigger-backed constraints for selected-version kind and immutable lineage; safe inspection rejected an application-table rebuild because dropping the referenced parent could cascade away child history.
- `DB-006` also owns the remaining audit/tombstone/future-sync-readiness review; this slice does not introduce speculative sync operations, device conflict machinery, or a hosted service.
- Indexes and FTS remain reserved for `DB-007`; `DB-008` remains open until the complete repository contract surface reaches its dedicated checklist review.
- `Q-006` remains open; no default display-stage or saved-view terminology was chosen or locked.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
