# Phase 3 unseeded canonical journey — verification in progress

Date: 2026-10-19. Checklist `Q3-005` remains open pending full and hosted verification.

## Scope and trust boundary

The existing scaffolded canonical regression remains unchanged. The new `e2e/phase-3-unseeded-journey.spec.mjs` starts at the normal `/` route, completes real vault setup and proves zero initial jobs, documents and manual Career Profile entries. It installs no reference fixture and uses no direct SQL or successful write-API shortcut. Every new source, confirmed fact, requirement, application/stage, document/copy, selected set, export, submitted snapshot and later document version is created through ordinary UI controls. Read-only application queries inspect durable witnesses.

The complete path is: local synthetic DOCX import → explicit manual fact confirmation → merge imported employment provenance without overwriting that fact → manual capture/review of one job → accept its retained-source requirement → explicitly select evidence/Partial coverage → create a user-named preparation stage/attempt → create reusable resume and cover letter plus exact saved-version job copies → generate a truthful template-only child → deliberately select exact versions → download/retain DOCX → explicitly record a resume/plain-text and cover-letter/file submitted set → create a different later cover-letter version through the editor → reload and retrieve the unchanged submitted set.

This journey has no application-answer selection; the retained scaffolded regression separately covers the three-item resume/cover-letter/answer case. AI remains disabled and no application is uploaded, sent or represented as received. Source imports remain proposals until explicit review. The final UI continues to show unevaluated claims rather than evidence-verification certification.

## Assertions and artifacts

- Imported file SHA-256 and byte length match the supplied committed synthetic fixture; all proposals retain source pointers/excerpts. The reviewed manual entry and imported-source metadata remain unchanged after merge and reload.
- The single requirement retains its exact listing excerpt, line-two pointer, source/current categories and explicit confirmation. One deliberately selected canonical evidence identity remains selected after reload; retained listing text is unchanged.
- Both job copies retain the exact reusable source-version origin and content hash. The template child contains the actual role, company and reviewed evidence text, with AI-disabled/evidence identity feedback.
- Download bytes are independently hashed. The retained artifact metadata and frozen snapshot use that exact hash, immutable document versions and purpose-qualified identity. The test checks retained identity after reload; it does not claim a new physical attachment readback/portable-restore drill. Those boundaries retain the separate `DOC-008` cross-adapter proof.
- A later UI-created child has the submitted cover version as its parent and different content/hash. It cannot replace the submitted set. The actual application channel, applied time and selected identities remain bound to the snapshot, while the normal Timeline reports the two real preparation/Applied events.
- The final vault has one job and four manually created/copied documents. No reference-catalog data is substituted. Offline/reload, zero external requests/page errors, 320-pixel overflow and automated axe assertions are included.

The Playwright report contains the `phase-3-unseeded-canonical.json` attachment with exact synthetic source/evidence/requirement/version/artifact/snapshot identities, plus `unseeded-submitted-set-320.png`. Local report/artifacts are under `test-results/resilience.json` and `test-results/resilience/phase-3-unseeded-journey-a-6a1c7-table-submitted-set-offline/`.

## Iteration evidence

The first run reached document preparation but timed out on an exact wrapped-label text locator. The rendered accessible combobox existed; the test now uses its exact accessible role/name. No product behavior or assertion was removed. The second run passes the entire journey in 6.7 seconds (`test-results/phase-3-unseeded-second.log`). Strengthened witnesses initially used the SQL-style `submittedAt` name rather than the public snapshot DTO's `appliedAt`; that test error was corrected while retaining exact cross-projection timestamp equality.

The strengthened focused case passes in 6.1 seconds (`test-results/phase-3-unseeded-strengthened.log`), including proposal-only import, exact original-file metadata, preserved confirmed truth, current/submitted/later-version distinctions, application identity/time/channel/selections, four user-created/copied documents and the two actual Timeline events. No timeout was increased; the new case also uses a bounded ten-second action timeout within its original 120-second whole-journey budget.

No runtime, dependency, schema, permission or Accepted decision changes are required by this proof-only slice, so no package Changeset or ADR is added. This browser journey is not an installed-native full import workflow, representative-user study or manual assistive-technology claim.

## Full local verification

`pnpm verify` exits 0 with `UNSEEDED_CANONICAL_VERIFY_EXIT=0` retained in `test-results/phase-3-unseeded-full-verify.log`. No source/fixture changes occurred during the run. Process-local `VITEST_MAX_WORKERS=4` changes scheduling only, not assertions, coverage, policy or timeouts.

- Unit and coverage: 142 files / 1,157 tests.
- Formatting, build, typecheck, lint, architecture/foundation records and generated reports pass.
- Browser suites: seven UI foundations, 76 shell, one performance, 23 resilience (including both canonical journeys), seven onboarding, 13 documents and nine storage cases pass.
- Native core: 14 passed / one intentionally ignored; all 14 native adapter cases and secure-store/archive/backup proofs pass. This does not turn the browser canonical journey into a native-import UI claim.
- Licenses cover 520 npm packages / 498 crates. Secret scan and Changesets pass. npm reports no known vulnerabilities; Cargo retains ten allowed warnings.

The narrow submitted-set artifact was visually inspected: the selected older cover letter remains identified separately from the later current version, the hash/IDs wrap, and the UI labels the snapshot as a local record rather than employer receipt. Automated overflow/axe checks pass; this is not manual accessibility acceptance.

Predecessor Timeline checkpoint `d6a130cc077c68963f8d290632a476f2d20f1952` passes every required hosted job in [run 39341919878](https://github.com/seabAu/Coredrill/actions/runs/39341919878). That verifies the Timeline/query source and isolated focus test, not this subsequent unseeded test.

## Remaining closure

Obtain clean-commit hosted verification of the unseeded case and then assess `Q3-005` against its exact proof requirements. Keep `GATE-3`, independent human/reference-device gates and the overall product goal open; remaining normal workspace/activity/recovery and later AI/salary/discovery/beta work are not completed by this test.
