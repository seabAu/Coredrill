# Phase 3 canonical journey verification

Date: 2026-10-19
Checklist item: `Q3-005`
Status: partial integration locally and hosted verified; complete production creation remains

## Integration finding and implementation

Inspection found that the demonstration Requirements interactions updated React
state while deterministic document generation read SQLite evidence selections.
The earlier component and repository proofs did not establish continuity
between those surfaces. Q3-005 remains open until that continuity is proven.

Canonical stored-job UUID routes now load the job, requirements, evidence
retrieval and coverage, and latest active application from the same SQLite
vault. The browser composition delegates category correction, selection/removal,
coverage decisions/reset, and coverage comparison to existing validated
application operations. The UI refreshes from storage after success. Generation
and Mark Applied reuse the existing immutable-version and retained-artifact
boundaries. No schema, dependency, permission, contract version, or Accepted
decision changes.

## Synthetic continuous journey

`e2e/phase-3-canonical-journey.spec.mjs` runs in the production-build resilience
suite. Initial job, requirement, document, and application scaffolding comes
from the existing synthetic reference fixture; the test does not claim that
scaffolding was authored or discovered during the journey.

After installation, the browser is set offline before resume import and remains
offline through review, comparison, generation, export, Mark Applied, later
revision, and reload. Non-local page requests are actively rejected and counted.
The journey:

1. Imports the checked-in synthetic DOCX as pending proposals with retained
   source hashes/excerpts/pointers and no verification promotion.
2. Deliberately records the reviewed role in the manual Career Profile editor
   with exact dates and the reviewed resume sentence, then merges the imported
   duplicate into that confirmed role. The ambiguous imported year range cannot
   replace the confirmed dates or increment the target row version.
3. Opens the actual stored job UUID, removes the seeded evidence selection,
   explicitly selects the reviewed role, records Partial coverage, and reloads.
   SQLite must retain exactly that evidence identity and reviewed decision.
4. Rejects a stale coverage write and compares coverage without replacing the
   saved decision.
5. Creates an AI-disabled cover-letter version containing the reviewed sentence
   and excluding the removed fixture evidence sentence. The exact evidence ID
   is visible in the generation result.
6. Explicitly selects the resume, generated letter, and answer versions, exports
   the generated letter as DOCX, and checks the retained artifact's full SHA-256,
   filename, byte length, and format against the downloaded bytes.
7. Explicitly confirms the exact file/text set through Mark Applied and retains
   its immutable snapshot. A later current letter version cannot replace it.
8. Reloads offline, compares the complete submitted snapshot and confirmed-role
   identity with the prior state, checks the selected evidence, and verifies
   narrow-screen reflow and automated accessibility.

The test attaches the synthetic import/context/version/artifact/snapshot
witness, axe output, ARIA tree, and a 320-pixel screenshot, and emits
`Q3_005_E2E_PROOF` with the evidence, version, export hash, and snapshot IDs.

## Verification checkpoint

The production-build offline journey passed locally with zero external
requests, exact artifact hash continuity, immutable snapshot reload, unchanged
confirmed role, zero axe violations, 320-pixel reflow, stale-write rejection,
and a read-only coverage comparison. The complete `pnpm verify` gate passed
against the reviewed patched graph, including 120 unit files / 909 tests,
coverage thresholds, all 76 application-shell journeys, four resilience
journeys, document/browser/native/recovery suites, static/build/policy, license,
secret, dependency audit, generated schema/report, and Changesets checks. See
the [security maintenance report](dependency-security-maintenance-2026-10-19.md)
for the six dependency fixes required by that final gate.

The final preceding security-closure commit `a58b57f` passed
[Foundation CI 36732872523](https://github.com/seabAu/Coredrill/actions/runs/36732872523).
That run is baseline evidence, not verification of the new changes.

The durable comparison connection, scaffolded offline journey, and patched
dependency graph subsequently passed every required job at exact commit
`752a1689a7bbb5293a0e15ce512cc782f5b51aa5` in
[Foundation CI 39223465958](https://github.com/seabAu/Coredrill/actions/runs/39223465958).
The extension success-fixture timestamp needed a calendar-independent repair;
see its [regression proof](extension-clock-regression-verification.md).

## Remaining boundaries

This synthetic test does not replace representative human research under
`Q3-002`, the manual/reference-device accessibility and performance matrix, or
release/deployment evidence. The earlier `DOC-008` browser/native recovery
proof remains the authority for portable archive restoration and physical
attachment recovery. `GATE-3` remains open.

The test currently seeds the starting application and document lineage. Code
inspection initially found no production document/application-set creation entry
point that replaces this fixture setup. A subsequent
[manual reusable-document creation slice](manual-document-creation-verification.md)
adds normal-user base resume/cover-letter creation, and a further
[application-attempt slice](application-attempt-creation-verification.md) proves
manual capture/review through local preparation without seeded jobs or attempts.
Job-derivative/document-set creation and stored-requirement authoring/parsing
composition remain. The durable comparison connection is an
implemented integration step, but Q3-005 must remain open until that creation
workflow is implemented and the journey proves it from actual vault records.
Do not use the scaffolded test as proof that a new user can complete the whole
Phase 3 workflow.

The same inspection also distinguishes demonstration shell interactions from
the already proven Phase 1 repository/application commands. Board/Table and
other normal-user paths require a composition audit before a product-readiness
claim. Earlier narrowly scoped proofs remain valid for their stated surfaces;
their aggregate checklist count is not a measure of usable product completion.
