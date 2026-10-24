# Contact source evidence and field-use eligibility prerequisite audit

Date: 2026-10-24

Checklist scope: INT-007, still unchecked. This is an executed local audit, not
implemented source-backed contact UI or completed eligibility enforcement.

## Starting state and authority

Implementation and origin/main match exact
`16486f6020cad119034a65fb43fa9bb3b9a10e19`; its normal-entry local and hosted
verification is closed under [the separate receipt](normal-interaction-entry-verification.md#exact-hosted-closure-and-normal-entry-requirement-disposition).
The only starting changes are its two post-push result documents, preserved.
The preceding goal turn is progress, not a wait or a no-progress turn.

The existing AGENTS/SECURITY, GOAL, D-002/020/024/026/030/033/034, Accepted
ADR-0001/0003/0004 and INT-007 constraints remain authoritative. The complete
source-design document04 was read for this follow-through, alongside current
contact/application/storage/source-policy and UI surfaces. No dependency,
connector, policy review, Accepted decision, permission or schema is changed.
Serena's TypeScript server fails initialization; standard file/text inspection
is used without changing its configuration. The prior external-memory privacy
refusal is preserved, not retried or bypassed.

## Findings that determine the next boundary

| Requirement                        | Current evidence                                                                                                                                                                                             | Disposition                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact field-to-source relationship | `contact_point_provenance` retains field, exact value SHA-256 and provenance ID; provenance links to snapshot then job source.                                                                               | Available stored facts, not yet a normal selected-contact read projection.                                                                                                                                   |
| Current-value binding              | An actual SQLite edit of a contact method leaves the historical provenance link intact but makes its stored value hash differ from the current method.                                                       | Recompute against a copied current value; do not classify by link existence alone.                                                                                                                           |
| Explicit manual basis              | Normal creation stores immutable exact initial hashes in `contact_manual_creation`; normal details call `resolveManualFields`.                                                                               | Keep existing manual proof separate. A confirmation bit is not a manual receipt.                                                                                                                             |
| Public or licensed field use       | `provenance.license_note` is nullable free text. The schema accepts an instruction-shaped public/license assertion as a note.                                                                                | It is untrusted source metadata, not a permission decision or structured public/license evidence.                                                                                                            |
| Actual reviewed source scope       | Checked-in executable records are Greenhouse job detail, Lever job detail and USAJOBS Public search. USAJOBS mapping explicitly excludes contact fields; prohibited source records remain disabled.          | These job policies must not be reused as authorization for contact extraction or contact enrichment. No contact acquisition is enabled by this audit.                                                        |
| Source independence                | Current snapshots have a required foreign key to `job_source`, which itself requires a job.                                                                                                                  | An employer team page or local contact source cannot be made independent by inventing a hidden job or rebranding a job source. Review an additive source representation before such acquisition/persistence. |
| Bounded normal inspection          | The minimized directory deliberately excludes methods/provenance. `StoredContactDetails` currently withholds non-manual populated fields and explicitly says source-backed provenance remains separate work. | Add selected, versioned evidence reads; do not preload a vault or substitute catalog origin labels.                                                                                                          |
| Complete product outcome           | Source qualification/provenance, company relationship projections and normal Home remain required.                                                                                                           | Full INT-007, INT-008 and the overall goal remain unfinished.                                                                                                                                                |

The generic APP-004 source-backed creation command validates populated-field
provenance coverage and exact hash links through an injected local port. Its
mocked command proof does not establish a concrete normal acquisition path,
public/license eligibility, a selected-vault transaction or a source review.
Normal manual creation intentionally rejects `origin: source_backed`. Neither
existing command should be silently widened to bypass these missing controls.

## Executed current-state evidence

Pinned Node24.19.0 / pnpm11.22.0, unchanged lockfiles. The first focused command
fails PowerShell parsing before starting tests because an in-memory command
prefix did not survive the turn boundary. Reconstructing the explicit pinned
prefix corrects invocation only; no source/test/config changes are made.

```text
pnpm exec vitest run packages/application/test/company-contact.test.ts packages/application/test/contact-workspace.test.ts packages/source-policy/test/connector-policy.test.ts packages/storage-core/test/contact-manual-creation-integrity.test.ts
Test Files  4 passed (4)
Tests       138 passed (138)
Duration    2.05s
```

This rechecks existing command/manual evidence/exclusion policies; it is not
new normal source-backed browser/native proof. The connector test reports three
reviewed production network records, denies unknown/prohibited sources and
preserves manual capture independently of kill switches.

An isolated `node:sqlite` in-memory diagnostic executes every current SQL
migration with foreign keys enabled and trusted schema disabled. It creates
only synthetic vault/job/contact/source/snapshot/provenance/link records using
UUIDv7 IDs, `.example` URLs and synthetic contact strings. The exact selected
join is:

```sql
SELECT c.email, l.value_hash, p.license_note,
       CAST(p.source_excerpt AS BLOB) AS excerpt,
       s.id AS snapshot_id, js.job_id
FROM contact c
JOIN contact_point_provenance l ON l.contact_id = c.id
JOIN provenance p ON p.id = l.provenance_id
JOIN source_snapshot s ON s.id = p.source_snapshot_id
JOIN job_source js ON js.id = s.job_source_id
WHERE c.id = ?;
```

Assertions independently hash the initial method, decode the BLOB excerpt as
UTF-8 including leading BOM and inert markup, and compare `total_changes()`
before/after the selected read. A synthetic later method edit then invalidates
the exact hash match while retaining the historical link. The diagnostic also
checks the absent manual receipt and actual snapshot foreign-key metadata.
The connection is closed in `finally`; no user vault or repository fixture is
opened or altered. Retained local output is
`test-results/contact-source-shape-audit.log`:

```json
{
  "migrations": 165,
  "actualSqliteChainJoined": true,
  "literalExcerptExactViaBlob": true,
  "selectedReadUnchanged": true,
  "freeTextLicenseAssertionStoredNotAuthorized": true,
  "confirmationDidNotCreateManualReceipt": true,
  "changedCurrentValueNoLongerMatchesLink": true,
  "snapshotRequiresJobSource": true,
  "publicOrLicensedEligibilityEstablished": false,
  "networkRequests": 0,
  "canonicalProductFilesChanged": false
}
```

The diagnostic is schema/fact evidence only. In particular, the accepted note
does not prove legal permission, and this Node run is not browser/native parity,
performance, migration/recovery or field-use completion proof.

## Next bounded implementation and required proof

1. Add a minimized, strict version-1 selected-contact field-evidence query and
   concrete SQLite read port. Bind the original sole viewed vault, contact,
   archive visibility, expected current row version and selected supported
   field. Copy before awaited hashing; query/verify in one transaction. Return
   bounded, explicitly live keyset pages with validated continuation anchors,
   exact historical value hashes and current-value match state. Preserve source
   IDs, method, extractor/version, capture time, literal excerpt/pointer,
   confidence and license note as evidence, never as public/license labels.
   Keep full snapshot bodies out of this projection and use explicit incomplete
   states rather than silent truncation or false absence.
2. Prove malformed/foreign/stale scope, changed/null current values, multiple
   historical links, missing/corrupt chains, tied pages/changed anchors,
   malicious notes/URLs/excerpts, immutable copies, content-free failures and
   read-only behavior in application tests and shared actual SQLite cases.
   Require actual Node/browser/native parity before closing this prerequisite.
3. Separately define durable exact-value public/licensed eligibility evidence,
   source-policy purpose/review/expiry/deletion semantics and normal explicit
   review controls before displaying or importing a method on that basis.
   An arbitrary URL, company domain, license note, confidence or user-confirmed
   bit cannot substitute. No new provider or official-page network acquisition
   is authorized implicitly. Any genuine Accepted-decision change requires an
   owner-accepted ADR; no such change is currently proposed.
4. Compose normal owned evidence/eligibility UI with unavailable/loading/empty/
   error/retry and late/cross-vault/navigation/reflow/accessibility/offline/
   reload proof. Run the complete final-source gate, serial extension/policy
   checks and exact committed hosted verification before claiming that slice.

The query is a necessary prerequisite, not a replacement or completion of
source-backed field eligibility. Company relationship projections, INT-008 Home,
document AI and subsequent checklist milestones remain in the full objective.
No owner decision currently prevents this read-only prerequisite. No checklist
checkbox is changed, no network/hosted run is started for this documentation-only
audit, and all three local result/audit documents carry into the next verified
implementation checkpoint.

## Selected field-evidence implementation activated

The audit now activates the first boundary above: strict selected field-evidence
application contract, actual SQLite read port and shared adapter proof. Public/
licensed qualification and UI remain required follow-through, not inferred from
this projection. Preserve all starting receipts, exact source history and stash.
No new schema/dependency/permission/connector or Accepted decision change is
planned. Tests must first expose the missing query, then prove owned pagination,
literal evidence and exact hash matching; complete verification is required
before a verified commit, not claimed by this activation.

## Implemented prerequisite and focused actual-runtime evidence

The version-1 application query and actual SQLite port are now implemented
locally and exported from application/storage-core. They return1–25 evidence
items (default20), no contact method values or source bodies, no total and no
canonical write. A sole viewed vault, selected contact/current version, supported
field and explicit contact archive scope own the read. Live creation-descending/
UUID-ascending continuation additionally binds link/provenance/snapshot/current
source identities and versions. Missing or changed anchors cannot silently
rebase. Historical links remain visible with an independently computed current
value match, including historical evidence for a currently absent method.

Original literal pointer/excerpt/license note use bounded BLOB byte reads and
complete fatal UTF-8 decoding with BOM preservation. SQL NULL and empty BLOB are
distinguished by independent byte-length columns, including adapters that return
null for a zero-length BLOB. Oversized/invalid UTF-8 or dangling chains fail
closed, including a corrupt look-ahead row. The same transaction rechecks the
sole vault, selected version/archive/current value after awaited hashing. Source
URL/connector fields are labeled current stored metadata, not historical rights.
`publicOrLicensedEligibility: not_established` explicitly leaves qualification
outside this projection; the independent manual-creation receipt is unchanged.

The shared adapter inventory advances from v17/36 to v18/37. This is the
executable repository test inventory, not a migration or durable schema version:
SQLite remains165 and the seven published JSON Schemas are unchanged. Browser,
native and Firefox assertions explicitly pin18/37, preserving all prior cases.
No normal UI/API composition, contact creation/import, rights classification,
acquisition, enrichment, sending or permissions are added.

Focused failure lineage is retained honestly:

- Initial new query suite fails collection because the module is absent; zero
  cases execute. After implementation,26 focused cases pass.
- Initial package typecheck finds unbranded IDs/timestamps and an unparsed cursor
  in the new tests; branded constructors and the cursor parser correct those
  fixtures. Storage typecheck finds missing contextual typing on the frozen
  port; explicit interface typing corrects it without weakening a check.
- Initial strict lint identifies redundant typed conditions/assertions and
  async-without-await test callbacks. These are corrected without suppression.
  Directly linting an application test is unsupported by the existing project
  service; package lint intentionally covers source, while test TypeScript checks
  remain required. No lint configuration is changed.
- Renaming the result to explicitly public/licensed eligibility exposes an old
  compiled application export in a focused SQL run:64 tests pass, one shared
  case fails. Inspection of `application/dist/contact-field-evidence.js` confirms
  the old property. Rebuilding the selected five-package dependency graph fixes
  the invocation state; the original continuation assertion remains unchanged.

Current focused actual-runtime results:

| Check                                                                   | Result and scope                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New application suite                                                   | 46 cases pass after additional supported-field/method, malformed/unknown/oversized, nullable, copied capability, paging, stable-error and redaction cases.                                                                                                                                                                                                                       |
| Selected rebuilt application + actual Node SQLite + execution inventory | 65 cases/3 files pass before the later20 application cases; the shared v18/37 case includes exact/tied pages, foreign vault, stale contact, changed anchor/current method, archive visibility, empty/absent/BOM/NUL/markup literals, original scope mutation during hashing, corrupt look-ahead/final-owner fault detection and unchanged canonical snapshots with DML disabled. |
| Workspace type graph                                                    | 35/35 tasks pass (73909 consumed exit0), before the last20 application-only cases; fresh complete verification still required.                                                                                                                                                                                                                                                   |
| Strict new source/harness lint                                          | All three new production/shared-harness files pass, no suppressions.                                                                                                                                                                                                                                                                                                             |
| Actual browser SQLite/OPFS                                              | 28948 consumed exit0: explicit v18/37 shared manifest1 test passes20.5s, actual case13.0s.                                                                                                                                                                                                                                                                                       |
| Actual native SQLite                                                    | 65406 consumed exit0:21 native cases pass20.72s; Rust24 pass plus one intentionally ignored OS-secret lifecycle case, not claimed executed here.                                                                                                                                                                                                                                 |

The two actual adapter runs include the expanded null/empty/owner/corrupt-row
contract. Only application test additions and result/design documents follow
those runtime runs. Complete final-source verification, serial extension/policy,
reviewed commit and its new exact hosted run remain required. Prior16486f6 CI is
not proof for these new sources. Full INT-007/INT-008/goal and independent Tokio
Unix/manual/reference-hardware/release gates remain open.

## Complete final-source gate activated

Session34412 is the original complete `pnpm verify` followed only on success by
the separate serial extension suite. Logs:
`test-results/contact-field-evidence-full-verify.log` and
`test-results/contact-field-evidence-extension.log`. Require terminal
`CONTACT_FIELD_EVIDENCE_FULL_VERIFY_EXIT=0` and
`CONTACT_FIELD_EVIDENCE_EXTENSION_EXIT=0`, not an observation timeout or partial
suite output. Do not restart or run overlapping browser/native/extension suites.
Product/query/shared-harness/tests/helpers/locks are frozen; only result records
may follow. Failed checks remain evidence and require a fresh final-source gate
after a genuine correction. Ordinary reviewed commit/new exact hosted proof
remain after full local/extension/final policy proof. No full INT-007/INT-008 or
goal completion is claimed.

## Complete local and serial extension verification passed

Original34412 consumes exit0 with both required terminal markers0 in the retained
full/extension logs. No product/query/port/test/shared-harness/helper or lock
changes follow the source freeze. Final-source results:

- 213 unit files/2,713 tests pass, repeated under coverage;35 typegraph and22
  lint/build tasks pass. All existing coverage thresholds remain unchanged.
- UI7 (13.8s), shell76 (2.5m), diagnostic performance1 (16.7s), resilience71
  (5.3m), onboarding7 (13.1s), document13 (14.1s), browser storage13 (54.3s) and
  actual Windows native21 pass. The browser/native gates execute shared v18/37.
- Rust24 pass and one intentionally ignored OS-secret case; the separate actual
  Windows Credential Manager proof then stores/retrieves inside Rust/deletes with
  secretExposed:false. Archive/backup, schema, extraction, boundary, records,
  license, secret, advisory and Changesets checks pass. All seven generated JSON
  Schemas still match. npm reports no known vulnerabilities; Cargo retains the
  same11 informational warnings and required Tokio Unix caller/patch review
  before public Unix acceptance, with no waiver or exclusion added.
- The separate serial extension9 cases pass27.5s, including the Firefox manual
  fallback at durable schema165. This is not a new production-origin/store or
  permissions acceptance claim.

Both lock hashes retain
`fc115519a541e3fa6b9dbc9f56bc31579413c080ab6591b7e8010cfe58d2142d` and
`8426c712842427fc31455183cb7afa902431220bca4276a52af66cb369d9d41a`.
All ten preserved recovery files match their HEAD Git objects. Stash
`2697ebcec53351a052d8c5c19e2b8e2a52056a70` is unchanged, refreshed main has zero
divergence from origin/main16486f6, and diff whitespace is clean. Final result
format/policy, exact reviewed staging/commit/push and new hosted verification
remain. The two prior CI receipt documents are included rather than discarded.
No new normal UI, public/license eligibility, independent source acquisition,
full INT-007/INT-008 or goal/release completion is claimed.

## Reviewed local checkpoint ready for ordinary commit

Final policy96518 consumes exit0 with terminal
`CONTACT_FIELD_EVIDENCE_FINAL_POLICY_EXIT=0`; complete workspace formatting19060
also consumes exit0. All19 boundaries,52 dependency/3 toolchain/16 target/10
accessibility records,831 npm packages/23 roots/498 crates and secret checks pass.
Whitespace, preserved stash and refreshed no-divergence16486f6 refs are checked.
Only reviewed source/tests/shared inventory/Changeset/design/proof paths enter
staging, including both prior post-push receipt documents. No product or test
change follows the complete gate. Ordinary commit/push and exact new hosted
verification remain; neither scoped hosted closure nor full INT-007 completion
is claimed yet.
