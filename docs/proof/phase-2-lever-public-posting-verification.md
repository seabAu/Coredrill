# Phase 2 Lever public-posting verification

Date: 2026-08-30

Branch: `main`

Implementation commit: `a4b6442cd6c36ce89a5f384839c97b1c93587c01`

## Outcome

`XTR-005` is implemented. Coredrill now has a reviewed, checked-in Lever Postings connector-policy record, exact global and EU GET-only request-descriptor boundaries, official hosted-job URL recognition, and a pure payload adapter that converts one published posting response into provisional field evidence.

The slice does not execute a network request. It adds no credentials, API-key input, application submission, candidate access, general crawling, background browser activity, entity write, field confirmation, AI inference, hosted service, database migration, dependency, or extension permission.

## Current interface and policy review

The 2026-08-30 review used Lever's current official [Postings API repository](https://github.com/lever/postings-api) at upstream revision `f61aac5831a193bc66e1183c3ad102739dfd9f56`, [Lever legal center](https://www.lever.co/legal), and [Employ privacy center](https://www.employinc.com/privacy/). The v0 documentation says the Postings API serves public job sites, exposes only published postings, and allows third parties to scrape published postings. It documents the global `api.lever.co` and EU `api.eu.lever.co` instances and an identity-specific JSON GET. The authenticated applicant-creation POST, API keys, and Lever Hire API are excluded.

The checked-in version-1 policy record:

- authorizes only connector `lever-postings`, method `documented_public_api`, and exact destination hosts `api.lever.co` and `api.eu.lever.co`;
- requires no credentials and requires source attribution;
- records the published-posting reuse basis, visible local-only data flow, local-vault retention boundary, and explicit exclusion of applicant, application, consent, and candidate data;
- carries both the existing global and targeted runtime kill switches; and
- expires for review on 2026-09-29. Lever publishes an application-POST limit but no published-posting GET limit in the reviewed interface, so the record requires one user-initiated GET per site per second, one request in flight, a 24-hour unchanged-detail cache, `Retry-After` handling, and fail-closed backoff before an executing client can ship under `XTR-009`.

The machine-readable policy witness is:

```json
{
  "connectorId": "lever-postings",
  "reviewedAt": "2026-08-30T00:00:00.000Z",
  "reviewDueAt": "2026-09-29T00:00:00.000Z",
  "exactGlobalHost": true,
  "exactEuHost": true,
  "getOnly": true,
  "credentialsOmitted": true,
  "applicationPathExcluded": true,
  "attributionRequired": true,
  "killSwitchRequired": true
}
```

## Request and extraction boundaries

The URL recognizer accepts only exact HTTPS job-detail URLs at `jobs.lever.co/{site}/{posting-id}` or `jobs.eu.lever.co/{site}/{posting-id}` with a bounded lowercase site token and canonical UUID. It rejects custom and lookalike hosts, subdomains, insecure or credentialed URLs, non-default ports, application paths, API-key query input, malformed and encoded paths, invalid sites/IDs, and surrounding whitespace. Tracking query strings and fragments are never propagated; an uppercase source UUID is canonicalized to lowercase.

A recognized reference can construct only one of these immutable, non-executing descriptors:

```text
GET https://api.lever.co/v0/postings/{site}/{posting-id}
GET https://api.eu.lever.co/v0/postings/{site}/{posting-id}
credentials: omit
accept: application/json
```

No list/global-search query, HTML/iframe mode, API key, `/apply`, POST, body, arbitrary destination, authorization header, or executing fetch is representable.

The pure extractor requires an exact version-1 input, a valid source UUIDv7 and canonical instant, a valid region/site/posting identity, a plain bounded payload, and an injected candidate-ID provider. The response UUID must exactly match the requested UUID. Any documented applicant-creation field or defensive candidate, question, consent, application, or API-key field rejects the payload atomically with a content-free error.

