# Phase 2 review Inbox queue verification

Date: 2026-09-26  
Checklist item: `REV-001`  
Status: complete

## Outcome

The durable capture Inbox now has explicit queue counts, deterministic keyboard
selection, named review-panel routing, and a direct route from Home. This slice
does not accept fields, resolve conflicts, merge, snooze, discard, create a job,
or refresh a source; those actions remain owned by later `REV-*` items.

## Implemented contract

- Home's **Review captures** action opens the Pipeline Inbox, refreshes the
  local durable receipt list, records `/pipeline?view=inbox&savedView=...` in
  local history, and performs no external request.
- The queue reports the durable item total and the selected position.
- The active queue item is the single tab stop. Arrow Down and Arrow Up wrap;
  Home and End select the first and last item. Focus follows selection.
- Every queue button points to the exact review article with `aria-controls`;
  the article is named by the selected capture heading.
- Routing a queue selection resets section/evidence selection and renders the
  already-validated, inert local preview. Existing source-path focus,
  sanitization, size bounds, and fail-closed preview behavior are unchanged.
- Empty, loading, and error states remain explicit and do not claim a queue
  item exists.
- Concurrent shell receipt reads share one in-flight browser database open, so
  the Home count and a direct Inbox route cannot race for the exclusive OPFS
  vault lease.

## Automated proof

The two-receipt browser fixture routes from Home to the Inbox, verifies the
active Pipeline view and visible count, moves between both queue items with
Arrow Down/Up, verifies the correspondingly named review article, exercises
source/evidence navigation, confirms zero external requests, runs axe against
the complete review surface, and checks narrow-screen reflow.

```text
REV001_PROOF {"durableQueueItems":2,"countVisible":true,"homeReviewRoute":"/pipeline?view=inbox","activeInboxView":true,"arrowSelectionWraps":true,"selectedReviewPanelNamed":true,"sourcePreviewStillInert":true,"axeViolations":0,"externalRequests":0}
```

## Local verification

- Focused `CaptureInboxReview` unit suite: 3/3 passing.
- Full application-shell browser suite: 63/63 passing, including the durable
  two-item queue proof, capture-path regressions, responsive checkpoints, and
  automated accessibility checks.
- Full unit suite: 78 files, 691 tests, passing.
- Workspace typecheck: 33 tasks, passing.
- Workspace lint: 22 packages plus tooling, passing with zero warnings.
- Workspace build: 22 tasks, passing.
- Formatting, architecture boundaries, foundation records, tracked/unignored
  secret scan, and the 7-file/38-test security suite: passing.
- Hosted clean-commit matrix for `5429b8c`: [GitHub Actions run
  36275145843](https://github.com/seabAu/Coredrill/actions/runs/36275145843),
  passing across static/policy checks, Chrome and Firefox browser storage,
  Chromium/Firefox extension transfer, the full-history secret scan, and
  Windows, macOS, and Ubuntu native packaging.

## Decision impact

No accepted decision changes. The slice stays inside the local-first capture
and review journey, preserves inert source rendering, and performs no network
or canonical data write.
