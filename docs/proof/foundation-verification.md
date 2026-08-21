# Phase 0 foundation verification

Date: 2026-08-21  
Scope: `FND-001` through `FND-008` only  
Branch: `main`  
Initial foundation commit: `982aaa5dd125491d00d834dd2c15aa499496d907`  
Privacy-default follow-up: `03b9274`  
Verified hardening commit: `abb854be9d26af7c2b1f2b6fef53745f0e79c295`

## Outcome

| Item      | Result  | Evidence                                                                                                                                                                                                              |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FND-001` | Blocked | Every required governance path exists and was reviewed, but the public license and durable private security/conduct reporting address remain owner decisions under `Q-013`. The temporary `LICENSE` grants no rights. |
| `FND-002` | Proven  | Exact pnpm workspace and lockfile installed and built from an isolated clone of `abb854b`; 19 package builds passed.                                                                                                  |
| `FND-003` | Proven  | Approved parent directories and 19 decoupled package boundaries exist; the architecture checker passed all 19 policies. Product runtimes contain reservation documents only.                                          |
| `FND-004` | Proven  | Strict TypeScript project references passed for all 19 packages. Seven unit tests include both accepted dependency graphs and intentional forbidden-import fixtures.                                                  |
| `FND-005` | Proven  | Formatting, lint, unit, coverage, build, and Git-history affected-task paths passed locally.                                                                                                                          |
| `FND-006` | Blocked | The workflow is configured and its local equivalent passes, but this repository has no GitHub remote from which to produce the required green workflow URL.                                                           |
| `FND-007` | Proven  | Changesets 3.0.1 parses the real sample patch changeset; release-note and migration-note templates are present.                                                                                                       |
| `FND-008` | Proven  | The ADR index, ADR template, and accepted-baseline ADR link each adopted decision back to the repository-local design kit. Provisional and deferred choices remain visibly excluded.                                  |

## Reviewed repository evidence

Governance:

- [`README.md`](../../README.md), [`AGENTS.md`](../../AGENTS.md), [`SECURITY.md`](../../SECURITY.md), [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md), [`SUPPORT.md`](../../SUPPORT.md), and the temporary [`LICENSE`](../../LICENSE).
- The complete supplied design authority is preserved under [`docs/design/job-workspace-design-kit`](../design/job-workspace-design-kit/README.md), with provenance in [`docs/design/README.md`](../design/README.md).
- No product feature, database implementation, scraper, AI integration, hosted service, Python worker, or broad extension permission was added.

Workspace and boundaries:

- Reserved entry points: `apps/web`, `apps/desktop/src-tauri`, and `apps/extension`.
- Shared layers: 19 packages under `packages/`, each with a manifest, strict project reference, and public source entry point.
- Durable-data, test-input, decision, and check ownership is explicit under `migrations/`, `fixtures/`, `docs/`, and `tooling/`.
- [`package-boundaries.mjs`](../../tooling/architecture/package-boundaries.mjs) is the explicit allowlist; [`check-boundaries.mjs`](../../tooling/architecture/check-boundaries.mjs) checks references, manifests, declared dependencies, imports, relative cross-package imports, and production use of test fixtures.
- [`invalid-boundary`](../../tooling/fixtures/invalid-boundary/packages/domain/src/bad.ts) and [`mixed-boundaries`](../../tooling/fixtures/mixed-boundaries/packages/application/src/bad.ts) are synthetic violation fixtures exercised by [`import-boundaries.test.mjs`](../../tooling/tests/import-boundaries.test.mjs).

Release and decision records:

- [Sample Changeset](../../.changeset/foundation-scaffold.md), [Changesets configuration](../../.changeset/config.json), [release-note template](../runbooks/release-note-template.md), and [migration-note template](../runbooks/migration-note-template.md).
- [ADR index](../adr/README.md), [ADR template](../adr/0000-template.md), and [accepted design baseline ADR](../adr/0001-adopt-design-baseline.md).

CI and privacy defaults:

- [`foundation.yml`](../../.github/workflows/foundation.yml) uses full-history checkout, exact Node/pnpm activation, frozen install, the complete local gate, license inventory, a digest-pinned Gitleaks image, and a commit-pinned public-repository dependency review.
- Workflow permissions default to read-only. The dependency-review job is not represented as an enforcement substitute for private repositories.
- Repository Turborepo scripts set `DO_NOT_TRACK=1` and `TURBO_TELEMETRY_DISABLED=1`; CI sets the same environment and the update notifier is disabled. This follows Turborepo's documented opt-out and the product's telemetry-off baseline.

## Clean-clone proof

An isolated clone was created outside the repository working tree at `.proof/final-clean-clone` and checked at `abb854be9d26af7c2b1f2b6fef53745f0e79c295`.

| Command                          | Runtime                             | Exit | Result                                                                |
| -------------------------------- | ----------------------------------- | ---: | --------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Node 24.19.0; pnpm 11.22.0          |    0 | Lockfile already current; 302 packages resolved from the exact graph. |
| `pnpm build`                     | Turborepo 2.10.11; TypeScript 6.0.3 |    0 | 19 of 19 package builds passed.                                       |

The disposable clone was removed after its commit and command results were recorded here; no source or user data was deleted.

## Local gate results

All commands used the pinned Node 24.19.0 and pnpm 11.22.0 runtime unless a row states otherwise.

| Command                          | Exit | Result                                                                                                                                   |
| -------------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` |    0 | Exact dependency graph installed.                                                                                                        |
| `pnpm format:check`              |    0 | All files in the configured Prettier scope matched.                                                                                      |
| `pnpm check:boundaries`          |    0 | 19 package policies passed.                                                                                                              |
| `pnpm typecheck`                 |    0 | 19 of 19 strict TypeScript projects passed.                                                                                              |
| `pnpm lint`                      |    0 | 19 package tasks plus repository tooling passed with zero warnings.                                                                      |
| `pnpm test:unit`                 |    0 | 2 files and 7 tests passed, including expected boundary rejection and secret-pattern cases.                                              |
| `pnpm test:coverage`             |    0 | Statements 93.87%, branches 85.89%, functions 100%, lines 97.84%; configured thresholds passed.                                          |
| `pnpm build`                     |    0 | 19 of 19 package builds passed.                                                                                                          |
| `pnpm check:licenses`            |    0 | 299 dependency records matched the reviewed permissive-license policy; unknowns fail closed.                                             |
| `pnpm check:secrets`             |    0 | No configured credential or private-key pattern found in the scanned repository files.                                                   |
| `pnpm audit:dependencies`        |    0 | No known dependency vulnerabilities reported at the high-or-greater gate.                                                                |
| `pnpm changeset:status`          |    0 | Sample changeset requests patch releases for `@job-workspace/application` and `@job-workspace/contracts`.                                |
| `pnpm check:affected -- HEAD^`   |    0 | 19 builds, 21 typecheck/prerequisite tasks, 19 lints, and tooling lint passed; no related tests was accepted only for this affected run. |
| `pnpm verify`                    |    0 | Complete aggregate local foundation gate passed.                                                                                         |

The built-in secret matcher is a fast local guard, not a claim of full-history coverage. The configured CI job supplies the separate full-history Gitleaks scan once the repository is hosted.

## Decision and scope review

No Accepted design decision changed. [`0001-adopt-design-baseline.md`](../adr/0001-adopt-design-baseline.md) imports the supplied Accepted decisions into repository governance; it does not promote provisional or deferred decisions. Exact tool versions are pinned for reproducibility, but the broader maintainer/advisory inventory remains the separate `FND-009` slice.

## Remaining actions

1. Continue with the unblocked `FND-009` and `FND-010` slice; do not begin product features as part of that foundation follow-up.
2. Independently, the owner selects the public license and durable private security/conduct reporting route, then replaces the temporary governance wording and closes `FND-001`.
3. Independently, add a GitHub remote, push `main`, run `Foundation CI`, and link a green workflow URL before closing `FND-006`.
