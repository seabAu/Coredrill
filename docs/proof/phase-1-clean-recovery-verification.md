# Phase 1 clean recovery verification

Date: 2026-08-30

Checklist scope: `BKP-007`

Packages: `@coredrill/storage-core`, `@coredrill/storage-browser`, `@coredrill/storage-native`, `@coredrill/web`, `@coredrill/desktop`

Decision changes: none

## Outcome

One committed, wholly synthetic schema-92 portable archive now restores through the production browser SQLite/OPFS adapter and the thin native rusqlite/app-data boundary. Both targets start empty, validate the same archive manifest and member checksums, temporarily inspect the candidate database, commit one database plus one physical attachment, and regenerate the same canonical content hash as the source archive.

The portable ZIP remains assembled and inspected in shared TypeScript. Rust does not define or parse a competing archive format; its version-2 path-free command protocol accepts only the already validated portable database and attachment payload, confines native writes to application data, verifies SQLite and attachment state again, and preserves the active database through a recovery snapshot during replacement.

## Representative fixture

[`phase-1-vault-v1.coredrill.zip`](../../fixtures/recovery/phase-1-vault-v1.coredrill.zip) and its [verification record](../../fixtures/recovery/phase-1-vault-v1.json) contain invented company, job, application, status-history, next-action, reminder, tag, document/version/link, and attachment records. The browser production adapter generates the fixture deterministically; ordinary tests require byte-for-byte equality with the committed artifact.

| Property                      |                                                       Pinned value |
| ----------------------------- | -----------------------------------------------------------------: |
| Schema                        |                                                                 92 |
| Archive bytes                 |                                                          1,040,738 |
| Archive SHA-256               | `72cc17f42ce2a4b1027c7d56a9d6a0ea7d4971dbcf9bb2aaa73f2ca5075947a2` |
| SQLite member SHA-256         | `5d1350d39b397b5ddfec7d5852789ec216b7f9d4d077146ca6619345973809c6` |
| Data files                    |                   58: 29 canonical JSON plus 29 human-readable CSV |
| Attachment files              |                                                                  1 |
| Attachment SHA-256/content ID | `e14c2f1b15c4323496d174fee5c4b5c52cf961c88de4bd99f8836f82ffa15a7b` |
| Canonical content SHA-256     | `30345b76dd3c3042e46d3f5bfdb5bc3d6938b30a5809d4ec87548cb5c746b5cf` |

The fixture contains no personal, credential, production, or externally derived data.

## Canonical comparison

The [version-1 content-hash contract](../design/coredrill-design-kit/portable-vault-content-hash-v1.md) hashes vault identity, schema, the deterministic 29 JSON projections, and every verified content-addressed attachment. CSV is an inspectable mirror and SQLite file layout is adapter-specific, so neither is double-counted in the logical comparison.

| State                    | Canonical SHA-256                                                  | Attachment bytes verified | Result |
| ------------------------ | ------------------------------------------------------------------ | ------------------------: | ------ |
| Validated source archive | `30345b76dd3c3042e46d3f5bfdb5bc3d6938b30a5809d4ec87548cb5c746b5cf` |                         1 | Match  |
| Clean browser restore    | `30345b76dd3c3042e46d3f5bfdb5bc3d6938b30a5809d4ec87548cb5c746b5cf` |                         1 | Match  |
| Clean native restore     | `30345b76dd3c3042e46d3f5bfdb5bc3d6938b30a5809d4ec87548cb5c746b5cf` |                         1 | Match  |

The browser re-export also preserves the exact SQLite member checksum. Native SQLite may rewrite non-semantic page bytes when reopening or producing an online-backup export, so its post-restore raw database checksum is diagnostic only; candidate validation and commit still verify the archive member checksum before replacement. Canonical equality is the cross-adapter recovery criterion.

## Browser proof

The browser test opens a new isolated context, deletes any harness residue, applies all 92 migrations, writes the representative source, stores its attachment under `coredrill/attachments/sha256/<2>/<2>/<hash>`, and generates the archive. A second isolated context begins with a migrated database containing no vault or attachment rows. The restore preview must report `conflict: none`, `requiredConfirmation: commit`, one attachment addition, and no reuse/removal before commit.

After commit the test re-exports the database, rereads the physical OPFS attachment, regenerates every canonical projection, and compares the pinned content hash and exact attachment inventory. It then previews typed vault deletion, observes one attachment file, deletes the vault with the exact phrase, and verifies that attachment cleanup is reported complete.

Local Edge 152.0.4191.53 emitted:

```json
{
  "archiveSha256": "72cc17f42ce2a4b1027c7d56a9d6a0ea7d4971dbcf9bb2aaa73f2ca5075947a2",
  "contentSha256": "30345b76dd3c3042e46d3f5bfdb5bc3d6938b30a5809d4ec87548cb5c746b5cf",
  "databaseMatchesArchive": true,
  "attachmentCount": 1,
  "cleanInstallRestore": true
}
```

## Native proof

The native integration test opens a new database in a generated temporary application-data root without applying migrations or creating a vault. Rust reports an empty target fingerprint. Shared TypeScript validates the committed ZIP and candidate database, then sends the exact database and attachment payload through the path-free native protocol. Rust repeats schema, vault, database length/checksum, SQLite integrity, attachment manifest, attachment length, and attachment checksum validation before content-addressed publication and atomic database replacement.

