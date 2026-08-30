# Phase 1 threat review

Date: 2026-08-30

Checklist scope: `Q1-004`

Implementation commit:
[`e166752083f957f45903dda5de0d9a1171796739`](https://github.com/seabAu/Coredrill/commit/e166752083f957f45903dda5de0d9a1171796739)

Decision changes: none

## Outcome

The implemented Phase 1 surfaces have been reviewed against the accepted
local-first security model. SQL, XSS, native IPC, attachments and portable
archives, native paths, and diagnostics each have reproducible automated
evidence. One high-impact native SQLite file-control gap found during the
review is fixed and protected by adversarial regression tests.

Every review finding is closed or explicitly triaged. Two defense-in-depth
items remain release-gated work: browser response headers belong to the first
real deployment in `DEP-002`, and a pre-decompression DOCX expansion ceiling
belongs to the deeper parser/archive audit in `SEC-005`. Neither is hidden as a
pass, and neither creates a hosted-service, account, network, or AI dependency.

## Reviewed assets, actors, and trust boundaries

Protected assets are the durable SQLite vault, content-addressed attachments,
portable exports and backups, operating-system provider secrets, provenance,
and privacy-safe diagnostics. The baseline assumes that an attacker may control
captured page content, pasted HTML, imported documents, portable archives,
serialized boundary input, SQL parameter values, and filenames. A compromised
or malicious WebView renderer is also considered when reviewing privileged
native capabilities. Local storage is not represented as an access-control
boundary against an actor who already controls the user's operating-system
account or device backup.

The reviewed boundaries are:

1. browser/extension content into restricted React and document models;
2. validated TypeScript contracts into persistence and application commands;
3. the local Tauri main window into four capability-gated Rust commands;
4. repository SQL into the single managed SQLite connection;
5. user-selected documents and portable archives into bounded parsers;
6. attachment/archive bytes into OPFS or canonical native app-data paths; and
7. internal failures into durable diagnostics and the user-copyable support bundle.

## Boundary review and retained controls

| Boundary                          | Retained controls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Reproducible evidence                                                                                                                                                                              | Result                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| SQL                               | Search/filter input compiles to a bounded AST and bound parameters. Native statements retain size/value limits, query/write separation, explicit transaction operations, defensive SQLite configuration, and a fail-closed authorizer. Only `main`/`temp`, reviewed pragmas, and FTS5 virtual tables are available; attached databases, `VACUUM INTO`, WebView-supplied transaction control, unsafe file/extension functions, other virtual-table modules, and unknown future authorizer actions are denied. | Search-filter adversarial tests; `confines_webview_sql_to_the_reviewed_database_boundary`; shared browser/native repository manifest and migration contracts; exact hostile bound-value round trip | Passed                                                                                |
| XSS and executable content        | Production web, extension, capture, transfer, document, and UI sources are policy-scanned for raw-HTML and dynamic-code sinks. Browser HTML entries use only local module scripts and no inline handlers. Tauri and extension CSPs disallow remote executable code and `unsafe-eval`. DOCX conversion disables external file access and images, then maps only reviewed block/inline structures into the restricted document IR; hostile pasted HTML is normalized by the restricted editor schema.          | `tooling/tests/phase-1-security.test.mjs`; extension package inspection; hostile document browser cases; complete route axe/application-shell suites                                               | Passed for implemented/local surfaces; browser response header retained for `DEP-002` |
| Native IPC and capabilities       | `withGlobalTauri` is false, prototype freezing is enabled, drag/drop is disabled, and only the local `main` window receives the four exact storage, secret, archive, and vault command permissions. There is no generic filesystem, dialog, shell, opener, HTTP, secret-read, or arbitrary-path JavaScript capability. Envelopes are versioned, deny unknown fields, and enforce limits before privileged work.                                                                                              | Static capability/CSP test, native protocol tests, complete Tauri Clippy/typecheck, packaged-boundary inspection on Windows/macOS/Ubuntu                                                           | Passed                                                                                |
| Attachments and portable archives | Browser attachments use SHA-256 content IDs under OPFS; native attachments use the same content-addressed identity under managed app-data. Portable restore validates entry names, duplicates, compression mode, per-entry and cumulative expanded sizes, checksums, schema/version, single-vault identity, and target freshness before transactional replacement. Native picker paths never cross into the WebView.                                                                                         | Attachment/layout tests; archive writer/restore suites; corruption/staleness/failure cases; browser clean-install and native atomic recovery proofs                                                | Passed                                                                                |
| Native paths                      | SQLite opens with `NOFOLLOW`; database names and attachment IDs are constrained; canonical app-data roots, final leaves, managed directories, symlinks, junctions, and reparse points are validated. Recovery and backup paths are Rust-owned and results are path-free.                                                                                                                                                                                                                                     | Native layout and Windows junction tests; Tauri app-data resolution; archive/backup proofs; packaged Windows/macOS/Ubuntu runs                                                                     | Passed                                                                                |
| Diagnostics                       | Diagnostic events and support bundles are strict, versioned allowlists with bounded strings/counts and forbidden content-bearing fields. Native errors map to stable content-free codes; paths, SQL text, secrets, record content, and imported source content are not copied into diagnostics.                                                                                                                                                                                                              | Domain/application/observability diagnostic tests, schema-drift check, sentinel redaction tests, secure-store proof with `secretExposed: false`                                                    | Passed                                                                                |

## Finding log

| ID           | Severity                    | Finding and exposure                                                                                                                                                                                                                                                                                                                         | Resolution/triage                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                           |
| ------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `Q1-004-F01` | High                        | The versioned native storage protocol carried repository SQL but previously relied on length/value limits and readonly checks. If the bundled WebView were compromised, SQLite file-control statements such as `ATTACH DATABASE` or `VACUUM INTO` could target files outside the managed vault directory.                                    | Enabled rusqlite hooks; applied defensive, no-double-quoted-string, no-FTS3-tokenizer, untrusted-schema, and no-writable-schema database settings; installed a fail-closed SQLite authorizer; blocked raw transaction/file-control statements; normalized authorization failures to a content-free error; added hostile file-control, pragma, function, virtual-table, transaction, FTS5-compatibility, and bound-value regressions. | Resolved in `e166752`                                            |
| `Q1-004-F02` | Medium, deployment-gated    | The browser build is local and uses bundled modules, but there is not yet a real hosted static origin whose response CSP/security headers can be inspected. A source-only check cannot prove production response headers.                                                                                                                    | Tauri and extension CSPs are exact and tested; executable source/HTML sinks are policy-scanned. Keep browser response CSP, Trusted Types decision, origin isolation, and header capture open under `DEP-002`/`SEC-002` before any public hosted deployment.                                                                                                                                                                          | Triaged; blocks hosted release, not Phase 1 local implementation |
| `Q1-004-F03` | Medium, parser hardening    | DOCX import rejects files over 10 MiB and constrains the resulting IR to 10,000 blocks/2,000,000 characters, but the current Mammoth path has no independent pre-decompression OOXML member-count or cumulative-expanded-byte ceiling. A deliberately compressed local file could create avoidable memory/CPU pressure before IR validation. | External file access and image materialization are disabled; only user-selected local files enter the parser; corrupt/signature failures and output limits fail closed. Add a bounded OOXML preflight or isolated cancellable parser budget in `SEC-005` before public beta.                                                                                                                                                         | Triaged; `SEC-005` owner                                         |
| `Q1-004-F04` | Platform-release constraint | The Linux Tauri GTK3 graph retains 14 unmaintained warnings and `RUSTSEC-2024-0429` for `glib 0.18.5`.                                                                                                                                                                                                                                       | ADR-0004 already keeps Linux native diagnostic-only and directs Linux users to the local browser app. Windows/macOS do not compile that GTK3 path. Revisit only when the exact dependency graph removes the warning and the full Ubuntu proof passes again.                                                                                                                                                                          | Accepted constraint; blocks public Linux-native support          |

## Reproducible local verification

Run with Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the reviewed lockfiles:

| Command                                                              | Result                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:security`                                                 | Passed 7 files and 38 focused SQL, XSS, document, archive, and diagnostic tests                                                                                                                                                                                                                                                                          |
| `pnpm test:storage-native`                                           | Rust: 11 passed, 1 intentionally harness-only/ignored; exact native repository suite: 11 passed                                                                                                                                                                                                                                                          |
| `cargo fmt --all --check` and focused `cargo clippy ... -D warnings` | Passed with no formatting or lint finding                                                                                                                                                                                                                                                                                                                |
| `pnpm check:foundation-records`                                      | Passed 49 direct dependencies, 3 toolchains, 16 execution targets, and 10 accessibility records                                                                                                                                                                                                                                                          |
| `pnpm verify`                                                        | Passed 60 unit files/540 tests, coverage at 83.19% statements, 74.83% branches, 82.30% functions, and 85.77% lines; 22 package builds; 5 UI-foundation, 59 application-shell, 1 performance, 3 resilience, 7 onboarding, 9 document, and 7 browser-storage cases; native secure-store/archive proofs; schemas, licenses, secrets, audits, and Changesets |

The npm audit reported no known vulnerabilities. RustSec reported no known
vulnerability that applies to the accepted Windows/macOS native targets and
retained the 15 already documented warnings described by ADR-0004 for the
diagnostic Linux graph and unmaintained transitives.

## Hosted clean-commit proof

[Foundation CI run 33304024952](https://github.com/seabAu/Coredrill/actions/runs/33304024952)
passed on exact implementation commit
`e166752083f957f45903dda5de0d9a1171796739`.

| Hosted lane                         | Job                                                                                                                                                                                      | Security-relevant result                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aggregate build/static/tests/policy | [99237255159](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255159)                                                                                              | Full gate, license inventories, dependency audits, extension inspection, and policy checks passed                                                                  |
| Chrome `151.0.7922.138`             | [99237255160](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255160)                                                                                              | Storage, repository, hostile document, UI, shell, resilience, and onboarding suites passed                                                                         |
| Chrome `152.0.7977.54`              | [99237255192](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255192)                                                                                              | Same complete current-generation browser matrix passed                                                                                                             |
| Firefox `153.0` / `154.0`           | [99237255208](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255208), [99237255148](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255148) | SQLite/OPFS lifecycle and identical repository manifest passed                                                                                                     |
| Extension Chromium/Firefox          | [99237255170](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255170)                                                                                              | Exact permissions/CSP/remote-code scan, source rebuild, acknowledged transfer, and fallback passed                                                                 |
| Full-history secrets                | [99237255178](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255178)                                                                                              | Checksum-pinned Gitleaks scan passed across complete history                                                                                                       |
| Windows native                      | [99237255180](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255180)                                                                                              | Hardened repository contracts, app-data, Credential Manager, archive/backup, Tauri boundary, installed startup, and package proof passed                           |
| macOS native                        | [99237255097](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255097)                                                                                              | Hardened repository contracts, Keychain, archive/backup, Tauri boundary, package launch, and artifact proof passed                                                 |
| Ubuntu native diagnostic            | [99237255229](https://github.com/seabAu/Coredrill/actions/runs/33304024952/job/99237255229)                                                                                              | Hardened repository contracts, Secret Service, archive/backup, Tauri boundary, AppImage launch, and artifact proof passed; support remains diagnostic per ADR-0004 |

The retained package/security-adjacent artifacts are immutable and bound to the
same commit:

| Artifact                              | ID           | GitHub artifact SHA-256                                            |
| ------------------------------------- | ------------ | ------------------------------------------------------------------ |
| Chromium extension inspection/package | `9730023147` | `47a9474f1bb0995dec1fe7832a83b633f4a6591d906f556553ff61da07f3863b` |
| Windows NSIS package proof            | `9729993397` | `929673b7197fe8d43565e980c0e1f8fc26c4a54c6ed8467ec2f1e5f45b12d12c` |
| macOS application proof               | `9729954448` | `436d98b7c87a84d249cf3821b1d59cddfd926828bcfaa67d75768f6bfd4705f9` |
| Ubuntu AppImage diagnostic proof      | `9729998260` | `6e103a4794dd137ed78b0d50a1d322dd7672a2f68e69544750cc6a90787b66e5` |

## Handoff

`Q1-004` is complete. Preserve `Q1-004-F02` and `Q1-004-F03` as explicit
release-gated inputs to `DEP-002`/`SEC-002` and `SEC-005`; do not reinterpret
them as shipped-hosting or parser-hardening proof. Continue with `Q1-005`, the
single canonical browser and first-desktop-OS journey, while the independent
reference-hardware and manual-accessibility blockers remain open.
