# Phase 2 listing snapshot diff verification

Date: 2026-09-26  
Checklist item: `REV-006`  
Status: complete; local and hosted clean-commit proof passing

## Outcome

The application layer now compares two explicit immutable listing snapshots
through a strict version-1 boundary. It reports stable freshness identity and
added, removed, or changed requirements, compensation, deadline, locations,
and retained content. The comparison has no repository, network, extraction,
confirmation, refresh, or trusted-field mutation capability.

The Job Source tab renders the result as read-only evidence. Requirement and
location changes remain itemized, scalar changes retain before/after values,
and content change is represented by the already-retained snapshot hashes with
a route back to the exact snapshots. The panel states that it did not refresh a
source and that confirmed values remain unchanged until the user explicitly
accepts a replacement through a later trusted command.

## Comparison contract

- Both snapshots require distinct stable IDs, exact increasing capture
  instants, lowercase SHA-256 content hashes, bounded unique requirement keys,
  bounded unique normalized locations, valid date-only deadlines, and bounded
  structured compensation.
- A stable requirement key distinguishes added, removed, and changed
  requirements without guessing semantic equivalence from prose.
- Compensation and deadline changes distinguish unchanged, added, removed, and
  changed states. Locations preserve exact added and removed values.
- Retained content compares hashes rather than duplicating source text into a
  second canonical representation.
- Every nested output is immutable. `refreshPerformed` and
  `trustedFieldMutationPerformed` are literal `false`.

## Automated proof

Frozen fixtures cover equivalent and fully changed snapshots, nullable scalar
addition/removal, deterministic requirement/location ordering, exact change
counts, deep immutability, reversed chronology, duplicate keys/locations, and
malformed identities/hashes:

```text
REV006_DIFF_PROOF {"requirements":{"added":1,"removed":1,"changed":1},"compensation":"changed","deadline":"changed","locations":{"added":1,"removed":1},"content":"changed","refreshPerformed":false,"trustedFieldMutations":0}
```

The Source-tab component proof renders each category through semantic text and
lists, before/after values, explicit local snapshot times, and the confirmation
boundary:

```text
REV006_COMPONENT_PROOF {"requirementsRendered":true,"compensationRendered":true,"deadlineRendered":true,"locationsRendered":true,"contentRendered":true,"trustedFieldMutations":0}
```

## Local verification

- Focused application and UI suites: 2 files, 10 tests, passing.
- Full unit matrix: 83 files, 718 tests, passing.
- Full TypeScript matrix: 33/33 tasks, passing.
- Full lint matrix: 22/22 tasks, passing.
- Full build matrix: 22/22 tasks, passing.
- Application-shell browser regression: 66/66 tests, passing, including the
  Source route, narrow Source reflow, forced-colors/responsive checkpoints, and
  zero automated axe findings or unexpected external requests.
- Format, foundation-record, import-boundary, Changesets, and secret checks:
  passing.

## Hosted verification

- Implementation commit:
  [`996520f4ad46482c72ee2cbc0212d567cf246d02`](https://github.com/seabAu/Coredrill/commit/996520f4ad46482c72ee2cbc0212d567cf246d02)
- [Foundation CI run 36285418663](https://github.com/seabAu/Coredrill/actions/runs/36285418663):
  passing on the aggregate build/static/test/policy gate, exact Chrome 151 and
  152 storage/application journeys, exact Firefox 153 and 154 storage
  journeys, Chromium/Firefox extension transfer and package proof,
  full-history secret scan, and Windows, macOS, and Ubuntu native storage and
  package lanes. The push-only dependency-review job was correctly skipped.

## Decision impact

No accepted decision changes. This slice realizes the existing immutable
snapshot, explicit freshness, provenance, confirmation-precedence, and
user-invoked-refresh requirements. It adds no schema, transport, connector,
permission, hosted service, automatic refresh, or trusted-field update path.
