# Source policy records

A network connector cannot ship without a checked-in policy record, current
terms/license review, fixtures, rate/retention/attribution rules, and a kill
switch.

The version-1 registry currently contains exactly three reviewed production
records:

- Greenhouse Job Board: exact published-job GET on
  `boards-api.greenhouse.io`, no credentials;
- Lever Postings: exact published-job GET on `api.lever.co` or
  `api.eu.lever.co`, no credentials; and
- USAJOBS Search: exact Public-only search on `data.usajobs.gov`, with
  user-owned credentials bound only at the privileged connector boundary.

All three were re-reviewed on 2026-09-26 and expire at
2026-10-26T00:00:00.000Z unless refreshed. Registry approval does not turn a
connector on. `XTR-009` requires an explicit enabled-connector set and user
action, then rechecks exact destination/method, review age, global and targeted
kill switches, source-specific rate scope, one-in-flight policy, bounded
memory-only cache, response size, retry/backoff, retention, and attribution.
Unknown sources remain denied by default.

`XTR-010` keeps a separate checked-in exclusion inventory for source automation
that must never be supplied to the connector transport. It currently contains
explicit `disabled` records for LinkedIn and Glassdoor automation. Each record
has zero allowed methods, exact affected domains, current official policy and
privacy links, a review window, a no-network/no-retention rule, a kill switch,
and a user-visible manual-entry fallback. Changing only `status` to `enabled`
is invalid because an enabled record must have at least one separately reviewed
method. The complete audit registry denies these known exclusions as
`connector_disabled`; an unreviewed ID remains `unknown_connector`. Manual
capture remains available in both cases.
