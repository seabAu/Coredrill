# Phase 2 connector source-policy audit

Date: 2026-09-27  
Checklist item: `Q2-004`  
Status: repository audit and local verification complete; hosted clean-commit verification pending

## Outcome

Every production connector is represented by one current, checked-in policy record and one exact transport profile. The audit rechecked the records against current primary documentation, traced attribution and retention through the runtime boundary, exercised every rate scope and both kill-switch levels, and confirmed that prohibited automation remains non-executable.

The audit found one material enforcement gap: transport authorization checked the connector and destination but trusted several descriptor fields after TypeScript compilation. A forged USAJOBS descriptor could therefore substitute an unapproved query such as `Status`, omit the fixed full-field requirement, or alter the privileged header-binding declaration while still reaching the injected executor. The transport now validates the complete runtime descriptor and exact key set before authorization or execution. The audit also aligned Lever's transport path with the request builder's documented UUID versions 1 through 8.

No connector was added or enabled, no permission was broadened, and no live credential, background discovery, scraping, submission, or hosted service was introduced.

## Reviewed inventory

| Source                            | Executable boundary                                                                                                                                                                   | Attribution and durable retention                                                                                                                                                                                                   | Rate/cache boundary                                                                                  | Disable boundary                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Greenhouse Job Board              | One unauthenticated `GET` to the exact `boards-api.greenhouse.io` detail path; application questions and unknown descriptor fields are rejected                                       | Result carries Greenhouse attribution and policy links; only a user-selected posting snapshot and derived evidence may enter the local vault until deletion                                                                         | One request/second and one in flight per board; 24-hour, 128-entry, 2 MiB memory-only response cache | Connector is default-off; targeted and global runtime kills fail closed |
| Lever Postings                    | One unauthenticated `GET` to the exact global or EU posting-detail path; arbitrary hosts, query strings, API keys, and application submission are rejected                            | Result carries Lever attribution and policy links; only a user-selected published-posting snapshot and derived evidence may enter the local vault until deletion                                                                    | One request/second and one in flight per exact region/site; same bounded memory-only cache           | Connector is default-off; targeted and global runtime kills fail closed |
| USAJOBS Search                    | One credential-bound `GET` to exact `data.usajobs.gov/api/search`; exact opaque bindings, `WhoMayApply=Public`, `Fields=Full`, bounded pagination, and a targeted query are mandatory | Result credits USAJOBS and retains only a user-selected public JOA snapshot/derived evidence in the registered user's local vault; credential values, contacts, internal/status announcements, and feed redistribution are excluded | One request/second and one in flight for the source; same bounded memory-only cache                  | Connector is default-off; targeted and global runtime kills fail closed |
| LinkedIn and Glassdoor automation | No executable method or transport profile                                                                                                                                             | No automated response or extracted field may be retained; manual entry with a source URL remains available                                                                                                                          | No automated request rate is permitted                                                               | Strict checked-in disabled records plus the global network kill         |

All three enabled records were reviewed at `2026-09-26T00:00:00.000Z` and are due for review before `2026-10-26T00:00:00.000Z`. Runtime authorization rejects stale or not-yet-valid records.

## Primary-source review

- Greenhouse's current [Job Board API](https://developers.greenhouse.io/job-board.html) documents public unauthenticated GET access and separates applicant submission; its [legal terms](https://www.greenhouse.com/legal) and [privacy policy](https://www.greenhouse.com/privacy-policy) remain linked in the record. No published request-per-time allowance was found, so Coredrill retains its conservative per-board limit.
- Lever's current [Postings API reference](https://github.com/lever/postings-api/blob/f61aac5831a193bc66e1183c3ad102739dfd9f56/README.md) at reviewed commit `f61aac5831a193bc66e1183c3ad102739dfd9f56` continues to describe publicly viewable postings and the exact global/EU endpoints; its [legal terms](https://www.lever.co/legal) and [privacy policy](https://www.employinc.com/privacy/) remain linked. The published application-POST limit is not treated as a public-posting GET allowance.
- USAJOBS's current [Search API reference](https://developer.usajobs.gov/api-reference/get-api-search), [authentication guide](https://developer.usajobs.gov/guides/authentication), [rate-limit guide](https://developer.usajobs.gov/guides/rate-limiting), [API request terms](https://developer.usajobs.gov/apirequest/index), and [terms of use](https://developer.usajobs.gov/guides/terms-of-use) support the existing registered-user, public-announcement-only boundary. Documented result/page maxima are not interpreted as a request-per-time allowance.
- LinkedIn's [prohibited software guidance](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions) and Glassdoor's [terms](https://www.glassdoor.com/about/terms-2022-12-01/) continue to support disabled automation records and manual capture only.

## Runtime proof

`packages/source-policy/test/connector-transport.test.ts` proves that:

- forged descriptor variants are rejected with `request_shape_invalid` before the injected executor receives them;
- Greenhouse questions, unknown keys, Lever API-key query strings, credential-mode changes, USAJOBS non-public search, incomplete credential bindings, missing fixed fields, and unknown keys all fail closed;
- a valid Lever version-7 UUID generated by the reviewed request builder reaches the aligned transport boundary;
- Greenhouse board, Lever region/site, and USAJOBS source scopes enforce separate one-second windows and one request in flight;
- every enabled connector exposes current review state, attribution, local-vault retention, and rate disclosure; and
- LinkedIn and Glassdoor remain the complete disabled automation set.

The focused source-policy suite passes 53 tests across five files and emits a machine-readable `Q2_CONNECTOR_AUDIT_PROOF` record. The full repository verification and hosted clean-commit matrix will be recorded before `Q2-004` is marked complete.

## Decision review

No Accepted decision changed, so no new ADR is required. The fix enforces the existing strict connector-policy, local-first retention, least-privilege, and default-off decisions at runtime.
