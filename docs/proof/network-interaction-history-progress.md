# Normal top-level Network interaction history — INT-007 in progress

## Scope and invariants

The requirement audit finds Network's Interactions tab still unconnected despite
implemented selected job/contact/company histories. The next slice reads actual
interaction records across the original viewed local vault, with bounded live
occurrence-descending/ID-ascending pages and explicit archived-job choice.
Preserve job-only records and nullable/deleted contact links. Current job/company
metadata is not occurrence-time employer or contact identity evidence; archived
company metadata remains historical context rather than silently filtering events.

Each continuation and summary reference binds original vault/archive scope,
interaction identity/time/version, current job identity/version, nullable contact
identity and nullable current company identity/version. Renamed/moved/deleted/
archived owners or detached contacts invalidate references without rebasing.
No clock ceiling hides valid future-dated imports. Validate lookahead and shared
job/company consistency in one actual SQLite read snapshot.

Pages return only bounded job/company metadata and up to1024 literal UTF-8 summary
preview bytes with complete byte length/truncation disclosure. Deliberate complete
summary inspection uses bounded parts through the existing literal UTF-8 decoder,
preserving BOM, NUL and scalar boundaries. Do not preload contact names/methods,
private company/job notes, source bodies, totals or entire summaries into lists.
Queries perform no canonical writes and do not manufacture contact/source rights.

Prove strict versioned/copied contracts and actual SQLite before shared adapter,
owned normal tab/summary/retry and browser/native/offline/reload/navigation/reflow/
accessibility proof. Existing entry remains explicit local-only and retains its
original context/uncertainty controller; no sending, implicit scheduling or weaker
unscoped mutation path. No schema/index/dependency/permission/Accepted change is
needed; SQL/export182 and old recovery archives stay unchanged. Keep INT-007
unchecked until this remaining normal view and the exact-current-source gates pass.

Published83da8b5 exact CI40214118395 is still followed by original16250. Preserve
its pending post-push receipts and stash2697; do not supersede live hosted proof
or produce a receipt-only push. Home and later product/release work remain open.

## Strict query and actual SQLite prerequisite

The version-1 page and deliberate summary contracts now exist, including copied/
frozen original ownership, exact content-free references, bounded literal previews,
current nullable company metadata and complete scalar-safe part validation. The
actual SQLite port independently validates the sole physical vault, current job/
company/contact identity tuple and audits in one read snapshot. Renames, moves,
company deletion without a job-version change, job archive and contact detachment
invalidate old references. Company archives do not implicitly filter active-job
history. Bounded BLOB transport preserves BOM/NUL and rejects hidden oversized or
malformed metadata; page lookahead and summary lengths receive full validation.
No contact table/method/private-note/body preloads or canonical writes occur.

35 application cases pass first. The first combined actual SQLite run passes48/
fails1 because the reference constructor rejects the legitimate extra fields of
an already validated page owner. It now accepts the known request/page DTO own
keys while retaining strict scope copying and unknown/getter rejection; an
application regression covers page-based construction. Corrected combined repeat
passes49 cases in2 suites (NETWORK_HISTORY_FOCUSED_CORRECTED_EXIT=0).
Initial workspace lint rejects a redundant assertion after primitive direction
narrowing; it is removed without weakening the guard. Corrected98814 closes exit0/
NETWORK_HISTORY_TYPES_LINT_UNIT_CORRECTED_EXIT=0 with35 type tasks,22 lint tasks
plus tooling and241 files/3477 unit tests. Shared adapters, selected runtime/owned
normal tab and full final-source/exact hosted gates are still required. No current
normal-tab or complete INT-007 success is claimed from these prerequisite checks.

## Shared adapters and owned normal runtime

Shared manifest26/46 adds networkInteractions. Actual Node aggregate passes92
cases; serial35213 closes0 with all22 browser components and selected complete
46-case native aggregate. Original per-test budgets remain. Initial33967 lint
finds two optional-chain issues after35 type tasks pass; equivalent guards fix
them. SQL/export182, old fixtures and locks remain unchanged.

Normal Interactions calls only the selected-runtime typed application API. Its
reader distinguishes unread/empty/stale/error, validates every page/body, allows
one read flight and exact explicit retry, and locks changed/invalid owners until
Refresh. Bodies open only for an actual viewed item; parts retain literal prefixes
and original identity. Retired vault/archive/tab owners cannot publish or move
focus. Summaries provide a24rem keyboard-scroll region and record-owned open/close
focus through reflow, preserving deliberate foreign focus.

