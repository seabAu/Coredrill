# Phase 1 privacy-safe local diagnostic support-bundle verification

Date: 2026-08-29

Checklist scope: `APP-008`

Packages: `@coredrill/contracts`, `@coredrill/observability`, `@coredrill/application`, `@coredrill/storage-core`

Decision changes: none

## Outcome

`APP-008` implements a durable local diagnostic log and a user-copyable redacted support bundle. The implementation commit is `4f214c3`; `922130a` gives the exact native repository proof a proportional 60-second cold-Windows budget after a hosted runner reached the previous 15-second limit, and `10c1bd2` adds a bounded retry for a Linux keyring-daemon cleanup race that occurred only after the functional secure-store proof had passed.

`RecordDiagnosticEventCommand` owns event identity, operation time, and application version. It sanitizes untrusted attributes through the fail-closed observability boundary before one local append. `CopySupportBundleQuery` reads at most 200 recent records, revalidates every stored event, and returns deterministic pretty JSON under the versioned `SupportBundleV1` contract. There is no network or automatic-send capability.

SQLite schema versions 88-92 add the strict `diagnostic_event` table, newest-first index, database-level JSON allowlist, update immutability guard, and newest-1,000 retention trigger. The shared repository manifest advances to `phase-1-repository-contracts-v3`: six component suites and 18 ordered cases executed identically in fast Node SQLite, official SQLite WASM/OPFS, and native rusqlite.

## Privacy and durability contract

| Contract              | Enforced behavior                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Content-free ingress  | Event category/name/code, severity/outcome, application version, timing, operation UUID, and scalar attributes are bounded by explicit allowlists. Unknown keys, arbitrary strings, nested values, arrays, and forbidden private-field names are rejected or counted and discarded before persistence. |
| Defense in depth      | SQLite independently rejects malformed JSON, more than 32 attributes, unknown keys, disallowed string values, nested values, and path-shaped/private content even if a caller bypasses TypeScript validation.                                                                                          |
| Immutable local truth | Events cannot be updated. The repository serializes attribute keys deterministically, validates rows on read, and returns copied frozen DTOs. Deletes remain available for automatic retention and a future explicit clear operation.                                                                  |
| Bounded retention     | An insert trigger keeps only the deterministic newest 1,000 records by `occurred_at DESC, event_id DESC`; application/repository reads are capped at 200.                                                                                                                                              |
| Versioned local copy  | `SupportBundleV1` requires `delivery: local-copy`, `eventOrder: newest-first`, unique event IDs, at most 200 version-1 events, a semantic application version, and a generation instant.                                                                                                               |
| Corruption handling   | Bundle assembly revalidates every stored event. Duplicate, malformed, oversized, or content-bearing adapter results fail closed rather than being copied.                                                                                                                                              |
| Safe failures         | Busy, unavailable, permission, read-only, and invalid-state failures map to reviewed content-free application errors. Arbitrary exceptions never return paths, SQL, private values, or adapter text.                                                                                                   |
| Telemetry separation  | Local events and user-initiated copy do not imply consent to telemetry. Product telemetry remains off and requires the separate future opt-in, disclosure, and privacy review in D-053.                                                                                                                |

