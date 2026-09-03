# Phase 2 USAJOBS public-search verification

Date: 2026-08-31

Branch: `main`

Implementation commit: `0768b3582bed16a2512a48a100decac55d30261d`

## Outcome

`XTR-006` is implemented and verified. Coredrill now has a reviewed, checked-in USAJOBS Search API policy; a strict user-owned configuration attestation; a bounded, deterministic, non-executing Public-only GET descriptor; and a pure adapter for one user-selected public search item.

This slice does not ship a shared key, accept an email or API-key value in its public configuration contract, read or log credentials, execute a network request, request Status/internal announcements, redistribute a feed, map public contact data, write entities, run AI inference, submit an application, or expand extension permissions.

## Current official interface and consumer review

The review used the current official USAJOBS material on 2026-08-30:

- [Search API reference](https://developer.usajobs.gov/api-reference/get-api-search): `GET https://data.usajobs.gov/api/search`, documented public-search filters, `Fields=Full`, salary and JOA response fields, at most 500 rows per page, and the `WhoMayApply=Public` scope. `All` and `Status` require additional authorization and are excluded.
- [Authentication guide](https://developer.usajobs.gov/guides/authentication): a registered consumer must bind `Host: data.usajobs.gov`, the registration email as `User-Agent`, and the assigned key as `Authorization-Key`.
- [Rate-limiting guide](https://developer.usajobs.gov/guides/rate-limiting): Search defaults to Public announcements, permits at most 10,000 rows per query and 500 rows per page, and publishes no request-per-time allowance.
- [API access request and consumer terms](https://developer.usajobs.gov/apirequest/index): data is for the registered requesting individual or company; internal storage/reformatting is allowed when displayed values remain unchanged, USAJOBS is credited, and users are sent to USAJOBS to view/apply. Standalone redistribution and competing job-data products are prohibited. API keys must remain confidential, public JOA data can contain publicly disclosed contact information, and USAJOBS may impose limits at any time.
- [General API terms/privacy notice](https://developer.usajobs.gov/guides/terms-of-use): use may be monitored and audited; unauthorized access or misuse is prohibited.

The checked-in version-1 policy record therefore uses:

- connector ID `usajobs-search`;
- method `configured_official_api`;
- the exact destination host `data.usajobs.gov` and endpoint `/api/search`;
- `credentials: user_configured` and required attribution;
- a 100-row-per-page and 100-page descriptor cap, below the official 500/10,000 ceilings;
- one-user local retention, explicit no-contact-mapping/no-feed restrictions, global and targeted kill switches; and
- review timestamps `2026-08-30T00:00:00.000Z` through `2026-09-29T00:00:00.000Z` (exclusive).

No request-per-time allowance is inferred. Executing transport remains deferred to `XTR-009`, where the policy requires an explicit user action, one request in flight, a 24-hour unchanged-query cache, `Retry-After` handling, and fail-closed backoff.

## Credential-safe request contract

`createUsaJobsSearchConfigurationV1` accepts only readiness/terms booleans and a current canonical acceptance timestamp. It has no email or key value field. Its output contains only fixed opaque bindings:

```json
{
  "Host": { "binding": "destination_host" },
  "User-Agent": { "binding": "registered_email" },
  "Authorization-Key": { "binding": "api_key" }
}
```

`createUsaJobsSearchRequestV1` rejects unknown keys, duplicate or delimiter-injecting filters, invalid occupational-series codes, values outside the official 0–60 `DatePosted` range, pages above 100, rows above 100, and searches with no targeting criterion. It deterministically adds `WhoMayApply=Public` and `Fields=Full`; callers cannot request `All`, `Status`, historic JOA, POST, a custom host, or raw query parameters. The descriptor is marked `privileged_connector_only` because browser code cannot safely own the registered email/key binding.

The retained policy witness is:

```json
{
  "connectorId": "usajobs-search",
  "reviewedAt": "2026-08-30T00:00:00.000Z",
  "reviewDueAt": "2026-09-29T00:00:00.000Z",
  "exactHost": true,
  "exactPath": true,
  "getOnly": true,
  "publicOnly": true,
  "fullFields": true,
  "userConfiguredCredentials": true,
  "credentialValuesExcluded": true,
  "privilegedBoundary": true,
  "attributionRequired": true,
  "killSwitchRequired": true
}
```

## Selected-item adapter proof

`extractUsaJobsSearchItemV1` accepts exactly one selected `SearchResultItems` entry and requires its `MatchedObjectId` to match the requested control number. It produces bounded `FieldCandidateV1` evidence for title, agency/company, job summary and duties, locations, schedule/offering type, qualification and requirement text, posting/closing dates, an exact USAJOBS view/apply URL, announcement number, and remuneration ranges.

Source strings remain unchanged in candidate values and exact `rawValue` evidence. Salary strings are retained without inventing a currency or doing Phase 2 normalization. Every candidate has a `usajobs_api` source type, exact pointer, API method, extractor identity, capture time, confidence, source excerpt, and consumer-terms note. Public contact fields are ignored and absent from candidates/excerpts; credential-like or applicant/system-user fields reject the item atomically.

The three synthetic golden cases cover a complete public announcement, malformed optional fields with safe partial retention, and ignored public contact fields. The retained accuracy witness is:

```json
{
  "fixtureCases": 3,
  "expected": 33,
  "produced": 33,
  "exactMatches": 33,
  "falsePositives": 0,
  "falseNegatives": 0,
  "precision": 1,
  "recall": 1
}
```

Per-field precision and recall are both `1` for all eleven retained fields. Focused coverage for `usajobs-search-item.ts` is 94.5% statements, 92.54% branches, 100% functions, and 95.29% lines; `usajobs-search.ts` is 94.17% statements, 87.6% branches, 100% functions, and 97.77% lines.

## Local verification

The implementation commit passed:

- frozen offline install for all 23 workspace projects;
- repository format check;
- full typecheck (32 tasks) and lint (22 tasks), including Rust check/fmt/clippy;
- full build (22 tasks), including web/PWA, extension packages, and the native storage probe;
- full unit suite: 73 files and 638 tests;
- full coverage: 84.28% statements, 78.18% branches, 83.58% functions, and 86.81% lines;
- import boundaries (19 package policies), foundation records (51 direct dependencies, 3 toolchains, 16 execution targets, 10 accessibility cases), and six generated-schema checks;
- license policy: 520 npm packages and 498 Rust crates;
- secret scan across tracked and unignored workspace files;
- npm audit with no known vulnerabilities and Cargo audit over 499 locked crates under the existing 15-warning advisory policy; and
- Changesets status with `@coredrill/extractors` and `@coredrill/source-policy` covered by `.changeset/add-usajobs-public-search.md`.

The full build retains the already-documented Firefox source-archive path warnings and web chunk-size warning; neither was introduced by this connector-only slice and both build lanes exited successfully.

## Hosted clean-commit proof

The exact implementation head completed [Foundation CI run 33516468091](https://github.com/seabAu/Coredrill/actions/runs/33516468091) successfully at `0768b3582bed16a2512a48a100decac55d30261d`. The [aggregate quality job 99884627950](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884627950) installed the frozen dependency graph and passed the complete foundation gate, including build, typecheck, lint, 638-unit-test and coverage passes, import boundaries, foundation records, generated schemas, secret and license policy, npm and Rust advisory checks, and Changesets status. The push-only dependency-review job was skipped by design.

The clean matrix also passed:

- [Chrome 151 job 99884627946](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884627946) and [Chrome 152 job 99884628110](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884628110);
- [Firefox 153 job 99884627801](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884627801) and [Firefox 154 job 99884627924](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884627924);
- [Windows job 99884627944](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884627944), [macOS job 99884627541](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884627541), and [Ubuntu job 99884627884](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884627884);
- [extension-transfer job 99884628188](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884628188); and
- [full-history secret-scan job 99884628026](https://github.com/seabAu/Coredrill/actions/runs/33516468091/job/99884628026).

Representative immutable artifact witnesses are Windows installer artifact `9804246057` (`sha256:f6695f93b9ad7bc1af1a7638fa5de698eda2135511cce824e14df9ff21b6eff2`), macOS application artifact `9803957844` (`sha256:1c6bd0ef028c8328b63c5d2d7abbe07a5364b79222c60301385e5839221a13f6`), Linux AppImage artifact `9804202741` (`sha256:9da1c4dea7d845694a905979a639d2c8baea09533be7201550b5c526c9215b72`), Chromium extension artifact `9804337004` (`sha256:762a84eb220dad9df47476e3eeb6a9dc865d4a5bceb8d8723cc7933e6244111b`), and extension-transfer artifact `9803931699` (`sha256:c2ff96632b613e34430d8fc38deabde905c0c34c9e1bcc6df5623c4053956a13`). All were unexpired when the proof was recorded on 2026-09-03. XTR-006 itself introduces no executable transport, binary, or network artifact.

## Decision and boundary audit

No Accepted decision changed. This implements D-033's reviewed USAJOBS interface and the existing `configured_official_api` / `user_configured` connector model. SQLite remains durable truth; no store, database, hosted-service, account, AI, extension-permission, or Rust-boundary decision changed, so no ADR is needed.

Hosted proof closes `XTR-006`. `XTR-007` is the next smallest unblocked slice: deterministic normalization for title, company, location, work mode, salary, currency, date, and source while retaining every raw candidate and its provenance. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners.
