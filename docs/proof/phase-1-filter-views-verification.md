# Phase 1 filter and saved-view verification

Date: 2026-08-25

Checklist scope: `DB-004`

Packages: `@coredrill/search-filter`, `@coredrill/storage-core`, `@coredrill/storage-browser`, `@coredrill/storage-native`

Decision changes: none

## Outcome

`DB-004` adds shared forward migrations `0023` through `0025`, focused repositories for tags and saved views, and version 1 of the validated job-filter AST and allowlisted parameterized SQL compiler. Existing databases advance from schema version 22 to 25 through the same checksum-bound migration chain in browser SQLite and native rusqlite.

The slice seeds no tag, saved-view, or display-stage vocabulary. Filter version 1 supports only fields backed by the current schema; future salary, skills, and match fields fail closed until their reviewed persistence slices land. It adds no account, hosted database, network dependency, AI path, background browser activity, or automated application action.

## Persistence, validation, and compiler proof

| Contract              | Enforced behavior                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tags                  | Case-insensitive unique bounded names, optional color, archive timestamp, durable timestamps, and row version are stored in a strict table. Repository writes bind values rather than interpolating them.                                  |
| Job-tag relationships | The strict junction table has cascading job/tag foreign keys and a composite primary key. Assignment is idempotent, requires an existing job and active tag, and repeated removal is safe.                                                 |
| Saved views           | A strict table stores scope, name, positive AST version, bounded valid JSON for the AST and UI settings, system/archive flags, timestamps, and row version. Create/update requires the JSON `specVersion` to equal the stored AST version. |
| Optimistic updates    | Saved-view updates compare the expected row version and increment it atomically; a stale writer receives a typed `row_version_conflict` instead of overwriting newer state.                                                                |
| Versioned AST         | Version 1 accepts exact group/predicate shapes only, rejects unknown properties/fields/operators, validates field/operator/value compatibility, and caps depth, children, predicates, list values, text, and serialized size.              |
| Stable categories     | Status-category filters admit only the accepted aggregate categories from `@coredrill/domain`; no provisional display-stage name becomes storage vocabulary.                                                                               |
| Safe compiler         | Every table, column, relation, and SQL operator comes from a source allowlist. User values use positional parameters; `LIKE` metacharacters are escaped before binding; nested `AND`/`OR`/`NOT` groups emit only validated structure.      |
| Future fields         | Unsupported salary, skills, match, or other fields are rejected as `unknown_field`; the compiler never guesses a table or column for them.                                                                                                 |

Every repository fixture is synthetic and contains no resume, provider credential, token, private page, real employer contact, or applicant data.

## Property and cross-adapter proof

The focused filter suite performs 500 generated valid-document round trips, 1,000 arbitrary-JSON typed-rejection checks, and 500 adversarial text-binding checks. It also exercises nesting, predicate-count, serialized-size, unknown-field, incompatible-operator, relation, and deterministic SQL behavior.

The shared `phase-1-view-repositories` suite executes the same two cases in Node in-memory SQLite, browser SQLite/OPFS, and native rusqlite:

1. `assigns active tags idempotently and enforces job relationships`
2. `round-trips versioned saved views with optimistic updates`

