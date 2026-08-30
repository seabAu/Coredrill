# Phase 2 Schema.org JobPosting verification

Date: 2026-08-30

Branch: `main`

Implementation and hosted proof commit: `77878887ed1383ac2377edf839c41b0cac38be3d`

## Outcome

`XTR-002` is proven. Coredrill now has an exported, pure, bounded Schema.org `JobPosting` JSON-LD parser that retains independently reviewable `FieldCandidateV1` records for every supported value instead of collapsing conflicting or repeated evidence. The parser accepts direct objects, arrays, nested values, and inherited-context `@graph` documents; warns on missing, invalid, or unsupported fields; preserves valid fields from partial postings; and rejects malformed or cyclic input without returning partial results.

The extractor performs no network, DOM, persistence, entity-write, or user-confirmation operation. Every candidate is validated through the existing version-1 field-evidence contract and retains its exact JSON pointer, raw JSON value, bounded excerpt, capture instant, source ID, extractor identity/version, method, and confidence. Candidate IDs are injected by the caller and must be valid, unique UUIDv7 values.

## Bounded parsing and evidence policy

`parseJobPostingJsonLdV1` accepts an exact version-1 input shape and rejects unsupported versions, extra properties, invalid source IDs or capture instants, non-JSON values, cycles, and failed candidate-ID providers with content-free errors. Work is bounded to 64 JSON-LD items, 32 levels of nesting, 10,000 traversed values, 256 candidates, and explicit string and URL lengths. Results, warnings, provenance, and retained raw values are recursively frozen, and input values are not mutated.

Schema recognition supports `@context` values for `https://schema.org` and `http://schema.org`, inherited context inside `@graph`, and `@type` as a short name, absolute Schema.org URL, or array. Multiple `JobPosting` objects remain independent, and repeated or conflicting values remain separate candidates.

The implemented field mappings are title, company, description, salary, locations, workplace type, posted date, valid-through date, requirements, apply URL, external ID, and employment type. Dates must be real calendar values, URLs must meet the shared contract, and unsupported or invalid values produce structured warnings rather than fabricated evidence.

## Golden accuracy proof

The checked-in suite contains four scenarios covering direct nested arrays, inherited-context `@graph` remote work, nested multiple conflicting postings, and malformed/partial data. It expects 43 candidates across 12 fields and compares produced field, normalized value, raw value, JSON pointer, method, extractor identity, source ID, capture instant, and confidence against the golden fixture.

The retained machine-readable result is:

```json
{
  "fixtureCases": 4,
  "expectedCandidates": 43,
  "producedCandidates": 43,
  "exactMatches": 43,
  "falsePositives": 0,
  "falseNegatives": 0,
  "precision": 1,
  "recall": 1,
  "nestedValues": true,
  "arrays": true,
  "graph": true,
  "multipleCandidatesRetained": true,
  "malformedJsonLdRejectedOrWarned": true,
  "missingInvalidFieldsWarned": true,
  "partialValidFieldsRetained": true,
  "rawSourceEvidenceRetained": true,
  "provenanceRetained": true
}
```

All per-field precision and recall values are `1`. The seven focused tests also cover strict/frozen results, caller ID validation, cycles and non-JSON inputs, traversal and candidate bounds, exact raw evidence, and input immutability. Focused V8 coverage for `packages/extractors/src/**/*.ts` is 95.97% statements, 92.83% branches, 100% functions, and 97.86% lines.

## Local verification

The retained final `pnpm verify` invocation exited successfully and reproduced:

- formatting, 19 package-boundary policies, and 49 dependency/foundation records;
- typecheck, lint, and build across 22 packages, including extractor test typechecking;
- 66 unit files and 584 tests, with the exact `XTR002_PROOF` record emitted in both unit and coverage passes;
- 82.69% statements, 76.06% branches, 82.29% functions, and 85.17% lines overall;
- all application-shell, UI-foundation, performance, resilience, onboarding, document, and browser-storage suites;
- the schema-92 repository manifest in browser SQLite and the native SQLite adapter;
- 12 native Vitest cases, 11 passing Rust tests plus one intentional secure-store harness exclusion, native secure-store/archive/backup proofs, and generated-contract drift checks;
- 520 npm and 498 Rust license records, workspace secret scanning, zero known npm vulnerabilities, and the existing 15 explicitly allowed Rust maintenance/unsoundness warnings; and
- a valid Changesets release record for `@coredrill/extractors`.

