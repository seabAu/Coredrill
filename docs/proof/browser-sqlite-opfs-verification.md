# Browser SQLite/OPFS verification

- Date: 2026-08-24
- Checklist scope: `STG-001`, `STG-002`, `STG-003`
- Packages: `@coredrill/storage-browser`, `@coredrill/storage-core`, `@coredrill/web`
- Browser locally proven: Microsoft Edge 151.0.4129.101 on Windows
- Hosted browser path: Playwright `chrome` channel on GitHub `ubuntu-latest`
- Decision changes at this checkpoint: none; D-024 and D-026 are implemented, and D-025 was still Provisional

## Outcome

`STG-001` through `STG-003` are proven locally and by hosted CI. Coredrill now has a minimal end-to-end browser storage path that runs official SQLite WebAssembly in a dedicated Worker, stores through `opfs-sahpool`, applies checksum-bound shared SQL migrations transactionally, survives close/reopen, exports checksummed SQLite bytes, restores them into a clean browser context, and deletes the restored database. The later STG-005 hardening correctly distinguishes an OPFS-backed database from a browser persistence grant; ungranted profiles are `best-effort`, not `durable`.

Follow-up: [`STG-004` through `STG-008`](browser-storage-platform-verification.md) later passed and accepted D-025/ADR-0003. The statements below preserve this earlier checkpoint's remaining-work boundary.

The proof uses only local browser storage and self-hosted build assets. It adds no account, network service, AI/provider call, telemetry sink, scraper, extension permission, native adapter, product record repository, or product UI. SQLite remains durable truth, and the harness remains useful with AI disabled.

## STG-001 official SQLite Worker/OPFS proof

`@coredrill/storage-browser` imports official `@sqlite.org/sqlite-wasm` 3.53.0-build1 only from `sqlite-worker.ts`. The Worker disables unrelated browser VFSes, installs `opfs-sahpool` in `/coredrill/sqlite-sahpool`, accepts only reviewed absolute `.sqlite3` names, verifies the opened VFS, enables and verifies foreign keys, and reports content-free diagnostics.

The Playwright browser log and final structured proof reported:

```text
COREDRILL_STORAGE {"event":"storage.open","adapter":"official-sqlite-wasm-opfs-sahpool","persistence":"durable","schemaVersion":1,"details":["sqlite-version:3.53.0","vfs:opfs-sahpool",...,"foreign-keys:on","thread:dedicated-worker"]}
STG_PROOF {"sqlite":"sqlite-version:3.53.0","vfs":"opfs-sahpool","worker":"dedicated-worker","schemaVersion":1,"byteLength":40960,"sha256":"4f655aacffe10d9433df185afe24442876222c2c2ca1f048ec5773949013ee52","durableRows":1,"rollback":true,"cleanProfileRestore":true}
```

The built web artifact contains the Worker bundle and the official 864.75 kB SQLite WASM asset. No database work runs synchronously on the UI thread.

## STG-002 migration, transaction, and durability proof

`migrations/0001_vault.sql` is the first shared forward migration. Its reviewed SHA-256 is `a458377c8c59701e9be97a093afe63203d9dfc1b9cdcbd323ab5a6379fa1822d`; it creates only the strict vault root needed by this spike.

The storage-core migration runner creates the strict `coredrill_schema_migration` ledger and records each migration's version, stable name, checksum, and application time in the same transaction as its SQL and `PRAGMA user_version`. It verifies prior ledger rows against reviewed source and fails closed on drift. Four focused unit tests prove first application/idempotent skip, invalid-definition rejection, checksum-drift rejection, and failed-migration rollback.

The Edge E2E test opens a clean database, applies version 1, inserts a vault using bound parameters inside `BEGIN IMMEDIATE`, deliberately rejects a second transaction, confirms that row rolled back, closes the Worker, reopens the same OPFS database, observes no migration reapplication, and reads exactly the committed row.

## STG-003 portable database restore proof

The adapter exports an owned copy of the SQLite bytes together with `schemaVersion`, `byteLength`, and SHA-256. Restore verifies the claimed byte length and checksum before import, then requires `PRAGMA integrity_check = 'ok'` and the expected `user_version` after reopening.

The deterministic fixture exported 40,960 bytes with SHA-256 `4f655aacffe10d9433df185afe24442876222c2c2ca1f048ec5773949013ee52`. The test then:

