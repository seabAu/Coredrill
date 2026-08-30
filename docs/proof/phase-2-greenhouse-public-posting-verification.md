# Phase 2 Greenhouse public-posting verification

Date: 2026-08-30

Branch: `main`

Implementation commit: `004f5bb7498ffd7b9ddae270a27ba89f83463394`

## Outcome

`XTR-004` is implemented. Coredrill now has a reviewed, checked-in Greenhouse Job Board connector-policy record, an exact GET-only request-descriptor boundary, official hosted-job URL recognition, and a pure payload adapter that converts one published job response into provisional field evidence.

The slice does not execute a network request. It adds no credentials, application submission, application questions, demographic or compliance collection, general crawling, background browser activity, entity write, field confirmation, AI inference, hosted service, database migration, or extension permission.

## Current interface and policy review

The 2026-08-30 review used the current [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Greenhouse legal hub](https://www.greenhouse.com/legal), and [Greenhouse privacy policy](https://www.greenhouse.com/privacy-policy). The API documentation states that published Job Board GET data is public and unauthenticated, identifies the job-detail endpoint, documents `pay_transparency=true`, and limits application submission to an authenticated POST. It also documents that `questions=true` can return application, location, compliance, and demographic questions; Coredrill never requests that option.

The checked-in version-1 policy record:

- authorizes only connector `greenhouse-job-board`, method `documented_public_api`, and exact destination host `boards-api.greenhouse.io`;
- requires no credentials and requires source attribution;
- records the public-posting reuse basis, visible local-only data flow, local-vault retention boundary, and explicit exclusion of applicant data;
- carries both the existing global and targeted runtime kill switches; and
- expires for review on 2026-09-29. Because Greenhouse publishes no Job Board rate limit in the reviewed interface, the record conservatively requires one user-initiated request per board per second, one request in flight, a 24-hour unchanged-detail cache, `Retry-After` handling, and fail-closed backoff before an executing client can ship under `XTR-009`.

The hosted machine-readable policy witness is:

```json
{
  "connectorId": "greenhouse-job-board",
  "reviewedAt": "2026-08-30T00:00:00.000Z",
  "reviewDueAt": "2026-09-29T00:00:00.000Z",
  "exactApiHost": true,
  "getOnly": true,
  "credentialsOmitted": true,
  "questionsExcluded": true,
  "payTransparencyRequested": true,
  "attributionRequired": true,
  "killSwitchRequired": true
}
```

## Request and extraction boundaries

The URL recognizer accepts only HTTPS job URLs on the exact official `boards.greenhouse.io` and `job-boards.greenhouse.io` hosts when both a bounded board token and positive safe-integer post ID are unambiguous. It rejects custom or lookalike hosts, subdomains, insecure or credentialed URLs, non-default ports, malformed paths, invalid tokens/IDs, and conflicting `gh_jid` values. Tracking query strings and fragments are never propagated.

A recognized reference can construct only this immutable, non-executing descriptor:

```text
GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}?pay_transparency=true
credentials: omit
accept: application/json
```

No callback, `questions=true`, POST, arbitrary destination, body, authorization header, or executing fetch is representable.

The pure extractor requires an exact version-1 input, a valid source UUIDv7 and canonical instant, a bounded board token, a positive safe-integer requested job ID, a plain object payload with at most 128 top-level keys, and an injected candidate-ID provider. The response `id` must exactly match the requested job ID. Any top-level `questions`, `location_questions`, `compliance`, `demographic_questions`, or `data_compliance` field rejects the payload atomically with a content-free error.

Recognized title, company, untrusted description content, location, first-published/deadline dates, safe HTTP(S) apply URL, Greenhouse post ID, and valid pay-transparency ranges become separate provisional candidates. Exact recognized raw values, source pointers, API method, source/capture identity, extractor identity/version, capture instant, confidence, source excerpt, and visible attribution/review note remain attached. The adapter does not render description HTML, normalize money or dates beyond basic validity, or treat unrelated response fields as job evidence.

Payload strings, description, URL, board token, pay ranges, output candidates, source excerpt, and candidate identifiers are bounded before output. Results are recursively frozen and every candidate passes the shared version-1 field-evidence contract.

## Synthetic golden proof

The checked-in suite contains three synthetic responses: one complete post with two valid pay ranges, one minimal post, and one post with independently invalid optional fields and one valid pay range. The fixtures contain no production employer content or applicant data.

The suite expects 19 candidates across nine fields and compares field name, normalized value, exact raw value, source pointer, confidence, source ID, method, capture instant, extractor identity, and attribution note. It produced 19 exact matches, zero false positives, and zero false negatives. Overall and every per-field precision and recall value are `1`.

```json
{
  "fixtureCases": 3,
  "expected": 19,
  "produced": 19,
  "exactMatches": 19,
  "falsePositives": 0,
  "falseNegatives": 0,
  "precision": 1,
  "recall": 1,
  "scenarios": {
    "getOnlyRequestDescriptor": true,
    "exactApiDestination": true,
    "payTransparencyWithoutQuestions": true,
    "jobIdentityMatched": true,
    "rawEvidenceRetained": true,
    "provenanceRetained": true,
    "applicantDataRejected": true,
    "invalidOptionalFieldsRejected": true
  }
}
```

These are exact synthetic-fixture metrics for extractor version 1.0.0, not a claim about all Greenhouse boards or web-wide accuracy. Broader calibration remains `XTR-008`; all candidates remain provisional until human review.

Twenty-four focused tests also cover current and legacy hosted URLs, root `gh_jid` URLs, invalid and ambiguous URLs, strict request inputs, exact frozen descriptors, policy expiry and authorization, global/targeted kills, missing required fields, malformed optionals, every forbidden applicant-data field, job-ID mismatch, payload/string/range/candidate bounds, deterministic IDs, throwing or duplicate IDs, raw evidence, provenance, and recursive immutability. Focused coverage is 92.87% statements, 90.48% branches, 100% functions, and 95.81% lines. The new extractor is 96.55% / 94.73% / 100% / 98.5%; the Greenhouse request-policy module is 90% / 82.53% / 100% / 98.11%.

## Local verification

The pinned local toolchain passed:

- formatting, 19 import-boundary policies, and 51 direct dependency/foundation records;
- typecheck, lint, and all 22 builds;
- 69 unit files and 608 tests;
- 83.36% statements, 76.6% branches, 82.95% functions, and 85.94% lines overall;
- 94.07% statements, 87.59% branches, 100% functions, and 96.76% lines across extractor production code;
- generated contract schemas, 520-package npm and 498-crate Rust license policies, secret scanning, and Changesets status; and
- the focused 24-test policy/adapter matrix and its exact machine-readable witnesses.

The slice adds no dependency and does not change `pnpm-lock.yaml`. The reviewed lockfile SHA-256 remains `8e24563334bfbf66ecfff5420c89f7bb0f77e759226346e6768917bbe78d0898`, with 936 external resolutions. The local environment did not send the workspace dependency graph to an advisory service; the exact clean hosted commit provides that evidence.

## Hosted clean-commit proof

The exact implementation head completed [Foundation CI run 33326303747](https://github.com/seabAu/Coredrill/actions/runs/33326303747) successfully. The [aggregate quality job 99296922484](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922484) installed the frozen 936-entry graph, emitted both exact `XTR004_POLICY_PROOF` and 19-of-19 `XTR004_ADAPTER_PROOF` witnesses in unit and coverage passes, passed 69 test files and 608 tests each time, reproduced the local coverage totals, validated 520 npm and 498 Rust license records, found no known npm vulnerabilities, and scanned 499 locked Rust crate dependencies under the existing reviewed advisory policy.

The clean matrix also passed:

- [Chrome 151 job 99296922552](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922552) and [Chrome 152 job 99296922561](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922561);
- [Firefox 153 job 99296922544](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922544) and [Firefox 154 job 99296922546](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922546);
- [Windows job 99296922553](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922553), [macOS job 99296922422](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922422), and [Ubuntu job 99296922495](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922495);
- [extension-transfer job 99296922534](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922534); and
- [full-history secret-scan job 99296922496](https://github.com/seabAu/Coredrill/actions/runs/33326303747/job/99296922496).

Representative immutable artifact witnesses are Windows installer artifact `9736490130` (`sha256:52f8328ca2470d823d6243c22e215ed9084270a9bd415f51ecb435fb453c6429`), macOS application artifact `9736375043` (`sha256:0a78fe427e257e76856729bb3e9635fbab90dad60575aa64017383d4c74a6560`), Linux AppImage artifact `9736444989` (`sha256:3f075a0980d2a0bbb50cbf1d19049e8f390bfa0cba8128010be1dd0585d0e07a`), Chromium extension artifact `9736484176` (`sha256:65446c2532cc3afb098829cb7f14e5a09e6d1fdc177fe829a9124b17b5f260a8`), and extension-transfer artifact `9736356034` (`sha256:c7ef4cc36ab2fd97764c18becbe0f800963badd0c351285db3af676bb20d7acd`). XTR-004 itself introduces no binary or network artifact.

The two Firefox jobs carry the existing informational annotation that the pinned `setup-geckodriver` action targets the deprecated Node 20 action runtime and GitHub executes it on Node 24. Both jobs passed; this is not an XTR-004 failure.

## Reviewed files

- `packages/source-policy/src/greenhouse-job-board.ts` — exact policy input, hosted-URL recognition, and non-executing GET-only request descriptor.
- `packages/source-policy/src/connector-policy.ts` — parsed checked-in production record and existing fail-closed registry integration.
- `packages/source-policy/test/greenhouse-job-board.test.ts` and `connector-policy.test.ts` — URL, request, policy, review-deadline, kill-switch, and machine-proof coverage.
- `packages/extractors/src/greenhouse-public-posting.ts` — strict bounded payload mapping, evidence/provenance retention, and applicant-data rejection.
- `packages/extractors/test/greenhouse-public-posting.test.ts` — golden, malformed-input, limit, ID, rejection, provenance, immutability, and accuracy tests.
- `packages/extractors/test/fixtures/greenhouse-public-posting.golden.json` and `greenhouse-public-posting.accuracy-report.json` — synthetic source/expectation cases and exact retained result.
- `04-capture-extraction-sources.md`, `10-technology-stack.md`, and `DECISION-SUMMARY.md` — current source URL, shipped boundary, policy, and deferrals.
- `.changeset/add-greenhouse-public-postings.md` — release/governance record.

## Scope and decisions

No Accepted decision changed, so no ADR is required. The slice implements the existing documented-public-API and strict connector-policy decisions while preserving accountless, local-first, offline/AI-disabled usefulness. It deliberately stops before the executing transport behavior assigned to `XTR-009`.

After this proof closes `XTR-004`, `XTR-005` is the next smallest unblocked slice: review the current Lever Postings API and legal/privacy interface, then add an equally bounded public-posting adapter and exact connector-policy record. Application submission, credentials, applicant data, arbitrary destinations, and executing network behavior remain outside that slice. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
