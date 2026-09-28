# Phase 3 template-only application-set verification

Date: 2026-09-28
Checklist item: `Q3-003`
Implementation commit: `97795d43d70bb1f4d98f5f38029713c1385082b9`
Hosted run: [Foundation CI 36405366750](https://github.com/seabAu/Coredrill/actions/runs/36405366750)
Status: complete

## Outcome

Coredrill now connects the accepted deterministic template engine to the
production Job Documents workflow. With AI disabled, a user can choose the
latest unchanged job-specific cover-letter version, create a new immutable
template-only child version from reviewed local context, explicitly select that
version, prepare an exact resume/cover-letter/answer set, and review local DOCX,
PDF, and plain-text exports.

The journey remains accountless, offline-capable, and local-first. It neither
uploads nor submits application material, and it performs no autofill,
outreach, provider call, hidden current-version substitution, or external
request.

## Production boundary

- The typed browser application API accepts the application, target document,
  and expected immutable base-version identities.
- It rejects submitted applications, stale versions, reusable bases,
  wrong-job derivatives, and documents with recoverable edits. The target must
  still be the latest unchanged job-specific cover letter when the editor is
  opened.
- Context comes from the exact local job and company, user-confirmed job
  requirements, and evidence already selected for those requirements.
  `deterministic-template-engine-v1` independently excludes private,
  unreviewed, duplicate, or structurally incomplete evidence.
- The generated IR is first retained as a recoverable editor draft and then
  consumed into one immutable child version labeled `Template-only draft`.
  A failure after draft retention cannot silently discard the user's work.
- The visible result names the template and engine versions, immutable output
  version and SHA-256, eligible evidence IDs and verification states, exact
  source document version IDs and hashes, AI-disabled state, zero-network
  boundary, and unevaluated-claim state.
- The new version is not selected automatically. The user must choose it and
  save the exact application set before any export review becomes available.

No schema, migration, contract version, provider, hosted service, account,
extension permission, source policy, or dependency changed.

## Real-browser proof

The production app-shell case
`template-only application set uses reviewed local evidence with AI and network disabled`
actively rejects every non-local request and proves the following in one
journey:

1. the template action is unavailable until an eligible exact cover-letter
   version is selected;
2. the resulting immutable version is version 2 with the accepted template ID,
   engine version, exact content hash, `source_backed` evidence identity, and
   exact source resume version/hash;
3. the generated plain text names the exact synthetic job/company and includes
   only the reviewed selected evidence sentence;
4. the previous cover-letter version becomes older while the generated child
   is latest, and the user explicitly selects the child rather than receiving a
   hidden substitution;
5. the exact resume, generated cover letter, and reusable answer set derives
   `Ready for export review` while claims remain explicitly unevaluated;
6. the resume produces a valid ZIP-based DOCX, the generated cover letter uses
   the reviewed PDF print path, and the answer produces exact UTF-8 plain text;
7. the generated content remains visible in export preview, while export stays
   separate from Mark Applied and no upload or submission occurs; and
8. automated axe analysis passes, the 320 CSS-pixel layout has no page-level
   horizontal overflow, and the captured ARIA tree retains named controls and
   evidence/source identities.

The test emits `Q3_003_E2E_PROOF` with AI mode `disabled`, network access
`none`, claim state `not_evaluated`, the exact generated cover-letter version,
reviewed evidence ID, source version ID, template ID, and all three export
formats. Existing `DOC006_E2E_PROOF` and its retained rendered artifacts remain
the visual authority for the unchanged DOCX/PDF/text export adapters; this
quality slice did not introduce a new export renderer or accept an unreviewed
retained artifact.

## Local verification

The complete `pnpm verify` gate passed on Windows against the locked dependency
graph at the implementation commit. Material results included:

- formatting, all 19 package-boundary policies, foundation records, typecheck,
  lint, production builds, generated schema/report checks, extension package
  inspection, license policy, secret scans, npm audit, Rust audit policy, and
  Changesets status;
- 118 unit-test files and 900 tests, followed by the aggregate coverage gate;
- all 76 application-shell, five UI-foundation, seven onboarding, three
  resilience, 13 document-browser, eight browser-storage, and performance
  journeys;
- 13 native TypeScript tests and 11 Rust tests, with the platform-only secure
  store case delegated to its redacted harness; and
- no known npm vulnerabilities. Rust audit retained only the seven already
  reviewed maintenance/unsoundness warnings.

The first full app-shell regression exposed only a changed synthetic evidence
search sentinel. The fixture was corrected to preserve the existing search
contract while adding the truthful template sentence; the affected Documents
test and Q3-003 test then passed together before the clean repository-wide
gate.

## Hosted verification

[Foundation CI 36405366750](https://github.com/seabAu/Coredrill/actions/runs/36405366750)
passed exact implementation commit
`97795d43d70bb1f4d98f5f38029713c1385082b9`. The aggregate
build/static/test/policy job, Chrome 151/152, Firefox 153/154, Windows, macOS,
Ubuntu, extension transfer/package inspection, and full-history secret scan all
completed successfully. The pull-request-only dependency-review job was
skipped as expected for the authorized direct push to `main`.

## Decision and scope review

No Accepted decision changed and no ADR is required. This slice composes the
already accepted D-040 template-only mode, D-041 selected-evidence/context
manifest boundary, and D-042 immutable version/application-selection/export
behavior without introducing Phase 4 provider or claim-ledger work.

This proof is synthetic and automated. It does not close the representative
human terminology/action study under `Q3-002`, the manual/reference-device
accessibility evidence retained under `Q1-003` and Phase 6, the document threat
review under `Q3-004`, the complete import-to-submitted-set canonical journey
under `Q3-005`, or `GATE-3`.
