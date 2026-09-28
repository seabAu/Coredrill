# Phase 3 document round-trip verification

Date: 2026-09-28
Checklist item: `DOC-008`
Implementation commit: `ffdeeae7f35043e402804630eb0f2a58e2c7e22c`
Hosted run: [Foundation CI 36391985097](https://github.com/seabAu/Coredrill/actions/runs/36391985097)
Status: complete

## Outcome

Coredrill's version-1 portable archive now has an exact, reproducible Phase 3
document round-trip witness. One synthetic schema-154 vault is exported through
the production archive writer, restored into empty browser SQLite/OPFS and
native rusqlite/app-data targets, and compared against the same immutable
document, application, evidence, provenance, and attachment projections.

The proof uses the existing accepted D-051 boundary. `database.sqlite3` remains
the lossless restore authority; paired JSON/CSV projections remain inspectable
ownership artifacts; and content-addressed attachments remain independently
verified physical bytes. No hosted service, account, AI provider, network
connector, or paid capability participates in export or restore.

## Exact document graph

The committed fixture contains:

- three documents and four immutable versions, including one base resume, one
  job derivative, one submitted derivative version, and a distinct later
  current version whose parent is the submitted version;
- two immutable lineage rows and two explicit job links;
- one recoverable editor draft based on the later current version;
- one exact selected resume version and one ordered application-answer
  selection;
- one applied application, one submitted snapshot, and two ordered snapshot
  items: a file-backed resume plus a plain-text answer;
- two attachment manifests and three purpose-qualified version relationships,
  including the exact file relation retained by the submitted snapshot; and
- the related source snapshot, provenance, job requirement, Career Profile
  evidence, story/skill/requirement evidence links, coverage decision, resume
  import decisions, and Answer Library provenance/version metadata.

The witness records exact ordered rows from 21 critical datasets. It explicitly
asserts that the application and submitted snapshot continue to reference
resume version `0198d9d4-0000-7000-8000-000000000022` after version
`0198d9d4-0000-7000-8000-000000000023` becomes current. The submitted file
item retains the matching `(document_version_id, content_id, purpose)` tuple;
the answer item retains its immutable selected version as plain text.

## Archive and clean-restore identity

The deterministic committed artifact contains all 56 schema-154 human-readable
datasets as 112 JSON/CSV members and two physical attachments.

| Identity                | SHA-256 / value                                                    |
| ----------------------- | ------------------------------------------------------------------ |
| Archive                 | `38f8f58f39f9e7524d1a8b5a5d79a7bf9d11559a13d2f3d2061cd0645f2667b7` |
| SQLite member           | `8f9745306c823e51e9977a31e1571fe6cad6d1a97be384724999edbf68b00867` |
| Canonical vault content | `011982b3238bc2982fe45536592f90c7c63092a4f07713e15de7ba062605682a` |
| Archive bytes           | `1,775,095`                                                        |
| Human-readable files    | `112`                                                              |
| Attachments             | `2`                                                                |

The browser test first regenerates the archive from the source vault and
requires byte equality with the checked-in ZIP and JSON witness. It then closes
and deletes the source context, opens a separate clean browser context, previews
an empty-target restore, commits it, regenerates the canonical projections,
rereads both attachment files, and requires exact equality with every witness
row and all three hashes.

The native test reads that same immutable ZIP, restores it through the actual
rusqlite/native attachment boundary into an empty app-data target, regenerates
the same 21 dataset witness, rereads the physical attachments, and requires the
same canonical content hash. Neither adapter reconstructs durable state from
CSV or silently merges a target.

## Failure and contract coverage

- The version-1 reader validates bounded ZIP layout, the exact manifest entry
  inventory, safe paths, lengths, and every checksum before a storage adapter
  receives candidate bytes.
- Temporary SQLite inspection requires integrity, schema, and vault identity;
  preview remains non-mutating and commit is bound to the exact target
  fingerprint.
- Existing archive suites continue to reject missing or corrupt attachments,
  truncated/corrupt archives, unsafe or duplicate entries, unsupported
  versions/schemas, stale targets, replay, and injected atomic-commit failure.
- The schema-inventory test still requires every durable table to be exported
  or deliberately classified as runtime-only. The normative mapping now lists
  `application_answer_selection` explicitly instead of relying only on the
  executable dataset inventory.

No archive version, document IR version, database migration, dependency, or
repository contract version changed. The current version-1 archive already
carried the complete schema-154 database and datasets; this slice adds the
missing exact Phase 3 cross-adapter witness and closes its proof obligation.

## Local verification

The complete `pnpm verify` gate passed on Windows with Node 24.19.0 and the
locked dependency graph. Material results included:

- formatting, 19-package boundary policy, foundation records, typecheck, lint,
  builds, generated schemas/reports, extension package inspection, licenses,
  secrets, npm audit, and the reviewed RustSec warning policy passed;
- 118 unit-test files and 899 tests passed; aggregate coverage remained 81.24%
  statements, 74.44% branches, 83.29% functions, and 84.19% lines;
- 75 application-shell journeys and all document, onboarding, resilience,
  performance, and UI-foundation journeys passed;
- eight browser-storage journeys passed, including committed-fixture
  reproduction and clean restore with exact document witness equality; and
- thirteen native storage tests passed, while the Rust suite passed 11 tests
  with one platform-only secure-store test intentionally delegated to its
  redacted harness.

## Hosted verification

[Foundation CI 36391985097](https://github.com/seabAu/Coredrill/actions/runs/36391985097)
passed exact implementation commit
`ffdeeae7f35043e402804630eb0f2a58e2c7e22c` across Chrome 151/152,
Firefox 153/154, Windows, Ubuntu, and macOS. The build/static/policy lane,
full-history secret scan, extension transfer/package lane, browser storage
lanes, native repository/restore lanes, secure stores, backup paths, and native
packages all remained green. The pull-request-only dependency-review job was
not applicable to the authorized direct push to `main`.

## Decision review

No Accepted decision changed. This slice supplies the exact Phase 3 recovery
evidence required by D-042 while retaining D-051's version-1 archive,
lossless-SQLite authority, inspectable projections, and content-addressed
attachments. No ADR or Changeset is required because persisted/runtime behavior
and package APIs did not change; only proof fixtures, test harnesses, and the
normative field mapping changed.

Document accessibility, print, pagination, and high-zoom completion remains
`DOC-009`.
