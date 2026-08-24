# Native SQLite/Tauri verification

- Date: 2026-08-24
- Checklist scope: `NAT-001`, `NAT-002`, `NAT-003`, `NAT-004`
- Packages: `@coredrill/desktop`, `@coredrill/storage-native`, `@coredrill/storage-core`, `@coredrill/web`
- Locally proven target: Windows x86-64 with Rust 1.98.0, Tauri 2.11.3, Node.js 24.19.0, and pnpm 11.22.0
- Decision changes at this checkpoint: none; D-022 remains Provisional and Q-003 remains open through `NAT-008`

## Outcome

`NAT-001` through `NAT-004` pass their local and immutable hosted proof gates. The shared Vite frontend builds as `coredrill.exe` in a Tauri 2 shell with a strict content security policy, a local-window capability, and generated permissions for narrow versioned native commands. A narrow `rusqlite` command layer is the provisional native-adapter candidate because it preserves the existing callback transaction and migration contracts without broadening the privileged surface. The exact same storage-core transaction suite and a shared migration/repository suite pass against a real Rust process and bundled native SQLite. Tauri's exact platform application-data resolver now feeds a canonical Rust layout for databases and content-addressed attachments, with fail-closed link and unusable-root behavior.

This checkpoint does not accept Tauri or the native adapter. [OS secure storage](native-secure-storage-verification.md) and [native export/restore recovery](native-archive-verification.md) are now proven separately. Installable packaging, cross-platform evidence, and the final D-022/Q-003 decision remain `NAT-007` and `NAT-008`. The shell adds no account, hosted database, telemetry, scraper, AI/provider call, updater, filesystem plugin, or product feature.

## NAT-001 desktop shell proof

The desktop package pins the release-age-reviewed Tauri CLI and builds the existing `@coredrill/web` production output. `tauri.conf.json` uses `../../web/dist`, disables the global Tauri object, freezes the JavaScript prototype, applies a production CSP without `unsafe-inline` or `unsafe-eval`, and leaves bundling inactive for this smoke slice.

The `main` capability is local, applies only to the bundled `main` window on desktop platforms, and grants only `allow-native-storage-invoke`. `build.rs` generates that permission from an explicit one-command app manifest. The Rust entry point forwards Tauri's application-data root into one native service and registers one invoke handler. All operation selection remains behind that single protocol command rather than exposing arbitrary filesystem or plugin permissions.

The Windows release smoke command completed with:

```text
vite v8.1.0 ... built in 276ms
Finished `release` profile [optimized]
Built application at: ...\target\release\coredrill.exe
```

The checked-in ICO is an intentionally neutral, reproducibly generated build resource. It is not a product-brand decision.

## NAT-002 native adapter decision matrix

| Requirement                            | Official Tauri SQL plugin                                                                                     | Narrow `rusqlite` command layer                                                                                                                                                      | Checkpoint result                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Tauri ownership/maintenance            | Official plugin in the Tauri plugins workspace                                                                | `rusqlite` is a focused SQLite binding maintained outside Tauri                                                                                                                      | Both credible                            |
| Callback transaction on one connection | The reviewed JavaScript API documents load/select/execute/close; open issue #886 requests transaction support | The service owns one connection per opaque session and implements begin/commit/rollback for the existing callback contract                                                           | `rusqlite` fits the current contract     |
| Shared reviewed migrations             | Plugin supports configured migrations, creating a second migration mechanism to reconcile                     | Executes the existing `migrations/*.sql` through storage-core's checksum ledger                                                                                                      | `rusqlite` avoids migration divergence   |
| Bound values and statement separation  | Parameter binding is supported through SQLx                                                                   | Tagged, size-bounded values are converted to `rusqlite` values; query rejects writes and execute rejects reads                                                                       | Both viable; narrow layer is proven      |
| SQLite build/features                  | Selected by the plugin's SQLx stack                                                                           | Exact `rusqlite` 0.40.1 with default features disabled and bundled SQLite only                                                                                                       | `rusqlite` is more explicit              |
| IPC/capability surface                 | Plugin permissions and SQL API must be reviewed as a package capability                                       | Two exact allowlisted database/recovery commands, strict tagged protocols, opaque sessions, bounded SQL/results, stable redacted errors                                              | `rusqlite` is narrower in this spike     |
| App-data/path control                  | Plugin database URLs/configuration must be constrained and platform-tested                                    | Exact Tauri app-data resolution, canonical managed roots, lowercase SHA-256 attachment paths, Windows-junction rejection, and SQLite `NOFOLLOW` are proven                           | `rusqlite` passes `NAT-004`              |
| Backup/atomic replace/file picker      | No reviewed high-level API establishes the complete requirement                                               | Official Rust picker plus online SQLite backup, streaming checksum, same-volume atomic replacement, and rollback now pass the NAT-006 lifecycle; `exportPortable()` remains distinct | Narrow adapter passes local `NAT-006`    |
| Maintenance burden                     | Less application-owned Rust, but plugin/API behavior and duplicate migration concerns remain                  | More application-owned protocol/Rust code and cross-platform testing                                                                                                                 | Material tradeoff retained for `NAT-008` |

