# Phase 1 indexed lexical job-search verification

Date: 2026-08-25

Checklist scope: `DB-007`

Packages: `@coredrill/storage-core`, `@coredrill/storage-browser`, `@coredrill/storage-native`, `@coredrill/web`

Decision changes: none

## Outcome

`DB-007` adds shared forward migrations `0046` through `0084`, advancing browser SQLite and native rusqlite from schema version 45 to 84. The migrations install reviewed B-tree and partial indexes for the current tracker schema, a regular search-content view, stable integer row identities, a durable content-revision signal, and triggers that advance search revisions without requiring FTS5.

The adapter-neutral search repository performs a real temporary-virtual-table capability probe before using FTS5. When the module is available it creates and maintains a local external-content FTS5 artifact; when the probe, initialization, or query fails it returns the same bounded all-token result contract through normalized parameter-bound `LIKE` predicates. The baseline remains local-only, useful without AI, and independent of accounts, hosted services, embeddings, or a vector server.

## Durable schema and index proof

| Contract              | Enforced behavior                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracker indexes       | Migrations `0046` through `0070` cover active-job recency, company/status/next-action/date/workplace/employment/seniority/location/title projections; source identity and deduplication; snapshot, status, interaction, action, interview, reminder, tag, document, and attachment relationship lookups. Partial indexes exclude archived or completed rows where the repository query has the same predicate. |
| Search identity       | `job_search_identity` assigns one stable integer FTS row ID per job without changing the canonical UUID job identity. Existing jobs are backfilled and later inserts receive an identity through regular-table triggers.                                                                                                                                                                                       |
| Search content        | `job_search_content` is a normal SQL view over current job title, description, company name/notes, and application notes. Current schema fields are searchable without copying them into another canonical table.                                                                                                                                                                                              |
| Search freshness      | `job_search_state` records monotonically increasing content and FTS revisions. Job, company, and application changes advance the content revision; the FTS artifact is rebuilt before query when revisions diverge. Contract tests prove updated text replaces stale results.                                                                                                                                  |
| Optional FTS artifact | Numbered migrations never reference an FTS virtual table, so an adapter without the module can migrate and write the complete durable schema. The optional external-content table is created only after a successful runtime probe and can be rebuilt from canonical content.                                                                                                                                  |
| Query plans           | Focused tests run representative job, source, timeline, action, document, and relationship queries through `EXPLAIN QUERY PLAN` and require the intended reviewed index rather than merely asserting that an index exists.                                                                                                                                                                                     |

All 84 migration names, versions, lowercase SHA-256 hashes, and compatibility notes are recorded in `migrations/README.md`. `pnpm report:migrations` proves that the embedded browser, native, and Node inventories remain contiguous and checksum-identical.

## Capability detection, correctness, and fallback safety

`detectFts5Capability` creates and drops a temporary FTS5 table. It does not infer support from a compile-option string alone. A unit-test adapter that rejects `CREATE VIRTUAL TABLE ... USING fts5` proves the search repository automatically selects `normalized-token` mode with reason `module-unavailable`; an explicit policy switch separately exercises the same functional contract.

The shared job-search contract suite runs accelerated and forced-fallback modes against Node in-memory SQLite, browser SQLite/OPFS, and native rusqlite. It proves:

1. title, description, company name/notes, and application-note matches;
2. all-token semantics and deterministic updated-time/job-ID ordering;
3. archived-job exclusion by default and explicit archived inclusion;
4. parameter binding for quotes, wildcard characters, FTS syntax, and hostile input;
5. bounded queries and result limits; and
6. content-revision refresh without stale or orphaned results.

User input is NFKC-normalized, lowercased, reduced to Unicode letters/numbers, and bounded to 512 source characters, 16 tokens, 64 characters per token, and 100 results. FTS input is quoted token-by-token and bound as a value. Fallback `LIKE` input is escaped and bound as a value. Search mode and fallback reason are inspectable diagnostics; no opaque relevance, ATS, or hiring-probability score is produced.

## Clean benchmark evidence

The immutable [Edge 151 search benchmark artifact](artifacts/job-search-benchmark-edge-151.json) is bound to clean implementation commit `968c0abb020a07777dbcd20508ecb3b99fded79a`, lockfile SHA-256 `9917fef25bd914c0a53fcee7c59d80d55cbe46cf32e369d775b210b33bffc4e6`, schema version 84, SQLite 3.53.0, Vite 8.2.2, and deterministic synthetic fixture `JW-STG-DATA-001`. Each search mode has five warmups followed by 50 measured correctness-checked searches per profile.

