# Phase 1 Pipeline control-surface verification

Date: 2026-08-29

Checklist scope: `UI-005`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-005` establishes a shared, presentation-neutral Pipeline control surface.
Implementation commit `e2c35e8` adds a typed `PipelineShell` whose peer Inbox,
Board, Table, and Discover views operate over one explicit record scope. Board is
the initial presentation, while switching views changes only the presentation ID
and leaves the matching and total counts unchanged.

The surface keeps saved views, local job search, sort state, and active filter chips
visible. Each chip is individually removable, multiple filters can be cleared
together, and the Inbox count remains attached to the Pipeline surface rather than
becoming a duplicate primary destination. The component validates nonnegative
counts, selection and matching bounds, unique filter/saved-view IDs, and the active
saved-view reference before rendering.

Bulk controls remain absent until an explicit selection exists. The selected state
offers Change status, Add tags, Archive, and Clear selection, but this slice emits
typed intent only. The deterministic host explicitly reports that a selected bulk
action changed no records. Durable mutations and confirmation belong to the
application/SQLite boundaries in later Board and Table slices.

## Interaction and accessibility proof

The application-shell Playwright suite retains screenshots and axe JSON while
exercising nine reviewed scenarios. Two Pipeline scenarios prove that:

- all four peer views are present, Board starts active, and the Inbox count remains
  visible;
- changing from Board to Table changes the presentation state while preserving the
  same `8 matching of 12` synthetic record scope;
- a saved local view can be selected, scoped job search can be entered, and a
  visible filter chip can be removed;
- Filter, Sort, and More controls emit local typed actions;
- the interactive desktop scenario produces no request outside the local test
  origin;
- bulk actions appear only for an explicit two-job selection, report that no
  records changed, and disappear when selection is cleared; and
- the selected state, filter chips, saved view, all four views, and bulk controls
  reflow at 320 pixels under forced colors and reduced motion without horizontal
  document overflow.

The desktop Table presentation and selected 320-pixel forced-color artifacts were
visually reviewed. The desktop hierarchy cleanly separates view, saved-view,
query/filter, and presentation controls. Mobile exposes the four views as a
two-by-two switch and stacks the bulk actions. Playwright's full-page capture
stitches the fixed bottom navigation into the middle of the tall mobile image; in
the live viewport it remains fixed at the bottom and the content remains
scrollable. Every reviewed Pipeline state reports zero automated axe violations.

Component tests separately freeze the peer-view and safe bulk-action vocabularies,
saved-view/filter/search/scope markup, selection-only bulk controls, and fail-closed
count/reference validation.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | Passed for all 23 workspace projects with the unchanged reviewed lockfile in every hosted execution lane.                                                                                                                                                                                                                  |
| `node node_modules/vitest/vitest.mjs run packages/ui/test/pipeline-shell.test.tsx`            | Passed 1 focused component file and 4 contract tests.                                                                                                                                                                                                                                                                      |
| `pnpm test:app-shell`                                                                         | Passed all 9 shell, Home, Pipeline, accessibility, request-ledger, focus, navigation, and responsive scenarios.                                                                                                                                                                                                            |
| `pnpm test:coverage`                                                                          | Passed 43 files and 437 tests at 86.57% statements, 77.21% branches, 87.57% functions, and 89.27% lines overall.                                                                                                                                                                                                           |
| `pnpm --filter @coredrill/web build`                                                          | Passed and emitted the application-shell entry plus existing application entries.                                                                                                                                                                                                                                          |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33264512038](https://github.com/seabAu/Coredrill/actions/runs/33264512038) | Passed final implementation commit `e2c35e8` in the aggregate gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                       |

Hosted application-shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             | Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | ----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99132122416` | `coredrill-app-shell-chrome-151.0.7922.138-e2c35e8c0c0665a343657922f2877d7985cdae1e` |  9718254754 | `c1db7c1f8c411482b30b166f599da2505b71a432d187dce6d439a28d032b80f0` |
| Chrome 152.0.7977.54  | `99132122442` | `coredrill-app-shell-chrome-152.0.7977.54-e2c35e8c0c0665a343657922f2877d7985cdae1e`  |  9718252298 | `6f06f4a2543e7331a1b1e75f77aa9c26571ccc8c9ac233e1d3c829dafc811b49` |

Both immutable artifacts expire on 2026-09-28. This committed report, component
tests, browser suite, and deterministic synthetic Pipeline model remain
reproducible after hosted retention ends.

## Dependency and policy status

This slice adds no dependency. The dependency inventory remains version 1.17 with
47 direct dependencies, 621 audited npm resolutions (82 optional), zero known npm
vulnerabilities, 354 reviewed JavaScript license records, and 498 reviewed Rust
crates. The lockfile SHA-256 remains
`60c3e35de7f71cc0bc4bb877d35c9f0312d89e1b92d0700b752fd844a8ff293b`.

The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all already reviewed and allowlisted; this slice adds no Rust dependency.

## Implementation surfaces

- `packages/ui/src/pipeline-shell.tsx` - typed peer views, saved views, scoped
  search, removable filters, record scope, selection-only bulk controls, callbacks,
  and fail-closed model validation.
- `packages/ui/styles.css` - wide, compact, mobile, reduced-motion, and
  forced-colors Pipeline composition.
- `apps/web/src/app-shell.tsx` - deterministic Pipeline state, presentation changes,
  local saved-view/filter/search interactions, selection fixture, and action
  reporting.
- `packages/ui/test/pipeline-shell.test.tsx` - frozen vocabularies, visible-control
  contract, selected state, and invalid-model tests.
- `e2e/app-shell.spec.mjs` - peer-view invariance, local controls, request ledger,
  bulk-action, screenshot, axe, and responsive proof in the existing shell suite.
- `.changeset/pipeline-control-surface.md` - UI/web change record.

## Boundaries and remaining work

- The shared UI consumes an immutable view model and emits typed actions; it does
  not own canonical records, execute filters, expose SQL, or perform network
  requests. The browser catalog is a deterministic proof host, so its React state
  and synthetic fixtures are explicitly noncanonical.
- Saved-view labels in the catalog are synthetic user-owned examples. This slice
  does not seed system views or silently resolve `Q-006`; production composition
  must use the already-proven versioned saved-view application and SQLite
  boundaries.
- Bulk Archive is an intent, not an immediate destructive action. Product
  composition must add the reviewed confirmation/undo flow and perform any durable
  change through the application boundary.
- D-011 remains satisfied: Board is the initial presentation and Table is a
  first-class peer over the same record scope. D-010 remains Provisional until
  navigation findability research is completed.
- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, zoom, screen-reader, drag-alternative, and
  representative-participant gates remain assigned to the dedicated accessibility
  and user-research items.
- `UI-006` is next for the virtualized Board, semantic-stage metadata, pointer and
  keyboard moves, accessible confirmation announcements, and durable-undo intent.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
