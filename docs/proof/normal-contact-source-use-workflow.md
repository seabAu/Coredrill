# Normal contact source-use workflow

Date: 2026-10-25. Status: implemented; complete final-source verification passes.
Serial extension proof also passes; the new exact hosted checkpoint remains pending.
INT-007, company relationships and Home remain open.

## Implemented behavior

Each populated normal contact field has a deliberate source-use review entry.
The AppShell owns its private draft across navigation and reflow. The workflow
separates source retention, reviewed permission and exact-field/purpose review;
source retention or a URL/license note alone never grants a field-use basis.
All canonical source/terms/permission selections and latest-review inspection
come from strict scoped SQLite queries, including bounded metadata pagination
and reload/resumption. No typed internal IDs or input-memory bodies substitute
for stored authority.

The user selects whole-character literal excerpts from retained text. Application
helpers derive exact UTF-8 spans and the copied original field hash, preserving
BOM/NUL/Unicode and rejecting split characters or oversized excerpts. Dates use
the accepted lazy local-time resolver: nonexistent times reject and overlaps
require an occurrence, reset when the clock/zone changes. A preview freezes the
original action before explicit confirmation; the first operation context is
captured on submission. No contact value is changed, no source fetched and no
message sent.

The controller preserves single-flight original intent, vault mutation exclusion,
pending/foreign ownership and observational uncertainty recovery. Lost
acknowledgements do not trigger writes again. Explicit retry uses the original
IDs/input/context only after observing absence/original state. Source and
permission records can be selected again after reload. One-way review revocation,
explicit renewal and permission disable preserve evidence and never revive an
older review. Disabling a shared permission warns that dependent bases on other
contacts are withheld. Independent manual-entry basis remains separate.

Retired/foreign views hide private bodies; failed reads retain exact requests and
withhold unconfirmed selections. Focus is captured before async work and restored
only while still owned. Restore disables the pre-restore workflow and hides its
private content; deliberate reopen warns about the session draft and starts clean.
Metadata pages are invalidated after acknowledged/observed writes so old empty
pages are not presented as current facts. No schema, dependency, permission,
source-acquisition or Accepted decision changes.

## Actual focused proof and retained failures

- Initial actual offline browser76144 consumes exit0/BROWSER marker0: full normal
  UI source/permission/field writes, literal retention, reload/resumption,
  revocation, explicit renewal and shared-policy disable pass in10.7s.
- The identical normal form journey through real Rust SQLite and simulated Tauri
  IPC passes on45656, exit0/NATIVE marker0,11.2s (23.7s with setup). The native
  host proves no OPFS/persistence/service-worker/worker fallback or external
  requests. This is not packaged WebView proof; later final-source gate repeats it.
- Expanded29999 passes employer-page, public-dataset, licensed-material and DST
  journeys but the lifetime test initially fails on an ambiguous plural alert
  locator. Whole-workflow privacy assertion is stronger and removes ambiguity.
  Repeat93822 then catches a test race choosing a row before the first page had
  replaced the previous page. Explicitly await10 refreshed entries before choosing;
  do not change a product guard or the30s case budget. Corrected62698 consumes
  exit0/LIFETIME_FINAL marker0 in2.7s.
- Expanded49214 consumes exit0/BROWSER_FINAL marker0: all6 cases pass in35.8s
  including setup. Besides all three source classes and full lifecycle, the actual
  normal UI preserves a held post-commit draft across another contact, hides its
  private DOM, reconciles a lost acknowledgement without another submission,
  retries the exact metadata continuation after a private failure, suppresses a
  late foreign literal read until deliberate same-request retry, and preserves
  the exact SQLite hash for observation-only reads. Restore/reopen retirement,
  DST gaps/fresh overlap choices,320px reflow, literal script inertness and axe
  pass. All external requests and page errors are zero. Twelve bulk sources in
  the paging case are disclosed runtime prerequisites; the held source and all
  source/permission/field/lifecycle writes in the primary journey use normal UI.
