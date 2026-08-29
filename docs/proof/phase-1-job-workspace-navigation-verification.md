# Phase 1 Job workspace navigation verification

Date: 2026-08-29

Checklist scope: `UI-008`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-008` establishes one shared Job workspace frame at the stable local route
`/jobs/:jobId/:tab`. Implementation commit `1628661` adds the six reviewed tab
identities, identifying job/company/status/priority/source/next-action context,
and the always-reachable Change status, Set next action, and Prepare application
actions without introducing an account, hosted route service, network request,
or AI dependency.

Opening a job from Pipeline at 1280 CSS pixels or wider keeps Pipeline mounted
and opens the shared frame as a bounded 560–760 pixel contextual workspace.
Opening at a narrower viewport uses the same frame as a full page. A contextual
workspace also changes to the full-page presentation if its live viewport becomes
narrow. A refresh or direct deep link always resolves the stable job URL as a
full page, even on a wide viewport, so reload behavior never depends on a hidden
Pipeline presentation.

Before contextual or full-page navigation, the shell captures the exact Pipeline
presentation, saved-view identity, filter chips, search text, selected jobs,
Board per-stage vertical scroll, Board horizontal scroll, Table scroll, window
scroll, and invoking job/action. Browser Back/Forward, the explicit Back/Close
control, and contextual Escape restore that snapshot and return focus to the
invoking element. The snapshot is typed, versioned, validated before use, and
stored only in local browser history for this proof host; it is not canonical
job storage.

## Navigation, responsive, and accessibility proof

The application-shell Playwright suite retains screenshots and axe JSON while
exercising 20 reviewed scenarios. Its four dedicated Job-workspace scenarios
prove that:

- a wide Board opens `/jobs/board-arc/overview` in a contextual frame, keeps
  Pipeline visible, focuses the Job heading, and exposes a working 560–760 pixel
  width control;
- Escape returns to the exact `/pipeline?savedView=active-search&view=board`
  URL with search, two-job selection, Board vertical/horizontal scroll, and
  opener focus restored, while browser Forward reopens the contextual entry;
- resizing that contextual entry to 800 pixels changes it to the full-page mode,
  unmounts Pipeline, and creates no document-level horizontal overflow;
- refreshing a wide contextual entry retains `/jobs/board-northstar/overview`
  but deliberately opens it full-page, after which Back restores Pipeline;
- a direct `/jobs/board-northstar/timeline` deep link opens full-page, Source
  changes the URL to `/source`, browser Back restores `/timeline`, and the
  explicit fallback returns to the default local Pipeline when no captured
  Pipeline entry exists;
- opening from Table at 800 pixels uses the same full-page frame and restores
  the Table presentation, search, selection, horizontal scroll, and opener focus;
- Overview, Requirements, Documents, Timeline, Company, and Source have stable
  tab identities and history entries, while their record content remains
  intentionally reserved for `UI-009`; and
- all three captured Job-workspace states report zero automated axe violations.

The contextual-wide and refresh-full-page screenshots were visually reviewed.
The side workspace preserves a clear hierarchy and reachable important actions
at 720 pixels, while the refreshed full page presents the same title, context,
actions, tabs, and content boundary without a duplicate implementation. The
narrow-return screenshot confirms the restored Pipeline owns its horizontal
overflow after leaving the full-page workspace.

Component tests separately freeze the six-tab and five-action vocabularies,
shared contextual/full-page context and action markup, full-page omission of the
contextual resize control, and fail-closed validation for missing identifying
context or widths outside 560–760 pixels.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | Passed for all 23 workspace projects with the unchanged reviewed lockfile in every hosted execution lane.                                                                                                                                                                                                                  |
| `node node_modules/vitest/vitest.mjs run packages/ui/test/job-workspace-frame.test.tsx`       | Passed 1 focused component file and 4 contract tests.                                                                                                                                                                                                                                                                      |
| `pnpm test:app-shell`                                                                         | Passed all 20 shell, Home, Pipeline, Board, Table, Job-workspace, accessibility, focus, history, and responsive scenarios.                                                                                                                                                                                                 |
| `pnpm test:coverage`                                                                          | Passed 46 files and 449 tests at 83.87% statements, 74.34% branches, 82.75% functions, and 86.58% lines overall.                                                                                                                                                                                                           |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33269559887](https://github.com/seabAu/Coredrill/actions/runs/33269559887) | Passed commit `1628661` in the aggregate gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                                            |

Hosted application-shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             |  Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99145478000` | `coredrill-app-shell-chrome-151.0.7922.138-1628661f9b494a25066e9dc3dfe6f62bf30dff25` | `9719700606` | `fa700826d9c697f90fea915c913069e6e464008b667eac349118e5dde59652f2` |
| Chrome 152.0.7977.54  | `99145477966` | `coredrill-app-shell-chrome-152.0.7977.54-1628661f9b494a25066e9dc3dfe6f62bf30dff25`  | `9719705581` | `b3330f03f5798c5dbe5e9058d66d3e6328dd0151a07c701c13c3e855158475d1` |

Both immutable artifacts expire on 2026-09-28. This committed report, component
tests, browser suite, and deterministic local route fixtures remain reproducible
after hosted retention ends.

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

- `packages/ui/src/job-workspace-frame.tsx` — shared validated frame, reviewed
  tabs/actions, identifying context, heading focus, and bounded contextual width.
- `packages/ui/styles.css` — contextual/full-page composition, sticky workspace
  structure, responsive reflow, local overflow, focus, and forced-colors treatment.
- `apps/web/src/app-shell.tsx` — stable route parsing, validated history state,
  responsive presentation selection, tab history, exact Pipeline snapshot capture
  and restoration, Escape/Back behavior, and opener-focus return.
- `apps/web/vite.config.mjs` — local development and preview HTML fallback for
  stable Pipeline and Job paths, including refresh and direct-link proof.
- `packages/ui/test/job-workspace-frame.test.tsx` — frozen vocabulary, shared-mode
  rendering, action/context presence, and invalid-model tests.
- `e2e/app-shell.spec.mjs` — contextual, responsive, refresh, direct-link,
  tab-history, exact Board/Table restoration, focus, screenshot, and axe proof.
- `.changeset/job-workspace-navigation.md` — UI/web change record.

## Boundaries and remaining work

- The frame consumes an immutable view model and emits typed tab/action/close/
  resize intents. It does not own canonical records, write SQL, or perform
  network or AI work.
- The standard composition uses deterministic synthetic records. Production
  composition must consume the accepted `APP-005` Job-workspace query and route
  mutation intents through the existing application-command boundaries.
- The Vite fallback proves development and preview refresh/deep-link semantics.
  Any future standalone web host must route `/pipeline` and `/jobs/*` to the
  app-shell entry; it must not add an account or hosted database requirement.
- `UI-009` is next and owns the local Overview, Timeline, Company, and Source
  skeleton content inside this already-shared frame. Requirements and Documents
  remain stable route identities for their later dedicated slices.
- Candidate status display names remain provisional while `Q-006` is open.
- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, zoom, screen-reader, and representative-participant
  gates remain assigned to dedicated accessibility and user-research items.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
