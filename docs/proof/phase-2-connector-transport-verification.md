# Phase 2 connector transport verification

Date: 2026-09-26  
Checklist item: `XTR-009`  
Status: complete; implementation verified locally and in the hosted clean-commit matrix

## Outcome

Coredrill now has one policy-owned, dependency-injected transport boundary for
the three approved production connectors. It does not add live discovery,
background work, a hosted service, credential storage, or an unreviewed source.
The application Settings route renders the checked-in connector disclosures
with every connector off by default.

## Current source review

The review was refreshed on 2026-09-26 and is due again at the exclusive
instant `2026-10-26T00:00:00.000Z`.

- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html) still
  documents published GET data as public and unauthenticated, the exact job
  detail endpoint, and `pay_transparency=true`. Application POST and
  `questions=true` remain excluded.
- Lever's official [Postings API](https://github.com/lever/postings-api) remains
  at upstream `master` revision
  `f61aac5831a193bc66e1183c3ad102739dfd9f56`. It still documents exact global
  and EU published-posting GETs, says published postings are public, and
  publishes no GET request-per-time allowance. Applicant POST remains excluded.
- [USAJOBS Search](https://developer.usajobs.gov/api-reference/get-api-search),
  [authentication](https://developer.usajobs.gov/guides/authentication),
  [rate limits](https://developer.usajobs.gov/guides/rate-limiting), and
  [terms](https://developer.usajobs.gov/guides/terms-of-use) still require a
  registered email/API key, describe Public search, and cap results at 10,000
  rows per query and 500 per page. Coredrill retains its stricter 100-page and
  100-row descriptor caps.

No accepted decision changed, so no ADR was required.

## Enforced transport contract

`packages/source-policy/src/connector-transport.ts` proves the following before
an injected HTTP executor can receive a request:

- the user initiated the action and the connector ID is in an explicit enabled
  set; the empty set is the default;
- the existing registry re-authorizes the connector, method, exact HTTPS host,
  review window, and global/targeted kill switches initially and again before
  every attempt;
- the URL matches the exact previously reviewed descriptor shape;
- Greenhouse is scoped per board, Lever per exact region/site, and USAJOBS per
  source; each scope permits one request in flight and one start per second;
- successful bodies are limited to 2 MiB and an LRU-style map retains at most
  128 exact-URL entries for 24 hours in memory only. Explicit cache clearing
  removes those bodies; durable selected snapshots remain governed by the
  connector record and local-vault deletion;
- retries are limited to network failures and HTTP `429`, `502`, `503`, and
  `504`; exponential delay and valid `Retry-After` are bounded at 30 seconds,
  attempts stop at three, and all other statuses fail closed; and
- network and cached results return the exact source URL, required attribution
  label, terms URL, review instants, and review age.

The transport accepts only an injected request function. This slice therefore
proves the controls without silently shipping a network client or credential
flow.

## Visible disclosure

`ConnectorRegistrySettings` renders the same policy records on the Settings
route. Each source shows:

- Off, On, or Blocked effective state;
- review age, exact review/due dates, and current/due-soon/expired state;
- last use, exact destination domains, credential mode, and attribution label;
- rate/cache/retention and user-visible data-flow text; and
- current terms/source-policy and privacy links.

The current composition passes no enabled connector IDs, so all three sources
display Off. Credential values are not part of either the disclosure model or
rendered markup.

## Automated proof

The focused source-policy and UI suites cover:

- default-off and both kill-switch paths;
- exact attribution for Greenhouse, Lever, and USAJOBS;
- 24-hour cache hit/expiry, explicit clearing, 128-entry eviction, and 2 MiB
  rejection;
- source-specific rate scopes and one-in-flight rejection;
- bounded `Retry-After`, retry exhaustion, terminal HTTP failure, and review
  expiry during backoff;
- last-use/review-age disclosure; and
- accessible static Settings markup with no credential value.

Local verification on the pinned Node `24.19.0` / pnpm `11.22.0` toolchain:

- frozen-lockfile install: pass; supply-chain policy accepted all 936 lock
  entries;
- focused source-policy plus connector Settings suites: 6 files, 48 tests,
  pass;
- full unit suite excluding the separately owned native-database proof: 78
  files, 688 tests, pass;
- security-focused suite: 7 files, 38 tests, pass;
- workspace typecheck: 33 tasks, pass;
- workspace lint: 22 packages plus tooling, pass;
- formatting, architecture boundaries, foundation records, Node and Rust
  licenses, and tracked/unignored secret scan: pass;
- fresh pnpm audit: 936 dependencies, zero advisories at every severity; and
- direct pinned-runtime web production build: 2,514 modules transformed and
  the PWA service worker generated successfully.

The root Turbo build completed 21 of 22 packages locally; the web package's
nested `pnpm` prebuild selected the host's stale Node 22 shim instead of the
pinned Node 24 process. Running the same web dependency builds and Vite build
directly with Node 24 passed. The hosted clean-commit matrix remains the
authoritative proof that the ordinary root command runs in the declared
toolchain environment.

## Hosted verification

[Foundation CI run 36272680253](https://github.com/seabAu/Coredrill/actions/runs/36272680253)
completed successfully on clean commit `3909369` on 2026-09-26. The matrix
passed:

- Chrome 151 and 152 application-shell, accessibility, storage, document,
  resilience, and onboarding journeys;
- Firefox 153 and 154 storage/repository contracts;
- the complete build, static-check, unit/security/policy, license, audit, and
  secret gate;
- Chromium and Firefox extension build/transfer proof; and
- Windows, macOS, and Linux native storage, secure-storage, recovery, lint,
  package, and launch proof.

The first hosted run of implementation commit `51ed7dc` correctly exposed that
Chrome 151's accessibility engine rejected an explicit `listitem` role on an
`article`. Commit `3909369` changed the disclosure cards to native `ul`/`li`
semantics, retained the inner articles and selectors, passed both exact failing
journeys locally, and then passed the complete hosted matrix above.
