# Phase 3 evidence export and deletion verification

Date: 2026-09-27
Checklist item: `EVD-008`
Implementation commits: `ccc0a0beeab1be8cadd47eddd4689edfa85cda24`, `88e87a4e17fa9f5849c3929824b252bfc424d59e`
Hosted run: [Foundation CI 36325271155](https://github.com/seabAu/Coredrill/actions/runs/36325271155)
Status: complete

## Outcome

Coredrill's version-1 portable archive now carries a reviewed human-readable JSON and CSV projection for every current Phase 3 user-data table, including canonical Career Profile evidence, typed story links, resume-import proposals and resolution provenance, and Answer Library entries and immutable versions. The archive remains accountless, local, checksummed, and restorable with AI disabled.

Deletion proof covers the matching relationship lifecycle. Removing an evidence target removes only its typed story link; removing a story removes its links without deleting canonical evidence. Removing an Answer Library document removes its owned entry, immutable answer-version mapping, document versions, and logical attachment link, while a shared content-addressed attachment manifest remains until explicit orphan cleanup. Whole-vault deletion continues to remove the database and all vault-managed attachment bytes after exact confirmation while preserving external recovery archives.

## Human-readable export coverage

- Current schema 126 exports 47 reviewed datasets as 47 JSON plus 47 CSV files, for 94 human-readable data files.
- Seventeen Phase 3 datasets were added: employment, education, project, skill, accomplishment, certification, publication, volunteer experience, story, candidate profile, resume import run/proposal/resolution/link records, typed story-evidence links, and Answer Library entry/version records.
- Dataset and column minimum-schema metadata preserves the version-1 archive contract for supported historical source schemas: schema 101 exports 30 datasets, schemas 111 and 112 export 40, schema 115 exports 42, and schema 126 exports 47.
- The schema-inventory test compares the real migrated database with the export registry. Every durable current-schema table must either have a dataset or appear in the explicit reviewed exclusion set, and every registered dataset must resolve to a real table.
- User-confirmed and imported evidence state, source-document pointers, privacy tags, source excerpts, immutable import decisions, sensitivity, last-used state, and version history remain present in the readable projection. No generated claim is promoted to verified evidence.

## Deletion and provenance semantics

- `anecdote_evidence_link` rows cascade when either the story or linked canonical evidence row is deleted. Repository proof confirms an evidence deletion removes only the affected link and leaves the story plus its other evidence intact; story deletion removes the remaining links while preserving the evidence rows.
- Evidence `source_document_id` references retain the accepted `ON DELETE SET NULL` behavior. Removing a source document cannot silently delete the user-owned evidence row.
- Answer Library `source_job_id` remains `ON DELETE RESTRICT`, so application provenance cannot be silently severed while the answer exists.
- Answer entry/version metadata, document versions, and logical attachment links cascade with the owning Answer Library document. The content-addressed `attachment_manifest` is intentionally independent so shared bytes are not removed prematurely; explicit orphan cleanup removes it only after no logical links remain.
- Resume import proposals, resolutions, and resolution-proposal membership cascade with the owning import run, preserving an atomic boundary rather than leaving partial provenance.
- Typed whole-vault deletion still previews the database and managed attachment count, rejects an inexact confirmation without mutation, removes only the selected vault's local data, and leaves the caller's external archive available for recovery.

## Cross-adapter recovery fixture

The deterministic recovery fixture now represents the complete Phase 3 evidence surface rather than only the original Phase 1 tracker rows. Browser and native restore checks compare this inventory after clean-install recovery:

- 8 canonical evidence records, one for each supported Career Profile evidence type
- 1 Situation/Action/Result story and 8 typed story-evidence links
- 1 resume import run, 2 proposals, 2 resolutions, and 2 resolution-proposal links
- 1 sensitive application-sourced Answer Library entry and 1 immutable answer version
- 2 attachment manifests and 2 logical attachment links

Fixture identity:

- schema version: `126`
- archive byte length: `1491761`
- archive SHA-256: `75166d15b244b8c7f2abb17d0beb238439ed64d9f9e93969df50967bf57a4dbc`
- database SHA-256: `51e90100eb2f0d34b094aa797c07447be997a32e8460ab84f204db714a07d2aa`
- content SHA-256: `28a22a32c6154896f7bb6108930887b4317bb0a4d7fda70a2ac744da5d05a771`
- human-readable data files: `94`
- managed attachments: `2`

## Local verification

- Focused storage-core verification passed 3 files and 15 tests covering export compatibility, current-schema inventory, story-link deletion, and Answer Library document/attachment deletion.
- Focused browser proof passed the current-schema export and clean recovery journeys in Edge 154. It reported schema 126, 47 datasets, 94 readable files, the fixture hashes above, both attachments, and an exact restored Phase 3 inventory.
- Native verification passed 13 TypeScript integration tests plus 11 Rust tests, with the one platform-secure-store test intentionally delegated to its redacted proof harness.
- `pnpm verify` passed formatting, 19 import-boundary policies, 51 dependency/toolchain foundation records, all 22-package typecheck and lint gates, 98 unit files and 793 tests, coverage, production builds, extension inspection, all browser suites, native recovery, contract schemas, licenses, secret scanning, dependency audits, and Changesets.
- Coverage passed at 82.36% statements, 75.42% branches, 83.91% functions, and 85.47% lines.
- Dependency policy remained clean: 520 JavaScript packages and 498 Rust crates passed license review; npm and Rust audits reported zero known vulnerabilities, with the same 7 reviewed Rust warnings allowed by policy.

## Hosted clean-commit verification

The first implementation run correctly exposed stale pre-EVD-008 counts in the Firefox-only WebDriver proof. Commit `88e87a4e17fa9f5849c3929824b252bfc424d59e` aligned that harness with the reviewed 47-dataset/94-file contract. Fresh Foundation CI run `36325271155` then completed successfully for that exact head SHA.

Required hosted jobs passed:

- build, static checks, tests, and policy (`108636979102`)
- native secure storage and packages on Ubuntu (`108636979077`), Windows (`108636979142`), and macOS (`108636979137`)
- browser storage on Chrome 151 (`108636979112`), Chrome 152 (`108636979156`), Firefox 153 (`108636979108`), and Firefox 154 (`108636979120`)
- extension transfer on Chromium and Firefox fallback (`108636978892`)
- full-history secret scan (`108636979149`)

The pull-request-only dependency review job (`108636979979`) was skipped as expected for a direct push to `main`.

## Decision review

No Accepted product or architecture decision changed. This slice extends the existing version-1 archive's reviewed projection and proof coverage while retaining SQLite as durable truth, typed local deletion, content-addressed managed attachments, provenance-preserving evidence, historical schema compatibility, and accountless offline recovery. It adds no dependency, hosted service, account requirement, network access, scraper, AI call, or extension permission. No new ADR was required for `EVD-008`.
