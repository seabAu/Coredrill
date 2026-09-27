# Phase 2 review source states verification

Date: 2026-09-26  
Checklist item: `REV-005`  
Status: complete

## Outcome

Capture review now derives one explainable source condition from explicit local
observations: available, expired, changed, blocked, or unsupported. The
projection reads retained evidence, a listing validity candidate, checked-in
source policy, and explainable stored-source identity suggestions. It has no
network, persistence, extraction, or mutation capability.

Blocked sources cannot be promoted. Expired, changed, and unsupported captures
remain reviewable because their retained evidence may still be useful, but each
shows a manual or paste fallback. Every non-available state says that the
original receipt, candidates, source paths, and provenance remain local, and
the UI states explicitly that no automatic refresh occurred.

## State contract

The strict version-1 input validates an exact safe shape and uses stable
precedence: blocked, expired, changed, unsupported, available.

- `blocked` is driven by an exact-host checked-in policy that is disabled or
  outside its reviewed interval. It disables acceptance and Save/Merge while
  keeping the retained capture visible and offering manual entry.
- `expired` is driven only by a retained `valid_through` date or exact instant.
  A date-only listing remains valid through that date; expiration does not
  delete the capture or a saved job.
- `changed` requires a stored source-ID or canonical-URL match without a matching
  content hash. It never instructs Coredrill to overwrite confirmed fields.
- `unsupported` requires a safe retained source URL with no supported snapshot
  section and no field candidate. It offers paste/import/manual entry without
  fetching the URL.
- `available` means only that retained local evidence is ready for review; it is
  not a claim that the live page was checked or remains current.

## Automated proof

The frozen state fixture covers every state and fallback, strict invalid-input
rejection, precedence, date-only expiration, non-overwrite language, and the
literal no-refresh contract:

```text
REV005_STATE_PROOF {"states":["available","expired","changed","blocked","unsupported"],"noRefresh":true,"blockedPromotion":true,"manualFallbacks":4}
```

The component fixture renders all five conditions, four usable fallback
controls, explicit no-refresh text, and disabled blocked-source promotion:

```text
REV005_COMPONENT_PROOF {"states":["available","expired","changed","blocked","unsupported"],"noRefresh":true,"blockedPromotion":true,"fallbackActions":4}
```

Real-browser tests create URL-only blocked and unsupported captures through the
shipped Add dialog, exercise both fallback modes, and prove that a second
capture with the same canonical source but different content is labeled changed
without blocking review. Axe reports no violations and request observation
records no external network request:

```text
REV005_E2E_PROOF {"blocked":true,"unsupported":true,"manualFallbacks":true,"retainedEvidence":true,"networkRequests":0,"accessibilityViolations":0}
```

## Local verification

- Focused application and UI suites: 2 files, 9 tests, passing.
- Focused browser source-state flow: 2/2 passing with zero external requests
  and zero accessibility violations.
- Full unit suite: 82 files, 713 tests, passing.
- Full app-shell browser matrix: 66/66 passing, including all earlier review,
  source-preview, supplied-capture, responsive, keyboard, and accessibility
  journeys.
- Full TypeScript matrix: 33/33 tasks passing.
- Full lint matrix: 22/22 tasks passing.
- Full 22-package production build: passing.
- Import boundaries, foundation records, Changesets, secret scan, and repository
  formatting: passing.
- Implementation commit: `bd5d95a5cedc638fbcd0c955eb0dc1e0200dec99`.
- Hosted clean-commit verification:
  [Foundation CI run 36283961379](https://github.com/seabAu/Coredrill/actions/runs/36283961379),
  passing across the aggregate foundation gate, exact Chrome 151/152 and
  Firefox 153/154 browser-storage lanes, extension transfer, full-history
  secret scan, and Windows, macOS, and Ubuntu native package lanes.

## Decision impact

No accepted decision changes. This slice realizes the existing requirements for
retained provenance, source-policy enforcement, explicit manual fallback,
non-overwriting refresh semantics, and no hidden network activity. It adds no
schema, permission, connector, hosted service, or automatic source-refresh path.
