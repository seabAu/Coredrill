# Phase 3 Career Profile repository verification

Date: 2026-09-27
Checklist item: `EVD-001`
Implementation commits: `6476de93df77ce73ed0840fb73d94eecd9275d48`, `e2755846f9326c24e52612ebcf3eb31e6210f346`
Hosted run: [Foundation CI 36305639670](https://github.com/seabAu/Coredrill/actions/runs/36305639670)
Status: complete

## Outcome

The durable Career Profile repository family now covers employment, education, projects, skills, accomplishments, certifications, publications, volunteer experience, stories, and preferences. Schema migrations `0102` through `0111` advance the database to schema version `111`, and each repository uses the same validated storage boundary rather than introducing UI or cache state as canonical truth.

The shared `phase-3-career-repositories-v1` contract proves two ordered cases across supported runtimes:

1. All ten Career Profile areas round-trip through their repository contracts.
2. A missing related source document rejects the write and rolls back the entire transaction.

The manifest carries an explicit `caseNames` order so browser-driver JSON serialization cannot change proof interpretation. This corrected a CI assertion-order issue found by the first hosted run; it did not change repository behavior.

No Career Profile editor, resume import, AI extraction, hosted service, account, or unrelated product feature was started in this slice.

## Local verification

- `pnpm verify` passed its complete repository gate: formatting, boundaries, foundation records, 33 typecheck tasks, 22 lint/build tasks, 88 unit-test files with 745 passing tests, browser suites, native tests, license inventories, secret checks, and dependency audits.
- Unit coverage passed at 83.92% statements, 77.56% branches, 85.17% functions, and 87.06% lines.
- The Chromium storage matrix passed all 8 cases against official SQLite `3.53.0`, OPFS `opfs-sahpool`, and schema version `111`.
- Local Firefox `156.0.1` passed the same storage proof with 18 Phase 1 contract cases and 2 Career Profile contract cases.
- Native verification passed 11 Rust tests with 1 intentionally ignored platform-specific test and 13 native TypeScript tests.
- Focused formatting, storage-core typecheck, lint, repository unit tests, and the complete Chromium storage matrix passed again after the explicit contract-case ordering correction.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; the npm and Rust audits reported zero known vulnerabilities, with 7 reviewed Rust advisories/warnings remaining allowed by policy.

## Recovery and export compatibility

- Recovery fixtures were regenerated at schema version `111`.
- Authoritative archive SHA-256: `69dc8594f60745acc9a8672529d25e409d50c12b3e668e55a2ab28c245c5beab`.
- Restored content SHA-256: `bb710c3df50eef20a19ba1eb2d70397c36d18cf48170ddb1c0bc3318599c8550`.
- Recovery accepts both the prior schema `101` archive and the new schema `111` archive.
- The human-readable portable export deliberately remains at the existing 30 datasets / 60 files until `EVD-008`; the authoritative SQLite archive already carries the Career Profile records.

## Hosted clean-commit verification

Foundation CI run `36305639670` completed successfully for exact head SHA `e2755846f9326c24e52612ebcf3eb31e6210f346`:

- Full-history secret scan: job `108581854596`, passed.
- Build, static checks, tests, and policy: job `108581854650`, passed.
- Chrome `151.0.7922.138`: job `108581854711`, passed the explicit Career Profile repository parity step.
- Chrome `152.0.7977.54`: job `108581854697`, passed the explicit Career Profile repository parity step.
- Firefox `153.0`: job `108581854703`, passed.
- Firefox `154.0`: job `108581854706`, passed.
- Windows native storage, installed startup, and package: job `108581854777`, passed.
- macOS native secure storage and package: job `108581854652`, passed.
- Ubuntu native secure storage and package: job `108581854696`, passed.
- Extension transfer fallback: job `108581854681`, passed.

The run retained 15 immutable artifacts. Representative package proof includes the Windows NSIS artifact `10927093851` (`sha256:dc7269108ebfa704c0d07fae8558d5d5f7f010af35933ebafd02e938973f11a9`), macOS application artifact `10926874109` (`sha256:b912628f0375b1ea7e61f4ef1527af9dbe95bdd37385c48b7b3d923a502e4294`), and Linux AppImage artifact `10926779917` (`sha256:5b113993f04267a192ccff22da2da315a9aa554891b0d4d7b75894d29cb593d6`).

## Decision review

No Accepted decision changed. The implementation follows the existing TypeScript/SQL/Rust ownership boundary, SQLite durable-truth decision, versioned-contract requirement, local-first baseline, and archive compatibility policy. No ADR was required.
