# Browser storage platform verification

- Date: 2026-08-24
- Checklist scope: `STG-004`, `STG-005`, `STG-006`, `STG-007`, `STG-008`
- Packages: `@coredrill/storage-browser`, `@coredrill/web`
- Decision record: [ADR-0003](../adr/0003-adopt-browser-storage-support-floor.md) (Proposed pending exact hosted lanes)
- Accepted-decision changes: none at this checkpoint; D-025 remains Provisional

## Outcome

The local hardening evidence is green. Edge 151 passes lifecycle, persistence/quota/eviction diagnostics, corrupt-restore preservation, second-tab handoff, abrupt reload recovery, and deterministic storage benchmarks. Real branded Firefox 154 passes the full lifecycle through Mozilla geckodriver. Exact hosted Chrome 152/151 and Firefox 154/153 jobs are committed but remain pending until the implementation checkpoint is pushed. Safari/macOS and mobile device rows remain unavailable and are not simulated.

## STG-004 compatibility evidence

| Target                    | Environment                                                                      | Result at implementation checkpoint | Evidence/fallback                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium current/previous | Exact Chrome for Testing `152.0.7977.54` and `151.0.7922.108` on `ubuntu-latest` | Pending hosted CI                   | Immutable-pinned setup action and exact-version assertion; lifecycle-only job                                                              |
| Edge current              | Edge `151.0.4129.101`, Windows 10 diagnostic host                                | Passed                              | Four-spec Playwright suite; diagnostic, not Windows 11 release evidence                                                                    |
| Firefox current           | Branded Firefox `154.0`, Windows 10 diagnostic host, geckodriver `0.37.1`        | Passed                              | WebDriver lifecycle reports SQLite 3.53.0, Worker, `opfs-sahpool`, reopen, export, delete, restore                                         |
| Firefox current/previous  | Exact branded Firefox `154.0` and `153.0` on `ubuntu-latest`                     | Pending hosted CI                   | Mozilla binaries plus geckodriver; exact-version assertion; no Playwright Firefox substitution                                             |
| Safari current/previous   | Safari `26.6.1`/`18.6` on the required macOS rows                                | Unavailable, not executed           | Block browser vault; use supported Chromium/Firefox or future native app and portable export. Playwright WebKit is not reported as Safari. |
| iOS/Android PWA           | Required physical-device rows                                                    | Unavailable, not executed           | No mobile support claim; use supported desktop browser/native path and portable transfer                                                   |

The local Firefox result is:

```text
STG_FIREFOX_PROOF {"browser":"154.0","appliedVersions":[1],"browserStoragePersistence":"best-effort","reopenedVersions":[],"restoredRows":1,"rows":1,"schemaVersion":1,"sha256":"34551af3ce99f2c02219226bad286f8de415c55419b8c71f65a879d1a43644ae","sqlite":"sqlite-version:3.53.0","vfs":true,"worker":true}
```

## STG-005 failure matrix

| Scenario                             | Mechanism                                         | Proven behavior                                                                                                                     |
| ------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Persistence denied                   | Page-level deterministic StorageManager response  | Adapter reports `best-effort`, `degraded`, and `persistence-not-granted`; it does not claim durable storage                         |
| Quota pressure                       | Deterministic estimate with 5%/50 bytes remaining | Adapter reports `quota-low` and degraded health                                                                                     |
| Private/ephemeral profile            | Two isolated browser contexts                     | Data written in the first context is absent after it closes; `expected-database-missing` is raised in the clean context             |
| Storage eviction/missing database    | Open with `expectedExisting: true` after deletion | Adapter opens a recoverable empty database but reports `expected-database-missing`; later UI must lead with restore/export guidance |
| Correctly checksummed corrupt SQLite | Truncated SQLite bytes with recomputed SHA-256    | Temporary import/integrity validation rejects the input and the original target row remains intact                                  |
| Corrupt existing database            | `PRAGMA quick_check` on every open                | Open fails before repositories use a database whose quick check is not `ok`                                                         |

Browsers intentionally resist private-mode detection. Coredrill does not fingerprint it; it responds to observable persistence, quota, and missing-database signals. The persistence request helper exists but the storage harness proves that open does not request permission implicitly.

## STG-006 contention and crash proof

