# Native SQLite/Tauri verification

- Date: 2026-08-24
- Checklist scope: `NAT-001`, `NAT-002`, `NAT-003`
- Packages: `@coredrill/desktop`, `@coredrill/storage-native`, `@coredrill/storage-core`, `@coredrill/web`
- Locally proven target: Windows x86-64 with Rust 1.98.0, Tauri 2.11.3, Node.js 24.19.0, and pnpm 11.22.0
- Decision changes at this checkpoint: none; D-022 remains Provisional and Q-003 remains open until `NAT-004` through `NAT-008`

## Outcome

`NAT-001` through `NAT-003` pass their local and hosted proof gates. The shared Vite frontend builds as `coredrill.exe` in a Tauri 2 shell with a strict content security policy, a local-window capability, and one generated permission for one versioned native-storage command. A narrow `rusqlite` command layer is the provisional native-adapter candidate because it can preserve the existing callback transaction and migration contracts without broadening the privileged surface. The exact same storage-core transaction suite and a shared migration/repository suite pass against a real Rust process and bundled native SQLite.

This checkpoint does not accept Tauri or the native adapter. OS app-data/path tests, secure storage, native export/restore, installable packaging, cross-platform evidence, and the final D-022/Q-003 decision remain `NAT-004` through `NAT-008`. The shell adds no account, hosted database, telemetry, scraper, AI/provider call, updater, filesystem plugin, or product feature.

## NAT-001 desktop shell proof

The desktop package pins the release-age-reviewed Tauri CLI and builds the existing `@coredrill/web` production output. `tauri.conf.json` uses `../../web/dist`, disables the global Tauri object, freezes the JavaScript prototype, applies a production CSP without `unsafe-inline` or `unsafe-eval`, and leaves bundling inactive for this smoke slice.

The `main` capability is local, applies only to the bundled `main` window on desktop platforms, and grants only `allow-native-storage-invoke`. `build.rs` generates that permission from an explicit one-command app manifest. The Rust entry point manages one native service rooted under Tauri's application-data `vaults` directory and registers one invoke handler. All operation selection remains behind that single protocol command rather than exposing arbitrary filesystem or plugin permissions.

The Windows release smoke command completed with:

```text
vite v8.1.0 ... built in 276ms
Finished `release` profile [optimized]
Built application at: ...\target\release\coredrill.exe
```

The checked-in ICO is an intentionally neutral, reproducibly generated build resource. It is not a product-brand decision.

## NAT-002 native adapter decision matrix

| Requirement                            | Official Tauri SQL plugin                                                                                     | Narrow `rusqlite` command layer                                                                                            | Checkpoint result                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Tauri ownership/maintenance            | Official plugin in the Tauri plugins workspace                                                                | `rusqlite` is a focused SQLite binding maintained outside Tauri                                                            | Both credible                            |
| Callback transaction on one connection | The reviewed JavaScript API documents load/select/execute/close; open issue #886 requests transaction support | The service owns one connection per opaque session and implements begin/commit/rollback for the existing callback contract | `rusqlite` fits the current contract     |
| Shared reviewed migrations             | Plugin supports configured migrations, creating a second migration mechanism to reconcile                     | Executes the existing `migrations/*.sql` through storage-core's checksum ledger                                            | `rusqlite` avoids migration divergence   |
| Bound values and statement separation  | Parameter binding is supported through SQLx                                                                   | Tagged, size-bounded values are converted to `rusqlite` values; query rejects writes and execute rejects reads             | Both viable; narrow layer is proven      |
| SQLite build/features                  | Selected by the plugin's SQLx stack                                                                           | Exact `rusqlite` 0.40.1 with default features disabled and bundled SQLite only                                             | `rusqlite` is more explicit              |
| IPC/capability surface                 | Plugin permissions and SQL API must be reviewed as a package capability                                       | One allowlisted command, strict tagged protocol, opaque sessions, bounded SQL/results, stable redacted errors              | `rusqlite` is narrower in this spike     |
| App-data/path control                  | Plugin database URLs/configuration must be constrained and platform-tested                                    | Rust service accepts only reviewed `.sqlite3` leaf names and canonicalizes its root                                        | Candidate only; `NAT-004` still required |
| Backup/atomic replace/file picker      | No reviewed high-level API establishes the complete requirement                                               | Not implemented in this slice; `exportPortable()` fails with an explicit capability error                                  | Neither passes `NAT-006` yet             |
| Maintenance burden                     | Less application-owned Rust, but plugin/API behavior and duplicate migration concerns remain                  | More application-owned protocol/Rust code and cross-platform testing                                                       | Material tradeoff retained for `NAT-008` |

The provisional result is to carry the narrow `rusqlite` adapter through `NAT-004` to `NAT-007`. This is implementation evidence, not an Accepted decision. If export, secure-store, packaging, or cross-platform work reveals a material disadvantage, the official plugin remains a live alternative for the final ADR.

## NAT-003 shared contract proof

The TypeScript adapter implements the existing asynchronous `DatabasePort`; it does not expose Rust, Tauri, or SQLite types to storage-core. Each operation receives a version, bounded request ID, tagged operation, opaque session ID, and separately tagged values. The Rust boundary denies unknown envelope fields, validates database/session names and sizes, serializes connection access, enables foreign keys and `trusted_schema = OFF`, uses WAL, and returns stable content-free errors.