Network New interaction reuses the root controller and original record/check
command. Explicit active-job selection uses all validated canonical pipeline
pages; no selected contact is inferred. Six kinds, immutable context/version,
uncertain acknowledgement, read-only check, identical explicit retry, session
draft privacy and vault locks retain the original path.

Initial UI typecheck passes, lint finds two optional-chain style issues; fixed
without changing behavior. Reader tests initially pass10/fail1 because a fixture
next ID violates canonical ascending equal-time order. Corrected fixture retains
the strict parser and passes11 (NETWORK_READER_CORRECTED_EXIT=0). Browser28295
fails only the close-focus expectation after prior paging/body/retry/reflow/axe
checks: this reader resolves the record's current opener, not fallback status.
Corrected62313 passes5.6s/NETWORK_UI_BROWSER_CORRECTED_EXIT=0; actual Rust SQLite
54110 passes10.3s/NETWORK_UI_NATIVE_EXIT=0. Both handles close0.

65343 closes0/NETWORK_ACK_BROWSER_NATIVE_EXIT=0: both complete workflows repeat
with real lost-COMMIT-acknowledgement injection at Worker/native boundaries,
passing2 cases28.6s. Each new Network write uses an explicit job and null contact
even after visiting selected contact. A lost reply blocks further Save; one
explicit read-only Check finds exactly one original record, with archive hash
unchanged and one save/one check/no replay. Two normal writes per runtime are
disclosed. Read-only history segments also preserve archive hash equality.
Journeys cover all-company/unknown-company/archived-company context, archived-job
scope, complete BOM/NUL/scalar reconstruction and empty bodies, exact page/part
retries, no summary preload, reload-first-page,320px forced-colors/reduced-motion/
keyboard/axe and retired-tab no publication/focus theft. Synthetic schema165
archive prerequisites preserve original recovery bytes. Full final-source gates
remain; these focused results alone do not complete INT-007.

Previous83da8b5 exact CI40214118395 is cancelled, with closed16250 terminal1 and
25349 complete-log terminal0:9 required jobs pass, Chrome152 hits25m after115
resilience/7 onboarding passes before uploads. The same exact Chrome suites now
partition into two lanes per version, with no test/job limit or assertion changes
and all required artifacts preserved. Require fresh exact-current hosted proof.

## First complete gate and integration-test update

Corrected whole-source35 type tasks,22 lint tasks plus tooling and242 files/3488
units pass (90819 terminal0/NETWORK_UI_LINT_UNIT_CORRECTED_EXIT=0). The preceding
55207/65995 attempts retain lint failures; final style fixes preserve the guard
and qualify the test-only globalThis.TextEncoder without suppression.

Durable full runner48652 saves exit1/NETWORK_INTERACTIONS_COMPLETE_VERIFY_EXIT=1;
launch64507 closes0, which is not the verification result. Full log is retained
at test-results/network-interactions-complete-verify.log. Unit3488 repeats under
coverage84.79/78.40/85.91/87.47; builds/artifacts,7 UI foundations,76 shell and
1 performance case pass. Resilience passes115/fails2 in9.6m. Both failures are
the same old shared company-directory assertion demanding the now-replaced
"Stored interactions navigation is not connected yet" placeholder, in browser
and native. All new history/entry/lost-ack journeys pass in this original run.
The shared assertion now requires the actual confirmed-empty history, zero rows,
no error and disabled New until explicit job selection. No production behavior,
test budget or privacy requirement changes. Focused repeat and fresh complete
corrected-source gate are required; no full success is inferred from115 passes.

Corrected78333 closes0/NETWORK_DIRECTORY_CORRECTED_EXIT=0 with both original
failures passing45.1s, including the complete native directory/contact/normal
entry/uncertainty/deletion chain27.2s and browser directory2.8s. Source/tests
freeze again for fresh final-source verification. No assertions are skipped.

## Complete corrected-source verification

Durable runner66536 saves0/NETWORK_INTERACTIONS_FINAL_VERIFY_EXIT=0 in
test-results/network-interactions-final-verify.log and matching .exit receipt;
original launch2594 is consumed terminal0. This fresh run follows the two old
placeholder failures and their focused repeat, not an interrupted or partial run.
All source/tests stay frozen after this gate; only result documentation follows.

- Whole formatting,19 import policies, foundation records,35 type tasks,22 lint
  tasks plus tooling and all workspace builds pass.
- 242 files/3488 unit tests pass, repeated under coverage84.79 statements/78.40
  branches/85.91 functions/87.47 lines.
