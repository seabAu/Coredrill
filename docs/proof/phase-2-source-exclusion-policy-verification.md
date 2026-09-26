# Phase 2 source-exclusion policy verification

Checklist item: `XTR-010`

Status: implementation verified locally; hosted clean-commit evidence pending

## Scope

This proof covers explicit disabled records and policy fixtures for prohibited
or unreviewed source automation. It does not add a connector, fetch a source,
broaden extension permissions, or disable manual entry.

## Current policy review

The source-policy records were reviewed on 2026-09-26 against current official
materials:

- [LinkedIn prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions)
  says third-party crawlers, bots, browser plug-ins, and extensions may not
  scrape or automate LinkedIn; the record also links the current
  [LinkedIn privacy policy](https://www.linkedin.com/legal/privacy-policy).
- [Glassdoor Terms of Use](https://www.glassdoor.com/about/terms-2022-12-01/)
  prohibit software or automated agents that scrape, strip, or mine the
  service without express written permission; the record links the current
  [Glassdoor privacy policy](https://hrtechprivacy.com/brands/glassdoor).

Both records are due for review by 2026-10-26 or earlier if the source policy
changes.

## Implementation evidence

- `packages/source-policy/src/disabled-source-policies.ts` contains exact,
  immutable LinkedIn and Glassdoor automation records with `status: disabled`,
  zero allowed methods, exact affected domains, no-network/no-retention rules,
  manual-entry fallback text, and a kill switch.
- `packages/source-policy/src/connector-policy.ts` accepts an empty method set
  only for a disabled record. Changing only its status to enabled fails strict
  parsing, so a one-field edit cannot make either exclusion executable.
- `CHECKED_IN_CONNECTOR_POLICY_RECORDS_V1` remains the three reviewed transport
  profiles. The exclusions live in
  `CHECKED_IN_DISABLED_SOURCE_POLICY_RECORDS_V1`, and the combined
  `CHECKED_IN_SOURCE_POLICY_RECORDS_V1` exists for policy audit and denial
  tests only.
- The combined registry returns `connector_disabled` for the two explicit
  exclusions, returns `unknown_connector` for an unreviewed source ID, and
  continues to allow the separate non-network `manual_capture` request.
- No exclusion record is supplied to `createConnectorTransportV1`, and neither
  record has a transport profile or request builder.

## Policy fixture proof

The focused test emits:

```text
XTR010_PROOF {"prohibitedRecords":["glassdoor-automation","linkedin-automation"],"allProhibitedRecordsDisabled":true,"linkedInAutomationDenied":true,"glassdoorAutomationDenied":true,"unknownSourceDenied":true,"transportProfilesRemainReviewedOnly":true,"exclusionsAbsentFromTransportRegistry":true,"manualCaptureUnaffected":true}
```

The same suite retains the earlier `XTR001_PROOF` and its count of three
production network records.

## Local verification

- Focused connector-policy test: 13/13 passing.
- Complete source-policy suite: 5 files, 49 tests, passing.
- Full unit suite: 78 files, 691 tests, passing.
- Source-policy TypeScript source and test typechecks: passing.
- Workspace typecheck: 33 tasks, passing.
- Workspace lint: 22 packages plus tooling, passing with zero warnings.
- Formatting, architecture boundaries, foundation records, tracked/unignored
  secret scan, and the 7-file/38-test security suite: passing.
- Remaining full-repository verification: pending the final slice commit.

## Decision impact

No accepted decision changes. The implementation makes accepted `D-033`
(approved sources only) and `D-034` (no LinkedIn/Glassdoor scraping foundation)
executable without adding a transport capability.
