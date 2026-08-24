# Migrations

Numbered forward SQL migrations in this directory are the reviewed source shared by browser and native SQLite adapters. Production adapters must apply them through `@coredrill/storage-core`, never through ORM auto-sync.

## Applied migration contract

- Filenames begin with one contiguous positive version and a stable descriptive token.
- Every migration is recorded transactionally in the strict `coredrill_schema_migration` ledger with its version, stable name, SHA-256 checksum, and application time.
- An already-applied version whose name or checksum differs from the reviewed source fails closed.
- The adapter updates `PRAGMA user_version` in the same transaction and rolls back the schema, ledger, and version together on failure.
- Browser and native adapters must consume the same SQL files and pass the same migration contract tests.

## Current migrations

| Version | File                     | Purpose                                      | SHA-256                                                            |
| ------- | ------------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| 1       | `0001_vault.sql`         | Minimal strict local-vault root record       | `a458377c8c59701e9be97a093afe63203d9dfc1b9cdcbd323ab5a6379fa1822d` |
| 2       | `0002_capture_inbox.sql` | Durable replay-identifiable capture receipts | `b6a44b450f90d40f3b90f6562a8d26964e5e0e9af5d1c308173897414f280925` |

The Phase 0 schema is deliberately minimal. The capture inbox stores the validated source envelope before the extension receives an acknowledgement; it is not yet a reviewed job record. Job, company, application, evidence, document, provenance, and attachment tables remain owned by their later checklist slices.
