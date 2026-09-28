# Phase 3 application document preparation verification

Date: 2026-09-27
Checklist item: `DOC-005`
Implementation commit: _pending_
Hosted run: _pending_
Status: implementation verified locally; hosted clean-commit proof pending

## Outcome

Coredrill now lets a local application attempt select the exact immutable
resume, optional cover-letter, and ordered reusable-answer versions intended
for a later reviewed submission. The Job workspace Documents tab derives and
explains four preparation states: missing, draft, review needed, and ready for
export review.

The workflow remains accountless, local-first, offline-capable, and useful with
AI disabled. It performs no export, upload, submission, autofill, provider call,
or network request, and it does not present an ATS or hiring-probability score.

## Durable and application boundaries

- Schemas `0149`–`0154` add ordered `application_answer_selection` rows and
  database guards for answer, resume, and cover-letter eligibility. The split
  insert/update lineage guards preserve one-statement migration compatibility
  across browser SQLite and native rusqlite.
- Existing application columns remain the exact resume and cover-letter
  selections. Answers reference immutable document versions without copying
  document content.
- Every selected document is active and non-template. A job derivative must
  belong to the application's job, and only one version of an answer document
  can be selected for an application.
- A save validates the complete candidate set, replaces the ordered answer set,
  and advances the application row version in one transaction. Optimistic
  conflicts and invalid lineage fail without a partial write.
- A submitted snapshot freezes the selected identities. Preparation remains
  distinct from the immutable submitted snapshot owned by `DOC-007`.
- Portable export version 1 now emits 56 reviewed datasets as 112 JSON/CSV
  files at schema 154 while retaining the prior schema-148 milestone.

## Derived status and interface behavior

- **Missing** means no exact resume version is selected.
- **Draft** means a selected document has recoverable editor changes that have
  not been made into an immutable version.
- **Review needed** means at least one selected version is older than the
  document's latest immutable version.
- **Ready for export review** means a resume is selected, no selected item has
  a draft, and every selected item is current. It does not mean claims are
  verified or that anything has been exported or submitted.
- The UI names exact versions, base/job-derivative lineage, and unevaluated
  claim state. It becomes read-only after submission and explains why.
- Browser proof covers keyboard-named controls, automated axe checks, a 320 CSS
  pixel reflow, persistent reload behavior, and zero external requests.

## Automated proof

- Focused application, UI, repository, migration, and portable-export proof
  passed 5 files and 19 tests before the full matrix.
- The full unit lane passed 116 files and 892 tests.
- Native rusqlite migration, repository, archive, and recovery proof passed all
  13 tests at schema 154.
- Browser SQLite/OPFS storage proof passed all 8 tests, including transaction,
  contention, failure, benchmark, portable export/restore, and deterministic
  clean-recovery cases. The recovery archive has SHA-256
  `0edb185cdd193a076e66b75542803f7cb112bfbeb56580f8da60700dad0cc89c`.
- The complete application-shell suite passed all 74 tests. `DOC005_E2E_PROOF`
  recorded all four states and zero external requests.
- Changed application, storage, UI, and web TypeScript projects passed source
  and test typechecks; their production builds passed.
- Formatting, scoped lint, 19 package-boundary policies, 51 dependency and
  execution foundation records, Changesets validation, the 520-package
  JavaScript license inventory, the 498-crate Rust license inventory, and the
  tracked/unignored workspace secret scan passed.

## Decision review

No Accepted product or architecture decision changed. This slice implements
the pre-submission selection portion of D-042 while preserving immutable
submitted identity as a separate action. No ADR is required.

DOCX/PDF/text export remains `DOC-006`; Mark Applied and exact submitted
snapshots remain `DOC-007`; import/export relationship round-trip remains
`DOC-008`; and document accessibility/print/pagination completion remains
`DOC-009`.