- Artifact/contrast/extraction/extension package checks pass, with7 UI foundation,
  76 shell,1 performance,117 resilience,7 onboarding,13 document-browser and36
  browser-storage cases passing.
- All23 native SQLite cases pass, including the complete shared26/46 aggregate.
  Rust24 pass/1 secure-store test remains independently delegated as before;
  actual Windows Credential Manager store/read/delete passes with secretExposed
  false. Archive cancellation, checksum rejection, atomic replacement/reopen and
  verified backup rotation pass.
- Generated schemas,831 npm/498 Rust license policies, secret scanning, npm/Rust
  vulnerability audits and Changeset status pass.

Both original directory failures and the new normal browser/native Network
history/entry/lost-ack cases repeat successfully with unchanged timeouts. Preserve
the first full failure and all earlier focused/lint failures as separate evidence.
SQL/export182, original recovery fixtures, locks, permissions and Accepted choices
remain unchanged. Stash2697 is preserved. Serial extension, final result hygiene,
authorized coherent commit/push and fresh exact hosted completion follow. Full
INT-007/INT-008 and independent release/manual gates remain open.

## Serial extension and final hygiene

Original72385 closes0/NETWORK_INTERACTIONS_EXTENSION_EXIT=0: all9 Chromium
transfer/Firefox fallback cases pass29.5s after the complete final-source gate.
All local browser/native/extension suite handles are terminal. Final document
format/policy/secret/diff checks precede the authorized coherent commit and push.
Pending company-outcome receipts are included, preserving the cancelled hosted
result honestly. A fresh exact-current hosted run remains required; no full
INT-007 or goal completion is claimed.

Final75394 closes0/NETWORK_FINAL_HYGIENE_EXIT=0: whole-workspace formatting,
19 boundary policies, foundation records,831 npm/498 Rust license checks and
secret scanning pass. Whitespace is clean; all36 reviewed files belong to this
checkpoint, including pending company-outcome receipts. Stash2697 is unchanged.
Only result records follow the frozen-source full gate. Commit/push is authorized
with no force or history rewrite; fresh exact hosted success remains required.

## Exact published checkpoint

60a7a1aa6b6d488c8792ae027de1bf5108a744b1 is committed and pushed normally to
origin/main:36 files,3795 insertions/67 deletions. It includes normal Network
history/summary/entry, shared26/46 contracts, all tests/design/Changeset records,
pending company-outcome cancelled hosted closure and living checklist updates.
HEAD and origin/main match; the tree is clean immediately after push. Stash
2697ebcec53351a052d8c5c19e2b8e2a52056a70 is unchanged.

Fresh exact [Foundation CI40220879128](https://github.com/seabAu/Coredrill/actions/runs/40220879128)
is in progress for this SHA. One quiet original watcher writes
test-results/network-interactions-hosted-watch.log, saved .exit receipt and
NETWORK_INTERACTIONS_HOSTED_EXIT. Follow that original handle to terminal closure;
do not restart or supersede it after an observation timeout. This is not hosted
success. Previous83da8b5/40214118395 remains cancelled, not green proof of this
new source. Both exact Chrome versions now execute every original suite and
required artifact across the two smaller lanes, keeping all timeouts unchanged.

Carry these post-push receipts with the next coherent verified implementation;
no receipt-only push. Fresh exact hosted completion and final INT-007 requirement
audit precede checking the item and beginning normal INT-008 Home. Later salary,
AI/discovery and independent release/manual/hardware gates remain open; no full
goal completion or owner blocker is claimed.

## Exact hosted closure

Original62381 consumes terminal1/NETWORK_INTERACTIONS_HOSTED_EXIT=1 and its saved
exit receipt. Complete-log retrieval60303 closes0. Exact60a7a1a CI40220879128 is
cancelled, not green: all11 other required jobs succeed, including all4 split
Chrome lanes and both Firefox/native/extension/secret coverage; PR-only review
skips. The aggregate reaches35m during final licenses after all functional,
archive/backup and schema checks pass. Full logs and jobs JSON retain the exact
evidence. See [complete-gate partition repair](ci-foundation-partition-verification.md).

The next reminder checkpoint partitions all original local verification commands
into two existing-quality-job matrix groups, with unchanged35-minute limits and
every complete runtime suite retained. This does not retrospectively make the
cancelled run successful. Both original handles are terminal; no watcher restart
or receipt-only push. Reminder commands/normal controls and final Network audit
still precede INT-007 closure and Home.
