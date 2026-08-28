# Phase 1 manual job pipeline application verification

Date: 2026-08-28

Checklist scope: `APP-002`

Package: `@coredrill/application`

Decision changes: none

## Outcome

`APP-002` adds adapter-neutral manual `CreateJob` and atomic `ChangeStatus` application operations over a narrow local `JobPipelinePort`. Manual creation validates the requested job before generating local identity or time values, persists neutral projections without inventing source or provenance facts, and returns a validated immutable job view. Status change validates its local references, records a locally generated UUIDv7 event identity and operation time, and makes exactly one port call whose contract requires every projection update and the append-only timeline event to commit together. The implementation commit is `718b92e`.

The already-proven storage-core `changePipelineStatus` repository transaction provides the matching durable operation: it updates the job projection and optional application projection and appends the status event in one database transaction, rolling back all three when any step fails. This slice establishes the application port and use cases over that transaction; concrete browser/native runtime composition and user interface wiring remain later work.

## Use-case proof

| Contract                  | Enforced behavior                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation shape           | Manual creation and status change are explicit PascalCase transactional commands exposed through the application operation registry.                                                  |
| Manual defaults           | A manual job starts with no normalized title, remote region, current status, next action, archive, source, or provenance claim; description alone defaults to an empty durable value. |
| Validation order          | Title, optional identifiers and text, dates, and date ordering are validated before job identity generation, clock access, or persistence.                                            |
| Local identity and time   | The application supplies the local UUIDv7 job/event identity and operation instant to the matching port action.                                                                       |
| Atomic status boundary    | A valid status change makes exactly one `changeStatus` call; that port action is required to update every projection and append the timeline event in one transaction.                |
| Returned-state validation | Created jobs and status events are parsed again and must match the initiating job, application, stage, event, note, and operation time; mismatches fail closed.                       |
| Stable failures           | Reviewed pipeline codes map to stable `validation`, `conflict`, `not_found`, `unavailable`, `permission_denied`, or `internal` application errors with explicit retryability.         |
| Unknown failures          | Adapter exception text is never returned. Paths, SQL, resume text, and arbitrary exception content collapse to one content-free internal failure.                                     |
| DTO ownership             | Successful job and event values are copied and frozen before crossing the application boundary.                                                                                       |

All fixtures are synthetic and contain no resume, provider credential, token, private page, real employer contact, or applicant data.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run packages/application/test/job-pipeline.test.ts`                         | Passed: 1 file and 32 focused use-case tests. The initial test-first checkpoint failed all 32 tests because the API did not yet exist.                                                                                                                                                           |
| `pnpm --filter @coredrill/application typecheck`                                              | Passed production and test TypeScript checks.                                                                                                                                                                                                                                                    |
| `pnpm --filter @coredrill/application lint`                                                   | Passed with zero warnings.                                                                                                                                                                                                                                                                       |
| `pnpm test:coverage`                                                                          | Passed: 31 files and 209 tests; 90.82% statements, 80.10% branches, 97.06% functions, and 93.25% lines overall. The application package reported 93.75% statements, 89.72% branches, 100% functions, and 97.14% lines; `job-pipeline.ts` reported 92.52%, 91.08%, 100%, and 96.93% respectively. |
| `pnpm verify`                                                                                 | Passed the complete formatting, architecture, typecheck, lint, unit, coverage, build, browser/native storage, recovery, security, license, audit, and Changesets gate.                                                                                                                           |
| [Foundation CI run 33212895865](https://github.com/seabAu/Coredrill/actions/runs/33212895865) | Passed implementation commit `718b92e` in the aggregate foundation gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                |

The dependency audit reported zero known vulnerabilities and the 15 already-reviewed allowed transitive Rust warnings in the native Linux/Tauri dependency graph.

## Implementation surfaces

- `packages/application/src/job-pipeline.ts` — pipeline port, immutable job/event DTOs, stable error mapping, and manual create/status-change operations.
- `packages/application/src/index.ts` — reviewed public application API.
- `packages/application/test/job-pipeline.test.ts` — success, validation, atomic-call, returned-state, safe-failure, redaction, and fail-closed proof.
- `.changeset/job-pipeline-application-flow.md` — package API change record.

## Boundaries and remaining work

- No source or provenance record is created for manual entry; later evidence attachment must cross the reviewed provenance boundary explicitly.
- New manual jobs deliberately have no current status. `Q-006` remains open, and this slice does not invent or lock default display-stage names.
- Concrete browser/native adapters and UI composition are not claimed by this use-case slice.
- `APP-003` is next for next actions, local reminders, interviews, and interactions with explicit clock and time-zone proof.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes; `GATE-0` still requires the owner-authorized participant study.
- No ADR is required because no Accepted decision changed.
