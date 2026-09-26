# Phase 2 review field-group verification

Date: 2026-09-26  
Checklist item: `REV-002`  
Status: implementation verified locally; hosted clean-commit evidence pending

## Outcome

The durable Inbox now presents every retained field candidate in a bounded,
read-only review structure. The presentation exposes evidence and uncertainty
without accepting a value, resolving a conflict, creating a job, or changing
canonical storage.

## Implemented contract

- Known field names map to Role & company, Location & work mode, Compensation,
  Description, Requirements, or Source & dates. Unknown names remain visible
  under Additional details.
- Each candidate card displays its exact proposed value, extraction method,
  numeric confidence, source excerpt, source path, and confirmation state.
- Distinct canonical JSON values for the same field produce an explicit
  `Unresolved conflict` label with the retained candidate count. The state is
  communicated with text and structure, not color alone.
- Capture envelopes are untrusted ingress. An embedded `userConfirmation`
  claim is intentionally downgraded to `unconfirmed` in the preview projection;
  the component supports a trusted `user_confirmed` presentation only when its
  caller supplies that application-owned state.
- Candidate source controls preserve the existing exact-path focus and inert
  excerpt-highlighting behavior. No review card performs a network request or
  write.

## Automated proof

The component fixture covers a documented group, unknown-field fallback,
unconfirmed and trusted-confirmed presentation states, two differing retained
values, exact method/confidence/excerpt display, and fail-closed malformed
conflict metadata:

```text
REV002_COMPONENT_PROOF {"documentedFieldGroup":true,"unknownFieldFallbackGroup":true,"methodVisible":true,"confidenceVisible":true,"sourceExcerptVisible":true,"confirmationStatesVisible":true,"unresolvedConflictVisible":true,"conflictUsesText":true}
```

The browser fixture proves a real durable capture exposes both role/company
candidates in one named group, retains evidence routing, reflows at the narrow
checkpoint, makes no external request, and has no automated axe violation:

```text
REV002_E2E_PROOF {"fieldGroupVisible":true,"groupedCandidates":2,"methodVisible":true,"confidenceVisible":true,"confirmationStateVisible":true,"sourceExcerptVisible":true,"exactSourceRouting":true,"narrowReflow":true,"axeViolations":0,"externalRequests":0}
```

## Local verification

- Focused capture projection and UI component suites: 2 files, 8 tests,
  passing.
- Focused source-preview browser E2E: 1/1 passing with zero axe violations and
  zero external requests.
- Capture-core and UI builds, TypeScript checks, and lint: passing.
- Full repository format, 33/33 TypeScript tasks, 22/22 lint tasks, 22/22
  builds, import boundaries, foundation records, secret scan, 38 security
  tests, and 693 unit tests: passing.
- Full app-shell browser matrix: 63/63 passing, including the REV-002 proof,
  with zero axe violations and zero external requests in the review fixture.
- Hosted clean-commit verification: pending the final slice commit.

## Decision impact

No accepted decision changes. The slice makes the existing evidence,
provenance, confirmation-precedence, and no-false-certainty decisions visible
without adding a write path or trusting capture-supplied confirmation metadata.
