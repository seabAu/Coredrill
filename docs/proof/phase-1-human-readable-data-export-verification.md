# Phase 1 human-readable data export verification

Date: 2026-08-29

Checklist scope: `BKP-002`

Packages: `@coredrill/contracts`, `@coredrill/storage-core`, `@coredrill/web`

Decision changes: none

## Outcome

Implementation commit `27954e7` adds the production version-1 human-readable
projection for a Coredrill vault. One adapter-neutral TypeScript writer reads a
consistent schema-92 transaction and emits every canonical Phase 1 user-data
table as paired JSON and CSV archive entries: 29 datasets and 58 files.

The exact dataset/field/order mapping is recorded in
[`portable-data-export-v1.md`](../design/coredrill-design-kit/portable-data-export-v1.md).
It includes vault settings, capture inbox records, jobs, companies, contacts,
sources and snapshots, provenance and retained field candidates, pipeline and
activity history, reminders, tags and saved views, documents and versions, and
content-addressed attachment relationships. Runtime migration, device,
diagnostic, search-acceleration, search-state, undo-token, and SQLite-internal
tables are explicitly excluded. `database.sqlite3` remains the complete,
lossless restore source.

The strict `PortableDataExportV1` Zod contract and generated Draft 2020-12 JSON
Schema bind the envelope, source schema, columns, exact row fields and count,
and CSV dialect metadata. Stored JSON becomes canonical nested JSON with sorted
object keys; SQLite booleans become JSON booleans. Rows and files use explicit
stable orders, so the same snapshot produces the same projection bytes.

## Encoding and spreadsheet safety

Both formats are UTF-8 and preserve Unicode. JSON preserves nulls, strings,
numbers, booleans, nested values, provenance IDs, relationship IDs, user
confirmation metadata, and row versions.

CSV uses a header, commas, CRLF records, doubled embedded quotes, normalized
embedded CRLF line endings, quoted strings, unquoted booleans/numbers, and
compact canonical JSON for JSON-valued cells. SQL null is empty-unquoted while
the empty string is `""`, preserving that distinction. A string beginning with
whitespace, `=`, `+`, `-`, or `@` receives a CSV-only apostrophe prefix to block
spreadsheet formula execution; JSON and SQLite retain the original string.
CSV is therefore an inspectable interchange view rather than the authoritative
restore representation.

The four committed byte-exact fixtures cover:

- commas, quotes, embedded line breaks, Unicode, nulls, and formula-leading job
  text in `job.json` and `job.csv`;
- canonical JSON values, provenance relationships, user-confirmation state,
  null metadata, and formula-leading raw evidence in `field_value.json` and
  `field_value.csv`.

## Integrity and failure proof

All 29 queries execute inside one `DatabasePort` transaction. The writer
returns the 58 files only after every dataset satisfies the strict contract.
The complete production bundle feeds directly into the existing D-051 archive
writer, which records each file's byte length and SHA-256 in the manifest.

Invalid caller UUID/timestamp metadata fails before a transaction begins.
Unsupported database schema, missing or mismatched vault identity, adapter
query failure, unexpected row shape, invalid stored JSON or boolean state,
binary or non-finite values, a cell over 16 MiB, a file over 128 MiB, or all
data over 384 MiB returns a stable redacted typed error and no successful
partial bundle.

Thirteen focused contract/storage tests cover the strict envelope, exact row
fields and counts, schema generation, all 29 inclusions and seven explicit
exclusions, four golden files, archive integration, transaction use, schema and
vault drift, query errors, malformed database values, size limits, and caller
validation.

## Browser and hosted proof

The production web storage harness runs the same writer against the fully
migrated official SQLite 3.53.0 WASM database in its dedicated Worker. The local
Chrome 152.0.4191.53 storage suite passed all six scenarios and emitted:

```json
{
  "schemaVersion": 92,
  "humanReadableDatasets": 29,
  "humanReadableDataFiles": 58
}
```

Hosted Foundation CI repeated the real-database projection in every supported
browser lane:

