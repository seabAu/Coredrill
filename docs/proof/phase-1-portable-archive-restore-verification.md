# Phase 1 portable archive restore verification

Date: 2026-08-29

Checklist scope: `BKP-003`

Packages: `@coredrill/storage-core`, `@coredrill/web`

Decision changes: none

## Outcome

Implementation commit `1c2244bcb4429c50246c83c8b7a32b4bd230e795` adds a
bounded, fail-closed reader and a two-step preview/commit workflow for Coredrill
portable archives. The preview validates an archive without changing the
target, reports an immutable overwrite conflict, and binds the inspected
archive to the exact target state. Commit requires the matching explicit
confirmation and refuses a stale target before invoking the storage adapter.

The restore contract is recorded in
[`portable-archive-restore-v1.md`](../design/coredrill-design-kit/portable-archive-restore-v1.md).
It implements accepted decision D-051: `manifest.json` is read first; the ZIP
entry set, version, sizes, paths, and SHA-256 checksums are verified; the
candidate SQLite database passes integrity, schema, and vault-identity checks;
and the database plus attachments cross the adapter boundary only after the
preview succeeds.

The archive bytes, prepared payload, storage port, and target fingerprint stay
in private weakly-held state rather than the public preview. Input bytes and
attachment inventories are copied. A successful preview can commit only once;
a failed adapter commit remains retryable because the adapter owns atomic
replacement and must preserve the previous usable vault on failure.

## Archive and database rejection proof

The reader rejects malformed or untrusted inputs with stable, content-free
error codes. It enforces a 544 MiB archive limit, a 128-entry data limit, a
10,000-entry attachment limit, canonical paths, unique entries, stored ZIP
members, exact manifest membership, declared member sizes, per-member hashes,
and the whole-archive checksum.

Focused tests prove each failure is rejected before commit:

| Invalid input                                                     | Result                                 |
| ----------------------------------------------------------------- | -------------------------------------- |
| Truncated or structurally corrupt ZIP                             | `archive_corrupt`                      |
| Whole-archive checksum drift                                      | `checksum_mismatch`                    |
| Database or declared entry checksum drift                         | `checksum_mismatch`                    |
| Missing, duplicate, unexpected, compressed, or unsafe member path | `unsafe_archive` or `manifest_invalid` |
| Unsupported archive version                                       | `version_unsupported`                  |
| Unsupported SQLite schema                                         | `schema_mismatch`                      |
| Candidate vault identity differs from the manifest                | `database_invalid`                     |
| Malformed adapter response or attachment inventory                | `database_invalid` or `commit_failed`  |
| Archive, member, or count exceeds a bound                         | `payload_too_large`                    |

The browser worker imports a candidate into a temporary SQLite database with
`trusted_schema=OFF`, runs `PRAGMA integrity_check`, verifies schema 92 and the
single expected vault identity, then deletes the temporary database and reopens
the unchanged target. Candidate inspection cannot silently become a target
restore.

## Conflict, staleness, and transactional proof

Preview distinguishes `none`, `identical`, `same_vault_replace`, and
`different_vault_replace`. Empty and byte-identical targets require `commit`;
same-vault replacement requires `replace_same_vault`; cross-vault replacement
requires the stronger `replace_different_vault` confirmation. Missing or wrong
confirmation is rejected.

The target fingerprint binds the database SHA-256 and the complete canonical
attachment inventory. Tests mutate the target after preview and prove commit
returns `stale_target` without calling the adapter. An injected adapter failure
returns `commit_failed`, preserves the prior target, and permits a retry. A
successful commit replaces the database and attachments together, returns the
committed target fingerprint, and invalidates the preview so it cannot replay.

## Browser and hosted proof

The production web harness builds an actual version-1 archive from the official
SQLite 3.53.0 WASM database plus the 29-dataset/58-file human-readable export.
The local Chrome 152.0.4191.53 suite passed all six storage scenarios and
emitted:

```json
{
  "schemaVersion": 92,
  "sha256": "8eedb6a5d3b2ca01d62df1811297fa293922288a1060c1ab6040721d0b242d08",
  "humanReadableDatasets": 29,
  "humanReadableDataFiles": 58,
  "archiveRestoreConflict": "same_vault_replace",
  "archiveRestoreCommitted": true,
  "archiveRestoreCorruptionRejected": true,
  "archiveRestoreStaleRejected": true
}
```

The browser proof truncates the archive and observes rejection with the target
hash unchanged, previews a same-vault overwrite without mutation, mutates the
target and observes stale-preview rejection, then obtains a fresh preview and
restores the exact original database hash and vault name. Chrome WebDriver and
Firefox WebDriver both assert those outcomes.

