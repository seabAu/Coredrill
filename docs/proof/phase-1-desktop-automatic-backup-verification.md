# Phase 1 desktop automatic backup verification

Date: 2026-08-29

Checklist scope: `BKP-004`

Packages: `@coredrill/storage-native`, `@coredrill/desktop`

Decision changes: none

## Outcome

Implementation commit `39930cedd34cabdb4d0eb98fcc4c6b65b8397c1b` adds a
pickerless, path-free automatic-backup operation to the thin Tauri boundary.
Every native vault now has a canonical managed backup directory beneath Tauri
app data. Rust, rather than the WebView, creates unique timestamped recovery
artifacts, verifies each new artifact, and only then removes older verified
backups according to the requested retention count.

The contract is recorded in
[`desktop-automatic-backup-v1.md`](../design/coredrill-design-kit/desktop-automatic-backup-v1.md).
It reuses the version-1 checksummed database-recovery envelope proven by
`NAT-006`. The TypeScript API accepts only an open session and an integer
retention count from 1 through 90. Its immutable result reports time, counts,
cleanup state, and redacted archive metadata; no filesystem path or database
name crosses into the WebView.

## Creation and verification proof

The filesystem proof creates a consistent SQLite online snapshot in managed
temporary state, opens it read-only without following links, and requires
SQLite integrity and the active schema. Rust hashes that snapshot, atomically
publishes the recovery envelope, rereads the published bytes, verifies the
length and checksum, extracts into managed temporary state, and repeats SQLite
integrity and schema validation. Rotation starts only after all those checks
succeed. The active vault is never written, replaced, or closed.

The test finishes with one retained artifact and reads it through the recovery
reader, proving that retention did not merely leave a filename behind.

## Retention and failure proof

The Rust filesystem test
`automatic_backups_verify_before_rotation_and_preserve_last_known_good` proves
the following sequence in one isolated native layout:

| Scenario                                                | Proven result                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| First, second, and third successful checkpoints         | Canonical per-vault placement and unique timestamped names                                   |
| Retention set to two                                    | Oldest verified artifact removed only after the new artifact passes reread verification      |
| Injected failure before publish                         | Exact prior backup inventory and readable active database preserved                          |
| Injected corruption after publish                       | New invalid artifact rejected and removed when possible; prior inventory preserved           |
| Injected cleanup deletion failure                       | Operation succeeds with `cleanupPending: true` and all good backups retained                 |
| Next successful run with retention set to one           | Deferred cleanup removes the three older verified backups and leaves one restorable artifact |
| Retention `0` or `91`                                   | Rejected before filesystem mutation                                                          |
| Unexpected, linked, malformed, or corrupt managed entry | Retained for diagnosis; never selected for automatic deletion                                |

The TypeScript protocol tests additionally reject zero, fractional, excessive,
and non-finite retention before transport; reject malformed native metadata;
route the exact version-1 `automatic_backup` operation; and prove that the
public result contains no path.

The reproducible native proof emits:

```text
BKP004_BACKUP_PROOF {"storage":"managed-per-vault-app-data","pickerRequired":false,"timestamped":true,"sqliteOnlineSnapshot":true,"checksumAndIntegrityVerifiedBeforeRotation":true,"retentionBounds":{"min":1,"max":90},"lastKnownGoodPreserved":true,"failedPublishPreservesPriorBackups":true,"failedVerificationPreservesPriorBackups":true,"cleanupFailureRetainsExtraBackups":true,"activeVaultPreserved":true,"pathExposedToWebview":false}
```

## Cross-platform hosted proof

