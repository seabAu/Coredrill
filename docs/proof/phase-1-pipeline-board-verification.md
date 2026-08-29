# Phase 1 Pipeline Board verification

Date: 2026-08-29

Checklist scope: `UI-006`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-006` establishes a contextual, accessible, and virtualized Board presentation
inside the shared Pipeline record scope. Implementation commits `1f39f46` and
`efae2cc` add a typed `PipelineBoard` whose stage model carries stable IDs,
display names, one or more semantic categories, and terminal-state metadata. The
shared component does not lock final user-facing stage names: the browser catalog's
Saved, Preparing, Applied, Interviewing, Offer, and Closed names are synthetic
composition candidates while `Q-006` remains open for participant evidence.

Every visible card retains the minimum decision context: title, company, work
mode/location, priority, next action or explicit absence, last activity, and any
missing-document, unreviewed-source, or unsupported-claim warnings. Pointer users
receive a dedicated drag handle, while keyboard and screen-reader users receive a
named native Move control on every card. Both paths emit the same typed move
contract and polite live announcement.

Terminal-to-active moves fail closed and request explicit reopening confirmation;
the proof host makes no move and records no event for that request. An ordinary
move reports timeline-event intent and exposes Undo. Undo restores the prior
column, preserves the original event, and reports a reversal event. The browser
catalog is deliberately synthetic and noncanonical: production durability remains
owned by the already-proven application and SQLite mutation/undo boundaries.

## Virtualization, interaction, and accessibility proof

The application-shell Playwright suite retains screenshots, axe JSON, and an ARIA
snapshot while exercising 12 reviewed scenarios. Three Board scenarios prove that:

- the Board exposes candidate display names plus the complete semantic-category
  mapping needed by downstream grouping without treating display names as durable
  semantics;
- contextual card facts and warning labels are visible, while the bounded warning
  set wraps instead of creating a nested keyboard-inaccessible scroll region;
- the native Move control moves a card by keyboard/screen-reader-facing input,
  announces the result, records one timeline-event intent, and exposes Undo;
- Undo restores the prior column, records a reversal intent, clears the single-use
  Undo affordance, and announces that the original timeline event remains;
- pointer movement through the dedicated drag handle uses the same move contract
  and announces the drag method;
- moving a card from Closed to Saved fails closed pending explicit confirmation,
  leaves the card in Closed, and does not increment the event count;
- a synthetic 72-card Saved column renders only eight card rows initially, reaches
  the final synthetic card after scrolling, and leaves the other columns usable;
- the Board owns horizontal overflow locally, so a 320-pixel forced-colors and
  reduced-motion viewport has no document-level horizontal overflow; and
- all interactive scenarios make zero requests outside the local test origin.

The desktop move/undo, large-column, and 320-pixel forced-colors captures were
visually reviewed. Card hierarchy and drag affordances remain legible, the large
column retains a stable viewport while its window changes, and mobile exposes one
usable column at a time behind local horizontal scrolling. The ARIA snapshot
retains stage headings, list names, contextual card labels, named Move controls,
the live region, and Undo. Every reviewed state reports zero automated axe
violations in the final Chrome 151 and Chrome 152 lanes.

Component tests separately freeze the semantic, warning, and move vocabularies;
minimum card context; window-size metadata; live announcement and Undo markup; and
fail-closed validation for duplicate IDs or incomplete semantic-stage metadata.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | Passed for all 23 workspace projects with the unchanged reviewed lockfile in every hosted execution lane.                                                                                                                                                                                                                                                                          |
| `node node_modules/vitest/vitest.mjs run packages/ui/test/pipeline-board.test.tsx`            | Passed 1 focused component file and 4 contract tests.                                                                                                                                                                                                                                                                                                                              |
| `pnpm test:app-shell`                                                                         | Passed all 12 shell, Home, Pipeline, Board, accessibility, request-ledger, focus, navigation, and responsive scenarios.                                                                                                                                                                                                                                                            |
| `pnpm test:coverage`                                                                          | Passed 44 files and 441 tests at 85.76% statements, 76.34% branches, 86.01% functions, and 88.49% lines overall.                                                                                                                                                                                                                                                                   |
| `pnpm verify`                                                                                 | Passed with exit code 0 after the final cross-platform accessibility correction across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33266213814](https://github.com/seabAu/Coredrill/actions/runs/33266213814) | Passed final commit `efae2cc` in the aggregate gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                                                                                              |

Hosted application-shell proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                             |  Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------ | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99136655862` | `coredrill-app-shell-chrome-151.0.7922.138-efae2cc3c69a8a5aaa432eb9c506d22d59d26f98` | `9718746086` | `ce38e4a1e2236dc1c63762e7942de52160350f87c78dfeda2a5e2044bcc2d435` |
| Chrome 152.0.7977.54  | `99136655940` | `coredrill-app-shell-chrome-152.0.7977.54-efae2cc3c69a8a5aaa432eb9c506d22d59d26f98`  | `9718748051` | `fe3788936ffebe608dfc730294751dce1c8bf9cb98e7b09a193d062a60ca86ac` |

