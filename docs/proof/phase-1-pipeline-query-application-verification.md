# Phase 1 Pipeline query application verification

Date: 2026-08-29

Checklist scope: `APP-005`

Package: `@coredrill/application`

Decision changes: none

## Outcome

`APP-005` adds adapter-neutral Pipeline counts, ordered board groups, shared table/board pagination, and detailed job-workspace queries over a narrow read-only `PipelineQueryPort`. The application implementation commit is `a837ff2`.

Every query is bound to `ApplicationOperationContext.initiatedAt`, validates both caller input and the complete adapter result, returns copied immutable DTOs, and maps typed or unknown adapter failures to stable content-free application errors. No query mutates durable state or exposes a network capability.

## Query contract proof

| Contract             | Enforced behavior                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-only operations | `GetPipelineCounts`, `GetPipelineBoardGroups`, `ListPipelineJobs`, and `GetJobWorkspace` are queries and receive only a read port.                                                            |
| Snapshot consistency | Every request carries one application-owned `asOf` instant; returned audit and projection timestamps cannot exceed it.                                                                        |
| Counts               | Counts are nonnegative safe integers, active/archive totals are explicit, and status/category counts cannot exceed their applicable aggregate.                                                |
| Board grouping       | Groups are uniquely identified and deterministically ordered by configured sort order, display order, then ID. Exactly one explicit unassigned group is supported.                            |
| Shared pagination    | Table and board use the same stable keyset page contract: default 50, maximum 100, ordered by `updatedAt` descending then `jobId` ascending.                                                  |
| Cursor integrity     | Cursors contain only the last returned `{ updatedAt, jobId }`; `hasMore`, `nextCursor`, item order, uniqueness, and requested group scope are validated together.                             |
| Explicit scope       | Archive inclusion and all/status/unassigned filters are discriminated input rather than implicit adapter behavior.                                                                            |
| Pipeline rows        | Job, company, status, next-action, attention, tag, archive, and update projections are nullable only where the contract permits and are deeply frozen.                                        |
| Job workspace        | The DTO joins the requested job with description/employment/seniority, active application, company, primary source, attention, next action, last interaction, and timeline count projections. |
| Relationship checks  | Requested-job, application/job/status, company, source/job, next-action, and interaction identities must agree; missing or contradictory projections fail closed.                             |
| Stable failures      | Reviewed validation, not-found, unavailable, permission, and internal errors retain stable retryability without leaking adapter exception text.                                               |

All fixtures are synthetic and contain no provider credential, token, private page, real employer, or applicant data.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/application/test/pipeline-queries.test.ts`                     | Passed: 1 file and 50 focused query, pagination, relationship, immutability, safe-failure, and fail-closed tests. The initial test-first checkpoint failed all 46 tests because the API did not yet exist; four additional consistency cases were added before the final green run.                  |
| `pnpm --filter @coredrill/application typecheck`                                              | Passed production and test TypeScript checks.                                                                                                                                                                                                                                                        |
| `pnpm --filter @coredrill/application lint`                                                   | Passed with zero warnings.                                                                                                                                                                                                                                                                           |
| `pnpm test:coverage`                                                                          | Passed: 34 files and 351 tests; 90.50% statements, 81.50% branches, 97.60% functions, and 93.70% lines overall. The application package reported 90.48% statements, 86.17% branches, 100% functions, and 95.85% lines; `pipeline-queries.ts` reported 86.82%, 79.62%, 100%, and 93.30% respectively. |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, typecheck, lint, unit, coverage, build, browser/native storage and recovery, extension packaging, schema, license, secret, dependency-audit, and Changesets gates.                                                                          |
| [Foundation CI run 33245520594](https://github.com/seabAu/Coredrill/actions/runs/33245520594) | Passed implementation commit `a837ff2` in the aggregate foundation gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                            |

The dependency audit reported zero known vulnerabilities and the 15 already-reviewed allowed transitive Rust warnings in the native Linux/Tauri dependency graph.

## Implementation surfaces

- `packages/application/src/pipeline-queries.ts` — read port, immutable DTOs, stable keyset page contract, result consistency validation, and four queries.
- `packages/application/src/index.ts` — reviewed public application API.
- `packages/application/test/pipeline-queries.test.ts` — counts, group order, shared pagination, workspace relationships, immutable output, failure mapping, and redaction proof.
- `.changeset/pipeline-query-workspace-dtos.md` — package API change record.

## Boundaries and remaining work

- Concrete storage-core browser/native query adapters and user-interface wiring are not claimed by this application use-case slice.
- The shared pagination contract prevents table/board semantic drift, but rendering, focus, virtualization, and responsive behavior remain UI work.
- Queries expose no mutation, remote fetch, enrichment, scoring, or AI capability.
- `APP-006` is next for validated filter, sort, group, and saved-view commands.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes; `GATE-0` still requires the owner-authorized participant study.
- No ADR is required because no Accepted decision changed.
