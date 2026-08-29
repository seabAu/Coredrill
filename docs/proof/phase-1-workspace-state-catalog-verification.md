# Phase 1 workspace state catalog verification

Date: 2026-08-29

Checklist scope: `UI-012`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-012` adds one validated, reusable state contract for every Phase 1 workspace
surface. Implementation commit `eb9f330` provides:

- loading, empty, partial, error, offline, and permission-denied patterns;
- an explicit relevance map covering Home, Pipeline, Job workspace, Documents,
  Career profile, Network, Insights, and Settings;
- bounded copy, progress, availability lists, permission detail, and no more than
  four unique typed recovery actions per state;
- named progress for longer loading work and a meaningful first-action path for
  empty workspaces;
- visible available/unavailable boundaries for partial data;
- work-preserving error recovery with retry, redacted diagnostics, export
  fallback, and manual paths;
- offline operation that keeps local work available and identifies queued work;
  and
- exact permission scope, why it is needed, preserved local state, and a manual
  fallback.

Invalid kinds, surfaces, actions, progress, permission copy, duplicate coverage,
and unsafe recovery combinations fail closed before render. The catalog remains
fully useful with AI disabled. Its proof host records only typed local action
identifiers and makes no external request.

## Component, browser, and accessibility proof

The focused component suite contains 4 tests that freeze the complete catalog,
surface relevance, kind-specific recovery semantics, rendered progress and
permission detail, and rejection of unsafe models. The complete unit suite
freezes these contracts across 50 files and 468 tests.

The application-shell Playwright suite exercises 27 scenarios. Its workspace
state coverage proves that:

- all six patterns render their exact heading, local/work-preservation note,
  and typed recovery actions;
- loading exposes named native progress and a cancel path;
- partial data distinguishes what is available from what is unavailable;
- errors expose bounded diagnostics/export recovery without raw error copy;
- offline mode keeps local work available and updates the shell's vault-health
  signal;
- permission denial identifies exact file access and retains a manual path;
- every state makes zero external requests and reports zero axe violations; and
- each state remains readable and operable at 320 CSS pixels and in forced
  colors, with 44-pixel focusable action targets and no document-level
  horizontal overflow.

The error pattern was visually reviewed at 1440 by 960 pixels. Offline and
permission-denied patterns were visually reviewed at 320 by 800 pixels: state
hierarchy, available/unavailable boundaries, permission explanation, local
preservation, and recovery actions remained readable and balanced.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node node_modules/vitest/vitest.mjs run packages/ui/test/workspace-state.test.tsx`           | Passed the focused workspace-state contract file and 4 tests.                                                                                                                                                                                                                                                              |
| `pnpm test:app-shell`                                                                         | Passed all 27 shell, workspace-state, Home, Pipeline, Board, Table, Job-workspace, Network, local-search, accessibility, focus, history, and responsive scenarios.                                                                                                                                                         |
| `pnpm test:coverage`                                                                          | Passed 50 files and 468 tests at 83.12% statements, 74.29% branches, 81.23% functions, and 85.66% lines overall; `workspace-state.tsx` reached 86.11% statements, 89.65% branches, 94.44% functions, and 85.29% lines.                                                                                                     |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33276539969](https://github.com/seabAu/Coredrill/actions/runs/33276539969) | Passed on attempt 1 for implementation commit `eb9f330`; all build, policy, extension, Chrome 151/152, Firefox 153/154, and Windows/macOS/Ubuntu native package lanes completed successfully.                                                                                                                              |

Hosted application-shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             |  Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99164140069` | `coredrill-app-shell-chrome-151.0.7922.138-eb9f330a781852132a053f436c055175800129f5` | `9721697764` | `52c03e34c25d9041b6d8d925878cb7683fb40f57b1afeef37be7d06feb797ac7` |
| Chrome 152.0.7977.54  | `99164140068` | `coredrill-app-shell-chrome-152.0.7977.54-eb9f330a781852132a053f436c055175800129f5`  | `9721698075` | `f77e0656c05e0444243ef00dc14865b035280f6251ae2cd20f484c854954c668` |

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

- `packages/ui/src/workspace-state.tsx` — validated catalog, relevance map,
  kind-specific recovery semantics, and accessible shared state renderer.
- `packages/ui/src/index.ts` — public workspace-state contract exports.
- `packages/ui/styles.css` — desktop, 320-pixel reflow, focus, progress,
  availability, action, and forced-color presentation.
- `apps/web/src/app-shell.tsx` — deterministic state proof host, offline vault
  health, and typed local action evidence.
- `packages/ui/test/workspace-state.test.tsx` — catalog, model, rendering, and
  fail-closed contract tests.
- `e2e/app-shell.spec.mjs` — six-state journeys, typed recovery, accessibility,
  responsive, forced-color, and zero-external-request proof.
- `.changeset/phase-one-workspace-states.md` — UI/web change record.

## Boundaries and remaining work

- This slice establishes the shared state and recovery contract plus its proof
  host. Production adapters still own the underlying operations and must provide
  structured state, preserved work, and typed actions at composition time.
- `copy-diagnostics` is a typed intent. Production composition must connect it
  to the existing bounded, redacted support-bundle boundary; raw errors, paths,
  and user content must never be copied.
- Query-selected state rendering is a deterministic synthetic proof surface. It
  performs no durable write or network request.
- Automated axe checks are necessary regression evidence, not a WCAG
  conformance claim. Manual keyboard, zoom, screen-reader, and
  representative-participant gates remain assigned to dedicated accessibility
  and user-research items.
- Candidate status display names remain provisional while `Q-006` is open.
- `BKP-001` is next and owns the portable archive writer with manifest,
  database/data, attachments, and checksums.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes; `GATE-0` remains blocked on owner-authorized
  representative human validation.
- No ADR is required because no Accepted decision changed.
