# Phase 1 saved job-view application verification

Date: 2026-08-29

Checklist scope: `APP-006`

Package: `@coredrill/search-filter`

Decision changes: none

## Outcome

`APP-006` adds adapter-neutral `CreateSavedJobView`, `UpdateSavedJobView`, `DuplicateSavedJobView`, and `ArchiveSavedJobView` application commands over a narrow local `SavedJobViewPort`. The implementation commit is `5285bca`.

The commands reuse the version-1 job-filter parser owned by `@coredrill/search-filter`, persist a versioned exact-shape presentation/sort/group document, require optimistic concurrency for edits and archive operations, and validate the complete adapter result before returning copied immutable DTOs. They never accept SQL, generate a system view, delete a view, mutate a job, or expose a network capability.

## Filter, sort, group, and lifecycle proof

| Contract          | Enforced behavior                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application shape | Create, update, duplicate, and archive are PascalCase transactional application commands using the shared `@coredrill/application` command/result primitives.                                                               |
| Filter AST        | Every create/update filter passes the existing version-1 exact-shape parser before persistence. Unknown versions, properties, fields, operators, incompatible values, and structural-limit violations fail before the port. |
| Presentation      | Version 1 accepts only `board` or `table`. A board must explicitly group by status or company; a table may also remain ungrouped.                                                                                           |
| Sort              | One to four unique clauses may use only company name, posted date, last interaction, next action, status order, title, or update time with ascending/descending direction. Unknown or extra properties fail closed.         |
| Stable execution  | The port contract fixes nulls last, requires grouped reads to retain one explicit unassigned group, and requires job ID ascending as the final stable query key.                                                            |
| Create            | Local UUIDv7 identity and operation time are application-owned; persisted views are job-scoped, user-owned, active, versioned, and begin at row version 1.                                                                  |
| Update            | A whole validated filter/settings definition is written with an expected positive row version; the returned version must advance exactly once and match the command.                                                        |
| Duplicate         | The caller supplies only source identity and a new normalized name. The port atomically clones stored filter/settings into a fresh user-owned identity; caller-supplied copied AST/settings cannot enter this path.         |
| Archive           | Archive is a timestamped optimistic update, not deletion. System views are protected and the returned archive time/version must match the initiating operation.                                                             |
| Immutable result  | Filter groups, predicate lists, sort clauses, and the enclosing DTO are copied and deeply frozen. Adapter timestamp, identity, state, filter/settings, and row-version mismatches fail closed.                              |
| Stable failures   | Reviewed conflict, not-found, protected-system, busy, unavailable, permission, read-only, and invalid-state failures map to stable safe application errors. Arbitrary exception text is never returned.                     |

No built-in saved-view names or default display stages are seeded by this slice. `Q-006` therefore remains open rather than being silently resolved in storage or command vocabulary.

All fixtures are synthetic and contain no provider credential, token, private page, real employer, or applicant data.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/search-filter/test/saved-view-commands.test.ts`                | Passed: 1 file and 42 focused command, AST/settings validation, property, optimistic-write, immutability, safe-failure, and fail-closed tests. The initial test-first checkpoint failed 40 of 41 tests because the command API did not exist; the sole passing assertion merely observed that the absent error constructor threw. The final suite includes 500 arbitrary-JSON filter cases and 100 generated reviewed sort combinations. |
| `pnpm --filter @coredrill/search-filter typecheck`                                            | Passed production and test TypeScript checks.                                                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm --filter @coredrill/search-filter lint`                                                 | Passed with zero warnings.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm test:coverage`                                                                          | Passed: 35 files and 393 tests; 90.42% statements, 81.91% branches, 97.79% functions, and 93.48% lines overall. Search-filter reported 89.95%, 84.73%, 98.95%, and 92.04%; `saved-view-commands.ts` reported 92.79%, 89.79%, 100%, and 96.77% respectively. The repository coverage allowlist now measures search-filter source directly.                                                                                                |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, typecheck, lint, unit, measured coverage, build, browser/native storage and recovery, extension packaging, schema, license, secret, dependency-audit, and Changesets gates.                                                                                                                                                                                                     |
| [Foundation CI run 33246777344](https://github.com/seabAu/Coredrill/actions/runs/33246777344) | Passed implementation commit `5285bca` in the aggregate foundation gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                                                                                                                                |

The new production dependency is an internal workspace edge from search-filter to the application command primitives; no external version was added. The refreshed lockfile is SHA-256 `e9add73f97e784b3950dcf1de207129d6781aac4d1ed832888381a6f5b6190b1`. License review passed for 351 npm and 498 Cargo records; npm reported zero known vulnerabilities and Rust retained the 15 already-reviewed allowed transitive warnings.

## Implementation surfaces

- `packages/search-filter/src/saved-view-commands.ts` — versioned settings, read/write port, immutable DTOs, stable errors, validation, and four commands.
- `packages/search-filter/src/index.ts` — reviewed public filter/saved-view API.
- `packages/search-filter/test/saved-view-commands.test.ts` — command metadata, property input, optimistic-write, result-consistency, immutability, error mapping, and redaction proof.
- `tooling/architecture/package-boundaries.mjs` and `packages/search-filter/tsconfig.json` — explicit search-filter-to-application command-primitive boundary.
- `vitest.config.mjs` — direct search-filter coverage measurement.
- `.changeset/saved-job-view-commands.md` — package API change record.

## Boundaries and remaining work

- Concrete storage-core browser/native implementations of `SavedJobViewPort` and user-interface wiring are not claimed by this command slice.
- The filter AST and sort/group settings expose no raw SQL; later adapters compile only the reviewed filter AST and hardcoded sort/group vocabulary.
- System-view protection exists, but this slice seeds no system view or default display-stage terminology and does not resolve `Q-006`.
- Duplicate and archive are atomic port contracts; a concrete adapter must prove their durable transaction and optimistic-version behavior before integration is claimed.
- `APP-007` is next for durable undo tokens covering status and next-action edits.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes; `GATE-0` still requires the owner-authorized participant study.
- No ADR is required because the existing runtime architecture already assigns the filter AST, SQL compiler, and saved views to `@coredrill/search-filter`; the added dependency uses the accepted shared application command shape without changing an Accepted product decision.
