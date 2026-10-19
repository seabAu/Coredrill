# Exact-version job-document copies

Date: 2026-10-19. Checklist scope: the production document-creation boundary within `Q3-005`; the complete canonical journey remains open.

## Behavior and boundaries

A stored job with a local, active, unsubmitted application attempt can explicitly copy a saved reusable resume or cover-letter version. The user chooses the exact version and a title. Unsaved drafts, templates and application answers are not reusable sources in this slice. The command validates canonical IR, derived plain text and the independently calculated SHA-256 before persistence. The transaction rechecks the application row version, job, reusable source, content and timestamps, then creates metadata, job lineage, version 1 and immutable origin together.

Creating a copy does not select it, advance the application row version, verify evidence, generate content, upload, submit or mark Applied. The first copied version has no cross-document parent-version link. Subsequent editing uses the existing same-document immutable version history.

## Schema and recovery

Migrations 155–158 add `document_derivation_origin` and insertion/update/deletion guards. An origin identifies the source version and the first identical derivative version; source content, IR, plain text, hash, kind and reusable-base lineage must match. Origins cannot be rewritten or detached while the derived document exists. Source-version retention is restrictive; deleting an otherwise deletable whole derivative cascades its origin without deleting the reusable source.

Legacy derivatives receive no invented version-origin backfill. Schema-154 exports remain supported with 56 datasets. Schema-158 exports include the new origin dataset as paired JSON/CSV, yielding 57 datasets and 114 data files. The recovery fixture deliberately retains the legacy tailored submitted derivative without an invented origin and adds a separate exact-copy derivative with a real origin row.

## Evidence obtained

- `packages/application/test/document-derivation.test.ts`: validated input, exact selected source identity, content/hash/plain-text consistency, normalization rejection, future-source rejection and redacted failures.
- `packages/storage-core/test/document-editor-repository.test.ts`: real SQLite migration application, exact origin retention after later reusable editing, mismatched-kind/content rejection, immutable/detach/source-deletion protection, whole-derivative cascade, unchanged application selections, stale/applied/archived rejection and transactional rollback.
- `packages/storage-core/test/portable-data-export.test.ts`: complete table inventory, nonempty schema-158 origin JSON/CSV, and preserved schema-154 output without fabricated origins.
- Final full unit matrix passed at 125 files / 979 tests, including editor-origin validation.
- Repository-wide typecheck passed all 33 tasks after production form/runtime composition.
- `e2e/application-attempt.spec.mjs` passed against the built PWA offline. It creates the capture, job, attempt and both reusable/derived document kinds through user actions, without scaffolded records; checks exact IR/hash, origin and reload identity; confirms unchanged application selections and row version; runs axe and 320-pixel reflow checks; observes zero external requests. Machine-readable output is `DOCUMENT_DERIVATION_PROOF`.
- The schema-158 synthetic recovery fixture regenerated successfully through `e2e/storage-recovery.spec.mjs`; clean-browser restore passed with matching raw SQLite identity, retained origin data and both physical attachments. Machine-readable output is `BKP007_BROWSER_PROOF`.
- The 320-pixel copy-form screenshot was visually inspected: fields and actions wrap without horizontal clipping. It is retained under the resilience suite's `job-document-copy-320.png` output.

## Full local verification

`pnpm verify` completed with exit 0. It passed formatting, 19 boundary policies, foundation/dependency records, all 33 typecheck tasks, lint, 979 unit tests and coverage, builds, generated reports and schemas, extension package checks, five UI-foundation tests, 76 shell tests, diagnostic performance, seven resilience tests, seven onboarding tests, 13 editor/browser tests, nine browser-storage tests, 13 native TypeScript tests and 11 Rust tests. The intentionally ignored secure-store unit case is exercised separately through the passing redacted real Windows secure-store harness. Native archive and automatic-backup proofs also passed.

The existing 26-case shared repository aggregate now additionally exercises exact-origin insertion, rejection of a template masquerading as the reusable base, immutable updates, detach rejection and retained identity. It passed in Node SQLite, browser SQLite/OPFS and native rusqlite. The native recovery test compares the nonempty origin dataset and complete row inventory against the schema-158 fixture.

Secret-pattern and npm/Rust license checks passed. npm reported no known vulnerabilities; Cargo completed successfully with the same ten reviewed informational warnings (nine unmaintained dependencies and the existing `glib` unsoundness warning). No dependency pins changed.

The first full-gate attempt stopped before the editor suite when its test URL appeared occupied; a subsequent listener check found no process to terminate. The complete rerun passed without changing test-port or server-reuse policy. Clean-commit hosted verification of this slice remains pending; local success is not a hosted CI claim.

The previous application-attempt/OPFS checkpoint at `db909dacad449db2ed3cc8fdc25bfd92e5f502b9` passed all required jobs in [CI run 39229249818](https://github.com/seabAu/Coredrill/actions/runs/39229249818). That run does not verify these new uncommitted derivation changes.

## Remaining integration work

The full `Q3-005` journey still uses seeded requirement/evidence/application/document setup in its separate canonical test. Replace those setup paths with production user actions, audit stored-job requirement authoring/parsing and tracker composition, and prove the complete export/Applied/reload loop before closing the item. The sidebar Documents destination currently retains an open editor; this journey uses the editor's explicit Back to documents action, which flushes before closing. Resolve general navigation/draft-flush behavior as an integration follow-up rather than claiming the sidebar behavior is proven here.

No Accepted decision, dependency pin, extension permission, network destination or account requirement changed.
