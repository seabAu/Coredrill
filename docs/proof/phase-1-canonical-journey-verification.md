# Phase 1 canonical journey verification

- Date: 2026-08-30
- Checklist scope: `Q1-005`
- Implementation commit: `00fd001e7d9a85113cd3d4d4b3af69c532a00747`
- Decision changes: none

## Outcome

`Q1-005` is complete. Coredrill now runs and records one accountless local
workflow through the browser application shell and the real Windows native
storage process:

1. create a schema-92 local vault;
2. add one manual job through `CreateJobCommand`;
3. move it through Saved, Applied, and Interviewing with three append-only
   status events and durable undo tokens;
4. persist one user-controlled application record;
5. schedule one interview;
6. schedule one follow-up next action and one pending reminder;
7. write and inspect a checksummed portable archive with all 29 canonical
   JSON/CSV projections;
8. delete app-managed local vault data through exact typed confirmation; and
9. restore the archive into a clean target and verify the complete logical
   state.

The journey exposes no account, network, outreach, provider, or AI capability.
The browser request recorder observed zero requests outside the local test
origin. AI remained disabled, and every useful action completed offline.

## One workflow, two production adapters

`runPhase1CanonicalJourney` is adapter-neutral orchestration in
`@coredrill/storage-core`. It composes the validated application commands with
the production SQLite repositories, portable data/archive writer, typed vault
deletion operations, restore coordinator, and canonical content hash. The
runtime supplies only the concrete database, deletion, restore, and attachment
ports.

- Browser proof binds the runner to official SQLite WASM in its dedicated
  Worker, the accepted `opfs-sahpool` VFS, browser-scoped typed deletion, and a
  clean OPFS restore target. The visible `?journey=phase-1` panel lives inside
  the real application shell and exposes its retained result to Playwright.
- Windows proof binds the same runner to `native-rusqlite-candidate` through the
  real Rust JSON-lines storage process, the native confined vault-deletion
  protocol, and the production native restore port. It is Windows-only and
  emits a machine-readable JSON artifact.

The browser and native SQLite files legitimately have different page layouts
and therefore different physical archive digests. Both regenerate the exact
same logical content SHA-256 before deletion and after restore:

`c19f425f81b314a7140b80037001a49133340f42e2aed9c34a82bd7dc61c5091`

| Runtime | Adapter                             | Physical archive SHA-256                                           | Archive bytes | Logical hash before/after restore |
| ------- | ----------------------------------- | ------------------------------------------------------------------ | ------------: | --------------------------------- |
| Browser | `official-sqlite-wasm-opfs-sahpool` | `14fc98a1951d1a78983c7d19458bc56c2085817ffb87ca4eb0178c2bda6a9818` |     1,039,728 | Exact match                       |
| Windows | `native-rusqlite-candidate`         | `1c63dd0a4247d08d431762d95a1742cbef375dd5213281d2a4523780929b84dc` |       585,072 | Exact match                       |

Each restored target contains exactly one job, one application, three status
events, one interview, one next action, and one reminder. The restored job is
`Research Operations Lead` in the Interviewing stage; the restored database
member also matches the inspected archive database checksum.

## Browser artifact

The Playwright case “runs and records the complete accountless browser recovery
journey” performs the action from the visible app shell, waits for all eight
displayed proof steps, runs axe against the completed panel, captures a
full-page screenshot, and attaches the structured journey JSON and axe report.
It fails if a request leaves the local origin, if any boundary flag changes, if
delete/restore is incomplete, if counts drift, or if the pre-delete and
post-restore content hashes differ.

The focused local run produced the following Playwright attachments; each exact
Chrome hosted lane retains them again in its immutable app-shell artifact:

- `phase-1-canonical-browser.json`
- `phase-1-canonical-browser.png`
- `phase-1-canonical-browser-axe.json`

## Windows native artifact

The Windows-native Vitest case starts the exact Rust storage process, migrates
a confined source vault, runs the shared journey, deletes through the reviewed
native protocol, migrates a separate clean target, and restores through the
production native port. It writes
`test-results/phase-1-canonical-native.json`, which is included with the
immutable Windows package artifact in hosted CI.

## Reproducible local verification

Run with Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the reviewed lockfiles:

