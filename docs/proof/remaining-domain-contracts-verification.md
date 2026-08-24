# Remaining domain contracts verification

- Date: 2026-08-24
- Checklist scope: `DOM-007`, `DOM-008`, `DOM-009`
- Packages: `@coredrill/domain`, `@coredrill/application`, `@coredrill/contracts`, `@coredrill/observability`
- Decision changes: none

## Outcome

`DOM-007` through `DOM-009` are proven locally. Coredrill now has pure provider-neutral ports for extraction, optional AI, public labor data, local document conversion, and explicitly deferred sync; stable application command/query/result/error conventions; and a strict content-free local diagnostic boundary with fail-closed redaction.

This remains contract-only work. It adds no extractor implementation, provider SDK, AI call, labor-data request, document parser/renderer, sync server/account/cryptography, telemetry sink, database schema, browser permission, hosted service, or product UI. Template-only/AI-disabled operation remains complete, and no method introduced here can submit applications, send outreach, fetch arbitrary URLs, or silently sync data.

## DOM-007 provider-neutral port proof

All ports live in the pure domain package, preserving the accepted dependency direction: application and replaceable adapters may depend on domain, while domain imports no adapter/runtime/provider package.

| Port                                 | Reviewed boundary and invariant                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExtractionPort<Payload, Candidate>` | Generic over an already validated payload and its versioned candidate type; source reference and capture time are required; support is scored; output names extractor ID/version and content-free warnings; arbitrary URL fetching is not exposed; deterministic extraction stays separate from optional LLM normalization               |
| `AiPort`                             | Capability discovery declares `disabled`/`local`/`byok`/`hosted`, availability, structured output, embeddings, destination, and context limit; structured generation carries explicit purpose, context manifest, output schema, token limit, and cancellation context; provider SDK objects and credentials never enter the type surface |
| `LaborDataPort`                      | Occupation search and occupation/geography statistics; every match/result carries provider, dataset/release, retrieval time, source URL, and license URL; occupation-wide salary output carries the warning that blocks an employer-specific interpretation                                                                              |
| `DocumentPort`                       | Local PDF/DOCX/Markdown/plain-text import and export; imported evidence is fixed to `proposal`; export requires an immutable document-version ID and canonical blocks, returning bytes/media type/extension/checksum without owning document history                                                                                     |
| `SyncPort`                           | Capability discovery only, returning frozen `deferred` / `not-available-in-baseline` / `networkRequired: false`; no push/pull/cursor/server/account API exists before the D-052 prerequisite ADR                                                                                                                                         |

The synthetic API test instantiates every port. It proves source-backed extraction, AI-disabled discovery without a generation call, attributed occupation-wide labor statistics, proposal-only imports, immutable-version export input, and the absence of sync push/pull methods.

## DOM-008 application operation proof

`defineCommand` and `defineQuery` require stable PascalCase names ending in `Command`/`Query`. A command declares `transactional: true`; a query declares `readOnly: true` and returns a view DTO rather than an adapter row. Both execute to the discriminated `ApplicationResult<T>` union.

The reviewed error vocabulary is `validation`, `not_found`, `conflict`, `unavailable`, `permission_denied`, `cancelled`, `rate_limited`, and `internal`. Error envelopes carry only the stable code, control-free user-facing message, and retryability. Runtime factories reject unreviewed codes and unsafe messages and freeze the result/error envelopes. Diagnostics consume only stable codes, never the free-text message.

The example `ChangeStatusCommand` proves success and conflict results. The `ListJobsQuery` maps synthetic storage-shaped rows to `{ id, title }` view DTOs. Negative tests reject ambiguous/wrong-suffix/oversized operation names, blank/control-bearing messages, and an unreviewed adapter error code.

## DOM-009 diagnostic event proof

`DiagnosticEventV1` is a strict integer-versioned Zod boundary with a committed Draft 2020-12 schema and stable `$id` `https://schemas.coredrill.local/diagnostic-event/v1.json`. `delivery` is fixed to `local`; future opt-in product telemetry requires a separate reviewed contract.

