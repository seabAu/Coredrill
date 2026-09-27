# Phase 3 evidence-state verification

Date: 2026-09-27
Checklist item: `EVD-002`
Implementation commits: `5b577e976cb90af3f7ee8d29c80169890974d285`, `33daa8e6d81b59756c015498e33efc25180d5bec`
Hosted run: [Foundation CI 36307988904](https://github.com/seabAu/Coredrill/actions/runs/36307988904)
Status: complete

## Outcome

Career evidence now has an explicit, fail-closed state policy for source references, verification, staleness, privacy tags, and future external-AI eligibility. The policy preserves the accepted `imported`, `user_confirmed`, `source_backed`, `stale`, and `disputed` verification states and requires every `source_backed` transition to carry a validated durable source reference.

Privacy tags are user-owned, lowercase, content-free identifiers. They are unique, sorted, limited to 16 values and 64 characters per value, and are persisted only on Career Profile stories, the record type for which the design authority currently permits privacy tags. Tagged evidence is ineligible for external AI context by default. Untagged evidence becomes only a future external-context candidate when it is `user_confirmed` or `source_backed`; a later feature must still require explicit user action before sending anything externally.

Staleness and verification transitions retain source provenance and privacy controls. User-confirmed values are never silently overwritten. No editor, resume import, AI integration, network flow, account, hosted service, or unrelated product feature was added.

## Contracts and persistence

- Migration `0112_anecdote_privacy_tags.sql` advances the shared database to schema version `112` and adds `anecdote.privacy_tags_json` with a non-null empty-array default.
- Migration checksum: `3d7beb402a18669257a88c789807b1e89cabb6e957ffd2f1760e649f600bee26`.
- `@coredrill/career-evidence` owns the pure evidence-state validation and transition policy; `@coredrill/storage-core` owns durable serialization and fail-closed storage validation.
- The shared `phase-3-career-repositories-v2` manifest runs three ordered cases: all ten Career Profile areas round-trip with privacy tags, a missing source document rolls back the aggregate, and unsafe story privacy-tag content is rejected without persistence.
- Browser, native, recovery, and portable-data compatibility assertions were advanced to schema version `112`. The human-readable export intentionally remains at 30 datasets / 60 files until `EVD-008`; the authoritative SQLite archive already carries story privacy tags.

## Local verification

- `pnpm verify` passed the complete repository gate: formatting, boundaries, foundation records, 33 typecheck tasks, 22 lint/build tasks, 89 unit-test files with 750 passing tests, browser suites, native tests, license inventories, secret checks, dependency audits, and Changesets status.
- Unit coverage passed at 83.98% statements, 77.62% branches, 85.25% functions, and 87.12% lines.
- Focused evidence/storage verification passed 4 files and 15 tests.
- The Chromium storage matrix passed all 8 cases against official SQLite `3.53.0`, OPFS `opfs-sahpool`, schema version `112`, and the three-case Career Profile contract.
- Native verification passed 11 Rust tests with 1 intentionally ignored platform-specific test and 13 native TypeScript tests.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust advisories/warnings allowed by policy.

## Recovery compatibility

- Authoritative archive byte length: `1,284,130`.
- Archive SHA-256: `22dcafbe8ac53f8f9f4d0931993f840f83724636ab40e98efc1d4f9820d9298b`.
- Database SHA-256: `9de3db88ec786546d1ff90ad8303c67da6199be1df6473816acca50d89af1b7b`.
- Restored content SHA-256: `a9a398f7be915e17478d02d5d24333cd05990dd42be7d8b03a7cd83aa5346db6`.
- Recovery accepts the reviewed schema `101`, `111`, and `112` archives.

## Hosted clean-commit verification

Foundation CI run `36307988904` completed successfully for exact head SHA `33daa8e6d81b59756c015498e33efc25180d5bec`:

- Full-history secret scan: job `108588488697`, passed.
- Build, static checks, tests, and policy: job `108588488701`, passed.
- Chrome `151.0.7922.138`: job `108588488736`, passed.
- Chrome `152.0.7977.54`: job `108588488714`, passed.
- Firefox `153.0`: job `108588488750`, passed the SQLite/OPFS and identical Career Profile repository contract.
- Firefox `154.0`: job `108588488734`, passed the SQLite/OPFS and identical Career Profile repository contract.
- Windows native storage, installed startup, and package: job `108588488607`, passed.
- macOS native secure storage and package: job `108588488713`, passed.
- Ubuntu native secure storage and package: job `108588488778`, passed.
- Extension transfer fallback: job `108588488725`, passed.

The first implementation run exposed one stale Firefox-harness expectation: it required the new three-case contract but still asserted manifest version `1`. Commit `33daa8e` changed only that expected version to `2`; the replacement run above passed both pinned Firefox generations and every other required lane.

## Decision review

No Accepted product or architecture decision changed. The slice follows the existing TypeScript/SQL ownership boundary, SQLite durable-truth decision, provenance and user-confirmation rules, local-first baseline, and explicit external-AI consent requirement. No new ADR was required for `EVD-002`.