An origin-wide exclusive Web Lock is acquired before installing `opfs-sahpool`. A second page in the same context receives a typed retryable `vault_busy` result and the status message “This Coredrill vault is open in another tab. Close it there, then retry.” It never reaches a second SAH-pool initialization.

The test closes the owner page without calling the database close API, then polls the contender. Browser-owned lock release permits the contender to open the existing database and read the committed row. Reloading that contender without a close call again releases/reacquires the lease and preserves the row. SQLite result code 5 and locked/busy messages map to `BrowserSqliteBusyError` with `retryable: true`.

```text
STG_CONCURRENCY_PROOF {"crashReloadDurable":true,"handoffAfterOwnerLoss":true,"secondWriterBlocked":true,"sqliteBusyTypedRetry":true}
```

## STG-007 diagnostic benchmark

The benchmark uses deterministic synthetic fixture `JW-STG-DATA-001` with seed `coredrill-storage-benchmark-v1`; no production content is present. It measures create, schema setup, batched import, indexed lookup, database export, validated restore, and full Worker/SAH-pool close/reopen startup for 100, 2,000, and 10,000 records. Search discards five warmups and records 50 iterations; startup records 20; export records five; restore records three. All operations report zero failures.

| Profile          | Records | Database bytes | Import ms | Search p95 ms | Export p95 ms | Restore p95 ms | Startup p95 ms |
| ---------------- | ------: | -------------: | --------: | ------------: | ------------: | -------------: | -------------: |
| `DATA-SMOKE`     |     100 |         65,536 |      11.7 |           0.7 |           1.1 |            9.7 |           73.7 |
| `DATA-REFERENCE` |   2,000 |        876,544 |      58.5 |           0.7 |           5.2 |           49.7 |           86.9 |
| `DATA-STRESS`    |  10,000 |      4,259,840 |     216.4 |           0.7 |          18.0 |          190.9 |          154.9 |

Raw measurements and per-profile fixture hashes are in [`storage-benchmark-edge-151.json`](artifacts/storage-benchmark-edge-151.json). The artifact is currently bound to base commit `c475080`, the exact lockfile hash, `HW-LOCAL-DIAG`, `OS-WIN10-LOCAL`, and a dirty implementation worktree. It will be regenerated from the clean implementation checkpoint before final proof. These diagnostic-host figures are record-only and do not validate the Windows 11/i5 reference budget.

## STG-008 decision candidate

[ADR-0003](../adr/0003-adopt-browser-storage-support-floor.md) proposes retaining official SQLite 3.53.0 `opfs-sahpool` in a dedicated Worker with an origin-wide Web Lock, current/previous Chromium and Firefox desktop support, best-effort labeling unless persistence is granted, explicit degraded warnings, and no Safari/mobile claim until their real runners pass. Unsupported browsers are blocked from creating a vault and directed to a supported desktop browser or future native app with portable export/restore; no in-memory/IndexedDB semantic substitute is introduced.

D-025 and Q-002 remain unchanged until the hosted exact-version lanes pass. No Accepted decision has changed yet.

## Local verification at the implementation checkpoint

| Check                       | Result                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Full `pnpm verify` gate     | Passed: format, boundaries, governance, typecheck, lint, tests/coverage, build, E2E, schema, license, secret, audit |
| Typecheck/lint/build        | 24/24 packages typechecked; 20/20 linted and built                                                                  |
| Unit tests and coverage     | 15 files / 93 tests; 99.02% statements, 95.29% branches, 100% functions, 99.19% lines                               |
| Edge E2E                    | 4 specs passed: lifecycle, failure matrix, contention/crash, and benchmark                                          |
| Firefox 154 WebDriver       | Full branded-browser lifecycle passed with SQLite 3.53.0 and `opfs-sahpool`                                         |
| Supply-chain/policy checks  | 307 packages license-checked; secret scan passed; zero production vulnerabilities                                   |
| Hosted exact Chrome/Firefox | Pending implementation push                                                                                         |

## Boundaries and remaining proof

- The benchmark schema is a throwaway storage-capacity fixture, not the Phase 1 product job schema or an ORM.
- The quota and persistence denial responses are deterministic browser-API simulations; actual browser estimates and private policies vary and are reported separately.
- Safari, iOS, Android, Windows 11 reference hardware, and previous Edge are not claimed as passed.
- Final completion requires exact hosted version-lane results, clean-commit benchmark regeneration, ADR/decision-register promotion, checklist links, and a final hosted proof checkpoint.
