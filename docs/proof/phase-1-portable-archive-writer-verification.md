# Phase 1 portable archive writer verification

Date: 2026-08-29

Checklist scope: `BKP-001`

Packages: `@coredrill/storage-core`, `@coredrill/web`

Decision changes: none

## Outcome

Implementation commit `185aa54` adds one shared TypeScript writer for the
version-1 Coredrill portable archive. It validates the existing strict manifest
contract, verifies the SQLite export, hashes caller-supplied data projections,
resolves content-addressed attachment bytes, and returns a successful archive
only after every required input is complete and internally consistent.

The output is an ordinary ZIP with this deterministic layout:

- `manifest.json` first;
- `database.sqlite3`;
- sorted `data/*.json` and `data/*.csv` projections; and
- sorted `attachments/<first-two-hash-characters>/<lowercase-sha256>` content.

Entry order, zero-compression mode, platform marker, and 1980-01-01 ZIP metadata
are fixed. Every payload entry has a byte length and SHA-256 in the validated
manifest, attachment content IDs equal their hashes, and the completed ZIP has
its own SHA-256. Input arrays and binary buffers are defensively copied so later
caller mutation cannot change the result.

Missing or unreadable attachments, database or attachment integrity drift,
unsafe/duplicate paths, schema drift, checksum failures, oversized entries,
oversized aggregate payloads, and ZIP-write failures return stable typed errors
without exposing paths or user content. The in-memory version-1 writer rejects
entries over 256 MiB and aggregate payloads over 512 MiB before copying or
hashing. Its manifest truthfully records encryption mode `none`.

## Golden and cross-runtime proof

The committed golden fixture is exactly 3,533 bytes with SHA-256
`47b18f1854ae6a608cffb4753895afc0fead06f3399818326e61142579a5fcde`.
It contains the manifest, synthetic SQLite bytes, paired job JSON/CSV files, and
two content-addressed attachments. Reversing the caller's data and attachment
arrays produces the same bytes and digest.

Six focused tests freeze the exact archive, inspect every ZIP entry, recompute
every manifest hash and length, compare the committed base64 fixture, and prove
fail-closed behavior for missing, unreadable, corrupt, unsafe, duplicate,
schema-drifted, and oversized inputs.

The production web bundle runs the same writer with Web Crypto and reproduces
the golden length, digest, paths, and encryption state. The complete browser
storage suite passes six scenarios locally in Chrome 152.0.4191.53. Hosted CI
repeats the archive assertion in both exact Chrome lanes and both exact Firefox
WebDriver lanes:

| Browser               |                                                                                           Job | Result                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------- |
| Chrome 151.0.7922.138 | [`99168956332`](https://github.com/seabAu/Coredrill/actions/runs/33278331455/job/99168956332) | Passed the browser SQLite, repository, and portable-archive proof.        |
| Chrome 152.0.7977.54  | [`99168956298`](https://github.com/seabAu/Coredrill/actions/runs/33278331455/job/99168956298) | Passed the browser SQLite, repository, and portable-archive proof.        |
| Firefox 153.0         | [`99168956362`](https://github.com/seabAu/Coredrill/actions/runs/33278331455/job/99168956362) | Reproduced the exact golden archive digest through the production bundle. |
| Firefox 154.0         | [`99168956288`](https://github.com/seabAu/Coredrill/actions/runs/33278331455/job/99168956288) | Reproduced the exact golden archive digest through the production bundle. |

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                              | Result                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node node_modules/vitest/vitest.mjs run packages/storage-core/test/portable-archive-writer.test.ts` | Passed 1 file and 6 focused writer tests.                                                                                                                                                                                                                                                                                      |
| `pnpm test:storage-browser`                                                                          | Passed 6 browser storage scenarios; the emitted `STG_PROOF` recorded the exact portable-archive digest.                                                                                                                                                                                                                        |
| `pnpm test:coverage`                                                                                 | Passed 51 files and 474 tests at 83.26% statements, 74.34% branches, 81.56% functions, and 85.81% lines overall; the writer reached 89.18% statements, 77.77% branches, 100% functions, and 92.30% lines.                                                                                                                      |
| `pnpm verify`                                                                                        | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, all 22 builds, UI and browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, native archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33278331455](https://github.com/seabAu/Coredrill/actions/runs/33278331455)        | Passed on attempt 1 for implementation commit `185aa54`; all policy, browser, extension, and Windows/macOS/Ubuntu native lanes completed successfully.                                                                                                                                                                         |

The committed golden fixture and its executable Node/browser assertions remain
reproducible independently of hosted log or artifact retention.

## Dependency and policy status

This slice adds exact `fflate` 0.8.3 to `@coredrill/storage-core`. Review on
2026-08-29 confirmed its MIT license, dependency-free package, current official
release, ordinary ZIP support, and fixed metadata options. No ADR is required:
the dependency implements accepted D-051 without changing the archive contract
or runtime boundary.

The dependency inventory is now version 1.18 with 48 direct dependencies, 622
audited npm resolutions (82 optional), zero known npm vulnerabilities, 354
reviewed JavaScript license records, and 498 reviewed Rust crates. The lockfile
SHA-256 is
`187bd9086e029157a638b2a184ce96cdd89ac3a78a4760eb75290c6952b1b405`.
The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all reviewed and allowlisted; this slice adds no Rust dependency.

## Implementation surfaces

- `packages/storage-core/src/portable-archive-writer.ts` — validated,
  deterministic archive assembly, hashing, limits, and typed redacted failures.
- `packages/storage-core/test/portable-archive-writer.test.ts` — exact golden,
  entry-integrity, order, mutation, corruption, missing-input, and size proof.
- `packages/storage-core/test/fixtures/portable-archive-v1.coredrill.zip.base64`
  — immutable version-1 golden ZIP bytes.
- `apps/web/src/portable-archive-proof.ts` and `e2e/storage-browser.spec.mjs` —
  production browser-bundle reproduction of the golden archive.
- `tooling/scripts/run-storage-firefox-webdriver.mjs` — exact Firefox archive
  assertion in hosted CI.
- `03-data-model.md`, `06-security-sync-deployment-testing.md`,
  `10-technology-stack.md`, and D-051 in `11-decision-register.md` — aligned
  writer, security, container, and remaining-scope authority.
- `.changeset/portable-archive-writer.md` — storage-core/web compatibility and
  release record.

## Boundaries and remaining work

- `BKP-002` still owns production JSON/CSV projection generation, stable field
  mappings, provenance representation, encoding/escaping, and complete fixtures.
  BKP-001 deliberately accepts already-generated data bytes; its synthetic job
  files prove container handling rather than the production export schema.
- `BKP-003` owns restore dry-run, version/checksum validation, conflict preview,
  and transactional commit. This writer does not accept or restore archives.
- The shared writer returns bytes only after success. Browser download and
  Rust-owned native save-picker composition remain later integration work; the
  Rust database-only recovery artifact remains explicitly distinct.
- Version 1 is deliberately in-memory and below classic ZIP limits. Any streamed
  or Zip64 format change requires benchmarks, compatibility proof, and a
  versioned contract review.
- Encryption mode `none` records the implemented baseline; it is not an
  encryption or at-rest-protection claim.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes. `GATE-0` remains blocked on owner-authorized
  representative human validation, and `Q-006` remains open.
- No Accepted decision changed, so no ADR was created.
