# Production first-run composition verification

Date: 2026-10-19. Scope: `Q3-005` production startup prerequisite; **not milestone closure**.

## Implemented boundary

- Normal root inspects/opens the selected browser/native SQLite identity before mounting saved-data views. No implicit identity seed or alternate-runtime fallback.
- Explicit safe defaults create `My job search`; Quick start saves a validated capture for separate Inbox review; Guided setup names the current host vault while unavailable optional actions remain disabled.
- Completion awaits acknowledgement. Failures retain input and acknowledged vault progress; retries inspect the current identity and do not rename/replace it. Unsaved-input unload warning is best-effort browser behavior, not crash recovery or automatic saving.
- Demo data is transient. SQLite remains canonical; the optional localStorage recovery hint contains only `true`, never identity or career data. Missing identity with that hint requires explicit recovery review.
- Actual vault name/observed health replace reference facts. Passive Settings refresh does not request persistence permission.

## Focused evidence

- `pnpm exec vitest run tooling/tests/first-run-commit.test.mjs tooling/tests/vault-lifecycle.test.mjs packages/ui/test/first-run.test.tsx`: 3 files / 23 tests pass.
- Focused resilience run for `native-runtime`, `stored-pipeline-navigation`, and `stored-vault-deletion`: 5 tests pass. These use real UI initialization rather than a seeded identity. Native success uses the real isolated Rust SQLite process through the simulated host; failure never falls back to browser storage.
- All five direct production setup journeys pass: Quick start through real Inbox acceptance/Table discovery/offline reopen/health refresh; held capture failure after vault acknowledgement and retry with exact identity; host-locked Guided setup; preservation of an explicitly prepared prior unidentified capture alongside an inert pasted-markup capture; demo isolation and missing-identity recovery review. The Quick start journey records zero external requests, page exceptions and persistence-permission requests.
- Quick review has zero axe violations and no horizontal overflow at 320 pixels. Its captured screenshot was visually inspected: content, summary and actions remain readable without clipping. This is not full manual assistive-technology conformance.
- Prior committed bootstrap/lifetime checkpoint `a4d5a0e` completed [hosted run 39300745263](https://github.com/seabAu/Coredrill/actions/runs/39300745263) successfully. That run does not verify this uncommitted setup slice.

## Final-source local gate

`pnpm verify` exits 0. The retained local log is `test-results/production-first-run-verify.log` (ignored; reproduce with the repository command).

- Format, architecture boundaries, foundation records, 34 typecheck tasks, 22 package lint tasks and tooling lint pass.
- Unit and coverage runs each pass 136 files / 1,099 tests.
- Build, contrast/extraction reports, extension build/package inventory and contract-schema drift checks pass.
- Browser suites pass: 6 UI foundations, 76 shell/capture/review, 1 diagnostic performance, 19 resilience (including all five production setup journeys), 7 separate onboarding/reference cases, 13 document and 9 storage cases.
- Fourteen actual native adapter tests pass. Rust core passes 14 tests with one separately run platform-secret lifecycle test; the redacted Windows Credential Manager harness, archive atomicity/recovery and managed-backup proof all pass.
- License checks pass for 520 npm packages and 498 crates; secret scan passes. npm reports no known vulnerabilities. Cargo retains the same ten reviewed allowed warnings, not a zero-warning claim. Changeset validation passes.
- Separate `pnpm test:extension-transfer` passes all nine cases, including normal setup after an already acknowledged real extension capture, reload and confirmed-field preservation. Retained local log: `test-results/production-first-run-extension.log`.

An early attempt caught lint issues and a paste test clicking a label-covered radio input. The final code passes lint and the test uses the visible label with a checked-state assertion; no forced click or product bypass was introduced.

## Fresh Windows package regression

`pnpm --filter @coredrill/desktop build:installer:windows` and `pnpm test:native-package` exit 0. The guarded test refuses to replace an existing installation, uses the confined diagnostic storage root, removes its temporary installation and preserves application data.

- Installer: 4,152,530 bytes; SHA-256 `0febaef19bc5f6d590f3e26ac3d2e3098a286eb2ca807f9746950471d16f376c`.
- Twenty measured launches, no failed run; page-load p95 609.3 ms, working-set p95 375,828,480 bytes.
- Local artifact: `apps/desktop/src-tauri/target/nat007/native-package-proof.json`; log: `test-results/production-first-run-package.log`.
- Diagnostic/page-load measurement only: `targetConformant` remains false. This is not reference-hardware, workspace-ready timing, signing, distribution or a complete installed first-run workflow acceptance claim.

## Changed surfaces and remaining limits

Runtime composition is in `apps/web/src/main.ts`, `stored-vault-root.tsx`, `first-run-commit.ts`, `vault-lifecycle.ts`, `vault-presentation.ts`, `app-shell.tsx` and `stored-vault-settings.tsx`. Shared setup is in `packages/ui/src/first-run.tsx`; `onboarding.tsx` labels the reference catalog explicitly. Unit/browser tests, real-setup helpers for existing journeys, the Changeset and design/checklist/proof records accompany the implementation.

Clean-commit hosted verification remains. No schema, dependency, permission or Accepted decision changes. Optional setup integrations, connected recovery/backup Settings, durable Pipeline mutations, remaining stored subviews and the entirely unseeded canonical Phase 3 journey remain unfinished. `Q3-005` stays unchecked.
