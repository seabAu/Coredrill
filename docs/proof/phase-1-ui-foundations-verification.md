# Phase 1 interface-foundations verification

Date: 2026-08-29

Checklist scope: `UI-001`

Packages: `@coredrill/ui`, `@coredrill/web`

Decision changes: none

## Outcome

`UI-001` establishes the shared visual and interaction foundations used by the
browser and native shells. Implementation commit `a95880d` adds versioned
light/dark/system theme preferences, comfortable/compact density, semantic CSS
custom-property tokens, a local system typography stack, a constrained Lucide
icon wrapper, visible focus treatment, 44-pixel minimum controls, reduced-motion
and reduced-data handling, and forced-colors support.

The standalone interface catalog exercises those foundations without network
or font requests. Theme and density are explicit root attributes rather than
canonical application data; invalid persisted values fail closed to reviewed
defaults. Semantic icons require an accessible label, decorative icons are
hidden from accessibility APIs, and neither form an independent keyboard stop.

## Component-catalog and contrast proof

The deterministic
[`ui-foundation-contrast-report.json`](artifacts/ui-foundation-contrast-report.json)
checks 22 normal-text and non-text pairs across both resolved themes against
WCAG 2.2 AA thresholds. All 22 pass. The minimum measured ratio is `3.29:1` for
the light-theme border on a surface, above its `3:1` non-text requirement; the
minimum normal-text pairs exceed `4.5:1`.

The Playwright catalog suite retains full-page screenshots and axe JSON for the
reviewed catalog states. It proves:

- zero automated axe violations in light/comfortable and dark/compact states;
- keyboard-visible focus and no independent icon tab stops;
- disabled transitions and animation under reduced motion;
- usable Windows forced-colors behavior; and
- no horizontal clipping at a 360-pixel mobile viewport.

Visual review of the retained light, dark, and forced-colors/mobile screenshots
confirmed readable hierarchy, complete content, visible controls, and no
viewport overflow.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | Passed for all 23 workspace projects with the reviewed lockfile.                                                                                                                                                                                                                                                                                    |
| `pnpm test:ui-foundations`                                                                    | Passed all 5 exact-Chromium catalog/accessibility cases and retained screenshots plus axe JSON.                                                                                                                                                                                                                                                     |
| `pnpm test:unit`                                                                              | Passed 39 files and 422 tests, including 8 interface-foundation unit/component cases.                                                                                                                                                                                                                                                               |
| `pnpm test:coverage`                                                                          | Passed at 90.53% statements, 81.97% branches, 98.02% functions, and 93.45% lines overall; `@coredrill/ui` reported 100% statements/functions/lines and 87.5% branches.                                                                                                                                                                              |
| `pnpm verify`                                                                                 | Passed with exit code 0 across formatting, architecture, foundation records, typecheck, lint, unit/coverage, 22-package build, deterministic contrast drift, UI browser proof, extension packaging/transfer, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33253836595](https://github.com/seabAu/Coredrill/actions/runs/33253836595) | Passed implementation commit `a95880d` in the aggregate gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native package lanes, extension transfer/reproducibility, and the full-history secret scan.                                                                                                                      |

Hosted Chrome proof is retained for both tested browser versions:

| Browser               |           Job | Artifact                                                                                  |  Artifact ID | SHA-256                                                            |
| --------------------- | ------------: | ----------------------------------------------------------------------------------------- | -----------: | ------------------------------------------------------------------ |
| Chrome 151.0.7922.138 | `99104029412` | `coredrill-ui-foundations-chrome-151.0.7922.138-a95880d79050748bfa6805c297ffa31b98acc338` | `9715199986` | `77b189ac4644fc4c77c8fae5c218ba5890159a8396750031af6264ba696fcb28` |
| Chrome 152.0.7977.54  | `99104029420` | `coredrill-ui-foundations-chrome-152.0.7977.54-a95880d79050748bfa6805c297ffa31b98acc338`  | `9715201136` | `881ec581bc14afe026f6f75a2b9c891bde55c78d3efe0be4509b29fe16859317` |

Both immutable artifacts expire on 2026-09-28; this committed report and the
deterministic contrast artifact remain reproducible after hosted retention ends.

## Dependency and policy status

The reviewed exact additions are Lucide React 1.35.0 and
`@axe-core/playwright` 4.13.0. The dependency inventory advances to version
1.16 with 43 direct dependencies, 551 audited npm packages (59 optional), zero
known npm vulnerabilities, 353 reviewed JavaScript license records, and 498
reviewed Rust license records. The inventory SHA-256 is
`789446b93c8240d34817c8928ebb17b086aa115562a713b94e6f1cfb901106fa`.

The known Rust audit baseline remains 14 unmaintained and 1 unsound transitive
warning, all already reviewed and allowlisted; this slice adds no Rust dependency.

## Implementation surfaces

- `packages/ui/src/foundations.ts` - preferences, resolved themes, density,
  tokens, parsing, and root attributes.
- `packages/ui/src/contrast.ts` - deterministic WCAG contrast cases and report.
- `packages/ui/src/icon.tsx` - constrained semantic/decorative Lucide wrapper.
- `packages/ui/styles.css` - theme, density, typography, focus, status, motion,
  forced-colors, and responsive foundations.
- `apps/web/src/ui-foundations.tsx` and `apps/web/ui-foundations.html` - local
  interactive catalog.
- `e2e/ui-foundations.spec.mjs` and `playwright.ui-foundations.config.mjs` -
  accessibility, keyboard, preference-media, and mobile proof.
- `tooling/scripts/generate-ui-contrast-report.mjs` - deterministic artifact
  generation and drift check.
- `.changeset/ui-foundation-tokens.md` - public package change record.

## Boundaries and remaining work

- Automated axe checks are necessary regression evidence, not a WCAG conformance
  claim. Manual keyboard, NVDA/VoiceOver, zoom, and participant validation remain
  assigned to the dedicated accessibility and user-research gates.
- The typography stack is deliberately local/system-only, so platform rendering
  varies while privacy and offline operation remain intact.
- The accepted styling direction remains Tailwind CSS plus CSS custom-property
  tokens. This narrow foundation establishes the canonical tokens directly in
  CSS; Tailwind utility integration begins with real product composition in
  `UI-002` rather than adding an unused framework layer here.
- `UXR-004` through `UXR-008` remain blocked on owner-authorized representative
  participants, and `FND-001` remains independently blocked on durable private
  conduct and vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed. The implementation
  realizes the existing theme, density, open-icon, accessibility, offline, and
  local-first decisions.
