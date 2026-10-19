# Concrete stored Pipeline queries

Date: 2026-10-19. Scope: prerequisite for actual Pipeline composition under
`Q3-005`, not completion of the normal-user journey.

## Implementation

The previously adapter-neutral `APP-005` query operations now have a concrete
DatabasePort/SQLite adapter and web runtime bridge. UI callers receive validated,
copied application DTOs, not rows. Counts, configured stage/unassigned groups,
keyset pages and workspace relationships share the existing tables. Every
projection runs within one transaction; tags are batch-read rather than queried
once per job. Values are bound parameters, page size remains capped at 100,
and changed/out-of-scope cursor anchors produce a retryable conflict.

No migration, dependency, permission, default stage, new canonical storage or
Accepted decision changes. Unassigned is only a read projection. Source selection
requires the stored primary flag; no fallback source is mislabeled primary.
The precise count semantics are documented in data model 03.

## Focused proof

- `pnpm exec vitest run tooling/tests/stored-pipeline.test.mjs packages/storage-core/test/document-editor-repository.test.ts packages/storage-core/test/tracker-repositories.test.ts`: 43 tests pass. New cases cover empty/no-seed reads, timestamp/ID tie order, pagination, archive/status scope, stale/out-of-scope anchor rejection, real attempt/action/company/source/tag/interview/reminder relationships, archived stages and tags, defined attention counts, no query writes, pre-open validation and content-free retryable open failures.
- `pnpm typecheck`: all 33 tasks pass.
- Shared pipeline contract assertions run concrete counts, groups, page and workspace through the unchanged application validators. Node's aggregate, the actual browser SQLite/OPFS tracker contract, and all 13 native tests pass again in the final-source complete gate.
- `pnpm exec playwright test --config=playwright.resilience.config.mjs application-attempt.spec.mjs`: one built-PWA offline journey passes. A normal manually captured/reviewed job and explicitly started attempt appear in all four runtime queries with exact stored identities and company name. No reference fixture is installed and external requests are zero. This still reads IDs for a deep link and does not prove ordinary Pipeline navigation.

The first runtime-unit invocation used package-name imports from the root tooling
directory, which has no such direct dependencies; explicit existing built-package
imports fix test resolution without changing dependencies. Lint identified one
nullish-coalescing style error, corrected without changing query semantics.

The first full gate then passed lint, all 130 files / 1,033 unit tests and coverage,
builds, package inspection and UI foundations, but stopped with one failure among
76 shell cases. The command-menu test navigated to its catalog-only synthetic
document ID, waited only for the Documents heading, and let the later async
document-unavailable result overwrite the command feedback it was asserting. Its
retained failure snapshot names that late document error. The test now waits for
the expected Document unavailable heading before opening the command menu;
production code, focus/route/locality assertions, retries and timeouts are unchanged.
All three repeated focused executions passed before subsequent complete gates.

Pre-commit review then identified over-broad `j.*` selection in summary pages.
A regression with a long synthetic description failed against that query by
inspecting the actual rows crossing DatabasePort (only column names are reported).
The summary now selects only its named columns; workspace detail separately reads
the description/employment/seniority fields in the same transaction. The regression
and all 43 focused tests pass, proving page transport omits description and remote
region payloads while explicit workspace detail retains the exact description.
That full gate finished with exit 0, including all browser/native contracts,
recovery, licenses, secrets and dependency policy, but began before this refinement
and is not final-source proof. The final-source gate below includes the refinement.

## Final local verification

`pnpm verify` passed with exit 0 on the final source: formatting, architecture and
foundation records, typecheck, lint, unit/coverage, all builds and report checks,
extension package inspection, every browser suite, shared browser/native storage
contracts, secure storage and archive/backup recovery, schemas, licenses, secrets,
dependency audit and Changesets. The shell matrix has 76 passing cases and the
resilience suite has nine. The separate final JSON unit report at
`test-results/stored-pipeline-unit.json` verifies 130 files / 1,034 passing tests,
zero failures and `success: true`. npm reports no known vulnerabilities; Cargo
retains the same ten reviewed warnings. The generic Rust unit runner's intentionally
ignored secure-store lifecycle is covered by the separately passing actual Windows
Credential Manager harness, not represented as a generic unit pass.

## Remaining work and proof

Fresh clean-commit hosted verification remains required. This checkpoint does not
wire Board/Table to the new API, replace the
storage-harness root entry point, implement real saved-view/edit/move composition,
or remove seeded canonical setup. The synthetic catalog must stay an explicit
proof surface while normal application navigation reads actual SQLite records.
`Q3-005`, `GATE-3`, earlier external-evidence gates and public release remain open.
