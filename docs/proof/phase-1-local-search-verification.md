# Phase 1 local search verification

Date: 2026-08-29

Checklist scope: `UI-011`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-011` adds bounded, deterministic local search to the shared application
shell. Implementation commit `50256cf` provides:

- one validated and version-independent search projection for job, company,
  contact, and document records;
- normalized all-token matching in stable source order, with explicit local
  scope and no opaque ranking or probability score;
- global result links with native activation, Arrow Up/Down, Home, End, and
  focus-return behavior;
- stable job, company, contact, and document destinations that survive direct
  navigation and reload; and
- Pipeline-scoped Board and Table filtering over job title and company, with
  exact matching/total counts and selection counts limited to visible records.

Query, token, result, identifier, label, context, and route bounds are validated
before render. Unsupported record kinds or Job tabs, duplicate result IDs,
oversized fields, and non-local routes fail closed. Search remains fully useful
with AI disabled and makes no external search, enrichment, analytics, or account
request.

## Component, browser, and accessibility proof

The focused component suites prove Unicode normalization, punctuation-tolerant
multi-token matching, deterministic ordering, explicit no-results behavior,
bounded results, safe routes, scoped Pipeline counts, and route-selected Network
records. The complete unit suite freezes these contracts across 49 files and 464
tests.

The application-shell Playwright suite exercises 25 scenarios. Its local-search
coverage proves that:

- the global dialog identifies its scope as `All local records`, announces exact
  result counts, and supports keyboard traversal and native link activation;
- job, company, contact, and document results open their exact stable local
  destinations, including direct-route and reload cases;
- Pipeline search identifies its narrower `Current Pipeline · jobs and
companies` scope and produces identical filtered membership in Board and Table
  views;
- filtered selection counts include only visible jobs; and
- the search journeys make zero external requests and report zero axe
  violations.

The global search dialog and Pipeline search were visually reviewed at desktop
size. The global dialog was also reviewed at 320 by 800 pixels: labels, scope,
results, focus, and actions remained readable with no document-level horizontal
overflow.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node node_modules/vitest/vitest.mjs run packages/ui/test/local-search.test.ts`               | Passed the focused local-search contract file and 4 tests.                                                                                                                                                                                                                                                                 |
| `pnpm test:app-shell`                                                                         | Passed all 25 shell, Home, Pipeline, Board, Table, Job-workspace, Network, local-search, accessibility, focus, history, and responsive scenarios.                                                                                                                                                                          |
| `pnpm test:coverage`                                                                          | Passed 49 files and 464 tests at 83.08% statements, 73.93% branches, 81.01% functions, and 85.66% lines overall.                                                                                                                                                                                                           |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33275007796](https://github.com/seabAu/Coredrill/actions/runs/33275007796) | Passed on attempt 1 for implementation commit `50256cf`; all build, policy, extension, Chrome 151/152, Firefox 153/154, and Windows/macOS/Ubuntu native package lanes completed successfully.                                                                                                                              |

Hosted application-shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             |  Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99160078547` | `coredrill-app-shell-chrome-151.0.7922.138-50256cf17c363e299b4117105898df96e08c0fb5` | `9721255141` | `e9c0b45255519fb6bff28bec77dbaef1a4d24fb28de2ef8444135d16dfb2a6c5` |
| Chrome 152.0.7977.54  | `99160078569` | `coredrill-app-shell-chrome-152.0.7977.54-50256cf17c363e299b4117105898df96e08c0fb5`  | `9721249161` | `94153dd1d83fc4d826de5733b26fa86d32c45470005e73b72ae5f4e5af1b7871` |

Both immutable artifacts expire on 2026-09-28. This committed report,
component tests, browser suite, and deterministic local fixtures remain
reproducible after hosted retention ends.

## Dependency and policy status

This slice adds no dependency. The dependency inventory remains version 1.17
with 47 direct dependencies, 621 audited npm resolutions (82 optional), zero
known npm vulnerabilities, 354 reviewed JavaScript license records, and 498
reviewed Rust crates. The lockfile SHA-256 remains
`60c3e35de7f71cc0bc4bb877d35c9f0312d89e1b92d0700b752fd844a8ff293b`.

The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all already reviewed and allowlisted; this slice adds no Rust
dependency.

## Implementation surfaces

- `packages/ui/src/local-search.ts` — bounded normalized query contract,
  deterministic matching, validation, and stable local result routes.
- `packages/ui/src/app-shell.tsx` — global local-search dialog, explicit scope,
  count announcements, semantic links, keyboard navigation, and focus return.
- `packages/ui/src/pipeline-shell.tsx` — explicit Pipeline scope and bounded
  query/count surface.
- `packages/ui/src/network-workspace.tsx` — validated route-selected company and
  contact synchronization without focus-destructive remounting.
- `apps/web/src/app-shell.tsx` — synthetic local projection, stable entity and
  destination routing, and shared Board/Table Pipeline filtering.
- `apps/web/vite.config.mjs` — direct-route history fallback for local result
  destinations.
- `packages/ui/styles.css` — result-link and explicit-scope presentation.
- `packages/ui/test/local-search.test.ts`,
  `packages/ui/test/network-workspace.test.tsx`, and
  `packages/ui/test/pipeline-shell.test.tsx` — search, routing, and scope
  contracts.
- `e2e/app-shell.spec.mjs` — global/scoped search journeys, stable navigation,
  reload, keyboard, accessibility, and zero-external-request proof.
- `.changeset/local-search-workspace.md` — UI/web change record.

## Boundaries and remaining work

- The standard composition remains a deterministic synthetic proof host.
  Production global search must compose the accepted `DB-007` job repository
  with local company, contact, and document read indexes when those durable
  adapters are connected.
- Pipeline filtering is currently a bounded client-side UI proof over the
  validated view model; durable query planning remains owned by repository
  composition.
- Search is local-only and useful with AI disabled. It exposes no generated
  evidence, hidden score, hiring probability, external crawl, or enrichment.
- Candidate status display names remain provisional while `Q-006` is open.
- Automated axe checks are necessary regression evidence, not a WCAG
  conformance claim. Manual keyboard, zoom, screen-reader, and
  representative-participant gates remain assigned to dedicated accessibility
  and user-research items.
- `UI-012` is next and owns the complete Phase 1 loading, empty, partial, error,
  offline, and permission state catalog.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