The lockfile changed only to record the internal `@coredrill/contracts` workspace edge. Its reviewed SHA-256 is `c190201edf23dbaf2bc6919fb44d0a0a03f9523e0eea5d9bf2800d317b4b8575`; the external graph remains 935 resolutions with no new external dependency, license, or advisory.

## Hosted clean-commit proof

The exact implementation commit completed [Foundation CI run 33321073242](https://github.com/seabAu/Coredrill/actions/runs/33321073242) successfully. The [aggregate quality job 99283030851](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030851) emitted the exact 43-of-43 `XTR002_PROOF` record in both unit and coverage passes, passed 66 test files and 584 tests each time, recorded 95.97% / 92.83% / 100% / 97.86% focused extractor coverage and 82.69% / 76.04% / 82.29% / 85.17% total coverage, validated 520 npm and 498 Rust license records, found no known npm vulnerabilities, and retained the 15 reviewed Rust warnings.

The clean matrix also passed:

- [Chrome 151 job 99283030880](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030880) and [Chrome 152 job 99283030866](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030866);
- [Firefox 153 job 99283030858](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030858) and [Firefox 154 job 99283030883](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030883);
- [Windows job 99283030668](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030668), [macOS job 99283030874](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030874), and [Ubuntu job 99283030855](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030855);
- [extension-transfer job 99283030891](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030891); and
- [full-history secret-scan job 99283030806](https://github.com/seabAu/Coredrill/actions/runs/33321073242/job/99283030806).

Representative immutable artifact witnesses are Windows installer artifact `9735059858` (`sha256:17eacf73bee6fb580a25db9103838f5f8244ebf3b4376c0d1ce099a2270d5ea7`), macOS application artifact `9734969526` (`sha256:d2e913d5b3200908ecbae708bfa36bc98a7d3914cc45b378cae5d0ea7778e56a`), Linux AppImage artifact `9735030371` (`sha256:9dd72885ba43c09ecbea427fb38241e527a0cbc6724f808c1ece261803e6f1cc`), Chromium extension artifact `9735061407` (`sha256:d4153723f92b0aebace1fc2a342c2d986db44af5a18535a826e2caea5d59eb65`), and extension-transfer artifact `9734928557` (`sha256:fb4fb5f239f2b526700eace0131921eee26be8e059a156803b457dacba860d65`). XTR-002 itself introduces no binary or network artifact.

The two Firefox jobs carry an existing informational annotation: the pinned `setup-geckodriver` action still targets the deprecated Node 20 action runtime and GitHub executes it on Node 24. Both jobs passed; this is not an XTR-002 failure.

## Reviewed files

- `packages/extractors/src/job-posting-jsonld.ts` — strict input, bounded traversal, Schema.org recognition, field extraction, warnings, provenance, evidence validation, and freezing.
- `packages/extractors/test/job-posting-jsonld.test.ts` — golden, malformed-input, bound, immutability, provenance, and machine-readable proof.
- `packages/extractors/test/fixtures/job-posting-jsonld.golden.json` — four independently reviewed source/expectation scenarios.
- `packages/extractors/test/fixtures/job-posting-jsonld.accuracy-report.json` — checked-in exact per-field accuracy result.
- `packages/extractors/src/index.ts` and package TypeScript configuration — public exports, contract dependency, and test typechecking.
- `vitest.config.mjs` — extractor production code included in the repository coverage gate.
- `04-capture-extraction-sources.md` — implemented pure JSON-LD extraction boundary and retained limitations.
- `.changeset/parse-schema-org-job-postings.md` — release/governance record.

## Scope and decisions

This slice adds no network client, connector record, DOM parser, Readability dependency, source-specific adapter, crawler, account, hosted service, database migration, entity write, AI integration, or user-confirmation behavior. It implements the accepted extraction and provenance requirements without changing an accepted decision, so no ADR is required.

`XTR-003` is the next smallest unblocked slice: implement selected-text and conservative generic DOM/Readability extraction with golden fixtures while retaining raw evidence and provenance. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