## Reproducible local verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                                                       | Result                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/search-filter/test/filter-ast.test.ts packages/storage-core/test/tracker-repositories.test.ts` | Passed: 2 files and 9 tests, including all property and fast SQLite repository checks.                                                                                                                        |
| `pnpm test:unit`                                                                                                              | Passed: 28 files and 152 tests.                                                                                                                                                                               |
| `pnpm test:coverage`                                                                                                          | Passed: 28 files and 152 tests; 90.57% statements, 77.88% branches, 96.61% functions, and 92.81% lines overall.                                                                                               |
| `pnpm test:storage-browser`                                                                                                   | Passed: 7 Chromium tests, including all three shared Phase 1 repository suites at schema version 25.                                                                                                          |
| `pnpm test:storage-native`                                                                                                    | Passed: 12 TypeScript adapter tests; Rust reported 6 passed and 1 intentionally ignored platform exercise.                                                                                                    |
| `pnpm test:extension-transfer`                                                                                                | Passed: 2 Chromium/Firefox transfer tests with schema-version-25 migration compatibility.                                                                                                                     |
| `pnpm check:foundation-records`                                                                                               | Passed: 32 direct dependencies, 3 toolchains, 16 execution targets, and 10 accessibility cases.                                                                                                               |
| `pnpm check:licenses`                                                                                                         | Passed: 351 npm and 498 Cargo package records reviewed.                                                                                                                                                       |
| `pnpm audit --audit-level=low`                                                                                                | Passed: no known vulnerabilities.                                                                                                                                                                             |
| `pnpm verify`                                                                                                                 | Passed the complete formatting, architecture, governance, typecheck, lint, unit, coverage, build, browser/native storage, recovery, security, license, audit, and Changesets gate.                            |
| [Foundation CI run 32858776469](https://github.com/seabAu/Coredrill/actions/runs/32858776469)                                 | Passed implementation commit `b484c27` across both pinned Chrome and Firefox lanes, Windows/macOS/Ubuntu native lanes, extension reproducibility, full-history secret scan, and the complete foundation gate. |

The lockfile graph did not acquire a new external version: `fast-check` 4.9.0 was already pinned and reviewed at the root, and `DB-004` declares it directly in the package that owns the property proof. The dependency inventory was rebound to lock SHA-256 `9917fef25bd914c0a53fcee7c59d80d55cbe46cf32e369d775b210b33bffc4e6`; npm audit found no known vulnerabilities. The Rust audit reported zero vulnerabilities and the 15 already-reviewed allowed transitive Linux GTK maintenance/unsoundness warnings recorded in the dependency inventory.

A local real-Firefox WebDriver invocation remains unavailable because this workstation has no `geckodriver`; hosted pinned Firefox 153 and 154 jobs supplied that clean-run proof. Those jobs retain the non-blocking notice that their checksum-pinned geckodriver setup action declares the deprecated Node.js 20 action runtime while GitHub forces it onto Node.js 24; review this when the upstream action publishes a newer runtime.

## Implementation surfaces

- `migrations/0023_tag.sql` through `migrations/0025_saved_view.sql` — strict forward schema for tags, relationships, and saved views.
- `packages/search-filter/src/filter-ast.ts` — versioned AST validation, limits, JSON serialization, and typed errors.
- `packages/search-filter/src/sql-compiler.ts` — allowlisted parameterized SQL compilation.
- `packages/search-filter/test/filter-ast.test.ts` — generated round-trip, arbitrary-input, limit, compatibility, and injection-resistance proof.
- `packages/storage-core/src/view-records.ts` and `view-repositories.ts` — adapter-neutral records and focused parameterized repositories.
- `packages/storage-core/src/view-contract-harness.ts` — reusable cross-adapter tag and saved-view contract proof.
- `e2e/storage-tracker-repositories.spec.mjs` — real browser OPFS/SQLite execution.
- `packages/storage-native/test/native-database.test.ts` — native rusqlite execution through the thin boundary.

## Boundaries and remaining work

- The compiler intentionally rejects salary, skill, and match fields until their owning schema slices provide reviewed storage semantics.
- `APP-002` and `APP-003` still own application-service commands, clock/time-zone orchestration, and UI-facing error translation; this slice proves durable repository/compiler behavior only.
- `DB-005` is next for document, version, and attachment-manifest persistence without an AI dependency.
- Audit/tombstone constraints remain reserved for `DB-006`; indexes and FTS remain reserved for `DB-007`.
- `DB-008` remains open until the complete repository contract surface reaches its dedicated checklist review.
- `Q-006` remains open; no default display-stage or saved-view terminology was chosen or locked.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