The provisional result is to carry the narrow `rusqlite` adapter through `NAT-007`. This is implementation evidence, not an Accepted decision. If packaging or cross-platform work reveals a material disadvantage, the official plugin remains a live alternative for the final ADR.

## NAT-003 shared contract proof

The TypeScript adapter implements the existing asynchronous `DatabasePort`; it does not expose Rust, Tauri, or SQLite types to storage-core. Each operation receives a version, bounded request ID, tagged operation, opaque session ID, and separately tagged values. The Rust boundary denies unknown envelope fields, validates database/session names and sizes, serializes connection access, enables foreign keys and `trusted_schema = OFF`, uses WAL, and returns stable content-free errors.

`packages/storage-native/test/native-database.test.ts` starts the exact Rust service as a JSON-lines probe in a verified OS temporary directory. The probe does not log requests or values. The five original contract cases prove:

1. the reusable storage-core callback transaction suite, including commit, rollback, return values, and nested-transaction rejection;
2. the shared `0001_vault.sql` migration and checksum ledger plus repository reads/writes with a hostile bound string;
3. close/reopen durability and schema diagnostics;
4. query/execute separation and an explicit not-yet-supported portable-export capability;
5. rejection of path-shaped database names before privileged work.

The NAT-004 path cases described below expand this file to nine real-process tests. The focused run reported:

```text
Test Files  1 passed (1)
Tests       9 passed (9)
```

## NAT-004 OS app-data and path-confinement proof

The production setup calls pinned Tauri 2.11.3's `app.path().app_data_dir()` and passes that value unchanged to `NativeStorageService`. A Tauri mock-runtime platform test loads the checked-in `app.coredrill.desktop` identifier, calls the same resolver helper used by production, and proves on Windows that the result is absolute and equals Tauri's platform data directory joined to that identifier. It does not write to the owner's real app-data directory.

The service creates and canonicalizes this fixed internal layout:

```text
<Tauri app-data>/
  databases/<validated-leaf>.sqlite3
  attachments/sha256/<hex[0:2]>/<hex[2:4]>/<64-char-lowercase-sha256>
```

Database names remain validated lowercase leaf names; attachment identities accept only a complete lowercase SHA-256 digest. The browser/UI cannot supply an arbitrary attachment path, and absolute storage paths are neither returned over IPC nor logged. Managed directory paths are re-canonicalized against their recorded canonical parents before use. Existing database/attachment leaves reject links or external canonical targets, and SQLite opens with `SQLITE_OPEN_NOFOLLOW` in addition to the existing bound-query and connection hardening. Attachment manifest/content IPC is deliberately not introduced by this path-only gate.

Executable proof covers:

1. two Rust tests create a previously missing nested app-data root, verify canonical `databases` and `attachments/sha256` directories, write a synthetic content-addressed attachment only inside its two-level shard, and reject relative roots, file-occupied roots, traversal-shaped/uppercase/short hashes;
2. nine real-process tests verify the existing SQLite contracts plus physical database placement under `databases`, relative/unusable-root rejection, external directory-link rejection at `databases`, `attachments`, and `attachments/sha256`, and a final `linked.sqlite3` reparse point rejected with a stable redacted `storage_unavailable` error before SQLite opens it;
3. one all-feature pinned-Tauri platform test verifies the configured application-data resolution on Windows;
4. all-target/all-feature Clippy passes with warnings denied, so the platform test and production Tauri setup compile together.

