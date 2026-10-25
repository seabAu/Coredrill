# Company listing sources — INT-007 in progress

## Current-state audit and scope

Company source evidence already exists through `job_source` and immutable
`source_snapshot` records. Company membership follows a job's current company;
neither matching a website domain nor a contact's employer creates that link.
The normal company view still leaves source evidence unloaded. Its catalog is
not canonical data and cannot supply missing sources or inferred totals.

The next slice reads bounded live pages of stored listing sources for jobs
currently linked to the explicitly viewed company. It includes source records
without retained snapshots rather than silently omitting them. Current source
metadata is distinct from the optional most-recent retained snapshot metadata,
and neither establishes verified employer facts or historical company membership.
Snapshot selection is capture-time descending/ID ascending, not a new verification
or permission grant. Existing source inspection remains the deliberate body path.

Bind original vault/company/revision, independent company/job archive scope, and
source update-time-descending/ID-ascending keyset order. Continuations retain
source ID/time/version and current job ID/version; changed/moved/archived/deleted
anchors reject without rebasing. Validate the lookahead too. The latest snapshot
is a live read projection; new retained captures can change it without making
earlier pages immutable. Do not hide valid future-dated imports with a clock ceiling.

Return minimal current job and source identity/audit metadata, literal stored URL
text plus separately validated HTTP(S) navigation targets, source hashes and an
optional retained snapshot reference/extractor/hash/retention metadata. Return no
descriptions, notes, contact methods, retained bodies, aggregate totals or inferred
rights/outcomes. URL validation must not rewrite the literal stored value. No
request fetches a URL; explicit navigation/inspection is separate.

Implement strict versioned contracts and the actual SQLite repository, then
prove ownership, ordering, source-only records, literal URLs/Unicode, snapshot
selection, corruption, private-body exclusion and read-only behavior. Shared
adapter execution and owned normal runtime/UI follow. Existing indexes and schema
182 remain; any later index change requires measurement. No dependency, permission,
provider, hosted service or Accepted decision change is needed.

The blueprint `salary_observation` table does not yet exist. Employer-specific
observations and public market context depend on later SAL-001–SAL-010 work;
current listing sources must not stand in for them. Company outcome history also
remains separate from current job status. This slice does not close full INT-007.

Previous60f456c exact CI40186513941 is terminal failure; original watcher94470
closed with exit1 and complete-log retrieval8450 with exit0. Its immutable source
is separate from these changes; retained receipts accompany this implementation.
Stash2697 and unrelated work remain preserved.

## Application, actual SQLite and owned UI

Strict copied/frozen version-1 contracts preserve literal URL text separately
from normalized safe HTTP(S) hrefs. Actual SQLite reads validate owner, canonical
source/job anchors and lookahead in one read snapshot. Bounded BLOB transport
rejects hidden oversized NUL tails and malformed UTF-8 rather than truncating
them into successful metadata. Source-only records and latest snapshot selection
are tested independently; there are no writes or retained-body reads.

Focused6bad44 passes45 cases across2 suites. Shared Node49303 passes88 cases
across4 suites. Manifest24/44 executes every previous case plus the new company
source contract: serial75978 passes all20 explicit Chromium components (55.0s)
and the selected complete native aggregate (8.0s). This is not yet a complete
native-runtime or final-source result. Types/lint/unit49562 passes35 type tasks,
22 lint tasks plus tooling and236 files/3374 tests before the archive-scope fix.

The normal company panel owns scope, first/next/archive/exact retry, stale/empty
states, literal links and metadata. It loads no bodies and fetches no URLs.
Explicit inspection opens the job-level Source workspace; it does not claim to
select the originating source's capture. Minimal history state restores the
original page/cursor/archive choice and selected-row focus after revalidation.
Foreign or obsolete owners cannot publish or rebase. Initial two normal browser
journeys83895 pass26.7s, including320px forced-color reflow/axe, unchanged export
hash during read-only actions and late foreign-page exclusion.

Archived inspection exposed a pre-existing Source-reader gap: every request
assumed active jobs. It now receives an immutable explicit archive scope only
after matching canonical job details confirm the selected archived job. All
snapshot/content/evidence/value/comparison requests, continuations and retries
retain that choice. Existing precise request assertions were updated to include
the explicit false default; a new test covers true across operations. Initial
401677 had6 request-shape failures; corrected a29dab passes60 cases in2 suites.
Initial source test mutation of an already frozen fixture and a redundant optional
chain lint failure were corrected without weakening validation or assertions.

Normal37545 passes3 browser journeys27.1s and the matching actual Rust native
journey13.8s. Final stale-return70190 passes all4 browser cases34.4s: an actual
concurrent company-note command invalidates the saved revision, makes no automatic
source request and requires an explicit first page at revision2. The320px forced
color screenshot was visually inspected; read-only export hash and no external
requests assertions pass. Native proof uses simulated Tauri IPC, not installed
WebView acceptance.

