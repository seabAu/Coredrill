# Phase 2 production extension state catalog verification

Date: 2026-09-26  
Checklist item: `PEX-001`  
Status: complete; local and hosted clean-commit proof passing

## Outcome

The production extension now has one immutable version-1 catalog for all six
reviewed states: unrecognized, recognized, needs-input, queued, transferred,
and permission-needed. Every state names the available and unavailable work,
what remains local, and its required next actions. No action is labeled Apply.

The resolver accepts only exact version-1 facts and applies stable precedence:
permission-needed, transferred, queued, then recognition. The page classifier
accepts only a valid `PageCaptureSnapshot`; it requires retained job-posting
evidence plus title and company for recognized, retains incomplete job evidence
as needs-input, and leaves generic pages unrecognized. It never fetches,
persists, confirms, or promotes a field.

## State and permission boundaries

- Unrecognized pages offer selected-text capture, manual Inbox review, and
  close without claiming field confidence.
- Recognized pages require an explicit Send to Workspace action; the preview
  remains provisional in extension memory until that action.
- Needs-input pages preserve detected evidence and offer selection correction
  or manual Inbox review.
- Queued work states that the full capture remains in the bounded local outbox
  until acknowledgement or expiry and exposes retry, export, and workspace
  paths.
- Transferred work names the durable Inbox receipt and states that acknowledged
  full content is no longer retained in the extension outbox.
- Permission-needed names exactly temporary `activeTab` plus scripting on the
  current HTTP(S) page, explains why, preserves the outbox, and offers a manual
  fallback. The checked-in manifests retain empty host and optional-host
  permission lists.

The live extension panel uses the catalog for recognized, unrecognized,
needs-input, queued, and permission-needed runtime facts. The transferred
catalog entry renders from an explicit acknowledged fact; the later hosted
transfer slice owns supplying that fact across the production handshake. This
slice does not absorb preview correction/notes (`PEX-002`), retry/backoff and
crash semantics (`PEX-003`), the compatibility handshake (`PEX-004`), or the
hosted transfer matrix (`PEX-005`).

## Automated proof

The focused catalog test validates exact coverage, recursive catalog/action
immutability, required recovery actions, exact permission copy, no Apply
labels, resolver precedence, fail-closed input, snapshot classification, and
semantic rendering of every state:

```text
PEX001_STATE_CATALOG_PROOF {"states":6,"recognized":true,"unrecognized":true,"needsInput":true,"queued":true,"transferred":true,"permission":true,"applyLabels":0,"hostPermissionsAdded":0}
```

## Local verification

- Focused state-catalog and extension-boundary suites: 2 files, 10 tests,
  passing.
- Full unit matrix: 84 files, 723 tests, passing.
- Full TypeScript matrix: 33/33 tasks, passing.
- Full lint matrix: 22/22 tasks, passing.
- Full build matrix: 22/22 tasks, passing.
- Chromium/Firefox transfer regression: 2/2 browser tests, passing.
- Chromium and Firefox store-package inspection: exact production-directory
  matches; zero remote assets, remote imports, eval calls, secret findings, host
  permissions, or optional host permissions.
- Isolated Firefox source-package rebuild: byte-identical production directory
  and store package, passing from the frozen offline dependency graph.
- Format, foundation-record, import-boundary, Changesets, and repository secret
  checks: passing.

## Hosted verification

- Implementation commit:
  [`db32dd29ba4f3da9bff62ecf8c2622936d2ea3d4`](https://github.com/seabAu/Coredrill/commit/db32dd29ba4f3da9bff62ecf8c2622936d2ea3d4)
- [Foundation CI run 36287389246](https://github.com/seabAu/Coredrill/actions/runs/36287389246):
  passing on the aggregate build/static/test/policy gate, exact Chrome 151 and
  152 storage/application journeys, exact Firefox 153 and 154 storage
  journeys, Chromium/Firefox extension transfer and package proof,
  full-history secret scan, and Windows, macOS, and Ubuntu native storage and
  package lanes. The push-only dependency-review job was correctly skipped.

## Decision impact

No accepted decision changes. This slice realizes the accepted browser
extension UI and least-privilege capture rules. It adds no dependency, schema,
network endpoint, account, AI call, content script, host permission, optional
permission, automatic capture, or trusted-field update.