| Command                                      | Result                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused browser canonical Playwright case    | 1 passed; zero external requests; zero axe violations; 8/8 journey steps passed                                                                                                                                                                                                                                                                                       |
| Focused storage-core SQLite composition test | 1 file and 6 tests passed, including the new production-port composition case                                                                                                                                                                                                                                                                                         |
| `pnpm test:storage-native`                   | Rust: 11 passed and 1 intentionally harness-only/ignored; native Vitest: 12 passed, including the canonical Windows process journey                                                                                                                                                                                                                                   |
| `pnpm test:coverage`                         | 60 files and 541 tests passed; 81.72% statements, 74.11% branches, 81.11% functions, and 84.35% lines                                                                                                                                                                                                                                                                 |
| `pnpm verify`                                | Passed formatting, 19 boundary policies, 49 dependency/3 toolchain/16 execution-target records, 32 typecheck tasks, 22 lint/build tasks, all unit/coverage gates, 5 UI-foundation, 60 app-shell, 1 performance, 3 resilience, 7 onboarding, 9 document, and 7 browser-storage cases, native secret/archive proofs, schemas, licenses, secrets, audits, and Changesets |

The npm audit reported no known vulnerabilities. RustSec retained only the 15
already reviewed allowed warnings documented by ADR-0004; no new advisory or
dependency was introduced.

## Hosted clean-commit proof

Hosted proof is retained by [Foundation CI run 33306410133](https://github.com/seabAu/Coredrill/actions/runs/33306410133)
for exact implementation commit
`00fd001e7d9a85113cd3d4d4b3af69c532a00747`.

| Hosted lane                         | Job                                                                                         | Relevant result                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregate build/static/tests/policy | [99243640648](https://github.com/seabAu/Coredrill/actions/runs/33306410133/job/99243640648) | The complete frozen-install foundation gate, coverage, builds, policies, license inventories, secrets, and dependency audits passed             |
| Chrome `151.0.7922.138`             | [99243640676](https://github.com/seabAu/Coredrill/actions/runs/33306410133/job/99243640676) | All 60 app-shell cases passed, including the zero-external-request canonical journey and its JSON/screenshot/axe attachments                    |
| Chrome `152.0.7977.54`              | [99243640720](https://github.com/seabAu/Coredrill/actions/runs/33306410133/job/99243640720) | The same complete current-generation browser matrix and canonical app-shell artifact passed                                                     |
| Windows native                      | [99243640700](https://github.com/seabAu/Coredrill/actions/runs/33306410133/job/99243640700) | The real Rust process completed the canonical delete/restore journey; native contracts, installed startup, and immutable Windows package passed |

The workflow retains the journey evidence in artifacts bound to the exact
implementation commit:

| Artifact                                               |           ID | GitHub artifact SHA-256                                            |
| ------------------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| Chrome 151 app shell and canonical journey             | `9730657275` | `6aecc03095392120d73daf6be32e6adaff17aa7999c99a7e9b7947d3acb18ef0` |
| Chrome 152 app shell and canonical journey             | `9730663425` | `9786d2db7c53cae639f498fc3058f68937b817958e992d6ec25deebf178a23c3` |
| Windows NSIS package and native canonical journey JSON | `9730765906` | `7ef0ebfe074e7c62360402ce322094164c4c823a0f143802e4d6d5dcd78a5d95` |

## Dependency and decision review

No external package or toolchain version changed. The lockfile change adds only
the reviewed `@coredrill/storage-core` → `@coredrill/application` workspace edge;
the dependency inventory remains 935 exact pnpm resolutions and 520 license
records, with its lockfile review hash updated in the same implementation.

No Accepted decision changed, so no ADR is required. The work realizes the
existing TypeScript application/storage boundary, official browser SQLite, thin
Rust native boundary, D-051 archive/restore contract, typed deletion contract,
and local-first/no-account baseline.

## Gate assessment and handoff

`Q1-005` is complete, but `GATE-1` is not. `Q1-001` still requires the exact
`HW-WIN-REF` performance run, and `Q1-003` still requires the recorded manual
assistive-technology matrix. Those unavailable external targets are not
reinterpreted as passing because the canonical journey is green.

The next unblocked implementation slice is `CAP-001`, the versioned capture
envelope and compatibility contract. It can proceed independently while the
reference-hardware/manual-accessibility owners complete the retained gate
actions; Phase 1 remains explicitly open until they do.