Recognized title, plaintext description, each declared location, commitment, supported workplace type, each labeled untrusted list-HTML block, exact identity-matched Lever-hosted apply URL, posting UUID, and valid salary range become separate provisional candidates. `descriptionPlain` is preferred; styled description and auxiliary salary-description fields are ignored so a candidate's exact raw value and source pointer identify the same evidence. The site slug is routing identity rather than a verified company name and is not promoted to `company`.

Exact raw values, JSON pointers, API method, source/capture identity, extractor identity/version, capture instant, confidence, bounded source excerpt, and visible attribution/review note remain attached. The adapter does not render retained HTML, normalize salary/work arrangements beyond basic validity, or treat unknown response fields as job evidence.

Payload/category keys, descriptions, list content, URLs, locations, lists, output candidates, site tokens, and identifiers are bounded before output. Results are recursively frozen and every candidate passes the shared version-1 field-evidence contract.

## Synthetic golden proof

The checked-in suite contains three synthetic responses: one complete global post, one minimal EU post, and one post with independently malformed optional fields. The fixtures contain no production employer content or applicant data.

The suite expects 21 candidates across nine fields and compares field name, normalized value, exact raw value, source pointer, confidence, source ID, method, capture instant, extractor identity, and attribution note. It produced 21 exact matches, zero false positives, and zero false negatives. Overall and every per-field precision and recall value are `1`.

```json
{
  "fixtureCases": 3,
  "expected": 21,
  "produced": 21,
  "exactMatches": 21,
  "falsePositives": 0,
  "falseNegatives": 0,
  "precision": 1,
  "recall": 1,
  "scenarios": {
    "globalAndEuRequestDescriptors": true,
    "exactApiDestinations": true,
    "applicationSubmissionExcluded": true,
    "postingIdentityMatched": true,
    "plainDescriptionPreferred": true,
    "rawEvidenceRetained": true,
    "provenanceRetained": true,
    "applicantDataRejected": true,
    "invalidOptionalFieldsRejected": true
  }
}
```

These are exact synthetic-fixture metrics for extractor version 1.0.0, not a claim about every Lever tenant or web-wide accuracy. Broader calibration remains `XTR-008`; all candidates remain provisional until human review.

Twenty-six focused tests cover global/EU hosted URLs, invalid and encoded URLs, strict request inputs, exact frozen descriptors, policy expiry and authorization, global/targeted kills, missing required fields, malformed optionals, all forbidden applicant/application fields, posting-ID mismatch, payload/category/location/list/text/candidate bounds, exact apply/hosted identity, deterministic IDs, throwing or duplicate IDs, raw evidence, provenance, and recursive immutability. Focused coverage for the new extractor is 96.27% statements, 95.33% branches, 100% functions, and 98.31% lines; the Lever request-policy module is 94% / 90% / 100% / 97.72%.

## Local verification

The pinned local toolchain passed:

- frozen offline install of all 23 workspace projects;
- formatting, 19 import-boundary policies, and 51 direct dependency/foundation records;
- typecheck, lint, and all 22 builds;
- 71 unit files and 624 tests;
- 83.76% statements, 77.36% branches, 83.23% functions, and 86.34% lines overall;
- 94.51% statements, 89.34% branches, 100% functions, and 97.08% lines across extractor production code;
- generated contract schemas, 520-package npm and 498-crate Rust license policies, secret scanning, and Changesets status; and
- the focused 26-test policy/adapter matrix and its exact machine-readable witnesses.

The slice adds no dependency and does not change `pnpm-lock.yaml`. The reviewed lockfile SHA-256 remains `8e24563334bfbf66ecfff5420c89f7bb0f77e759226346e6768917bbe78d0898`, with 936 external resolutions. The local environment did not send the workspace dependency graph to an advisory service; the exact clean hosted commit provides that evidence.

## Hosted clean-commit proof

