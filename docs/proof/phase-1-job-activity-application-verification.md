# Phase 1 job activity application verification

Date: 2026-08-28

Checklist scope: `APP-003`

Package: `@coredrill/application`

Decision changes: none

## Outcome

`APP-003` adds adapter-neutral `SetNextAction`, `RecordInteraction`, `ScheduleInterview`, and `ScheduleReminder` application commands over a narrow local `JobActivityPort`. Every new record receives a locally generated UUIDv7 identity and audit timestamps from the application operation clock. Scheduled instants remain UTC while their future local-time interpretation retains a canonical IANA time zone. The application implementation commit is `24c39b5`; the hosted Windows contract-suite timing-budget correction is `b679689`.

The port stores next actions, append-only interaction history, interview schedules, and pending local reminder records. It is not a hosted scheduler and does not send email, outreach, or network notifications. Existing storage-core repositories provide the matching durable seams, including atomic next-action/job-projection updates and foreign-key-backed activity relationships; concrete browser/native composition and user-interface wiring remain later work.

## Clock and time-zone proof

| Contract                  | Enforced behavior                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation shape           | All four actions are explicit PascalCase transactional commands.                                                                                                                                    |
| Operation clock           | Locally generated audit timestamps come from `ApplicationOperationContext.initiatedAt`; callers cannot inject created/updated times.                                                                |
| Next action               | A new action is always pending and incomplete. Due instant and IANA zone are supplied together or both remain null; no zone is invented for an unscheduled action.                                  |
| Interaction history       | Occurrence defaults to the operation time and may be historical, but cannot be future-dated. The interaction is append-only and creates no implicit next action.                                    |
| Interview schedule        | Start time must be later than the operation clock, the IANA zone must be recognized and canonicalized, and duration is a whole 1–1440 minutes. Contact IDs are bounded, valid, ordered, and unique. |
| Local reminder            | Reminder time must be later than the operation clock, its IANA zone is explicit, and its initial state is pending with no fired timestamp. No network scheduler is called.                          |
| Linkage                   | Job, application, contact, interaction, next-action, and interview references are typed local UUIDv7 values; the port has a stable linkage-conflict failure for relational mismatches.              |
| Returned-state validation | Returned records are parsed again and must match every initiating identity, linkage, schedule, state, content, and audit field; mismatches fail closed.                                             |
| Stable failures           | Reviewed activity codes map to stable `validation`, `conflict`, `not_found`, `unavailable`, `permission_denied`, or `internal` application errors with explicit retryability.                       |
| Unknown failures          | Adapter exception text is never returned. Paths, SQL, contact notes, and arbitrary exception content collapse to one content-free internal failure.                                                 |
| DTO ownership             | Successful records and interview contact-ID arrays are copied and frozen before crossing the application boundary.                                                                                  |

All fixtures are synthetic and contain no resume, provider credential, token, private page, real employer contact, or applicant data.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run packages/application/test/job-activity.test.ts`                         | Passed: 1 file and 48 focused clock, time-zone, validation, linkage, safe-failure, and fail-closed tests. The initial test-first checkpoint failed all 48 tests because the API did not yet exist.                                                                                               |
| `pnpm --filter @coredrill/application typecheck`                                              | Passed production and test TypeScript checks.                                                                                                                                                                                                                                                    |
| `pnpm --filter @coredrill/application lint`                                                   | Passed with zero warnings.                                                                                                                                                                                                                                                                       |
| `pnpm test:coverage`                                                                          | Passed: 32 files and 257 tests; 90.82% statements, 81.17% branches, 97.23% functions, and 93.51% lines overall. The application package reported 92.45% statements, 89.65% branches, 100% functions, and 97.06% lines; `job-activity.ts` reported 90.90%, 89.58%, 100%, and 96.96% respectively. |
| `pnpm verify`                                                                                 | Passed the complete formatting, architecture, typecheck, lint, unit, coverage, build, browser/native storage, recovery, security, license, audit, and Changesets gate.                                                                                                                           |
| `pnpm test:storage-native` after the hosted timing correction                                 | Passed: 10 native TypeScript tests; the Rust library reported 6 passed and 1 intentionally ignored secure-store harness case.                                                                                                                                                                    |
| [Foundation CI run 33215630721](https://github.com/seabAu/Coredrill/actions/runs/33215630721) | Passed formatted verification commit `cf68474` in the aggregate foundation gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native lanes, extension transfer/reproducibility, and the full-history secret scan.                                                        |

The first hosted attempt exposed that the complete 15-case native repository manifest could exceed Vitest's generic five-second default on a cold Windows runner. Commit `b679689` gives only that established cross-adapter contract test a 15-second ceiling; no product behavior, manifest case, or assertion changed.

The dependency audit reported zero known vulnerabilities and the 15 already-reviewed allowed transitive Rust warnings in the native Linux/Tauri dependency graph.

## Implementation surfaces

- `packages/application/src/job-activity.ts` — local activity port, immutable DTOs, stable errors, temporal validation, and four activity commands.
- `packages/application/src/index.ts` — reviewed public application API.
- `packages/application/test/job-activity.test.ts` — clock boundaries, IANA zones, exact port actions, validation, immutable results, failure mapping, and redaction proof.
- `.changeset/job-activity-application-flow.md` — package API change record.

## Boundaries and remaining work

- The commands persist local schedule intent; operating-system/browser notification delivery and runtime wake-up behavior are not claimed.
- Concrete browser/native adapters and UI composition are not claimed by this use-case slice.
- Interaction logging never sends a message, synthesizes contact data, or initiates outreach.
- `APP-004` is next for company/contact relationship commands with explicit provenance rules.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes; `GATE-0` still requires the owner-authorized participant study.
- No ADR is required because no Accepted decision changed.