Hosted Foundation CI repeated the proof in every supported browser lane:

| Browser               |                                                                                           Job | Result                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | [`99178429553`](https://github.com/seabAu/Coredrill/actions/runs/33281932059/job/99178429553) | Passed SQLite/OPFS, archive corruption, non-mutating preview, stale-target rejection, and committed restore. |
| Chrome 152.0.7977.54  | [`99178429599`](https://github.com/seabAu/Coredrill/actions/runs/33281932059/job/99178429599) | Passed SQLite/OPFS, archive corruption, non-mutating preview, stale-target rejection, and committed restore. |
| Firefox 153.0         | [`99178429608`](https://github.com/seabAu/Coredrill/actions/runs/33281932059/job/99178429608) | Passed the same production archive/restore assertions through Firefox WebDriver.                             |
| Firefox 154.0         | [`99178429556`](https://github.com/seabAu/Coredrill/actions/runs/33281932059/job/99178429556) | Passed the same production archive/restore assertions through Firefox WebDriver.                             |

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                                                                 | Result                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run packages/storage-core/test/portable-archive-restore.test.ts apps/web/src/storage/browser-sqlite.protocol.test.ts` | Passed the 7 focused restore scenarios and browser protocol coverage.                                                                                                                                                          |
| `pnpm test:storage-browser`                                                                                                             | Passed 6 real Chrome storage scenarios and emitted the production restore proof above.                                                                                                                                         |
| `pnpm test:coverage`                                                                                                                    | Passed 54 files and 495 tests at 83.62% statements, 74.99% branches, 82.48% functions, and 86.14% lines overall; `portable-archive-restore.ts` reached 86.11% statements, 84.41% branches, 100% functions, and 88.62% lines.   |
| `pnpm verify`                                                                                                                           | Passed with exit code 0 across formatting, boundaries, dependency records, typecheck, lint, unit/coverage, all 22 builds, UI/browser/extension/document/native proof, schemas, licenses, secret scans, audits, and Changesets. |
| [Foundation CI run 33281932059](https://github.com/seabAu/Coredrill/actions/runs/33281932059)                                           | Passed on attempt 1 for implementation commit `1c2244bcb4429c50246c83c8b7a32b4bd230e795`; all policy, browser, extension, and Windows/macOS/Ubuntu native lanes completed successfully.                                        |

## Dependency and policy status

This slice adds no dependency. It reuses the reviewed `fflate` 0.8.3 archive
implementation, Web Crypto checksum boundary, worker-owned SQLite runtime, and
existing database ports. The lockfile SHA-256 remains
`187bd9086e029157a638b2a184ce96cdd89ac3a78a4760eb75290c6952b1b405`.
The npm audit has zero known vulnerabilities. The existing Rust baseline of 14
unmaintained and one unsound allowlisted transitive warning is unchanged.

## Implementation surfaces

- `packages/storage-core/src/portable-archive-restore.ts` — bounded ZIP reader,
  typed failures, conflict preview, target binding, and single-use commit.
- `packages/storage-core/test/portable-archive-restore.test.ts` — archive,
  database, conflict, staleness, replay, and failure-preservation proof.
- `apps/web/src/storage/browser-sqlite.ts`, worker, and protocol — non-mutating
  candidate inspection and stale-target-protected commit through the dedicated
  SQLite Worker.
- `apps/web/src/main.ts`, `e2e/storage-browser.spec.mjs`, and the Firefox
  WebDriver script — production browser archive/restore proof.
- `portable-archive-restore-v1.md`, architecture/security docs, and D-051 —
  aligned design authority.
- `.changeset/portable-archive-restore.md` — storage/web compatibility and
  release record.

## Boundaries and remaining work

- SQLite is the authoritative restore member. JSON and CSV remain inspectable
  exports and are not silently substituted for database recovery.
- The production browser scenario contains no attachments because its fixture
  vault has none. Adapter-neutral tests prove attachment inventory binding and
  atomic database/attachment replacement; `BKP-007` still owns a clean browser
  and desktop recovery exercise with representative attachments and canonical
  hash comparison.
- This slice does not add archive encryption. Its absence is explicit in the
  accepted baseline and manifest.
- `BKP-004` owns desktop automatic backup rotation and last-known-good
  preservation. `BKP-005` owns browser persistence/quota health and a neutral
  export reminder.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes. `GATE-0` remains blocked on owner-authorized
  representative human validation, and `Q-006` remains open.
- No Accepted decision changed, so no ADR was created.