Both immutable artifacts expire on 2026-09-28. This committed report, component
tests, browser suite, and deterministic synthetic Board model remain reproducible
after hosted retention ends.

## Dependency and policy status

This slice adds no dependency. The dependency inventory remains version 1.17 with
47 direct dependencies, 621 audited npm resolutions (82 optional), zero known npm
vulnerabilities, 354 reviewed JavaScript license records, and 498 reviewed Rust
crates. The lockfile SHA-256 remains
`60c3e35de7f71cc0bc4bb877d35c9f0312d89e1b92d0700b752fd844a8ff293b`.

The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all already reviewed and allowlisted; this slice adds no Rust dependency.

## Implementation surfaces

- `packages/ui/src/pipeline-board.tsx` - validated semantic stages, contextual card
  model, virtualized columns, native and pointer move paths, live announcement, and
  Undo surface.
- `packages/ui/styles.css` - fixed-height virtual rows, local Board overflow,
  contextual cards, wrapping warning chips, responsive layout, reduced motion, and
  forced-colors treatment.
- `apps/web/src/app-shell.tsx` - deterministic candidate stages, normal and
  large-column fixtures, typed move/reopen behavior, timeline-event counters, and
  reversal-aware Undo proof host.
- `packages/ui/test/pipeline-board.test.tsx` - frozen vocabularies, minimum context,
  virtualization metadata, announcement/Undo, and invalid-model tests.
- `e2e/app-shell.spec.mjs` - keyboard and pointer moves, ARIA snapshot, axe,
  fail-closed reopen, Undo, large-column virtualization, request ledger,
  screenshots, and responsive proof.
- `.changeset/pipeline-board-interactions.md` - UI/web change record.

## Boundaries and remaining work

- The shared UI consumes immutable view models and emits typed move intent. It does
  not own canonical records, write timeline events, persist Undo state, expose SQL,
  or perform network requests.
- The browser host's stage names are synthetic candidates. `Q-006` remains open,
  and this slice does not claim participant validation or lock configurable stage
  names.
- Product composition must route ordinary moves, terminal-stage confirmation, and
  reversal through the accepted application and SQLite boundaries. User-confirmed
  values and provenance remain protected by those boundaries.
- D-011 remains satisfied: Board stays the initial Pipeline presentation and Table
  remains a first-class peer over the same record scope. No opaque ATS or hiring
  probability score was introduced.
- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, zoom, screen-reader, pointer-alternative, and
  representative-participant gates remain assigned to dedicated accessibility and
  user-research items.
- `UI-007` is next for the virtualized Table, pinned/configurable columns, safe
  inline editing, and E2E/performance proof.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
