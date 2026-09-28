# Phase 3 deterministic template verification

Date: 2026-09-27
Checklist item: `DOC-004`
Implementation commit: `51298c8fb8167c0ca1a419a4b032d4c85f22df41`
Hosted run: [Foundation CI 36369364955](https://github.com/seabAu/Coredrill/actions/runs/36369364955)
Status: complete

## Outcome

Coredrill now has a pure, deterministic `deterministic-template-engine-v1`
renderer for AI-disabled cover letters and application answers. The engine
accepts bounded, validated job context, ordered requirements, and explicitly
selected durable Career Profile evidence, then returns canonical document IR,
plain text, section-level support mappings, and a versioned context manifest.

The output contract is accountless, local, offline-capable, provider-neutral,
and reproducible. It adds no provider call, network access, storage schema,
document write, export, submission, Answer Library reuse, score, or claim of AI
or employer verification.

## Evidence-first rendering contract

- Cover letters retain the exact job title, company, selected requirements, and
  eligible evidence supplied by the application boundary.
- Application-answer templates cover experience/evidence, motivation/company,
  and behavioral/STAR prompts. Behavioral output requires a structured story;
  it does not invent missing situation, action, or result details.
- Only `user_confirmed` and `source_backed` evidence is draftable. Private
  evidence and imported, stale, or disputed evidence are excluded with explicit
  reasons.
- Stable normalization and ordering make output independent of input ordering.
  The four exact golden fixtures cover a cover letter and all three answer
  families.
- Each rendered section is mapped only to job context, selected evidence, or
  style-only support. Insufficient evidence returns an explicit non-draft result
  instead of unsupported prose.
- The context manifest retains job, requirement, and evidence identifiers,
  update times, and optional source-version/source-hash metadata so downstream
  review can identify the exact rendering inputs.
- Outputs are deeply frozen, inputs are not mutated, timestamps and source
  metadata are strictly validated, and the renderer accepts only the versioned
  Career Profile evidence and verification vocabularies.

## Sensitive-question boundary

The application-layer `guardApplicationAnswerTemplateDraft` derives the answer
kind through the accepted `application-question-policy-v1` classifier. A caller
cannot override that classification. The renderer is never invoked for legal or
demographic questions, private eligibility facts, logistics/profile proposals,
compensation, signatures or attestations, or unknown questions that require
direct user review. Only the classifier's three draftable categories can reach
the deterministic renderer.

## Automated proof

- The focused documents and application suites passed 2 files and 19 tests.
  They verify exact golden outputs, canonical IR, deep immutability, input
  immutability, ordering, privacy/review exclusions, insufficient-evidence
  handling, strict input vocabularies, support mappings, all three draftable
  question categories, and six non-draftable short-circuit paths.
- Repository formatting and package-boundary checks passed all 19 package
  policies.
- Typecheck passed all 33 tasks; lint and build passed all 22 tasks.
- Unit verification passed 113 files and 883 tests. Changeset validation passed.
- The release-wide policy suite passed the reviewed 520-package JavaScript
  license inventory, 498-crate Rust license inventory, secret scanning, and
  security checks. Security-specific verification passed 7 files and 38 tests.
- Coverage passed at 82.06% statements, 75.18% branches, 84.11% functions, and
  85.07% lines before the final input-vocabulary guard; the final focused
  documents/application suites then passed again.

## Hosted clean-commit verification

Foundation CI run `36369364955` completed successfully for exact implementation
commit `51298c8fb8167c0ca1a419a4b032d4c85f22df41`.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108762199185`)
- browser storage on Chrome 151 (`108762199194`), Chrome 152 (`108762199304`),
  Firefox 153 (`108762199204`), and Firefox 154 (`108762199242`)
- native secure storage and packages on Ubuntu 26.04 (`108762199110`), Windows
  (`108762199017`), and macOS 26 (`108762199146`)
- extension transfer on Chromium and Firefox fallback (`108762199102`)
- full-history secret scan (`108762199266`)

The pull-request-only dependency review job (`108762200107`) was skipped as
expected for a direct push to `main`. GitHub emitted only the existing runner
transition and third-party action Node.js deprecation notices; no `DOC-004`
failure or security finding was reported.

## Decision and data-model review

No Accepted product or architecture decision changed. This slice implements
D-040 and D-041 while preserving D-042's immutable-version boundary. It adds no
schema or repository contract; schema version 148 remains current. No ADR was
required for `DOC-004`.

Job/application document-set selection and preparation status remain `DOC-005`;
export remains `DOC-006`; Mark Applied remains `DOC-007`; Answer Library reuse
remains `CLM-006`; and provider-backed generation plus the complete claim ledger
remain Phase 4 work.
