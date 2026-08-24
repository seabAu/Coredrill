# Capture and provenance contracts verification

- Date: 2026-08-24
- Checklist scope: `DOM-003`, `DOM-004`
- Package: `@coredrill/contracts`
- Decision changes: none

## Outcome

`DOM-003` and `DOM-004` are proven locally. Coredrill now has one strict serialized boundary for user-invoked capture input and source-backed field candidates, plus durable contracts for provenance, explicit user confirmation, and retained conflicts. The contract is accountless, offline-capable, provider-neutral, and useful without AI.

This slice adds no database, migration, extractor implementation, browser permission, outbox runtime, network connector, AI adapter, hosted service, or user-interface behavior. Ingestion/idempotency, current-and-previous-version compatibility, expiry enforcement, extractor ranking, and persistence behavior remain later `CAP-*`, `XTR-*`, and `DB-*` work.

## Documentation reconciliation

The illustrative capture type in `04-capture-extraction-sources.md` used `specVersion: "1.0"`, while the accepted compatibility policy in `10-technology-stack.md` requires explicit integer schema/capture versions. Version `1` now aligns the example and implementation with the governing policy before any durable capture contract shipped. This corrects an internal inconsistency; it does not change an Accepted decision, so no ADR is required.

## DOM-003 capture-envelope proof

`CaptureEnvelopeV1` is inferred from a strict Zod contract and has a generated, committed JSON Schema Draft 2020-12 artifact with stable `$id` `https://schemas.coredrill.local/capture-envelope/v1.json`. The repository generator formats the artifact using the checked-in Prettier configuration, and `check:contract-schemas` fails on missing or stale output.

The boundary requires:

- integer `specVersion: 1`, local UUIDv7 ID, exact UTC timestamps, expiry, sender kind/ID, safe sequence, and bounded base64url nonce;
- user-invoked capture method, safe HTTP(S) source URLs without credentials, source metadata, JSON-only content, field candidates, capture-client identity/version, and lowercase SHA-256 content hash;
- strict objects that reject unknown fields rather than stripping hostile input;
- a pre-schema UTF-8 envelope limit of 2 MiB, plus 64 KiB selected text, 512 KiB readable text, 1 MiB sanitized HTML, 64 JSON-LD items, and 256 field candidates.

The synthetic valid fixture round-trips through JSON and Zod without normalization loss. Ten invalid fixture mutations prove rejection of the legacy string version, unsafe/credentialed URLs, wrong UUID version, unsafe sequence, short nonce, malformed hash, missing provenance pointer, forbidden unknown input, and a missing candidate collection. Additional tests reject per-field and total byte-limit violations, `bigint`, `undefined`, and circular data without throwing across the trust boundary.

## DOM-004 evidence-contract proof

| Contract                 | Enforced behavior                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `FieldSourceReferenceV1` | Durable source type/UUIDv7 ID plus required bounded content-free pointer                                                    |
| `ExtractorIdentityV1`    | Stable extractor name and exact semantic version                                                                            |
| `FieldProvenanceV1`      | Source, method, extractor identity/version, capture time, confidence, optional excerpt, and optional license note           |
| `FieldCandidateV1`       | Versioned UUIDv7 candidate, field name, JSON normalized/raw values, complete provenance, and optional separate confirmation |
| `UserConfirmationV1`     | Explicit `actor: "user"`, confirmation ID/time, and hash of the confirmed value                                             |
| `FieldConflictV1`        | At least two unique retained candidate IDs; resolved form must record a user selection of one retained candidate            |

Contract examples retain JSON-LD, user-entered/confirmed, and unconfirmed LLM-derived candidates together. The LLM candidate remains visibly `method: "llm"`; confirmation is not inferred from confidence or provenance. A resolved conflict selects rather than deletes a candidate. Runtime refresh/replacement policy is intentionally deferred to `CAP-005`, where property tests must prove that persisted user-confirmed values are never silently displaced.

## Reproducible verification

Run with pinned Node.js 24.19.0 and pnpm 11.22.0:

| Command                                 | Result                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`        | Passed for all 20 workspace projects; lockfile already up to date                                                                                       |
| focused contracts Vitest run            | 2 files and 19 tests passed                                                                                                                             |
| `pnpm verify`                           | Passed formatting, boundaries, foundation records, typecheck, lint, unit, coverage, build, schema drift, license, secret, audit, and Changesets gates   |
| `pnpm test:unit` within `verify`        | 7 files and 53 tests passed                                                                                                                             |
| `pnpm test:coverage` within `verify`    | 98.25% statements, 94.62% branches, 100% functions, and 98.55% lines overall; all four contract source files reached 100% statements/functions/branches |
| Typecheck/lint/build within `verify`    | 21/21 typecheck tasks, 19/19 lint tasks, and 19/19 build tasks passed                                                                                   |
| Contract/policy checks within `verify`  | Generated schema matched; 19 package-boundary policies and secret scan passed                                                                           |
| Dependency checks within `verify`       | 301 license records passed; zero known vulnerabilities at every audit severity                                                                          |
| `pnpm changeset:status` within `verify` | `@coredrill/contracts` has a pending minor Changeset                                                                                                    |

Hosted Foundation CI evidence will be appended after the implementation commit is pushed and the run completes.

## Dependency review

The contracts package pins Zod `4.4.3`, the current stable release at review time. Zod is MIT-licensed, maintained under the `colinhacks` registry account, has zero runtime dependencies, and provides the stable validation and `z.toJSONSchema` APIs used here. Coredrill deliberately does not use the documented experimental `z.fromJSONSchema` API. Sources: [official Zod package documentation](https://zod.dev/packages/zod), [official JSON Schema documentation](https://zod.dev/json-schema), and [registry metadata](https://registry.npmjs.org/zod/4.4.3).

The refreshed `JW-DI-001` dependency inventory is version `1.2.0`, covers 12 direct dependencies, and is bound to lockfile SHA-256 `23f27418bee651e48aa09cb7c10fb55b3ac67b2f725dae84d82ae4c44a7e9e07`.

## Files providing proof

- `packages/contracts/src/` — Zod boundary contracts, inferred TypeScript types, JSON Schema generation, and bounded parser.
- `packages/contracts/schemas/capture-envelope.v1.schema.json` — generated Draft 2020-12 artifact.
- `packages/contracts/test/` — round-trip, invalid, size, provenance, confirmation, and conflict tests with synthetic fixtures.
- `tooling/scripts/generate-contract-schemas.mjs` — generator and stale-artifact check.
- `.changeset/capture-provenance-contracts.md` — compatibility and release record.
- `docs/proof/foundation-dependency-inventory.json` — exact reviewed dependency and lockfile record.

## Remaining work and boundaries

- `DOM-005` and `DOM-006` are the next coherent contract slice: portable-archive manifest/checksum and database-port/transaction contracts.
- `CAP-001` later implements compatibility, nonce/sequence replay behavior, expiry, acknowledgement, and idempotency; this slice only validates their serialized shape.
- `CAP-005` later proves persisted candidate/conflict handling and no silent overwrite of confirmed values.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
