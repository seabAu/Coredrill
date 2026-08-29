# Phase 1 Pipeline Table verification

Date: 2026-08-29

Checklist scope: `UI-007`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-007` establishes the Table as a first-class semantic peer of Board over the
shared Pipeline scope. Implementation commit `893c129` adds a controlled
`PipelineTable` with 14 reviewed product columns, stable column identities, a
fixed 12-row render window, leading pinned title/company context, configurable
visibility, pinning, width, and order, and selection controls that feed the
existing bulk-action shell.

The standard browser composition derives its eight Table records from the same
synthetic Board records and status definitions, so changing presentation does
not change the underlying IDs or matching count. Column layouts are controlled
per saved-view identity through a typed callback. The proof host retains a
separate layout for each local saved view; production durability remains owned
by the already-versioned saved-view `uiSettings` and SQLite boundaries rather
than component state.

Only status, priority, tags, and next-action date expose inline editors. Every
edit request carries the job ID and expected row version. The component validates
the reviewed status/priority vocabulary, bounded unique tags, and real ISO dates
before emitting an intent. A closed-to-active status edit additionally requires
an explicit reopening checkbox. Version conflicts and host failures keep the
editor open, preserve the previous record, and show a non-color-only field error.
Title, company, and every other complex field open the Job workspace boundary
instead of accepting an unsafe scalar edit.

The evidence-coverage column reports a transparent count such as “6 of 8
requirements have linked evidence.” It is not an ATS score, hiring-probability
score, or generated claim presented as verified evidence.

## Virtualization, interaction, and accessibility proof

The application-shell Playwright suite retains screenshots, axe JSON, and an
ARIA snapshot while exercising 16 reviewed scenarios. Its Table and peer-view
scenarios prove that:

- the standard Table uses a native table/caption/header/body structure and keeps
  the same eight record IDs and scope count as Board;
- title and company remain visible, leading, and sticky while other columns may
  be shown, hidden, resized from 96–480 pixels, reordered, or pinned as a leading
  group;
- configuration changes remain isolated by saved-view identity: changes made to
  Active search do not leak into Interview prep and return when Active search is
  restored;
- title/company actions open the complex Job workspace boundary, while only the
  four reviewed low-risk scalar fields expose named Edit controls;
- valid priority and next-action edits update the controlled local record, while
  duplicate case-insensitive tags fail validation without incrementing the edit
  counter;
- reopening the closed Product Manager record cannot submit until the explicit
  confirmation is selected, after which the host records status-event/undo
  intent and increments the shared timeline-event counter;
- a deterministic stale-row fixture rejects the edit with a visible conflict
  error, leaves the previous controlled value intact, and records zero edits;
- a synthetic 2,000-record dataset renders 12 data rows initially and after
  scrolling, reaches `table-volume-1992`, and completes the scroll/render
  assertion inside the reviewed 2.5-second diagnostic ceiling;
- a 320 CSS-pixel forced-colors/reduced-motion viewport has no document-level
  horizontal overflow while the named, keyboard-focusable Table region owns its
  necessary horizontal and vertical scrolling; and
- all reviewed Pipeline/Table interaction paths make zero requests outside the
  local test origin.

Desktop, 2,000-row, and 320-pixel forced-colors screenshots were visually
reviewed. The dense desktop hierarchy remains readable, sticky context survives
horizontal overflow, the row window preserves a stable viewport, and the narrow
layout keeps application controls reachable above the locally scrolling Table.
The ARIA snapshot retains the Table caption, column headers, row selection,
named complex-field actions, low-risk Edit actions, and live status region. Every
reviewed state reports zero automated axe violations in the final Chrome 151 and
Chrome 152 lanes.

Component tests separately freeze the complete column and editable-field
vocabularies, the default pinned layout, baseline contextual values, semantic
table/caption markup, 12-row window metadata, and fail-closed validation for
duplicate jobs, incomplete layouts, and unpinned title/company columns.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | Passed for all 23 workspace projects with the unchanged reviewed lockfile in every hosted execution lane.                                                                                                                                                                                                                  |
| `node node_modules/vitest/vitest.mjs run packages/ui/test/pipeline-table.test.tsx`            | Passed 1 focused component file and 4 contract tests.                                                                                                                                                                                                                                                                      |
| `pnpm test:app-shell`                                                                         | Passed all 16 shell, Home, Pipeline, Board, Table, accessibility, request-ledger, focus, navigation, and responsive scenarios.                                                                                                                                                                                             |
| `pnpm test:coverage`                                                                          | Passed 45 files and 445 tests at 83.98% statements, 74.16% branches, 83.38% functions, and 86.71% lines overall.                                                                                                                                                                                                           |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33267887614](https://github.com/seabAu/Coredrill/actions/runs/33267887614) | Passed commit `893c129` in the aggregate gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                                            |

Hosted application-shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             |  Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99141093836` | `coredrill-app-shell-chrome-151.0.7922.138-893c12995af408ca4dfdf9ebd1a69f825f82badb` | `9719222974` | `ad2087710286b3d0b6ca51bcfadca55b2850ca2b606e50a597959ac134175b58` |
| Chrome 152.0.7977.54  | `99141093831` | `coredrill-app-shell-chrome-152.0.7977.54-893c12995af408ca4dfdf9ebd1a69f825f82badb`  | `9719223477` | `84363d20ed38b9265f395d5504d7cef24e36eee176c15b4caeee35426067ac77` |

Both immutable artifacts expire on 2026-09-28. This committed report, component
tests, browser suite, and deterministic synthetic Table model remain
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

- `packages/ui/src/pipeline-table.tsx` — validated immutable row/configuration
  model, semantic windowed table, sticky-column offsets, per-view configuration
  intents, bounded editors, conflict errors, reopening confirmation, and
  selection.
- `packages/ui/styles.css` — dense semantic table, sticky header/columns, local
  overflow, configuration surface, editor/focus/error states, responsive layout,
  and forced-colors treatment.
- `apps/web/src/app-shell.tsx` — shared Board/Table record fixtures, per-view
  configuration host, controlled row-version updates, status/priority projection
  consistency, selection, conflict fixture, and 2,000-record performance model.
- `packages/ui/test/pipeline-table.test.tsx` — frozen contracts, semantic markup,
  baseline context, virtualization metadata, and invalid-model tests.
- `e2e/app-shell.spec.mjs` — peer-scope invariance, column configuration,
  ARIA/axe/screenshots, valid and invalid edits, explicit reopening, version
  conflict, 2,000-row performance, request ledger, and responsive proof.
- `.changeset/pipeline-table-workspace.md` — UI/web change record.

## Boundaries and remaining work

- The shared UI consumes immutable view models and emits typed configuration,
  selection, open-workspace, and version-aware edit intents. It does not own
  canonical records, persist saved views, write SQL, or perform network requests.
- Product composition must route status and next-action requests through the
  accepted application commands and add equivalent reviewed priority/tag
  application commands before treating those synthetic host edits as durable.
  The UI does not bypass those missing boundaries.
- Saved-view layout durability belongs in the existing versioned `uiSettings`
  port/SQLite boundary. This slice proves the controlled per-view UI behavior;
  it does not make Zustand or component state canonical storage.
- D-011 remains satisfied: Board stays the initial Pipeline presentation and
  Table is a first-class peer over the same standard record scope. Candidate
  status display names remain provisional while `Q-006` is open.
- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, zoom, screen-reader, and representative-participant
  gates remain assigned to dedicated accessibility and user-research items.
- `UI-008` is next for the contextual/full-page Job workspace with route,
  back/refresh, and scroll restoration proof.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
