# Native recovery-archive verification

- Date: 2026-08-24
- Checklist scope: `NAT-006`
- First target proven locally: Windows x86-64
- Exact toolchain: Rust 1.98.0, Tauri 2.11.3, Node.js 24.19.0, pnpm 11.22.0
- Decision changes: none; D-022 remains Provisional, D-051 remains Accepted, and Q-003 remains open through `NAT-008`

## Outcome

Coredrill can export and restore a database-only recovery artifact through an operating-system file picker without exposing the selected path to the WebView. The WebView sends only a versioned `export` or `restore` operation plus an opaque native session ID. Rust opens the official Tauri dialog, performs all filesystem work, and returns only cancellation or non-sensitive format/schema/length/SHA-256 metadata.

The implementation proves atomic replacement and recovery on the first target OS. A selected export is written to a unique temporary file in the destination directory, flushed, and moved over the destination with Windows `MoveFileExW` using `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`. Restore validates into managed same-volume temporary storage before the live connection closes. It snapshots the current database, replaces the database atomically, reopens and validates it, and atomically restores the snapshot if any post-replacement step fails.

This artifact is deliberately labeled `checksummed-database-recovery`. It contains SQLite database bytes only. It is not the full D-051/BKP-001 portable archive, which must later include attachments, a manifest, encryption metadata where applicable, and human-readable JSON/CSV exports.

## Narrow picker and IPC boundary

The local-window capability adds one generated permission for the custom `native_archive_invoke` command. The official dialog plugin is called only from Rust on a blocking worker thread. Its JavaScript open/save commands and the transitive filesystem plugin receive no WebView capability. Selected paths are converted and consumed inside Rust; neither request nor response has a path field.

Before a picker opens, the archive request, session, transaction state, and managed database path are validated. After selection:

- relative paths, links, directories, unusable parents, and any target inside Coredrill's managed app-data tree fail closed;
- cancellation returns an explicit, successful `cancelled` response without creating a file;
- operations remain serialized with database work through the native service mutex;
- path- and OS-derived failures collapse to stable, content-free errors.

`NativeSqliteDatabase.exportRecoveryArchive()` and `restoreRecoveryArchive()` expose this narrow flow to TypeScript. `DatabasePort.exportPortable()` remains explicitly unavailable because a database-only recovery artifact must not masquerade as the later full portable archive.

## Versioned recovery artifact

The streaming format is bounded to 64 GiB and has a fixed 62-byte header:

| Field                 | Encoding                           |
| --------------------- | ---------------------------------- |
| Magic                 | 16 bytes: `COREDRILL_DB_V1\0`      |
| Format version        | little-endian `u16`, currently `1` |
| SQLite `user_version` | little-endian `u32`                |
| Database byte length  | little-endian `u64`                |
| Database digest       | 32 raw SHA-256 bytes               |
| Payload               | exact SQLite database bytes        |

Export uses rusqlite's official online-backup API so WAL content is represented in a consistent standalone snapshot. The snapshot must pass `integrity_check` and schema validation before hashing. SHA-256 and copy operations use a 1 MiB streaming buffer rather than loading the database into memory.

Restore rejects the wrong magic/version/schema, impossible or excess length, trailing/truncated data, digest mismatch, and invalid SQLite before replacement. The extracted temporary database must pass `integrity_check` and the currently open vault's `user_version`. Replacement removes stale WAL/SHM sidecars only after the live connection closes. A recovered or restored connection re-enables foreign keys, `trusted_schema = OFF`, WAL, a bounded busy timeout, and `SQLITE_OPEN_NOFOLLOW`.

## End-to-end failure and recovery proof

The real SQLite/filesystem lifecycle test performs this sequence through one `NativeStorageService` session:

1. create a strict schema at `user_version = 1` and store an original row;
2. reject an export target inside managed app-data;
3. export twice to the same selected file, proving create and atomic replace;
4. cancel a second export without creating a file;
5. mutate the live database;
6. corrupt one payload byte and prove checksum rejection leaves the mutation readable;
7. inject a replacement failure after the live connection closes and prove the recovery snapshot restores the latest committed data;
8. inject a failure immediately after atomic replacement and prove the recovery snapshot restores the mutated database and usable session;
9. restore the valid archive and prove the original row returns;
10. close/reopen and prove the restored row remains durable.

Local results:

```text
NAT006_ARCHIVE_PROOF {"artifact":"checksummed-database-recovery","pickerBoundary":"rust-only","cancellation":true,"checksumRejectedBeforeReplacement":true,"atomicReplacement":true,"replacementFailureRecovery":true,"postReplacementRecovery":true,"durableAfterReopen":true,"pathExposedToWebview":false}
cargo test --locked --no-default-features --lib: 6 passed, 1 ignored
archive protocol tests: 8 passed
cargo clippy --locked --all-targets --all-features -- -D warnings: no issues
tauri build --no-bundle: release coredrill.exe built in 26.08 seconds
```

The TypeScript protocol tests separately reject the wrong request ID, malformed digest, unsafe byte count, and unknown cancellation operation. They prove the adapter auto-detects the archive-capable Tauri transport and that both archive requests serialize without a path field.

The complete repository `pnpm verify` gate also passed: 25/25 typecheck tasks, 21/21 lint tasks, 18 portable unit-test files and 105 tests, 99.02% statements/95.29% branches/100% functions/99.19% lines, 21/21 builds, four browser storage E2E tests, six passing Rust native tests plus one deliberately ignored real-secret test, nine TypeScript-to-real-Rust native storage/path tests, both native proof harnesses, schema drift checks, both license policies, secret scanning, npm/RustSec vulnerability checks, and Changesets status. The separate all-feature Tauri platform test, all-target Clippy gate, and release Tauri build also pass.

## Dependency, license, and advisory review

`JW-DI-001` v1.7.0 binds all 12 direct Cargo declarations to lock SHA-256 `1d1b889b68954bcb38b97ae8e334e944cef3fec13de594daccfc1e24a208dfb8`. The slice adds exact `sha2` 0.11.0, optional `tauri-plugin-dialog` 2.7.1, rusqlite's existing backup feature, and target-only direct `windows-sys` 0.61.2 features for atomic replacement. License policy passes all 442 registry crates. RustSec scans 443 locked packages with zero vulnerabilities; the same 14 unmaintained and one GTK/glib unsoundness warning remain explicit cross-platform evidence for `NAT-008`.

Implementation commit [`faddbcf17448cbf8086268310b0c88e237d1dde0`](https://github.com/seabAu/Coredrill/commit/faddbcf17448cbf8086268310b0c88e237d1dde0) passed [Foundation CI run 32733226898](https://github.com/seabAu/Coredrill/actions/runs/32733226898) from a clean hosted checkout. The [Windows native/Tauri job](https://github.com/seabAu/Coredrill/actions/runs/32733226898/job/97450005294) passed the shared native contracts, Tauri app-data proof, redacted OS secret lifecycle, picker-owned archive recovery, all-target Clippy, and release Tauri build. The [Linux quality job](https://github.com/seabAu/Coredrill/actions/runs/32733226898/job/97450005194) passed the complete repository gate and both reviewed license inventories. Both pinned Chrome and Firefox version lanes and the full-history secret scan also passed.

## Reproducible verification

| Command                                                | Expected result                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `pnpm test:native-archive`                             | Emits the content-free NAT006 proof manifest after the complete lifecycle passes                  |
| `pnpm test:storage-native`                             | Shared transactions/migrations/path tests and the archive lifecycle pass against real Rust/SQLite |
| `pnpm --filter @coredrill/desktop lint:desktop`        | Complete Tauri/archive boundary passes Clippy with warnings denied                                |
| `pnpm --filter @coredrill/desktop build:desktop`       | Official picker plugin, exact custom permission, and release shell compile                        |
| `pnpm check:foundation-records`                        | Exact direct declarations and Cargo lock record pass                                              |
| `pnpm check:licenses`                                  | 309 npm records and 442 Cargo records pass policy                                                 |
| `cargo audit --file apps/desktop/src-tauri/Cargo.lock` | Zero vulnerabilities; 15 reviewed informational warnings                                          |

## Sources

- [Tauri dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri dialog 2.7.1 release](https://github.com/tauri-apps/plugins-workspace/releases/tag/dialog-v2.7.1)
- [SQLite Online Backup API](https://sqlite.org/backup.html)
- [rusqlite backup module](https://docs.rs/rusqlite/0.40.1/rusqlite/backup/)
- [Windows MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
- [sha2 0.11.0](https://docs.rs/sha2/0.11.0/sha2/)
- [RustSec advisory database](https://rustsec.org/)

## Remaining native slice

- `NAT-007`: installable first-OS artifact with measured size, startup, and memory.
- `NAT-008`: cross-platform secure-store/package evidence and the final D-022/D-024/Q-003 ADR decision.
