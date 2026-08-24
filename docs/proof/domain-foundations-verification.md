# Domain foundations verification

Date: 2026-08-24
Checklist scope: `DOM-001`, `DOM-002`
Package: `@coredrill/domain`
Decision changes: none

## Outcome

`DOM-001` and `DOM-002` are proven locally and in hosted CI. The implementation establishes a pure TypeScript domain surface for validated value objects, semantic reporting categories, custom display stages, and guarded status transitions. It adds no database, migration, serialized boundary version, adapter, hosted service, account, connector, AI path, permission, or telemetry.

The work preserves the accepted distinction between semantic reporting categories and display stages. It deliberately does not select the default display-stage vocabulary still governed by `Q-006`, nor does it turn the provisional six-column Board presentation into accepted domain policy.

## DOM-001 value-object proof

| Contract                   | Enforced behavior                                                                                                                        | Representative proof                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `EntityId<TEntity>`        | Entity-specific branded RFC 9562 UUIDv7; local Web Crypto generation; canonical lowercase text                                           | Generated UUID/version/variant assertions plus property-generated valid UUIDv7 parsing |
| `DateOnly`                 | Exact `YYYY-MM-DD` calendar value with leap-year and month-length validation; no implicit time zone                                      | Property-generated valid dates and impossible/ambiguous-date rejection                 |
| `Instant`                  | UTC ISO timestamp only, normalized to millisecond precision                                                                              | UTC normalization, invalid date/time, offset, and invalid-`Date` cases                 |
| `TimeZone`                 | Recognized IANA identifier with canonical runtime spelling; fixed numeric offsets rejected                                               | Named-zone, UTC, whitespace, offset, and unknown-zone cases                            |
| `Money` / `MoneyRate`      | Safe integer minor units, normalized three-letter currency code, nonnegative rates, explicit `hour`/`day`/`week`/`month`/`year` interval | Safe-integer and interval properties plus fractional/unsafe/negative rejection         |
| `WebUrl`                   | Normalized absolute HTTP(S) URL; credentials, unsafe schemes, relative URLs, controls, and surrounding whitespace rejected               | Canonicalization and negative URL cases                                                |
| `SourceReference<TSource>` | Immutable opaque source type + UUIDv7 ID with optional bounded content-free pointer                                                      | With/without-pointer serialization, immutability, and invalid type/ID/pointer cases    |
| `Confidence`               | Finite closed interval `[0, 1]`, with negative zero normalized                                                                           | Double property over the valid interval and out-of-range/non-finite rejection          |

The value objects serialize as primitives or frozen plain objects; they contain no adapter or provider type.

## DOM-002 status proof

The public `STATUS_CATEGORIES` tuple exactly preserves the ten accepted data-model categories:

```text
viewed, saved, preparing, applied, response,
interview, offer, rejected, withdrawn, archived
```

Every `StatusStage` requires one category, a UUIDv7 status-definition ID, a safe name, a nonnegative integer sort order, and an explicit `terminal` flag. Terminal state is not inferred from category because the accepted data model stores it independently and custom stages must remain expressive.

Transition policy proves:

- distinct active stages may move forward, backward, or within one semantic category;
- entering a terminal stage is classified as `close`;
- correcting one closed outcome to another is allowed and classified separately;
- leaving a terminal stage is rejected unless the caller supplies explicit reopen confirmation;
- a same-stage move is rejected;
- generated property cases cover every pair of accepted semantic categories.

Status moves remain pure domain decisions here. `APP-002` will later make the persisted status change and append-only timeline event transactional.

## Reproducible verification

Run with the pinned Node.js 24.19.0 and pnpm 11.22.0 toolchains:

| Command                                                                              | Result                                                                                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                     | Passed for all 20 workspace projects; lockfile already up to date                                                                       |
| `pnpm exec vitest run packages/domain/test`                                          | 2 files and 20 tests passed                                                                                                             |
| `pnpm verify`                                                                        | Passed all formatting, boundary, foundation-record, typecheck, lint, unit, coverage, build, license, secret, audit, and Changeset gates |
| `pnpm test:unit` within `verify`                                                     | 5 files and 34 tests passed                                                                                                             |
| `pnpm test:coverage` within `verify`                                                 | 97.85% statements, 94.34% branches, 100% functions, 98.21% lines overall; domain sources 98.51% statements and 96.05% branches          |
| Typecheck/lint/build within `verify`                                                 | 21/21 typecheck tasks, 19/19 lint tasks, and 19/19 build tasks passed                                                                   |
| Policy checks within `verify`                                                        | 19 package-boundary policies passed; secret scan passed                                                                                 |
| Dependency checks within `verify`                                                    | 301 license records passed; zero known vulnerabilities at every audit severity                                                          |
| `pnpm changeset:status` within `verify`                                              | `@coredrill/domain` has a pending minor Changeset                                                                                       |
| [Foundation CI run #4](https://github.com/seabAu/Coredrill/actions/runs/32697763432) | Commit `fd72f10`; full-history secret scan passed, and frozen install + complete foundation gate + reviewed license inventory passed    |

## Dependency review

Property tests use the design-selected `fast-check` package. Version `4.9.0` is pinned as a root development dependency after review of its current [official documentation](https://fast-check.dev/docs/introduction/) and [registry metadata](https://registry.npmjs.org/fast-check/4.9.0). It is MIT-licensed, maintained under the `ndubien` registry account, and adds no runtime dependency to `@coredrill/domain`.

The updated `JW-DI-001` dependency inventory is version `1.1.0`, is bound to lockfile SHA-256 `c729212ca5ca8b8486f887f4fb8f66cad22916d67f5bb950c3ccaea730e9c3cf`, and records the refreshed advisory and license results.

## Files providing proof

- `packages/domain/src/` — public domain implementation.
- `packages/domain/test/value-objects.test.ts` — unit and property proof for `DOM-001`.
- `packages/domain/test/status.test.ts` — category, custom-stage, and transition proof for `DOM-002`.
- `vitest.config.mjs` — domain suite discovery and coverage inclusion.
- `.changeset/domain-foundations.md` — release-note and compatibility record.
- `docs/proof/foundation-dependency-inventory.json` — exact reviewed dependency and lockfile record.

## Remaining work and boundaries

- `DOM-003` and `DOM-004` remain the next coherent contract slice: the versioned capture envelope and the provenance/conflict/user-confirmation boundary.
- `Q-006` remains open; no default status-stage vocabulary is accepted by this work.
- `FND-001` remains independently blocked on durable private conduct and vulnerability-reporting routes.
- No ADR is required because no Accepted decision changed.