| Profile          |   Jobs | FTS initialize | FTS p95 | Fallback p95 | Search failures |
| ---------------- | -----: | -------------: | ------: | -----------: | --------------: |
| `DATA-SMOKE`     |    100 |        18.9 ms |  2.7 ms |       1.7 ms |               0 |
| `DATA-REFERENCE` |  2,000 |        33.0 ms |  2.9 ms |       5.8 ms |               0 |
| `DATA-STRESS`    | 10,000 |        74.5 ms |  3.1 ms |      21.7 ms |               0 |

The fallback is intentionally a bounded linear scan over the regular content view. It is functionally safe for the accepted small-corpus contingency but is not claimed to match FTS5 `unicode61` stemming, diacritic handling, or scaling. The benchmark makes that tradeoff visible rather than hiding it.

## Reproducible local and hosted verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                                                                                                     | Result                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/storage-core/test/tracker-repositories.test.ts packages/storage-core/test/job-search.test.ts packages/storage-core/test/query-plans.test.ts` | Passed focused repository, real-module-unavailable fallback, query-safety, refresh, and intended-index-plan proof.                                                                                   |
| `pnpm test:unit`                                                                                                                                                            | Passed: 29 files and 160 tests.                                                                                                                                                                      |
| `pnpm test:coverage`                                                                                                                                                        | Passed: 29 files and 160 tests; 90.60% statements, 79.02% branches, 96.78% functions, and 92.94% lines overall.                                                                                      |
| `pnpm test:storage-browser`                                                                                                                                                 | Passed: 10 Chromium tests at schema version 84, including accelerated and forced-fallback search contracts.                                                                                          |
| `pnpm test:storage-native`                                                                                                                                                  | Passed: 14 TypeScript adapter tests; the bundled rusqlite adapter selected FTS5 after its real module probe. Rust reported 6 passed and 1 intentionally ignored platform exercise.                   |
| `pnpm report:migrations`                                                                                                                                                    | Passed the 84-entry browser/native/Node migration inventory and printed version/name/hash parity.                                                                                                    |
| `pnpm check:licenses`                                                                                                                                                       | Passed: 351 npm and 498 Cargo package records reviewed.                                                                                                                                              |
| `pnpm audit --audit-level=low`                                                                                                                                              | Passed: no known vulnerabilities.                                                                                                                                                                    |
| `pnpm verify`                                                                                                                                                               | Passed the complete formatting, architecture, governance, typecheck, lint, unit, coverage, build, browser/native storage, recovery, security, license, audit, and Changesets gate.                   |
| [Foundation CI run 32872269856](https://github.com/seabAu/Coredrill/actions/runs/32872269856)                                                                               | Hosted proof for implementation commit `968c0ab`: aggregate gate, pinned Chrome 151/152 and Firefox 153/154, Windows/macOS/Ubuntu native packages, extension transfer, and full-history secret scan. |

The dependency graph and lockfile did not change. npm audit found no known vulnerabilities. The Rust audit retains zero vulnerabilities and the 15 already-reviewed allowed transitive Linux GTK maintenance/unsoundness warnings recorded in the dependency inventory. All benchmark and correctness fixtures are deterministic synthetic records; no resume, credential, token, applicant data, real employer contact, private page, or production career content was used.

## Implementation surfaces

- `migrations/0046_job_active_updated_index.sql` through `migrations/0084_job_search_application_delete_revision.sql` — reviewed tracker indexes plus FTS-independent search identity, content, revision, and refresh triggers.
- `packages/storage-core/src/job-search.ts` — bounded tokenizer, real capability probe, optional FTS initialization/refresh, parameterized FTS query, and parameterized normalized-token fallback.
- `packages/storage-core/src/job-search-contract-harness.ts` — reusable accelerated/fallback correctness and hostile-input contracts.
- `packages/storage-core/test/job-search.test.ts`, `query-plans.test.ts`, and `tracker-repositories.test.ts` — module-unavailable, query-plan, cross-repository, and migration proof.
- `e2e/storage-job-search.spec.mjs` and `e2e/storage-job-search-benchmark.spec.mjs` — real browser adapter correctness and clean benchmark artifact generation.
- `packages/storage-native/test/native-database.test.ts` — native rusqlite execution of the same job-search contracts.

## Boundaries and remaining work

- Current search covers fields that exist in schema version 84. Requirements and career-evidence content join the same reviewed search boundary only after their owning persistence slices exist; this slice does not pre-create speculative tables.
- `DB-008` remains open for a dedicated, versioned proof that browser and native CI execute one identical complete repository-contract inventory.
- Application-service orchestration and scoped/global search UI remain owned by `APP-*` and `UI-011`; this slice exposes repositories and diagnostics only.
- No embeddings, vector store, network service, account, AI provider, crawler, browser surveillance, auto-apply, automated outreach, or generated evidence was introduced.
- `Q-006` remains open; no default display-stage or saved-view terminology was chosen or locked.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
- `GATE-0` remains blocked on owner-authorized representative human validation.
- No ADR is required because no Accepted decision changed.