After reopen, shared storage-core regenerates all 29 JSON projections through the native adapter and rereads the physical attachment through the confined native boundary. Its canonical result matches the source and browser values above. The complete native integration suite passes all 11 migration, repository, confinement, persistence, archive, and recovery cases; the Rust library suite passes 10 cases with only the separately harnessed secure-store lifecycle intentionally ignored.

## Hosted clean-commit proof

Implementation commit [`a74d12d83e443a17aecc2ba6be7c4befa0230875`](https://github.com/seabAu/Coredrill/commit/a74d12d83e443a17aecc2ba6be7c4befa0230875) completed [Foundation CI run `33298779542`](https://github.com/seabAu/Coredrill/actions/runs/33298779542) successfully. The aggregate Ubuntu job ran the complete `pnpm verify` gate, including all seven production browser-storage scenarios and the committed clean-recovery fixture. The exact-version Chrome jobs passed the existing SQLite/OPFS lifecycle and repository-manifest compatibility suites; they did not run the new attachment-recovery scenario and are not presented as that proof.

Each native job independently ran `pnpm test:storage-native` against the same committed archive before building and launching its package:

| Hosted lane                                                                                                                       | Result                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Aggregate build, static checks, tests, and policy](https://github.com/seabAu/Coredrill/actions/runs/33298779542/job/99222911807) | Complete `pnpm verify` passed on Ubuntu 24.04, including the browser clean-recovery scenario. |
| [Native storage and Tauri shell / Windows](https://github.com/seabAu/Coredrill/actions/runs/33298779542/job/99222911736)          | Native recovery suite, package build, installed startup, and resource checks passed.          |
| [Native secure storage and package / macOS 26](https://github.com/seabAu/Coredrill/actions/runs/33298779542/job/99222911795)      | Native recovery suite, application-bundle build, and packaged launch passed.                  |
| [Native secure storage and package / Ubuntu 26.04](https://github.com/seabAu/Coredrill/actions/runs/33298779542/job/99222911778)  | Native recovery suite, AppImage build, and packaged launch passed.                            |
| [Browser storage / Chrome 151.0.7922.138](https://github.com/seabAu/Coredrill/actions/runs/33298779542/job/99222911811)           | Exact-version SQLite/OPFS lifecycle and repository-manifest compatibility passed.             |
| [Browser storage / Chrome 152.0.7977.54](https://github.com/seabAu/Coredrill/actions/runs/33298779542/job/99222911837)            | Exact-version SQLite/OPFS lifecycle and repository-manifest compatibility passed.             |

## Reproducible verification

Run with the repository-pinned Node.js, pnpm, Rust toolchain, and lockfiles:

| Command                                                                                                                                  | Result                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/storage-core/test/portable-archive-restore.test.ts packages/storage-native/test/archive-protocol.test.ts` | Passed 2 files and 22 tests, including the canonical hash and strict portable protocol.                                                                                                                                                                                                                                             |
| `pnpm test:storage-browser`                                                                                                              | Passed the production browser recovery scenario and all existing storage scenarios after preserving the bound OPFS method in failure-test storage mocks.                                                                                                                                                                            |
| `pnpm test:storage-native`                                                                                                               | Passed the complete native integration and Rust boundary suites, including the same committed fixture.                                                                                                                                                                                                                              |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --no-default-features --lib`                                      | Passed 10 Rust tests; one secure-store lifecycle remains intentionally delegated to its redacted harness.                                                                                                                                                                                                                           |
| Repository `pnpm verify`                                                                                                                 | Passed with exit code 0: formatting, boundaries, records, typecheck, lint/Rust clippy, 59 files and 537 unit tests, 83.18% statement coverage, all 22 builds, UI/document/browser E2E, 7 storage-browser scenarios, 11 native integration tests, secure-storage/archive proofs, schemas, licenses, secrets, audits, and Changesets. |
| Hosted Foundation CI                                                                                                                     | Passed [run `33298779542`](https://github.com/seabAu/Coredrill/actions/runs/33298779542) on implementation commit `a74d12d83e443a17aecc2ba6be7c4befa0230875`, including aggregate browser recovery and native recovery on Windows, macOS, and Ubuntu.                                                                               |

## Security, dependency, and scope status

- Every external archive member is validated by the existing bounded version-1 reader before an adapter receives bytes.
- Browser and native attachment storage is content-addressed; reads and writes recheck SHA-256 and length. SQLite remains the logical inventory and durable truth.
- Browser OPFS and native app-data paths never cross the public application result. The Rust command denies unknown fields and accepts opaque session/content identifiers rather than arbitrary filesystem paths.
- The fixture and logs contain only synthetic data and hashes. Error surfaces remain stable and content-free.
- This slice adds no dependency and does not change the accepted D-051 format, encryption state, storage authority, or TypeScript/Rust responsibility split. No ADR is required.
- The native boundary can retain unreferenced content-addressed bytes after replacing a non-empty vault; logical inventory is exact and clean-install recovery is proven here. A future bounded garbage-collection operation should remove verified orphans without weakening rollback safety.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes. `GATE-0` remains blocked on owner-authorized representative human validation, and `Q-006` remains open.