Local focused results:

```text
cargo test --locked --no-default-features --lib: 2 passed
vitest native real-process suite: 9 passed
cargo test --locked --all-features --lib tauri_app_data_path_...: 1 passed, 2 filtered out
cargo clippy --locked --all-targets --all-features -- -D warnings: no issues
```

## Dependency, license, and advisory review

`JW-DI-001` v1.5.0 binds 18 direct npm dependencies to `pnpm-lock.yaml` and five direct crates to `Cargo.lock`. The npm license policy passes 309 package records; the Cargo metadata policy passes 419 registry crates. pnpm reports zero advisories at every severity.

`cargo audit` 0.22.2 scans 420 locked packages and reports zero vulnerabilities. It also reports 15 informational warnings: 14 unmaintained transitive crates and one glib 0.18.5 unsoundness advisory in Tauri/Wry's cross-platform GTK3 graph. The Windows target does not compile the GTK3 path, but the finding is neither hidden nor globally ignored; it remains a maintenance/cross-platform review item for `NAT-008`.

## Reproducible verification

Run with the repository's pinned toolchains:

| Command                                                | Result                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm test:storage-native`                             | Passed two Rust layout tests and nine real-process native storage/path tests              |
| `pnpm --filter @coredrill/desktop test:platform`       | Passed the pinned-Tauri app-data resolver test on Windows                                 |
| `pnpm --filter @coredrill/desktop build:desktop`       | Built the shared Vite frontend and `coredrill.exe`                                        |
| `pnpm check:foundation-records`                        | Passed 18 direct npm dependencies, 3 toolchains, and the exact Cargo manifest/lock record |
| `pnpm check:licenses`                                  | Passed 309 npm package records and 419 Cargo crate records                                |
| `cargo audit --file apps/desktop/src-tauri/Cargo.lock` | Zero vulnerabilities; 15 reviewed informational warnings                                  |

The complete NAT-004 repository `pnpm verify` gate passed: 25/25 typecheck tasks, 21/21 lint tasks, 16 portable unit-test files and 94 tests, 99.02% statements/95.29% branches/100% functions/99.19% lines, 21/21 builds, four browser storage E2E tests, two Rust native-layout tests plus nine real-process native storage/path tests, schema drift checks, both license policies, secret scanning, npm/RustSec vulnerability checks, and Changesets status. The separate all-feature Tauri platform test and all-target Clippy gate also pass. A release-mode build after dependency minimization and result-bound hardening produced `coredrill.exe` in 20.27 seconds.

Hosted clean-checkout proof for implementation commit `7fe612d14e9d704a9cc86c4e59daf6a57795d4da` passed [Foundation CI run 32721800309](https://github.com/seabAu/Coredrill/actions/runs/32721800309):

- the [Windows native/Tauri job](https://github.com/seabAu/Coredrill/actions/runs/32721800309/job/97414591853) built prerequisites from an empty checkout, passed the five native contracts, passed complete all-feature Rust lint, and built the shared frontend in the release Tauri shell;
- the [Linux quality job](https://github.com/seabAu/Coredrill/actions/runs/32721800309/job/97414592126) passed the complete repository gate and emitted both reviewed npm and 419-crate Rust license inventories;

NAT-004's first hosted candidate exposed a Linux-only target-confinement defect after its Windows path proof passed. The corrected manifest and app-data implementation subsequently passed [Foundation CI run 32726880717](https://github.com/seabAu/Coredrill/actions/runs/32726880717): its [Windows native/Tauri job](https://github.com/seabAu/Coredrill/actions/runs/32726880717/job/97430061868) passed the app-data resolver, native path suite, complete Rust lint, and release build, while its [Linux quality job](https://github.com/seabAu/Coredrill/actions/runs/32726880717/job/97430062112) passed the full portable repository gate.

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

- `NAT-007`: build an installable first-OS artifact and measure size, startup, and memory.
- `NAT-008`: synthesize all evidence, resolve the cross-platform Cargo warnings, and update D-022/D-024/Q-003 through an ADR or documented fallback.
