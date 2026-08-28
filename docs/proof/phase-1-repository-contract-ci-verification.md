# Phase 1 repository-contract CI parity verification

Date: 2026-08-25

Checklist scope: `DB-008`

Packages: `@coredrill/storage-core`, `@coredrill/storage-browser`, `@coredrill/storage-native`, `@coredrill/web`

Decision changes: none

## Outcome

`DB-008` closes the Phase 1 repository parity gap with one versioned, auditable contract manifest. Manifest version 1 names five component suites and 15 ordered cases. One aggregate factory validates every component suite name, case name, and case order against that manifest before any adapter executes it.

The same aggregate then runs through fast Node SQLite, the official SQLite WASM worker over browser OPFS, and the narrow native rusqlite service. Browser and native jobs no longer maintain separate handwritten expected-case lists. The manifest includes an explicit ordered case array so WebDriver JSON object-member ordering cannot change the proof.

## Reviewed contract inventory

| Component  | Suite                             |  Cases |
| ---------- | --------------------------------- | -----: |
| Tracker    | `phase-1-tracker-repositories`    |      6 |
| Pipeline   | `phase-1-pipeline-repositories`   |      3 |
| Views      | `phase-1-view-repositories`       |      2 |
| Documents  | `phase-1-document-repositories`   |      2 |
| Job search | `phase-1-job-search`              |      2 |
| **Total**  | `phase-1-repository-contracts-v1` | **15** |

The inventory covers migration/settings, source aggregates and provenance, field-candidate confirmation, rollback and foreign keys, local identity and audit integrity, custom pipeline stages and atomic history, scheduling records, tags and saved views, immutable document lineage and attachment manifests, and accelerated/fallback lexical job search.

Adding, removing, renaming, or reordering a Phase 1 repository case now requires a reviewed manifest-version change. Component harness drift fails while constructing the aggregate, before an adapter result can be accepted.

## Adapter and hosted-CI parity

[Foundation CI run 32875385169](https://github.com/seabAu/Coredrill/actions/runs/32875385169) proves final commit `51c1ba99df81f26674bee39546a06c610c4ed0bd`, including the aggregate implementation from `1b224b7252605d2c5d839f59a38a49b43bb04266`.

| Adapter                                                      | Hosted proof                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Official SQLite WASM worker with `opfs-sahpool`, Chrome 151  | [Chrome 151 job](https://github.com/seabAu/Coredrill/actions/runs/32875385169/job/97892170257)        |
| Official SQLite WASM worker with `opfs-sahpool`, Chrome 152  | [Chrome 152 job](https://github.com/seabAu/Coredrill/actions/runs/32875385169/job/97892169560)        |
| Official SQLite WASM worker with `opfs-sahpool`, Firefox 153 | [Firefox 153 job](https://github.com/seabAu/Coredrill/actions/runs/32875385169/job/97892169380)       |
| Official SQLite WASM worker with `opfs-sahpool`, Firefox 154 | [Firefox 154 job](https://github.com/seabAu/Coredrill/actions/runs/32875385169/job/97892169918)       |
| Native rusqlite, Windows                                     | [Windows native job](https://github.com/seabAu/Coredrill/actions/runs/32875385169/job/97892169598)    |
| Native rusqlite, macOS                                       | [macOS native job](https://github.com/seabAu/Coredrill/actions/runs/32875385169/job/97892169256)      |
| Native rusqlite, Ubuntu diagnostic lane                      | [Ubuntu native job](https://github.com/seabAu/Coredrill/actions/runs/32875385169/job/97892169706)     |
| Fast Node SQLite plus complete repository gate               | [Aggregate quality job](https://github.com/seabAu/Coredrill/actions/runs/32875385169/job/97892169526) |

The Firefox harness combines its existing persistence/export/restore lifecycle with the aggregate manifest. The initial hosted attempt exposed a proof-only defect: deriving canonical order from JSON object members after crossing WebDriver was not portable. All 15 cases had passed, but the order comparison failed. Commit `51c1ba9` moved canonical order into an explicit manifest array; both exact Firefox versions then passed without weakening the exact-case comparison.

## Reproducible local verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                                      | Result                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/storage-core/test/tracker-repositories.test.ts`                               | Passed: 1 file and 5 tests, including the 15-case aggregate manifest through fast SQLite.                                                                                       |
| `pnpm exec playwright test e2e/storage-tracker-repositories.spec.mjs --config=playwright.storage.config.mjs` | Passed: the 15-case aggregate through real browser SQLite/OPFS.                                                                                                                 |
| `pnpm test:storage-native`                                                                                   | Passed: 10 TypeScript adapter tests, including the same aggregate manifest; Rust reported 6 passed and 1 intentionally ignored platform exercise.                               |
| `pnpm verify`                                                                                                | Passed formatting, architecture/governance, typecheck, lint, unit, coverage, build, browser/native storage, document, recovery, security, license, audit, and Changesets gates. |

The complete local gate passed 29 unit files and 156 tests; coverage was 90.62% statements, 79.01% branches, 96.85% functions, and 92.92% lines. Browser storage passed six real-OPFS tests, and the native suite passed all 10 TypeScript tests. License review covered 351 npm and 498 Cargo records; npm audit reported no known vulnerabilities. The existing 15 reviewed Rust warnings remain unchanged.

## Security, privacy, and boundaries

- All fixtures are deterministic synthetic data. No resume, credential, token, applicant record, private page, or production career content enters the suite.
- No dependency, lockfile, migration, database shape, permission, CSP, network flow, AI path, hosted service, or account requirement changed.
- The proof establishes identical repository behavior; it does not claim that the browser and native SQLite implementations are internally identical.
- Adapter-specific persistence, locking, recovery, packaging, and secure-store cases remain in their owning suites and gates.
- Linux native remains diagnostic under the accepted `NAT-008` boundary; browser and native repository parity does not promote Linux desktop support.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes, and `GATE-0` remains blocked on owner-authorized representative human validation.

No ADR is required because no Accepted decision changed.
