# Phase 2 generic job-document verification

Date: 2026-08-30

Branch: `main`

Implementation commits: `0917347b3439e40eb322eebec3b246e33a509408`, `12d8d336b9fdaa9475c3433c91acfb3477f6ded3`

## Outcome

`XTR-003` is implemented. Coredrill now exports two pure local extraction boundaries: an explicit selected-text path and a conservative generic page-document path. Selected text becomes one provisional description candidate while retaining the caller's exact string as raw evidence. The generic path clones a caller-supplied `Document`, strips non-content and obvious boilerplate nodes, retains independently reviewable selector candidates, and runs Mozilla Readability on a second detached clone for a plain-text description proposal.

Neither path fetches a URL, observes or mutates a live page, writes an entity, confirms a value, resolves a conflict, calls AI, expands extension permissions, or adds a hosted dependency. Every emitted candidate passes the existing version-1 field-evidence contract and carries capture source ID, evidence pointer, exact raw value, source excerpt, extractor identity/version, method, capture instant, confidence, and a visible-source review note.

## Conservative extraction and bounds

`extractSelectedTextV1` accepts an exact version-1 input, a valid capture source UUIDv7 and canonical UTC instant, at most 64 KiB of selected text, and an injected candidate-ID provider. It normalizes whitespace for the proposed value but retains the exact selected text as `rawValue` at `/content/selectedText`. Blank, oversized, malformed, or ID-invalid inputs fail atomically with content-free errors.

`extractGenericJobDocumentV1` accepts only a document-capable value and clones it before work. It rejects documents exceeding 10,000 elements or 128 levels, then removes scripts, styles, templates, frames, embedded objects, vector/canvas content, forms and controls, hidden nodes, navigation, banners, footers, complementary regions, and obvious advertising, cookie, consent, newsletter, promotion, share, and social containers. Retained document text is capped at 1 MiB; Readability text is capped at 512 KiB; short values and source excerpts are capped at 4 KiB; output is capped at 256 candidates and 64 requirement candidates.

Visible `h1` elements, Open Graph/Twitter title metadata, document titles, labeled definition-list/table values, and headed or labeled requirement sections produce selector candidates. Supported labels map company, location, workplace type, salary, employment type, posting/deadline dates, safe HTTP(S) apply URLs, external IDs, and categorized requirements. Repeated and conflicting values remain separate candidates with separate pointers. Invalid or missing labeled values produce structured warnings and unsafe application URLs are never promoted.

Mozilla Readability 0.6.0 runs with JSON-LD disabled, a 10,000-element parse limit, a 120-character threshold, and Coredrill's conservative readerability check. Only normalized `textContent` plus bounded plain metadata is retained; Readability-generated HTML is discarded. Runtime extraction uses the platform DOM. LinkeDOM 0.18.13 is a test-only detached DOM and is loaded through a runtime-checked adapter so its older published DOM declarations do not require weakening TypeScript library checks.

## Golden accuracy proof

The checked-in suite contains one explicit selected-text case and three synthetic document cases: a complete job, repeated/conflicting labeled values, and hostile boilerplate/hidden content. It expects 27 candidates across 12 fields and compares produced field, normalized value, exact raw value, DOM/content pointer, method, confidence, source, capture instant, and extractor identity against the golden fixture.

The retained machine-readable result is:

```json
{
  "fixtureCases": 4,
  "expected": 27,
  "produced": 27,
  "exactMatches": 27,
  "falsePositives": 0,
  "falseNegatives": 0,
  "precision": 1,
  "recall": 1,
  "selectorCandidates": 25,
  "readabilityCandidates": 2,
  "explicitSelectedText": true,
  "readabilityPlainText": true,
  "repeatedConflictingCandidatesRetained": true,
  "boilerplateAndHiddenContentRejected": true,
  "rawSourceEvidenceRetained": true,
  "provenanceRetained": true,
  "inputDocumentUnchanged": true
}
```

All per-field and per-method precision and recall values are `1`. Ten focused tests also cover strict and recursively frozen results, malformed/extra inputs, whitespace and size rejection, document capability failures, Readability failure, element/depth/text/candidate/requirement bounds before candidate IDs, reused or throwing IDs, invalid labels, unsafe apply URLs, definition lists, tables, heading-section boundaries, exact evidence, and input immutability. Focused V8 coverage for `generic-job-document.ts` is 90.75% statements, 75.46% branches, 100% functions, and 94.71% lines.

These are exact synthetic-fixture metrics for extractor version 1.0.0, not a claim about web-wide accuracy. Broader source calibration remains `XTR-008`, and all generic candidates remain provisional until human review.

## Local verification

The frozen install verified 936 supply-chain entries and reconstructed all 840 installed package entries from the content-addressed store without downloading or changing the lockfile. The local verification set then passed:

- formatting, 19 package-boundary policies, and 51 direct dependency/foundation records;
- typecheck, lint, and build across 22 packages, including strict extractor test typechecking without `skipLibCheck`;
- 67 unit files and 594 tests;
- 83.03% statements, 76.04% branches, 82.64% functions, and 85.57% lines overall;
- 93.49% statements, 85.46% branches, 100% functions, and 96.33% lines across extractor production code;
- all application-shell, UI-foundation, performance, resilience, onboarding, document, browser-storage, native SQLite, secure-storage, archive/backup, contract-schema, extension-package, accessibility, secret, license, and Changesets checks; and
- 520 npm license records and 498 Rust license records.

The reviewed lockfile SHA-256 is `8e24563334bfbf66ecfff5420c89f7bb0f77e759226346e6768917bbe78d0898`. The graph has 936 external resolutions. The slice adds current Apache-2.0 Mozilla Readability 0.6.0; LinkeDOM 0.18.13 was already present in the external graph and is now a direct test-only dependency. The local environment did not send the workspace dependency graph to npm's advisory service; the exact clean hosted commit supplies the required npm and Rust advisory proof.

## Hosted clean-commit proof

The exact implementation head completed [Foundation CI run 33323958947](https://github.com/seabAu/Coredrill/actions/runs/33323958947) successfully. The [aggregate quality job 99290742625](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742625) emitted the exact 27-of-27 `XTR003_PROOF` record in both unit and coverage passes, passed 67 test files and 594 tests each time, recorded 93.49% / 85.46% / 100% / 96.33% extractor-package coverage and 83.03% / 76.02% / 82.64% / 85.57% total coverage, validated 520 npm and 498 Rust license records, found no known npm vulnerabilities, and retained the 15 reviewed Rust warnings.

The clean matrix also passed:

- [Chrome 151 job 99290742686](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742686) and [Chrome 152 job 99290742653](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742653);
- [Firefox 153 job 99290742748](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742748) and [Firefox 154 job 99290742692](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742692);
- [Windows job 99290742711](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742711), [macOS job 99290742698](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742698), and [Ubuntu job 99290742560](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742560);
- [extension-transfer job 99290742699](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742699); and
- [full-history secret-scan job 99290742755](https://github.com/seabAu/Coredrill/actions/runs/33323958947/job/99290742755).

Representative immutable artifact witnesses are Windows installer artifact `9735849978` (`sha256:409dffe32dcefbac674ee5fb6e1ad4f2d89b5707f3209088d5a5006c882975b6`), macOS application artifact `9735757015` (`sha256:af4d3e496fe98a5fe36bc71f9ecf3a5f8bb457d95eb1d1d24274091fb5220557`), Linux AppImage artifact `9735812778` (`sha256:96cdbf81f064cd2ddc5789650d6bce12f987449565cb84edf22946b7647cb644`), Chromium extension artifact `9735861493` (`sha256:9865c1be84cac6370b4a63f457624591c351f25aa4cbb9906704e50642f51d3d`), and extension-transfer artifact `9735724320` (`sha256:52671c2b7849b6d9dd82def047c0887dd06f60dc52e5ed3738dee68d64b8bb56`). XTR-003 itself introduces no binary or network artifact.

The two Firefox jobs carry the existing informational annotation: the pinned `setup-geckodriver` action still targets the deprecated Node 20 action runtime and GitHub executes it on Node 24. Both jobs passed; this is not an XTR-003 failure.

## Reviewed files

- `packages/extractors/src/generic-job-document.ts` — strict inputs, selected-text extraction, bounded DOM scrubbing, labeled-field extraction, safe URL handling, plain-text Readability, evidence validation, warnings, and freezing.
- `packages/extractors/test/generic-job-document.test.ts` — golden, malformed-input, capability, limit, ID, unsafe-URL, provenance, immutability, and machine-readable accuracy proof.
- `packages/extractors/test/fixtures/generic-job-document.golden.json` and the three HTML fixtures — independently reviewed source/expectation scenarios containing only synthetic content.
- `packages/extractors/test/fixtures/generic-job-document.accuracy-report.json` — checked-in exact per-field and per-method accuracy result.
- `packages/extractors/package.json`, `pnpm-lock.yaml`, and `foundation-dependency-inventory.json` — exact dependency, lock, license, maintainer, advisory, and selection records.
- `04-capture-extraction-sources.md` — implemented selected-text and generic DOM/Readability boundary and limitations.
- `.changeset/extract-generic-job-documents.md` — release/governance record.

## Scope and decisions

This slice adds no network client, source-specific connector, crawler, browser surveillance, background task, database migration, entity write, application submission, outreach, AI integration, or user-confirmation behavior. It implements the accepted Mozilla Readability plus platform-DOM decision without changing an accepted architecture decision, so no ADR is required.

After hosted proof closes this item, `XTR-004` is the next smallest unblocked slice: add a Greenhouse public Job Board API adapter and checked-in current connector policy record using only documented unauthenticated GET endpoints. POST application submission, credentials, applicant questions/demographic/compliance data, general crawling, and unreviewed destinations remain outside that slice. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