The exact implementation head completed [Foundation CI run 33328115964](https://github.com/seabAu/Coredrill/actions/runs/33328115964) successfully. The [aggregate quality job 99301764794](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764794) installed the frozen 936-entry graph, emitted both exact `XTR005_POLICY_PROOF` and 21-of-21 `XTR005_ADAPTER_PROOF` witnesses in unit and coverage passes, passed 71 test files and 624 tests each time, reproduced the local coverage totals, validated 520 npm and 498 Rust license records, found no known npm vulnerabilities, and scanned 499 locked Rust crate dependencies under the existing reviewed advisory policy.

The clean matrix also passed:

- [Chrome 151 job 99301764781](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764781) and [Chrome 152 job 99301764803](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764803);
- [Firefox 153 job 99301764657](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764657) and [Firefox 154 job 99301764763](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764763);
- [Windows job 99301764747](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764747), [macOS job 99301764737](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764737), and [Ubuntu job 99301764767](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764767);
- [extension-transfer job 99301764764](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764764); and
- [full-history secret-scan job 99301764730](https://github.com/seabAu/Coredrill/actions/runs/33328115964/job/99301764730).

Representative immutable artifact witnesses are Windows installer artifact `9737002228` (`sha256:d88a757659e0e1e42044ecf7849cb42bd1b8236ce3ed61ce4cd18c18a756b530`), macOS application artifact `9736891753` (`sha256:cdb9f3f9b8edc2ead16b55e43d4294e9324b7b60d6087dff976229b4a67bd783`), Linux AppImage artifact `9736952086` (`sha256:b7fce887f2ecfa3aa665b1231b6ddfc9fb9b0886ee34c7c440c4f7b5367a71b4`), Chromium extension artifact `9737007859` (`sha256:1bc27e6fedc5a89c022160324a5a1e153a67e1a4cb9ff673d22dcf58d785dad6`), and extension-transfer artifact `9736874169` (`sha256:06cc94ca68058cc46b93c1c2d881bf207ec1cc3863048094f52ae5f32f5bc3db`). XTR-005 itself introduces no binary or network artifact.

The two Firefox jobs carry the existing informational annotation that the pinned `setup-geckodriver` action targets the deprecated Node 20 action runtime and GitHub executes it on Node 24. Both jobs passed; this is not an XTR-005 failure.

## Reviewed files

- `packages/source-policy/src/lever-postings.ts` — exact policy input, global/EU hosted-URL recognition, and non-executing GET-only request descriptor.
- `packages/source-policy/src/connector-policy.ts` — parsed checked-in production record and existing fail-closed registry integration.
- `packages/source-policy/test/lever-postings.test.ts` and `connector-policy.test.ts` — URL, request, policy, review-deadline, kill-switch, and machine-proof coverage.
- `packages/extractors/src/lever-public-posting.ts` — strict bounded payload mapping, exact evidence/provenance retention, identity validation, and applicant-data rejection.
- `packages/extractors/test/lever-public-posting.test.ts` — golden, malformed-input, limit, ID, URL, rejection, provenance, immutability, and accuracy tests.
- `packages/extractors/test/fixtures/lever-public-posting.golden.json` and `lever-public-posting.accuracy-report.json` — synthetic source/expectation cases and exact retained result.
- `04-capture-extraction-sources.md` and `10-technology-stack.md` — current source interface, shipped boundary, policy, and deferrals.
- `.changeset/add-lever-public-postings.md` — release/governance record.

## Scope and decisions

No Accepted decision changed, so no ADR is required. The slice implements the existing documented-public-API and strict connector-policy decisions while preserving accountless, local-first, offline/AI-disabled usefulness. It deliberately stops before the executing transport behavior assigned to `XTR-009`.

After hosted proof closes `XTR-005`, `XTR-006` is the next smallest unblocked slice: implement a non-executing USAJOBS search/configuration and payload-adapter boundary under the current official API, authentication, rate, and API-consumer terms. Coredrill must not ship a shared key; executing transport, secret entry/storage UI, broad/global retrieval, and automatic application remain outside that slice. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
