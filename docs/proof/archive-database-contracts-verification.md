# Archive and database contracts verification

- Date: 2026-08-24
- Checklist scope: `DOM-005`, `DOM-006`
- Packages: `@coredrill/contracts`, `@coredrill/storage-core`
- Decision changes: none

## Outcome

`DOM-005` and `DOM-006` are proven locally and in hosted CI. Coredrill now has a strict integer-versioned portable-archive manifest and an adapter-neutral asynchronous database boundary with executable commit/rollback semantics. Both remain accountless, offline-capable, provider-neutral, and useful with AI disabled.

This is deliberately a contract slice. It adds no archive writer/importer, SQLite implementation, migration, OPFS/VFS choice, Tauri command, background task, network service, account, AI path, browser permission, or product UI. Those behaviors remain gated by later `STG-*`, `DB-*`, and product checklist work.

## DOM-005 portable-archive proof

`PortableArchiveManifestV1` is inferred from a strict Zod contract and published as a committed Draft 2020-12 JSON Schema with stable `$id` `https://schemas.coredrill.local/portable-archive-manifest/v1.json`. The shared schema generator emits both serialized contract artifacts and the repository drift check fails if either is missing or stale.

The manifest records:

- integer `specVersion: 1`, archive/vault UUIDv7 IDs, exact creation time, and creating Coredrill semantic version;
- vault schema version plus strictly increasing, checksummed migration history whose final version equals the current schema version;
- an exact SQLite database entry, human-readable JSON/CSV entries, and content-addressed attachments;
- safe relative archive paths, media type, bounded byte length, and lowercase SHA-256 for every entry;
- globally unique entry paths, unique attachment content IDs, and equality between every attachment content ID and its SHA-256;
- explicit baseline encryption state `{ "specVersion": 1, "mode": "none" }`, which records actual protection without implying unimplemented encryption.

The complete synthetic fixture inventories a database, paired JSON/CSV job exports, two migrations, and one attachment. Tests round-trip it without normalization loss and reject traversal paths, duplicate paths, malformed hashes, duplicate/mismatched content IDs, inconsistent or unordered migration history, an unsupported encryption mode, and unknown fields through strict-object validation. Cross-entry and migration-history invariants are enforced by the Zod trust-boundary validator; the generated schema supplies the portable structural contract.

## DOM-006 database contract proof

The public storage boundary now defines:

- `SqlStatement` as SQL text plus a separate immutable parameter array; `sqlStatement` rejects blank/NUL SQL and non-finite numeric bindings and defensively copies binary bindings;
- minimal async `query`/`execute` session methods and typed execution/row values;
- `DatabaseTransaction` as a deliberately narrowed session, preventing transaction callbacks from opening nested transactions or invoking export/diagnostic operations;
- commit only when the callback fulfills, rollback when it rejects, and preservation of the callback's original error;
- adapter-neutral portable database bytes/checksum/schema metadata and privacy-neutral storage diagnostics.

`defineDatabaseContractSuite` and `runDatabaseContractSuite` provide the reusable repository contract harness. Every case receives a fresh isolated database; cleanup always runs; a case and cleanup failure are both retained; successful case names are returned as immutable evidence. Future browser and native adapters can execute the same suite factory.

`createTransactionSemanticsSuite` is the shared executable transaction proof. Its probe captures state inside and outside the transaction and verifies commit visibility, exact rejection identity, and rollback. The reference memory adapter passes both cases. Negative tests prove that the suite rejects adapters that discard fulfilled writes, wrap the callback error, commit rejected writes, or fail to expose the probe mutation.

## Documentation alignment

The storage-port illustration in `02-runtime-architecture.md` now matches the accepted implementation boundary by separating `DatabaseSession`, narrowed `DatabaseTransaction`, and `DatabasePort`, and by stating the commit/rollback/error and portable-database handoff semantics. This clarifies D-051 and the existing architecture; no Accepted decision changed and no ADR is required.

## Reproducible verification

Run with pinned Node.js 24.19.0 and pnpm 11.22.0:

| Command                                 | Result                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`        | Passed for all 20 workspace projects; lockfile already up to date                                                                                                                          |
| focused archive/storage Vitest run      | 2 files and 14 tests passed                                                                                                                                                                |
| `pnpm verify`                           | Passed formatting, boundaries, foundation records, typecheck, lint, unit, coverage, build, schema drift, license, secret, audit, and Changesets gates                                      |
| `pnpm test:unit` within `verify`        | 9 files and 67 tests passed                                                                                                                                                                |
| `pnpm test:coverage`                    | 98.74% statements, 94.80% branches, 100% functions, and 98.96% lines overall; contract sources have 100% statements/functions/lines and `storage-core` has 100% statements/functions/lines |
| Typecheck/lint/build within `verify`    | 21/21 typecheck tasks, 19/19 lint tasks, and 19/19 build tasks passed                                                                                                                      |
| Contract/policy checks within `verify`  | Both generated schemas matched; 19 package-boundary policies, foundation-record validation, and secret scan passed                                                                         |
| Dependency checks within `verify`       | 301 license records passed; zero known vulnerabilities at every audit severity                                                                                                             |
| `pnpm changeset:status` within `verify` | `@coredrill/contracts` and `@coredrill/storage-core` have pending minor Changesets                                                                                                         |

Hosted [Foundation CI run #8](https://github.com/seabAu/Coredrill/actions/runs/32701786838) passed for implementation commit `00d2de6`, including the frozen install, complete foundation gate, reviewed license inventory, and full-history secret scan.

## Dependency review

This slice adds no dependency and does not change the lockfile. The exact `JW-DI-001` v1.2.0 inventory therefore remains authoritative: 12 direct dependencies and lockfile SHA-256 `23f27418bee651e48aa09cb7c10fb55b3ac67b2f725dae84d82ae4c44a7e9e07`.

## Files providing proof

- `packages/contracts/src/portable-archive.ts` — strict manifest contract and generated-schema source.
- `packages/contracts/schemas/portable-archive-manifest.v1.schema.json` — committed Draft 2020-12 artifact.
- `packages/contracts/test/portable-archive.test.ts` and its fixture — round-trip and invalid-invariant proof.
- `packages/storage-core/src/database-port.ts` — database/session/transaction/export/diagnostic boundary.
- `packages/storage-core/src/contract-harness.ts` — reusable isolated suite runner and transaction semantics suite.
- `packages/storage-core/test/database-port.test.ts` — passing reference adapter, lifecycle/error handling, and deliberately broken-adapter proof.
- `.changeset/archive-database-contracts.md` — compatibility and release record.

## Remaining work and boundaries

- `DOM-007` through `DOM-009` are the next coherent domain slice: remaining application-facing ports, command/query/result/error conventions, and privacy-safe diagnostics.
- `STG-*` later selects and proves the actual browser SQLite/OPFS adapter, migration, durability, archive export, and restore behavior against these contracts.
- `DB-*` later implements durable schema/repositories, migration safety, backup/restore, and adapter parity.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