- Initial typecheck identifies a nullable-flow guard and is corrected before
  browser execution. Strict lint identifies void handlers/optional booleans,
  corrected without suppressions.56351 passes types then stops at one remaining
  Details handler brace; units do not run there. Corrected81090 consumes exit0
  with FINAL2_TYPES_LINT_UNIT marker0:35 type tasks,22 lint tasks plus tooling,
  227 files/3173 unit cases. New pure preparation cases verify byte spans,
  split-character rejection and copying the original field before an await.

These results precede the final metadata-page invalidation adjustment. The full
checkpoint gate must verify the exact final source, all regressions, coverage,
builds, policy/license/secret/audit artifacts and serial extension proof before
commit/push. A fresh exact hosted run is then required. The independently
[closed601a687 hosted checkpoint](checkpoint-ef35114-hosted-verification.md#exact-follow-up-hosted-closure)
contains earlier storage/runtime/read-display behavior and does not prove these
new forms. Keep all pending receipts with this verified implementation change.

## Final-source verification

The final audit found that the stored-contact DTO parser normalized a legacy
profile URL even though qualification hashes its literal SQLite value. Stored
reads now validate the URL while preserving that literal; explicit manual
creation still normalizes. The direct parser and actual SQLite qualification
regressions pass93 cases after rebuilding the changed application package.
The first targeted run used stale package output and failed the literal
comparison; its failure is retained rather than counted as final-source proof.

Browser26057 consumes terminal exit0 and
`CONTACT_USE_PROFILE_FORMS_BROWSER_EXIT=0`: all7 normal offline form cases pass
in48.1s, including `HTTPS://SYNTHETIC.EXAMPLE:443/Profile?q=%7e#Tail` through
qualification, display and reload. Source bodies, hashes and stored values stay
literal. The same-source native normal journey is repeated in the full gate.

Initial full gate66653 stops at the new regression test's unbranded IDs and
unknown storage result. The test now uses validated IDs and parses the returned
workspace through its actual application contract; no assertion is removed.
Corrected74510 consumes terminal exit0 and
`CONTACT_USE_NORMAL_FORMS_FULL_VERIFY_FINAL_EXIT=0`.
`test-results/contact-use-normal-forms-full-verify-final.log` records:

- Whole formatting,19 architecture boundaries and foundation records pass.
- All35 type tasks and22 lint tasks plus tooling pass.
- All227 unit files/3175 cases pass, repeated under coverage:84.06% statements,
  77.57% branches,85.39% functions and86.65% lines.
- All builds and extraction/contrast/extension package artifacts pass.
- Browser suites pass7 UI foundations,76 shell,1 diagnostic performance,
  96 resilience,7 onboarding,13 documents and15 storage cases.
- The resilience suite repeats all7 normal form cases and the identical normal
  form journey through real Rust SQLite (14.0s), with no OPFS fallback.
- Rust core reports24 passed/1 existing ignored; all23 Windows native adapter
  cases pass. Credential Manager proves store/read/delete without exposing a
  secret. Native archive/backup recovery and all7 generated schema checks pass.
- License/secret checks, npm audit and Cargo audit, and Changesets pass.
  Cargo retains11 existing allowed warnings; this is not their resolution.

The runtime/feature/test source is fixed throughout the successful gate.
Subsequent edits record these proof results only. No schema, lockfile, preserved
recovery fixture, permission or Accepted decision changes. The previous stash
is retained. Full INT-007, company relationships, Home and independent release
gates remain open. Exact hosted results must identify the new commit and cannot
be inferred from the earlier601a687 run.

Serial extension29959 consumes terminal exit0 and
`CONTACT_USE_NORMAL_FORMS_EXTENSION_EXIT=0`: all9 transfer/Firefox manual-fallback
cases pass in37.9s after the full gate, including failed storage preservation,
checksum rejection and idempotent durable import. Log:
`test-results/contact-use-normal-forms-extension.log`.

Final proof formatting and policy31168 consume terminal exit0 and
`CONTACT_USE_NORMAL_FORMS_FINAL_POLICY_EXIT=0`:19 boundaries, foundation records,
831 npm/498 Rust license records and tracked/unignored secret scan pass.
Staged whitespace checks pass. The reviewed checkpoint contains28 files and
includes the pending601a687 hosted closure receipt; the unchanged stash and
preserved SQL/fixtures/lockfiles remain outside the change.
