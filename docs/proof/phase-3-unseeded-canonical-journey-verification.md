# Phase 3 unseeded canonical journey — verification

Date: 2026-10-19. Checklist `Q3-005` is complete at clean-commit hosted checkpoint `9ffc13e`; `GATE-3` and the overall product goal remain open.

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

## Hosted completion and remaining gates

The [ordering repair](requirement-review-ordering-verification.md) deterministically reproduces enabled dependent controls during a held evidence write, then protects both write/readback windows with per-job pending coordination. The canonical test retains the exact manual Partial assertion, adds explicit command failure/retry, pending 320-pixel frame replacement and exact `user-confirmed` decision equality after reload. Complete final-source verification exits 0 with 145 files / 1,168 unit tests and all 24 resilience plus browser/native/recovery/policy checks. All nine extension tests separately pass against built app assets without suppressing real transport errors. Fresh hosted proof remains; these local results do not rewrite the failed run below.

Commit `986e2528618d71252c849cddc88927c137e8a420` is pushed. Hosted [run 39344803133](https://github.com/seabAu/Coredrill/actions/runs/39344803133) is terminal failure: exact Chrome 151/152 and aggregate all show automatic Partial instead of the requested explicit manual Partial at line 149 (22 other resilience cases pass in each). The test immediately chooses coverage after selecting evidence. Pending-action/read-refresh ordering in normal requirement review needs deterministic investigation; no assertion or timeout is relaxed. The extension lane independently fails a local test-server `route.fetch: socket hang up` (eight passed / one failed). Native Windows/macOS/Ubuntu, exact Firefox and secret lanes pass. Failure logs remain under `test-results/unseeded-hosted-*-failure.log`. Subsequent local full verification of the Overview/Company slice still passes this unchanged canonical test; that does not supersede the hosted failure.

Clean commit `9ffc13e1f0ecc3300f597f4b92769e544b9047c7` passes every required job in [run 39348202319](https://github.com/seabAu/Coredrill/actions/runs/39348202319). Exact successful logs are inspected for both Chrome lanes and aggregate: the named unseeded journey passes, with all 24 resilience cases in each. Local retained witnesses are `test-results/canonical-repair-hosted-{chrome151,chrome152,aggregate}-success.log`. Extension transfer and exact Firefox, Windows/macOS/Ubuntu package/security and secret lanes also pass. This supplies the previously missing clean-commit proof for the exact import → confirmation → comparison → preparation → local Applied → immutable retrieval journey, with explicit provenance, no confirmed overwrite, offline/AI-disabled/zero-egress, exact version/artifact hashes, reflow and accessibility assertions. `Q3-005` is complete; the old failed run remains failed. This is not an installed-native full resume-import claim or human usability/accessibility study.

Keep `GATE-3` open for `Q3-002` representative-user validation. Independent human/reference-device gates and the overall product goal also stay open; normal Source/activity/recovery and later AI/salary/discovery/beta work are not completed by this journey.
