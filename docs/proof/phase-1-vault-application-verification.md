# Phase 1 vault application verification

Date: 2026-08-28

Checklist scope: `APP-001`

Package: `@coredrill/application`

Decision changes: none

## Outcome

`APP-001` adds adapter-neutral `CreateVaultCommand`, `OpenVaultCommand`, and `GetVaultDiagnosticsQuery` application operations over a narrow local `VaultLifecyclePort`. The commands create or open an accountless local vault with a validated local UUIDv7 identity and operation time; the query returns only reviewed operational storage state. The implementation commit is `87ec528`.

This slice does not select or wire a concrete browser/native storage adapter. Runtime composition remains outside the application package so the same use cases can sit over official SQLite WASM/OPFS or the accepted thin Tauri/rusqlite boundary. It adds no account, hosted database, network dependency, AI path, scraping, background browser activity, or automated application action.

## Use-case proof

| Contract               | Enforced behavior                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation shape        | Create/open are PascalCase transactional commands; diagnostics is a PascalCase read-only query.                                                                                           |
| Create                 | The use case validates a 1–512-character control-free name before storage, creates a locally supplied UUIDv7, and passes the operation instant as both creation and initial-open time.    |
| Open                   | The use case rejects non-UUIDv7 vault IDs before storage and passes the operation instant for the durable open/touch boundary.                                                            |
| Port result validation | Returned identifiers, names, timestamps, and schema versions are parsed again; create/open intent and session/diagnostic schema agreement must match or the use case fails closed.        |
| Stable failures        | Reviewed lifecycle codes map to stable `validation`, `conflict`, `not_found`, `unavailable`, `permission_denied`, or `internal` application errors with explicit retryability.            |
| Unknown failures       | Adapter exception text is never returned. Paths, SQL, resume text, and other arbitrary exception content collapse to one content-free internal failure.                                   |
| Diagnostics            | Only reviewed health/persistence values and issue codes survive. Adapter name/details, paths, duplicate codes, unreviewed strings, and malformed schema versions are removed or rejected. |
| DTO ownership          | Successful vault, diagnostics, and issue-code values are copied and frozen before crossing the application boundary.                                                                      |

All fixtures are synthetic and contain no resume, provider credential, token, private page, real employer contact, or applicant data.

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository lockfile:

| Command                                                                                       | Result                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/application/test/vault.test.ts`                                | Passed: 1 file and 21 focused use-case tests.                                                                                                                                                                                     |
| `pnpm --filter @coredrill/application typecheck`                                              | Passed production and test TypeScript checks.                                                                                                                                                                                     |
| `pnpm --filter @coredrill/application lint`                                                   | Passed with zero warnings.                                                                                                                                                                                                        |
| `pnpm test:coverage`                                                                          | Passed: 30 files and 177 tests; 90.73% statements, 79.35% branches, 96.95% functions, and 93.07% lines overall. The application package reported 94.87% statements, 88.09% branches, 100% functions, and 97.32% lines.            |
| `pnpm verify`                                                                                 | Passed the complete formatting, architecture, typecheck, lint, unit, coverage, build, browser/native storage, recovery, security, license, audit, and Changesets gate.                                                            |
| [Foundation CI run 33211367927](https://github.com/seabAu/Coredrill/actions/runs/33211367927) | Passed implementation commit `87ec528` in the aggregate foundation gate, exact Chrome 151/152 and Firefox 153/154 lanes, Windows/macOS/Ubuntu native lanes, extension transfer/reproducibility, and the full-history secret scan. |

The dependency audit reported zero known vulnerabilities and the 15 already-reviewed allowed transitive Rust warnings in the native Linux/Tauri dependency graph.

## Implementation surfaces

- `packages/application/src/vault.ts` — adapter-neutral lifecycle port, immutable view DTOs, stable error mapping, and create/open/diagnostics operations.
- `packages/application/src/index.ts` — reviewed public application API.
- `packages/application/test/vault.test.ts` — success, validation, safe-failure, redaction, and fail-closed use-case proof.
- `.changeset/vault-application-flow.md` — package API change record.

## Boundaries and remaining work

- Concrete browser/native lifecycle adapters and UI composition are not claimed by this use-case slice.
- `APP-008` still owns the durable local diagnostic log and user-copyable redacted support bundle; this slice only constrains the vault diagnostic response.
- `APP-002` is next for manual `CreateJob` and atomic `ChangeStatus` orchestration over the already-proven repositories.
- `Q-006` remains open; no default display-stage terminology was chosen or locked.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