`packages/storage-native/test/native-database.test.ts` starts the exact Rust service as a JSON-lines probe in a verified OS temporary directory. The probe does not log requests or values. Five tests prove:

1. the reusable storage-core callback transaction suite, including commit, rollback, return values, and nested-transaction rejection;
2. the shared `0001_vault.sql` migration and checksum ledger plus repository reads/writes with a hostile bound string;
3. close/reopen durability and schema diagnostics;
4. query/execute separation and an explicit not-yet-supported portable-export capability;
5. rejection of path-shaped database names before privileged work.

The focused run reported:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

## Dependency, license, and advisory review

`JW-DI-001` v1.5.0 binds 18 direct npm dependencies to `pnpm-lock.yaml` and five direct crates to `Cargo.lock`. The npm license policy passes 309 package records; the Cargo metadata policy passes 419 registry crates. pnpm reports zero advisories at every severity.

`cargo audit` 0.22.2 scans 420 locked packages and reports zero vulnerabilities. It also reports 15 informational warnings: 14 unmaintained transitive crates and one glib 0.18.5 unsoundness advisory in Tauri/Wry's cross-platform GTK3 graph. The Windows target does not compile the GTK3 path, but the finding is neither hidden nor globally ignored; it remains a maintenance/cross-platform review item for `NAT-004` and `NAT-008`.

## Reproducible verification

Run with the repository's pinned toolchains:

| Command                                                | Result                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm test:storage-native`                             | Passed the five real-process native storage tests                                         |
| `pnpm --filter @coredrill/desktop build:desktop`       | Built the shared Vite frontend and `coredrill.exe`                                        |
| `pnpm check:foundation-records`                        | Passed 18 direct npm dependencies, 3 toolchains, and the exact Cargo manifest/lock record |
| `pnpm check:licenses`                                  | Passed 309 npm package records and 419 Cargo crate records                                |
| `cargo audit --file apps/desktop/src-tauri/Cargo.lock` | Zero vulnerabilities; 15 reviewed informational warnings                                  |

The complete repository `pnpm verify` gate passed: 25/25 typecheck tasks, 21/21 lint tasks, 16 portable unit-test files and 94 tests, 99.02% statements/95.29% branches/100% functions/99.19% lines, 21/21 builds, four browser storage E2E tests, five separate native storage tests, schema drift checks, both license policies, secret scanning, npm/RustSec vulnerability checks, and Changesets status. A release-mode build after dependency minimization and result-bound hardening produced `coredrill.exe` in 20.27 seconds.

Hosted clean-checkout proof for implementation commit `7fe612d14e9d704a9cc86c4e59daf6a57795d4da` passed [Foundation CI run 32721800309](https://github.com/seabAu/Coredrill/actions/runs/32721800309):

- the [Windows native/Tauri job](https://github.com/seabAu/Coredrill/actions/runs/32721800309/job/97414591853) built prerequisites from an empty checkout, passed the five native contracts, passed complete all-feature Rust lint, and built the shared frontend in the release Tauri shell;
- the [Linux quality job](https://github.com/seabAu/Coredrill/actions/runs/32721800309/job/97414592126) passed the complete repository gate and emitted both reviewed npm and 419-crate Rust license inventories;
- both current/previous Chrome and Firefox storage lanes passed, and the [full-history secret scan](https://github.com/seabAu/Coredrill/actions/runs/32721800309/job/97414592000) passed.

The hosted Firefox jobs retain a non-failing GitHub annotation because the checksum-pinned geckodriver setup action still declares a Node.js 20 action runtime that GitHub forces onto Node.js 24. Both exact Firefox lifecycle lanes pass; action-runtime compatibility remains a routine CI maintenance item rather than product proof.

## Sources

- [Tauri capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri content security policy](https://v2.tauri.app/security/csp/)
- [Tauri command invocation](https://v2.tauri.app/develop/calling-rust/)
- [Official Tauri SQL plugin README](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/sql/README.md)
- [Official SQL-plugin transaction issue #886](https://github.com/tauri-apps/plugins-workspace/issues/886)
- [`tauri-plugin-sql` 2.4.0 documentation](https://docs.rs/crate/tauri-plugin-sql/2.4.0)
- [`rusqlite` 0.40.1 documentation](https://docs.rs/crate/rusqlite/0.40.1)
- [`rusqlite` 0.40.1 release](https://github.com/rusqlite/rusqlite/releases/tag/v0.40.1)
- [RustSec advisory database](https://rustsec.org/)

## Remaining work

- `NAT-004`: platform-test the real Tauri app-data root, canonicalization, symlink/reparse-point behavior, attachment paths, and missing/unwritable storage.
- `NAT-005`: select and prove OS secure storage with redacted create/read/delete failure tests.
- `NAT-006`: implement native picker-driven checksummed export/restore with temporary validation, atomic replacement, and recovery.
- `NAT-007`: build an installable first-OS artifact and measure size, startup, and memory.
- `NAT-008`: synthesize all evidence, resolve the cross-platform Cargo warnings, and update D-022/D-024/Q-003 through an ADR or documented fallback.
