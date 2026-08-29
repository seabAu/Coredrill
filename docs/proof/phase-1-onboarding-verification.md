# Phase 1 first-run experience verification

Date: 2026-08-29

Checklist scope: `UI-003`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-003` establishes Coredrill's accountless first-run UI contract. Implementation
commit `1c149ca` adds a shared `FirstRunExperience` with Quick start, Guided setup,
and a separate disposable demo-vault path. Proof-strengthening commit `18cc4d6`
adds an explicit browser assertion that both first-run tracks can finish later and
converge on Home.

Quick start explains device-local browser or desktop scope, creates a named vault
with safe defaults, accepts one manually entered, pasted, or user-invoked captured
job, presents a review step, defers Career Profile collection, and emits a typed
completion targeting the job Overview. Guided setup presents six skippable steps:
device scope, vault and backup intent, optional imports, evidence-proposal review,
AI mode, and extension intent. AI is disabled by default, no key is collected, and
the completed guided path targets Home.

The disposable demo contract is frozen as session-only, synthetic version 1, and
isolated from the user vault. Its three fictional jobs occupy a dedicated demo
state slot. Opening or discarding it does not create or mutate user-vault state,
and starting an owned vault first discards the demo state.

## Path, isolation, and accessibility proof

The Playwright onboarding suite retains screenshots and axe JSON while exercising
seven reviewed scenarios:

- the chooser explains device-local storage, offline use, optional AI, no account,
  both tracks, demo exploration, and whole-setup deferral;
- Quick start creates one confirmed manual job, defers Career Profile collection,
  preserves a typed completion, and opens the job Overview locally;
- Quick start and Guided setup each exercise `Finish later`, retain no user or demo
  vault record, and converge on Home;
- Guided setup records desktop scope, optional device lock, backup intent, two
  import intents, evidence-review semantics, AI-disabled mode, and extension-pair
  intent before converging on Home;
- every Guided setup decision can be skipped while retaining the safe defaults of
  browser-local scope, backup reminder, no imports, AI disabled, and extension
  pairing deferred;
- the disposable demo exposes exactly three synthetic records, remains isolated
  from user state, and is absent before an owned vault starts; and
- a 320-pixel compact layout under forced colors and reduced motion reflows without
  horizontal overflow.

The chooser, demo vault, Quick completion, dark Guided completion, and forced-color
mobile artifacts were visually reviewed. They retain readable hierarchy, named
storage scope, visible actions, and content reflow. Every axe-reviewed state reports
zero automated violations. Request ledgers around the chooser, Quick path, and
Guided path report zero requests outside the local test origin.

Component tests separately freeze the exact track, runtime, job-method, AI-mode,
guided-step, safe-default-name, and disposable-demo contracts, plus the chooser's
accountless and local-first copy.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | Passed for all 23 workspace projects with the unchanged reviewed lockfile in every hosted execution lane.                                                                                                                                                                                                                  |
| `pnpm exec vitest run packages/ui/test/first-run.test.tsx`                                    | Passed 1 focused component file and 3 contract tests.                                                                                                                                                                                                                                                                      |
| `pnpm test:onboarding`                                                                        | Passed all 7 local-first path, deferral, isolation, accessibility, request-ledger, and responsive scenarios.                                                                                                                                                                                                               |
| `pnpm test:coverage`                                                                          | Passed 41 files and 429 tests at 86.96% statements, 77.45% branches, 89.38% functions, and 89.69% lines overall.                                                                                                                                                                                                           |
| `pnpm --filter @coredrill/web build`                                                          | Passed and emitted the onboarding entry plus existing application entries.                                                                                                                                                                                                                                                 |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, dependency records, typecheck, lint, unit/coverage, 22-package build, all UI browser proofs, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33262252764](https://github.com/seabAu/Coredrill/actions/runs/33262252764) | Passed final commit `18cc4d6` in the aggregate gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                                      |

Hosted onboarding proof is retained for both tested Chrome versions:

| Browser               |           Job | Artifact                                                                              | Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99126116522` | `coredrill-onboarding-chrome-151.0.7922.138-18cc4d645007a79c209de567f806d42d38c9367e` |  9717607596 | `550132534ceadaa2726f0971e96626111cad78d29e90d3fcca9f09ad766ede16` |
| Chrome 152.0.7977.54  | `99126116509` | `coredrill-onboarding-chrome-152.0.7977.54-18cc4d645007a79c209de567f806d42d38c9367e`  |  9717602009 | `2be69739003e7b0c0860cfa672a487aa704f459441633ab227749d756cb71c47` |

Both immutable artifacts expire on 2026-09-28. This committed report, component
tests, browser suite, and deterministic synthetic catalog remain reproducible after
hosted retention ends.

## Dependency and policy status

This slice adds no dependency. The dependency inventory remains version 1.17 with
47 direct dependencies, 621 audited npm resolutions (82 optional), zero known npm
vulnerabilities, 354 reviewed JavaScript license records, and 498 reviewed Rust
crates. The lockfile SHA-256 remains
`60c3e35de7f71cc0bc4bb877d35c9f0312d89e1b92d0700b752fd844a8ff293b`.

The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all already reviewed and allowlisted; this slice adds no Rust dependency.

## Implementation surfaces

- `packages/ui/src/first-run.tsx` - typed first-run states, completion contracts,
  Quick start, Guided setup, and disposable demo-vault behavior.
- `packages/ui/styles.css` - desktop/mobile composition, semantic states, responsive
  reflow, focus, reduced-motion, and forced-colors behavior.
- `apps/web/src/onboarding.tsx`, `apps/web/src/onboarding.css`, and
  `apps/web/onboarding.html` - deterministic local proof composition with separate
  demo and user state slots.
- `packages/ui/test/first-run.test.tsx` - frozen contract and chooser semantics.
- `e2e/onboarding.spec.mjs` and `playwright.onboarding.config.mjs` - path,
  deferral, isolation, request-ledger, screenshot, and axe proof.
- `.github/workflows/foundation.yml` - exact-Chrome proof execution and immutable
  artifact retention.
- `.changeset/first-run-local-paths.md` - UI/web change record.

## Boundaries and remaining work

- The shared UI emits typed completion and navigation events; it does not become
  canonical storage. The browser catalog is a deterministic proof host, so its
  in-memory state is explicitly noncanonical. Product composition must execute the
  emitted result through Coredrill's already-proven application and storage
  boundaries rather than adding UI-owned persistence.
- Backup, optional lock, import, AI, and extension selections record intent for
  later dedicated flows. This screen performs no upload, provider call, credential
  storage, browser surveillance, permission expansion, or extension pairing.
- Demo records are fictional and session-only. The demo request and discard events
  are structurally separate from user-vault completion and can never be submitted
  as user data through this component.
- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, zoom, screen-reader, and representative-participant gates
  remain assigned to the dedicated accessibility and user-research items.
- D-015 remains Provisional until the first-run usability and storage-comprehension
  study is completed. This implementation does not claim to lock its wording.
- `UI-004` is next for Home's attention queue, due actions, recent items, and
  optional snapshot.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
