# Manual reusable document creation

Date: 2026-10-19  
Checklist scope: production-creation integration under `Q3-005`  
Status: complete local verification; clean-commit hosted verification pending

## Production path

Documents now offers an explicit New document action for a reusable resume or
cover letter. A validated application command accepts only a bounded title,
kind, and manual initial text. The accepted document normalizer supplies
canonical IR 1 and derived plain text; the SHA-256 binds the serialized IR just
as it does for later editor versions. The SQLite adapter atomically creates
the document, base lineage, and first immutable version. It opens the existing
editor only after commit and never selects the version for a job/application.

Blank first versions are allowed. The browser witness exposed a pre-existing
empty-block normalization bug: an absent inline-content property became an
own property with value `undefined`, which is not JSON. Normalization now omits
that absent property instead of weakening JSON validation. Serialized JSON and
its hash are unchanged for existing equivalent empty blocks; the IR schema and
version remain unchanged. Regression tests cover empty paragraphs and headings
with absent and empty inline arrays.

The form uses explicit labels and native controls, prevents concurrent submits,
retains entered values on failure, and allows cancellation. A committed
creation is not reclassified as failed merely because a later list refresh
fails. Manual text remains user-authored content, not verified career evidence,
import provenance, generated material, an application selection, or a submitted
snapshot. Answers retain the existing sensitivity-aware Answer Library path.

## Executable proof

The focused unit run passes three files / 26 tests: malformed and oversized
input, unexpected fields, unsupported kind, empty initial text, invalid
normalizer/hash/identity output, content-free failures, canonical empty blocks,
actual SQLite creation, and rollback. The rollback test forces an existing
immutable-version ID conflict after document and lineage insertion and proves
neither new row survives while the old version remains intact.

`e2e/document-creation.spec.mjs` runs in the production-build resilience suite.
It starts with an empty document library and does not install any reference
fixture. After service-worker installation it stays offline while it:

1. Opens New document and enters a synthetic resume containing literal markup.
2. Injects a one-shot UI failure (not a production storage substitute), proves
   all entered values remain, checks axe and 320-pixel reflow, then restores the
   real application API before retry.
3. Creates the reusable resume through the real command and SQLite repository,
   opens its editor, independently recomputes its canonical IR hash, and reloads
   the exact first-version history and identity.
4. Creates and reloads a blank reusable cover letter the same way.
5. Reads the real library and proves both records are reusable, unrelated to
   any job, not submitted, and explicitly claim-unevaluated.

The test emits `DOCUMENT_CREATION_PROOF`, attaches the version/hash witness and
the narrow-screen screenshot, and rejects/counts external requests (zero).
The document and browser-storage suite configs now use disjoint child output
directories instead of Playwright's root-cleaning default. A tooling regression
checks every suite's output confinement and non-overlap, so later verification
suites cannot silently delete the earlier creation/resilience artifacts.
The normalizer and creation code add no dependency, schema migration,
permission, network capability, account requirement, or Accepted decision
change. A Changeset records the new package behavior and empty-block repair.

## Remaining boundary

The full `pnpm verify` gate passed with 121 unit files / 924 tests and coverage,
33 typecheck tasks, 22 lint/build tasks, all 76 app-shell journeys, five
resilience journeys, seven onboarding, 13 document-browser, eight browser-storage,
13 native TypeScript and 11 Rust tests, secure-store/archive/backup proof,
schemas/reports, package inspection, license/secret/advisory and Changeset checks.
The final output-directory guard was then added: the final complete unit run
passes 122 files / 925 tests, and tooling lint passes. The three affected
browser suites passed again in order (five resilience, 13 document, eight
storage tests), with the earlier screenshots and JSON reports retained after
the output-directory changes. The form's final token-based control styling is
verified by another five-test resilience run and narrow-screen visual review.
npm reports no known vulnerabilities; the same
ten reviewed Cargo informational warnings remain.

This is browser production-composition and Node SQLite proof, not a claim that
the new UI has completed native-platform or representative-user validation.
The aggregate gate still runs the existing browser/native repository and
recovery suites. Clean-commit hosted verification remains required.

`Q3-005` remains open. Its full journey still needs production application-attempt
and job-derivative/document-set creation, replacement of the seeded starting
records, and a normal-user tracker composition audit. Human evidence and
publication blockers remain independently open.
