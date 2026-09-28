# Phase 3 Mark Applied verification

Date: 2026-09-28
Checklist item: `DOC-007`
Implementation commit: `a97c5438eacd7abfca46fd051975f829608ac1cd`
CI-proof alignment commit: `7b7fa0719295077e71681e0b28108ed8aaab624b`
Cross-browser assertion commit: `27c7261d1d8403269ff18269b408562d4b742d23`
Hosted run: [Foundation CI 36387091788](https://github.com/seabAu/Coredrill/actions/runs/36387091788)
Status: complete

## Outcome

Coredrill now presents Mark Applied as a separate, explicit local confirmation.
The action records the application and job status, applied time, channel,
append-only status event, immutable submitted snapshot, and ordered exact
submitted items in one transaction. Each item retains the selected immutable
document version and either its exact locally retained content-addressed export
artifact or an explicit plain-text submission identity.

The workflow does not upload, autofill, submit, contact an employer, or claim
that an employer or external site received anything. It remains accountless,
offline-capable, local-first, and available with AI disabled.

## Transaction and identity proof

- Application operations validate the review, local export metadata, explicit
  confirmation, and returned immutable snapshot at the application boundary.
- DOCX and UTF-8 text exports are retained locally before their content hash,
  media type, byte length, logical name, and purpose-qualified attachment
  identity are recorded. PDF retention validates a user-selected local PDF and
  records its exact bytes; Coredrill never silently substitutes preview bytes.
- Mark Applied validates the application/job/status pair and every selected
  resume, cover-letter, and answer version, plus every selected file relation,
  before updating projections and inserting the event/snapshot/items.
- A forced duplicate-event failure proves that projection updates and snapshot
  writes roll back together. A valid transaction then proves the exact ordered
  version, answer, content-hash, and attachment-purpose identities.
- A repeated Mark Applied action fails with the stable public `conflict`
  result. Database guards also prevent submitted items or their exact file
  relations from being edited or detached.
- Creating a later current document version does not alter the submitted
  snapshot; the UI names the immutable submitted version separately.

No schema migration was required. The flow uses the accepted schema-134–154
application, status-event, attachment, selection, and submitted-snapshot
records. The shared repository contract aggregate is now
`phase-1-repository-contracts-v10` with 26 cases.

## UI and boundary proof

The Job Documents surface requires the user to choose, for each selected
document, either exact plain text or a retained local artifact, choose an
Applied-category status and channel, and check an explicit confirmation. The
completed view names immutable IDs, filenames, formats, and hashes while
stating that the record is local and is not proof of employer receipt.

Automated browser proof covers keyboard operation, axe, 320 CSS-pixel reflow,
reload, later-version immutability, a repeated-action conflict, and zero
external requests. Static UI tests also ensure the receipt disclaimer and
separate confirmation contract remain present.

## Local verification

The complete `pnpm verify` gate passed on Windows with Node 24.19.0 and the
locked dependency graph. Material results included:

- typecheck, lint, builds, generated-schema checks, license policy, secret scan,
  `pnpm audit`, and `cargo audit` policy all passed;
- 118 unit-test files and 899 tests passed, with aggregate coverage of 81.24%
  statements, 74.44% branches, 83.29% functions, and 84.19% lines;
- 75 application-shell journeys passed, including `DOC007_E2E_PROOF` with exact
  submitted versions, one retained DOCX identity, later-version immutability,
  duplicate rejection, and zero external requests;
- eight browser-storage tests passed the v10/26 aggregate, thirteen native
  storage tests passed it through the rusqlite probe, and the native Rust suite
  passed 11 tests with its one platform-only test intentionally ignored;
- document, onboarding, resilience, storage-failure, concurrency, recovery,
  performance, and accessibility suites passed.

The known RustSec findings remain the previously reviewed allowed warnings;
this slice added no dependency and introduced no new vulnerability finding.

## Hosted verification

[Foundation CI 36387091788](https://github.com/seabAu/Coredrill/actions/runs/36387091788)
passed commit `27c7261d1d8403269ff18269b408562d4b742d23` across exact Chrome
151/152, Firefox 153/154, Windows, Ubuntu, and macOS. The first implementation
run correctly exposed stale Firefox proof expectations for the newly advanced
v10/26 repository aggregate; commit `7b7fa07` aligned those assertions, and
both Firefox jobs then passed the identical repository contract suite. The next
run exposed an older command-menu test's ambiguous generic live-region locator
on slower Chrome 151; commit `27c7261` targeted the command result's own status,
and the focused local journey plus both hosted Chrome lanes passed.

Direct pushes to `main` skip the pull-request-only dependency-review job by
design. Full-history Gitleaks, build/static/policy, extension transfer, browser
storage, and native package jobs remained required.

## Decision review

No Accepted product or architecture decision changed. This slice completes the
Mark Applied portion of D-042 using the already accepted snapshot schema and
local-only application boundary. No dependency, migration, or ADR was added.

Portable import/export relationship round-trip remains `DOC-008`; document
accessibility, print, pagination, and high-zoom completion remains `DOC-009`.