| Browser | Job | Result |
| --- | ---: | --- |
| Chrome 151.0.7922.138 | [`99173641235`](https://github.com/seabAu/Coredrill/actions/runs/33280074760/job/99173641235) | Passed SQLite/OPFS and the 29-dataset/58-file production projection. |
| Chrome 152.0.7977.54 | [`99173641220`](https://github.com/seabAu/Coredrill/actions/runs/33280074760/job/99173641220) | Passed SQLite/OPFS and the 29-dataset/58-file production projection. |
| Firefox 153.0 | [`99173641228`](https://github.com/seabAu/Coredrill/actions/runs/33280074760/job/99173641228) | Passed the exact schema/count assertion through the production bundle. |
| Firefox 154.0 | [`99173641209`](https://github.com/seabAu/Coredrill/actions/runs/33280074760/job/99173641209) | Passed the exact schema/count assertion through the production bundle. |

## Reproducible verification

Run with pinned Node.js 24.19.0, pnpm 11.22.0, Rust 1.98.0, and the repository
lockfile:

| Command | Result |
| --- | --- |
| `pnpm exec vitest run packages/contracts/test/portable-data-export.test.ts packages/storage-core/test/portable-data-export.test.ts` | Passed 2 files and 13 focused tests. |
| `pnpm check:contract-schemas` | All six generated contract/document schemas matched their executable source, including `portable-data-export.v1.schema.json`. |
| `pnpm test:storage-browser` | Passed 6 real Chrome storage scenarios; `STG_PROOF` recorded schema 92, 29 datasets, and 58 files. |
| `pnpm test:coverage` | Passed 53 files and 487 tests at 83.53% statements, 74.61% branches, 82.07% functions, and 86.06% lines overall; `portable-data-export.ts` reached 91.03% statements, 82.82% branches, 100% functions, and 93.44% lines. |
| `pnpm verify` | Passed with exit code 0 across formatting, boundaries, dependency records, typecheck, lint, unit/coverage, all 22 builds, UI/browser/extension/document/native proof, schemas, licenses, secret scans, audits, and Changesets. |
| [Foundation CI run 33280074760](https://github.com/seabAu/Coredrill/actions/runs/33280074760) | Passed on attempt 1 for implementation commit `27954e7`; all policy, browser, extension, and Windows/macOS/Ubuntu native lanes completed successfully. |

## Dependency and policy status

This slice adds no dependency. It reuses the exact `fflate` 0.8.3 dependency
reviewed for `BKP-001`, the existing Web Crypto checksum boundary, and the
existing database ports. The dependency inventory remains version 1.18 with 48
direct dependencies, 354 reviewed JavaScript license records, and 498 reviewed
Rust crates. The lockfile SHA-256 remains
`187bd9086e029157a638b2a184ce96cdd89ac3a78a4760eb75290c6952b1b405`.
The npm audit has zero known vulnerabilities. The existing Rust baseline of 14
unmaintained and one unsound allowlisted transitive warning is unchanged.

## Implementation surfaces

- `packages/contracts/src/portable-data-export.ts` and its generated schema —
  strict version-1 serialized boundary.
- `packages/storage-core/src/portable-data-export.ts` — explicit 29-dataset
  projection, normalization, CSV encoding, bounds, transaction, and typed
  failures.
- `packages/storage-core/test/portable-data-export.test.ts` and
  `fixtures/portable-data-v1/` — contract, golden, corruption, limit, and archive
  integration proof.
- `apps/web/src/main.ts`, `e2e/storage-browser.spec.mjs`, and
  `tooling/scripts/run-storage-firefox-webdriver.mjs` — production SQLite proof
  across local Chrome and hosted Chrome/Firefox.
- `portable-data-export-v1.md`, data/security/stack docs, and D-051 — exact
  mapping and aligned design authority.
- `.changeset/portable-data-exports.md` — contract/storage/web compatibility and
  release record.

## Boundaries and remaining work

- `BKP-003` owns fail-closed archive reading, restore dry-run, database
  integrity/schema checks, conflict preview, stale-target protection, attachment
  staging, and transactional commit. This slice creates export bytes and does
  not accept or restore an archive.
- SQLite remains the lossless restore source. CSV intentionally applies
  spreadsheet-safety transformation and is not used as a silent substitute for
  database restore.
- The projection is pinned to source schema 92. A schema change must update the
  explicit mapping and version/compatibility evidence; it cannot silently omit
  a new canonical user field.
- `FND-001` remains independently blocked on durable private conduct and
  vulnerability-reporting routes. `GATE-0` remains blocked on owner-authorized
  representative human validation, and `Q-006` remains open.
- No Accepted decision changed, so no ADR was created.