## First complete gate and lifecycle regression

Original44778 closes exit1/COMPANY_SOURCES_COMPLETE_VERIFY_EXIT=1, log
test-results/company-sources-complete-verify.log. Whole formatting, boundaries,
foundation,35 types/22 lint plus tooling,236 files/3375 units repeated under
coverage84.48/78.03/85.69/87.12, builds/artifacts,7 UI foundations,76 shell and
diagnostic performance pass. Resilience passes109/111 cases15.3m, including all
new company-source browser/native and normal interaction/note-lifetime cases.
Native tracking and standalone browser comparison fail the same missing Compare
control after reload at listing-comparison-journey.mjs:224; this is not success.
Later full-gate stages do not execute after that failure.

The comparison probe replaces an API object while preserving its workspace read
function. The details hook depended on the whole object, causing an unrelated
details refresh; the new canonical archive-scope gate then retired/recreated the
Source reader, losing a newly selected paired snapshot. Details now bind the
actual workspace function, job and row version rather than unrelated API methods.
Actual workspace replacement still retires the reader. Focused comparison repair,
complete corrected-source verification, serial extension/policy and fresh exact
hosted proof remain required. No timeout/assertion is weakened. SQL/export182,
locks, recovery archives, permissions and Accepted decisions remain unchanged.

Focused19498 closes exit0/COMPANY_SOURCES_COMPARISON_REPAIR_EXIT=0: both original
failing journeys pass1.9m total (native tracking1.1m; browser comparison6.1s),
with unchanged assertions and120s limits. Retained log:
test-results/company-sources-comparison-repair.log. Source/tests freeze again for
the complete corrected-source gate; this focused success does not replace it.

## Complete corrected-source verification

The first corrected run93169 loses its handle during the desktop interruption.
Its log (company-sources-corrected-verify.log) ends during shell checks with
`Target page, context or browser has been closed`; there is no terminal marker.
It is interrupted, not successful. An elevated read-only process inventory
confirms no Coredrill verification/build process remains before a fresh run.
The first hidden-runner launch has a quoting parse error and launches no process;
corrected launch22111 starts durable PID77308 with saved result/log receipts.

Durable77308 is now terminal with saved exit0 and
COMPANY_SOURCES_DURABLE_VERIFY_EXIT=0; its launch handle22111 also closes exit0.
Retained complete log: test-results/company-sources-durable-verify.log; exit
receipt: test-results/company-sources-durable-verify.exit. Frozen corrected source
passes full `pnpm verify`:

- Whole formatting,19 boundaries, foundation records,35 type tasks,22 lint tasks
  plus tooling;236 unit files/3375 cases repeated under coverage84.48% statements,
  78.03% branches,85.69% functions and87.12% lines; complete builds/artifacts.
- All7 UI foundation,76 shell,1 diagnostic performance,111 resilience (8.8m),
  7 onboarding and13 document-browser cases. Both repaired comparison journeys,
  normal interaction entry, note lifetime and all company-source browser/native
  cases repeat with unchanged assertions and budgets.
- All34 browser-storage tests, including the20 complete reviewed components;
  all44 shared repository cases execute under original per-test limits. All23
  native storage tests pass with the identical24/44 manifest. Rust core24 pass,
  one secure-store lifecycle case delegated to its separate passing harness.
- Windows Credential Manager store/read/delete with secretExposed:false; native
  archive/recovery/backup checks; schema artifacts, license and secret policy,
  dependency audit and Changesets status. No known npm vulnerabilities; the same
  11 reviewed allowed Cargo warnings remain.

Serial extension79047, final documentation hygiene and authorized coherent
implementation/proof commit/push follow. Fresh exact hosted evidence is still
required. Local Chromium156 and simulated-IPC actual Rust proof do not establish
exact hosted Chrome151/152/Firefox153/154, installed WebView/manual accessibility,
reference hardware, signing or release acceptance. INT-007 remains open for
remaining company outcomes and salary prerequisites; INT-008 Home and later
product/release work remain. No dependency/schema/permission/Accepted change.

Serial79047 closes exit0/COMPANY_SOURCES_EXTENSION_EXIT=0 with all9 extension
cases28.8s, retained in test-results/company-sources-extension.log. All local
suite processes are terminal. Final documentation formatting/policy/secret and
whitespace hygiene precede the authorized implementation/proof checkpoint.

Final60268 closes exit0/COMPANY_SOURCES_FINAL_HYGIENE_EXIT=0: whole formatting,
19 boundary policies, foundation records,831 npm/498 Rust license checks and
secret scan pass. Whitespace checks are clean. The39 known implementation/test/
design/Changeset/proof files form this coherent checkpoint; stash2697 is unchanged.
Only result records follow frozen source/tests before normal authorized commit
and push. Fresh exact hosted proof remains required.
