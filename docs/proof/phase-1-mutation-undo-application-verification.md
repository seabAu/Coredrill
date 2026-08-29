# Phase 1 durable mutation-undo verification

Date: 2026-08-29

Checklist scope: `APP-007`

Packages: `@coredrill/application`, `@coredrill/storage-core`

Decision changes: none

## Outcome

`APP-007` makes successful status and next-action edits return a fresh durable undo token and adds `ConsumeUndoTokenCommand` over a narrow local persistence port. The implementation commit is `95b59f5`; `508c4b7` updates the exact Firefox proof guard from the historical v1/15 inventory to the new v2/17 manifest after Firefox had successfully returned all new values, and `7149aae` updates the extension-transfer migration proof from schema 84 to 87 after both transfers had opened the new schema correctly.

SQLite schema versions 85–87 add the strict `mutation_undo_token` record plus consume-only update and immutable-delete guards. Token creation shares the original edit transaction. Consumption checks the exact post-edit projection and row versions, applies the compensating projection changes, and marks the token consumed in one transaction. Tokens contain identifiers, projection preconditions, audit instants, and versions rather than display text or private job content.

## Durable consistency contract

| Contract                | Enforced behavior                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atomic creation         | `ChangeStatus` commits job/application projections, one append-only event, and a status undo token together. `SetNextAction` commits the pending action, job next-action projection, and its token together.   |
| Single use              | A database trigger permits only one `consumed_at: null` to timestamp transition with exactly one row-version increment. The application maps replay to a stable non-retryable conflict.                        |
| Status restoration      | Consumption restores the prior job status and optional application status only when both still match the token's expected status and row versions.                                                             |
| Append-only history     | Status undo never updates or deletes the referenced status event. The consumed token is the durable reversal audit record.                                                                                     |
| Next-action restoration | Consumption dismisses the token's still-pending action, dismisses its linked pending reminders, and restores the exact prior `job.next_action_at` projection. Records are not deleted.                         |
| Stale protection        | Any later edit that changes a target projection, action state, or guarded row version causes `undo_target_changed`; the transaction rolls back every attempted restoration and leaves the token fresh.         |
| Durable availability    | Tokens have no storage expiry. The UI must expose undo for at least ten seconds, but later consumption is safe only while the exact post-edit preconditions still hold.                                        |
| Application boundary    | Status/next-action commands generate local UUIDv7 token IDs, require an atomic token-bearing port result, copy and freeze all returned DTOs, and fail closed on mismatched adapter data.                       |
| Safe failures           | Not-found, already-consumed, changed-target, busy, unavailable, permission, read-only, and invalid-state failures map to reviewed content-free application errors. Arbitrary exception text is never returned. |

The repository contract manifest advances from `phase-1-repository-contracts-v1` with 15 cases to `phase-1-repository-contracts-v2` with 17 ordered cases. The two new cases execute the successful, replay, stale, rollback, retained-history, action-dismissal, reminder-dismissal, and token-immutability paths identically in fast Node SQLite, official SQLite WASM/OPFS, and native rusqlite.

All fixtures are synthetic and contain no provider credential, token, private page, real employer, or applicant data.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                                                                                                                                                      | Result                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/storage-core/test/tracker-repositories.test.ts` before implementation                                                                                                                         | Expected red: 1 of 5 tests failed because the reviewed v2 manifest contained the two undo cases while the pipeline suite had not implemented them.                                                                                              |
| `pnpm exec vitest run packages/application/test/job-pipeline.test.ts packages/application/test/job-activity.test.ts packages/application/test/mutation-undo.test.ts packages/storage-core/test/tracker-repositories.test.ts` | Passed: 4 files and 96 focused application/storage tests, including token-bearing edit results, safe consumption, replay, stale targets, rollback, append-only history, and linked-reminder cleanup.                                            |
| `pnpm exec vitest run packages/storage-native/test/native-database.test.ts`                                                                                                                                                  | Passed: 10 native tests, including the identical 17-case v2 repository contract through rusqlite.                                                                                                                                               |
| `pnpm test:storage-browser`                                                                                                                                                                                                  | Passed: 6 Chromium tests at schema version 87, including the identical 17-case v2 repository contract through official SQLite WASM/OPFS.                                                                                                        |
| `pnpm test:coverage`                                                                                                                                                                                                         | Passed: 36 files and 404 tests; 90.38% statements, 81.97% branches, 97.88% functions, and 93.44% lines overall. Application reported 90.04%, 85.69%, 100%, and 95.53%; storage-core reported 90.21%, 76.27%, 96.79%, and 92.96% respectively.   |
| `pnpm verify`                                                                                                                                                                                                                | Passed with exit code 0 across formatting, architecture, typecheck, lint, unit, measured coverage, build, browser/native storage and recovery, extension packaging, schemas, licenses, secret scans, dependency audits, and Changesets.         |
| [Foundation CI run 33249462636](https://github.com/seabAu/Coredrill/actions/runs/33249462636)                                                                                                                                | Passed final implementation commit `7149aae` in the aggregate foundation gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan. |

No external dependency or lockfile version changed. Migration SHA-256 values are recorded beside versions 85–87 in `migrations/README.md`. License review passed for 351 npm and 498 Cargo records; npm reported zero known vulnerabilities and Rust retained the 15 already-reviewed allowed transitive warnings.

## Implementation surfaces

- `migrations/0085_mutation_undo_token.sql` through `0087_mutation_undo_token_delete_guard.sql` — strict token state, exact preconditions, and database immutability guards.
- `packages/storage-core/src/pipeline-repositories.ts` and `pipeline-records.ts` — atomic token-bearing edits, token lookup, compensating consumption transaction, and immutable records.
- `packages/storage-core/src/pipeline-contract-harness.ts` and `repository-contract-manifest.ts` — v2/17 shared browser/native integration proof.
- `packages/application/src/mutation-undo.ts` — token DTO/port, stable failures, validation, and `ConsumeUndoTokenCommand`.
- `packages/application/src/job-pipeline.ts` and `job-activity.ts` — application-owned token IDs and required token-bearing edit results.
- Application unit tests plus browser/native/fast-SQLite contract lanes — fail-closed DTO, replay, stale-write, history, and projection proof.
- `.changeset/durable-mutation-undo.md` — application and storage-core public API change record.

## Boundaries and remaining work

- Concrete browser/native composition of the application `MutationUndoPort` and the at-least-ten-second user-interface affordance remain later UI/runtime work; this slice proves the durable storage operation and adapter-neutral command boundary.
- A token is not a blanket rollback capability. It can restore only the one reviewed status or next-action mutation kind and only while its recorded projection and row-version preconditions still match.
- Undo bypasses ordinary forward status-transition policy only to restore the exact prior projection recorded by the token; it does not create a general implicit reopen path.
- Status history remains append-only. Interface copy that previously said undo restores the event now correctly says it restores projections and retains the event with a consumed reversal token.
- `APP-008` is next for privacy-safe local diagnostics and a user-copyable redacted support bundle.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes; `GATE-0` still requires the owner-authorized participant study.
- No ADR is required because no Accepted product or architecture decision changed; the implementation realizes the existing durable-undo, atomic projection, append-only history, and local-first requirements.
