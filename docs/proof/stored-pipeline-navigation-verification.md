# Stored Pipeline navigation

Date: 2026-10-19. Checklist: `Q3-005`, integration checkpoint, not gate closure.

## Implemented boundary

Normal `app-shell.html` windows now initialize Board/Table with no reference
records. A runtime projection reads every validated `APP-005` keyset page,
checks duplicate identities/cursors and aggregate/group consistency, and exposes
one shared transient record set for both views. Abandoned loads are ignored;
failed/inconsistent reads show a content-free retry state rather than publishing
a partial corpus or falling back to sample records. SQLite remains truth.

Unassigned remains a category-free read group. Priority and capture time are
unknown when the query does not supply them; creation time is not relabeled as
capture time. Unknown application dates/salary do not imply “Not applied” or
“Not disclosed.” Missing durable move/edit/configuration callbacks remain
unavailable, not React-only writes. Real configured status metadata is still
provided to the read-only Table.

Presentation/performance tests explicitly opt into
`coredrillReferenceShellCatalog` before mounting. Normal Home attention/recent
items and search results no longer use reference jobs/companies. Loaded local
document summaries are searchable. Reference Company/Timeline/Source content
is not shown as real stored-job data; unconnected views explain that limitation.
The requirements and application-document flows continue using their actual
stored adapters.

## Evidence

- Focused projection/UI tests: 20 passing tests. The 205-record case proves all
  three keyset pages are read. Other cases cover unknown facts, inconsistent
  counts, duplicate/repeated cursors, cancellation and content-free failures.
- Typecheck (33 tasks) and lint (22 tasks plus tooling) passed during iteration;
  final-source full verification is pending below.
- `e2e/stored-pipeline-navigation.spec.mjs` passes against the built PWA offline:
  empty Pipeline → normal Add/manual capture → review/Save → discover the record
  in Board and Table → open by UI → start explicitly named preparation → Close
  through tab history → restore the original Table opener after an intentionally
  held query → switch to Board → reload → retry an injected query failure.
  Navigation never reads a job ID from a test API or installs seeded records.
  Zero page exceptions, external requests and axe violations; 320-pixel
  forced-colors/reduced-motion screenshot visually inspected.
- The normal-document navigation regression passes after its synthetic-company
  search was replaced with its own UI-created local resume. Save-before-search,
  failed Back text retention and abandoned-load checks remain intact.

The browser journey exposed and reproduced three integration failures: Close
returned only one tab-history entry instead of Pipeline; read-only Table lacked
real status metadata; and a stale snapshot restored Table over a Board URL on
reload. The fixes preserve tab-history depth and Forward entries, provide real
group status metadata without enabling edits, and update presentation snapshots.
Focus restoration now waits for the returned stored rows rather than assuming a
fast query. No forced clicks, test-runner retries, exception suppression or timeout increases
were added to make the journey pass.

## Remaining required work

This is not the final product composition. Root `index.html` is still the
diagnostic storage entry; native UI still needs the accepted native DatabasePort
selection. Durable Pipeline moves/undo/scalar edits, stored Company/Timeline/
Source views, complete global-search composition, and replacing the seeded
canonical Phase 3 setup remain required. No schema, dependency, permission or
Accepted decision changed. `Q3-005` and every open milestone gate remain open.

## Final verification

Final-source `pnpm verify` exited 0: formatting, boundaries, foundation records,
33 typecheck tasks, 22 lint tasks plus tooling, 131 unit files / 1,046 tests,
coverage, builds, contrast/extraction/extension checks, six UI-foundations tests,
76 explicit reference-catalog shell tests, diagnostic performance, ten resilience
journeys (including the actual stored-record journey), seven onboarding tests,
13 document-browser tests, nine browser-storage tests, 11 Rust tests plus one
intentionally ignored platform-secret test, 13 native-adapter tests, separate
Windows secure-store proof, archive/backup proofs, schemas, licenses, secret
scan, dependency audits and Changesets status. npm reports no known
vulnerabilities; Cargo retains ten allowed warnings.

After the full gate, documentation-only verification records were updated.
Clean-commit hosted verification remains pending. The prior query commit
`bab1d70` passed hosted run `39279887948`; presentation commit `82e0226` is pushed
and its run `39285039523` was last observed queued. Neither verifies this new
checkpoint; do not cancel an unfinished predecessor run by pushing early.