1. closed the source Worker and browser context;
2. opened a separate clean browser context and deleted any target database;
3. proved an all-zero forged checksum is rejected before restore;
4. restored the valid database and compared its logical rows with the source;
5. re-exported the target and matched schema version, byte length, and SHA-256;
6. deleted and reopened the target and proved it was empty.

This is the adapter-neutral `PortableDatabase` byte/checksum/schema handoff required by DOM-006. Full portable archive assembly, JSON/CSV projections, attachments, encryption metadata, and recovery UX remain later checklist work.

## Reproducible local verification

Run with pinned Node.js 24.19.0 and pnpm 11.22.0:

| Command                                     | Result                                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                               | Passed formatting, 19 boundary policies, foundation records, typecheck, lint, unit/coverage, build, browser storage E2E, three schema-drift checks, license, secret, all-severity audit, and Changesets status |
| `pnpm test:unit` within `verify`            | 14 files and 89 tests passed                                                                                                                                                                                   |
| `pnpm test:coverage`                        | 99.02% statements, 95.29% branches, 100% functions, and 99.19% lines overall                                                                                                                                   |
| Typecheck/lint/build within `verify`        | 24/24 typecheck tasks, 20/20 lint tasks, and 20/20 build tasks passed                                                                                                                                          |
| `pnpm test:storage-browser` within `verify` | 1 Edge E2E test passed; exact `STG_PROOF` shown above                                                                                                                                                          |
| Dependency/policy checks within `verify`    | 15 direct dependencies, 307 license records, secret scan passed, and zero known vulnerabilities at every audit severity                                                                                        |

Implementation commit [`03842f4111f0c7efde4c00cbc67a6693d4ee21ca`](https://github.com/seabAu/Coredrill/commit/03842f4111f0c7efde4c00cbc67a6693d4ee21ca) passed hosted [Foundation CI run `32707257074`](https://github.com/seabAu/Coredrill/actions/runs/32707257074) in 2m05s. The hosted Linux/Chrome path passed all 89 unit tests, the complete policy/security/dependency gate, and the browser E2E test in 4.2s with the same 40,960-byte SHA-256 and structured `STG_PROOF` shown above. The full-history Gitleaks job also passed.

## Dependency and boundary review

The reviewed direct additions are official `@sqlite.org/sqlite-wasm` 3.53.0-build1 for `@coredrill/storage-browser`, Vite 8.1.0 for the local web build, and Playwright 1.61.1 for browser proof. All are exact-pinned in `pnpm-lock.yaml` and recorded in `JW-DI-001` v1.4.0. The inventory is bound to lockfile SHA-256 `358dfdbcc831d663582256deee57e5d3c64815bdc979405b3770327e26df23f4`; license policy covers 307 packages and the all-severity audit reports zero advisories.

The storage-browser package depends only on the adapter-neutral storage-core contract plus the official SQLite package. The web package is a Phase 0 proof harness, not a canonical-state owner. The dedicated Worker receives only the package's versioned internal protocol; SQL statements carry separately bound parameters.

## Files providing proof

- `packages/storage-browser/src/` — Worker protocol, official SQLite/OPFS implementation, serialized coordinator, export/restore/delete, and diagnostics.
- `packages/storage-core/src/migrations.ts` and `packages/storage-core/test/migrations.test.ts` — shared transactional migration runner and failure/drift tests.
- `migrations/0001_vault.sql` and `migrations/README.md` — first reviewed shared migration and operating contract.
- `apps/web/src/main.ts` — minimal browser proof harness with no product feature surface.
- `e2e/storage-browser.spec.mjs` and `playwright.storage.config.mjs` — clean-context Edge lifecycle proof and browser configuration.
- `docs/proof/foundation-dependency-inventory.json` — exact dependency, license, maintainer, advisory, and lockfile record.
- `.changeset/browser-storage-spike.md` — compatibility and release record.

## Remaining work and boundaries at this checkpoint

- `STG-004` must prove current/previous Chromium, Firefox, and Safari support or record exact unsupported fallbacks. This report makes only the local Edge claim above.
- `STG-005` must cover private browsing, persistence denial, quota/eviction diagnostics, and corrupted database behavior.
- `STG-006` must cover second-tab contention, controlled handoff/read-only behavior, crash/reload, and `SQLITE_BUSY` recovery.
- `STG-007` must benchmark the reference datasets and hardware matrix.
- At this checkpoint, `STG-008` still had to synthesize that evidence into the final VFS/browser-support decision and update D-025/Q-002; D-025 remained Provisional until the linked follow-up proof.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