Foundation CI run
[`33283386694`](https://github.com/seabAu/Coredrill/actions/runs/33283386694)
repeated the native archive and automatic-rotation proof from a clean checkout
on every supported desktop operating system:

| Platform     |                                                                                           Job | Result                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows      | [`99182244608`](https://github.com/seabAu/Coredrill/actions/runs/33283386694/job/99182244608) | Passed the repository/native contracts, app-data boundary, secure-storage lifecycle, recovery envelope, automatic rotation, lint, packaging, installed startup, and artifact upload. |
| macOS 26     | [`99182244611`](https://github.com/seabAu/Coredrill/actions/runs/33283386694/job/99182244611) | Passed the repository/native contracts, Keychain lifecycle, automatic rotation, lint, packaging, launch, and artifact upload.                                                        |
| Ubuntu 26.04 | [`99182244622`](https://github.com/seabAu/Coredrill/actions/runs/33283386694/job/99182244622) | Passed the repository/native contracts, Secret Service lifecycle, automatic rotation, lint, AppImage packaging, launch, and artifact upload.                                         |

The same run also passed the aggregate static, test, build, policy, license,
audit, and secret-scan gates plus the current and previous Chrome and Firefox
browser lanes.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                                                           | Result                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run packages/storage-native/test/archive-protocol.test.ts packages/storage-native/test/native-database.test.ts` | Passed the focused TypeScript protocol and native-adapter coverage; the full focused selection with the archive parser comprised 3 files and 25 tests.                                                                                           |
| `pnpm test:native-archive`                                                                                                        | Passed 7 Rust tests with the intentional Windows picker smoke test ignored outside its opt-in environment; emitted the `BKP004_BACKUP_PROOF` record above.                                                                                       |
| `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`                      | Passed the complete Rust feature/target matrix without findings.                                                                                                                                                                                 |
| `pnpm verify`                                                                                                                     | Passed with exit code 0 across formatting, boundaries, dependency records, typecheck, lint, 54 coverage files and 500 tests, all 22 builds, UI/browser/extension/document/native proof, schemas, licenses, secret scans, audits, and Changesets. |
| [Foundation CI run 33283386694](https://github.com/seabAu/Coredrill/actions/runs/33283386694)                                     | Passed on attempt 1 for implementation commit `39930cedd34cabdb4d0eb98fcc4c6b65b8397c1b`; all policy, browser, extension, and Windows/macOS/Ubuntu native lanes completed successfully.                                                          |

Overall coverage remained 83.62% statements, 74.99% branches, 82.48%
functions, and 86.14% lines.

## Dependency and policy status

This slice adds no dependency and does not change the lockfile. It reuses the
reviewed `rusqlite` online-backup boundary and the existing native recovery
envelope. The lockfile SHA-256 remains
`187bd9086e029157a638b2a184ce96cdd89ac3a78a4760eb75290c6952b1b405`.
The npm audit has zero known vulnerabilities. The existing Rust baseline of 14
unmaintained and one unsound allowlisted transitive warning is unchanged.

The operation uses the existing exact `native_archive_invoke` capability, so
it adds no Tauri permission and does not broaden filesystem access. Managed
entry enumeration is bounded at 512 and never follows links.

## Implementation surfaces

- `apps/desktop/src-tauri/src/native_archive.rs` — online snapshot, atomic
  publish, post-publication verification, retention, and filesystem fault
  proof.
- `apps/desktop/src-tauri/src/native_storage.rs` — canonical managed backup
  root and per-vault directory.
- `packages/storage-native/src/archive-protocol.ts` and
  `native-database.ts` — strict path-free operation and result boundary.
- `.github/workflows/foundation.yml` and
  `tooling/scripts/run-native-archive-proof.mjs` — cross-platform proof and
  machine-readable evidence.
- `desktop-automatic-backup-v1.md` and affected architecture, security, stack,
  and native-boundary documentation — aligned design authority.
- `.changeset/automatic-native-backups.md` — storage/native compatibility and
  release record.

## Boundaries and remaining work

- Automatic checkpoints protect canonical SQLite data only. They do not
  contain attachments or the JSON/CSV projections from the D-051 portable ZIP.
  `BKP-007` still owns full clean-install browser/desktop recovery with
  representative attachments and canonical hash comparison.
- This slice implements the checkpoint primitive, verification, and rotation.
  A later settings/startup integration may choose when to invoke it; JavaScript
  still cannot select or inspect the destination path.
- This slice does not add archive encryption. Its absence remains explicit.
- `BKP-005` owns browser persistence/quota health and a neutral export
  reminder. `BKP-006` owns destructive vault deletion.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes. `GATE-0` remains blocked on owner-authorized
  representative human validation, and `Q-006` remains open.
- No Accepted decision changed, so no ADR was created.