All fixtures use synthetic UUIDs and content-free tokens. Sentinel tests assert that private values and path-shaped strings are neither stored nor reflected in failures.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                                                                                                                                                                                                      | Result                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused contract/application tests before implementation                                                                                                                                                                                                                     | Expected red: the reviewed support-bundle fixture/API and diagnostic application operations did not yet exist.                                                                                                                                                                  |
| `pnpm exec vitest run packages/contracts/test/diagnostic-event.test.ts packages/contracts/test/support-bundle.test.ts packages/observability/test/diagnostics.test.ts packages/application/test/diagnostics.test.ts packages/storage-core/test/tracker-repositories.test.ts` | Passed: 5 files and 23 tests covering schema generation, redaction, bundle ordering/uniqueness, stable failures, malformed stored data, database rejection, immutability, and retention.                                                                                        |
| `pnpm test:storage-native`                                                                                                                                                                                                                                                   | Passed: 10 native tests, including the identical 18-case v3 repository contract through rusqlite.                                                                                                                                                                               |
| `pnpm test:storage-browser`                                                                                                                                                                                                                                                  | Passed: 6 Chromium tests at schema version 92, including the identical 18-case v3 repository contract through official SQLite WASM/OPFS.                                                                                                                                        |
| `pnpm test:extension-transfer`                                                                                                                                                                                                                                               | Passed: 2 Chromium/Firefox fallback transfer tests against schema version 92.                                                                                                                                                                                                   |
| `pnpm test:unit`                                                                                                                                                                                                                                                             | Passed: 38 files and 414 tests.                                                                                                                                                                                                                                                 |
| `pnpm test:coverage`                                                                                                                                                                                                                                                         | Passed: 90.37% statements, 81.91% branches, 97.98% functions, and 93.34% lines overall. Application reported 89.85%, 85.60%, 100%, and 95.11%; observability 96.66%, 69.23%, 100%, and 96.55%; storage-core 90.18%, 76.39%, 96.97%, and 92.86% respectively.                    |
| `pnpm verify`                                                                                                                                                                                                                                                                | Passed with exit code 0 across formatting, architecture, foundation records, typecheck, lint, unit/coverage, build, extension packaging, document/browser/native storage, secure storage, archive recovery, schemas, licenses, secret scans, dependency audits, and Changesets. |
| [Foundation CI run 33251766620](https://github.com/seabAu/Coredrill/actions/runs/33251766620)                                                                                                                                                                                | Passed commit `10c1bd2` in the aggregate foundation gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native repository and package lanes, extension transfer/reproducibility, and the full-history secret scan.                                       |

Migration SHA-256 values are recorded beside versions 88-92 in `migrations/README.md`:

| Version | SHA-256                                                            |
| ------- | ------------------------------------------------------------------ |
| 88      | `d59b4641d8dab1e526f2af8a4680799cd348be976d940c207f1e49f6bb6bdbeb` |
| 89      | `1f0cbb9a4141f8510f4dd8781e7df43143dc33ff125911547facc768480a6b49` |
| 90      | `b9ad09e4015f3a1b49174781514af6e0f2b3295db57d3054b5fed45d4057b73f` |
| 91      | `b94d7e8578a26054f52bc0b5b05c2cbce5ae524251ca9c9d63b1eb2e8ad1c426` |
| 92      | `c24e41c3dbadb0e11d13c7bdf2b1df42fdd9fcd1e5beecf819b42f5b25d2b6f1` |

No external dependency version changed. The application-to-observability workspace edge changed the lockfile without changing the 548-package external graph. The reviewed lockfile SHA-256 is `fdf109d4827b86fbc8920b8ba7d646f05134ce54d6cf9f12ce986e80e5de6822`. License review passed for 351 npm and 498 Cargo records; npm reported zero known vulnerabilities and Rust retained the 15 already-reviewed allowed transitive warnings.

## Implementation surfaces

- `packages/contracts/src/diagnostic-event.ts` and `support-bundle.ts` - versioned content-free event and local-copy contracts plus generated JSON schemas.
- `packages/observability/src/diagnostics.ts` and `support-bundle.ts` - fail-closed redaction, revalidation, deterministic ordering, freezing, and pretty JSON copy.
- `packages/application/src/diagnostics.ts` - `RecordDiagnosticEventCommand`, `CopySupportBundleQuery`, narrow local port, and stable safe failures.
- `migrations/0088_local_diagnostic_event.sql` through `0092_diagnostic_event_retention.sql` - strict storage, newest-first index, SQL allowlist, immutability, and retention.
- `packages/storage-core/src/diagnostic-repository.ts` and `diagnostic-contract-harness.ts` - validated repository plus shared privacy/durability contract.
- `packages/storage-core/src/repository-contract-manifest.ts` - v3/18 inventory shared by fast, browser, and native SQLite.
- `.changeset/privacy-safe-diagnostic-log.md` - contracts, observability, application, and storage-core public API change record.

## Boundaries and remaining work

- This slice proves the command/query and storage boundary. The concrete Diagnostics settings surface, clipboard composition, and accessible success/error feedback belong to the UI slices.
- A support bundle is local user-controlled JSON, not an upload. Any future support transport or telemetry requires a separately reviewed destination and consent contract.
- Diagnostics intentionally cannot carry raw exception messages, paths, SQL, URLs, prompts/responses, resumes, notes, contacts, salary data, or other job/applicant content.
- The newest-1,000 retention policy is a bounded operational default, not a promise of permanent audit history.
- `UI-001` is next for tokens, themes, density, typography, icon/focus foundations, and reduced motion.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes; `GATE-0` still requires the owner-authorized participant study.
- No ADR is required because no Accepted decision changed; the implementation realizes the existing local-only diagnostic, fail-closed redaction, SQLite truth, bounded retention, and telemetry-separation requirements.