The event admits only operational version/time/category/name/severity/outcome/code/duration/operation-ID data plus at most 32 reviewed attributes. Event names, codes, attribute keys, and string tokens are explicit allowlists; numeric values are finite/bounded and booleans are permitted. Arbitrary strings, objects, arrays, unknown fields, and content-bearing concepts—including resumes, answers, contact data, prompts/responses, raw text/HTML, URLs, notes, credentials, keys, cookies, tokens, and secrets—cannot pass.

`redactDiagnosticAttributes` sorts deterministically, drops unsafe or excess fields, returns only a frozen safe record plus a rejection count, and never returns rejected values. Sentinel tests submit synthetic resume, prompt, key, email, nested, free-form, non-finite, and overflow inputs and prove none survive. `createLocalDiagnosticEvent` redacts before strict schema validation and fails closed for non-local delivery.

## Documentation alignment

`02-runtime-architecture.md` now records the exact port ownership/surfaces, operation conventions, and capability-only deferred sync design. `06-security-sync-deployment-testing.md` now records the local diagnostic allowlist/redaction boundary and the separation from future opt-in telemetry. These changes implement D-040, D-052, and D-053 without changing an Accepted decision, so no ADR is required.

## Reproducible verification

Run with pinned Node.js 24.19.0 and pnpm 11.22.0:

| Command                                 | Result                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`        | Passed for all 20 workspace projects from the updated exact lockfile                                                                                           |
| focused DOM-007–DOM-009 Vitest run      | 4 files and 18 tests passed                                                                                                                                    |
| `pnpm verify`                           | Passed formatting, boundaries, foundation records, typecheck, lint, unit, coverage, build, schema drift, license, secret, audit, and Changesets gates          |
| `pnpm test:unit` within `verify`        | 13 files and 85 tests passed                                                                                                                                   |
| `pnpm test:coverage`                    | 99.14% statements, 95.52% branches, 100% functions, and 99.34% lines overall; application/contracts/observability sources have 100% statements/functions/lines |
| Typecheck/lint/build within `verify`    | 21/21 typecheck tasks, 19/19 lint tasks, and 19/19 build tasks passed                                                                                          |
| Contract/policy checks within `verify`  | Three generated schemas matched; 19 package-boundary policies, foundation records, and secret scan passed                                                      |
| Dependency checks within `verify`       | 301 license records passed; zero known vulnerabilities at every audit severity                                                                                 |
| `pnpm changeset:status` within `verify` | The four affected packages have pending minor Changesets                                                                                                       |

The implementation commit's hosted Foundation CI run is recorded here after GitHub validates the exact pushed tree.

## Dependency and boundary review

No external dependency was added. `@coredrill/observability` now declares its existing policy-allowed workspace edge to `@coredrill/contracts` so the redactor validates the exact serialized diagnostic boundary. The lockfile changes only by that local link.

`JW-DI-001` is refreshed to v1.3.0 with the same 12 non-workspace direct dependencies and is bound to lockfile SHA-256 `a79a7163063ea36971cba6c71205885a174161c7a66d682041cffa073682877c`.

## Files providing proof

- `packages/domain/src/ports/` and `packages/domain/test/ports.test.ts` — public port types and synthetic executable API review.
- `packages/application/src/` and `packages/application/test/operation.test.ts` — operation/result/error conventions and examples.
- `packages/contracts/src/diagnostic-event.ts`, generated schema, and contract tests — serialized local diagnostic boundary.
- `packages/observability/src/diagnostics.ts` and tests — deterministic fail-closed redaction and validated event creation.
- `.changeset/remaining-domain-contracts.md` — compatibility and release record.
- `docs/proof/foundation-dependency-inventory.json` — refreshed exact lock/inventory evidence.

## Remaining work and boundaries

- `STG-001` through `STG-003` are the next coherent Phase 0 slice: official SQLite WASM Worker/OPFS open, migration/transaction/reload durability, and portable export/delete/restore proof.
- `STG-004` through `STG-008` later cover compatibility, failure/locking matrices, benchmarks, and the evidence-backed VFS decision.
- Actual extractor, AI, labor, document, and sync implementations remain in their later checklist phases and must pass their source/privacy/evaluation gates.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
