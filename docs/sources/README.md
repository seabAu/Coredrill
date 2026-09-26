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
