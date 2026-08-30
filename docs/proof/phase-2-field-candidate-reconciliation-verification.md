# Phase 2 field-candidate reconciliation verification

Date: 2026-08-30

Branch: `main`

Implementation commit: `c614c8242b4e9136d8aae8bf760c6eee3ed7fbd7`

## Outcome

`CAP-005` is proven. Coredrill now has an exported application boundary that revalidates and retains trusted existing and untrusted incoming `FieldCandidateV1` records, compares normalized JSON values canonically, emits bounded unresolved `FieldConflictV1` records for differing values, and produces a deterministic review suggestion without treating that suggestion as confirmation or an entity write.

A single trusted existing user confirmation always remains selected, regardless of an incoming proposal's method, confidence, time, or value. Incoming capture/extraction data carrying an embedded confirmation is rejected. The existing schema-92 repository boundary still prevents generic supersession of a confirmed value and permits replacement only through the explicit transactional operation that confirms the new value and preserves the old history row.

## Trust and validation boundary

`reconcileFieldCandidatesV1` takes existing durable candidates and current incoming proposals as separate inputs. Every candidate is reparsed with the version-1 field-evidence contract before policy evaluation. The boundary then rejects:

- malformed candidate or input shapes;
- more than 512 candidates in one bounded reconciliation request;
- any incoming candidate carrying `userConfirmation`;
- candidate ID reuse across existing and incoming sets;
- more than one active existing confirmation for one field;
- a differing-value conflict whose complete candidate set exceeds the contract's 32-ID limit;
- malformed, reused, or candidate-colliding conflict IDs; and
- a conflict-ID provider that fails.

All failures use content-free application error codes and occur before a persistence command exists. Parsed output is recursively frozen. Candidate ordering is canonical by field and ID, so caller order cannot change the plan.

## Resolution and conflict policy

The reconciler groups candidates by field and compares `value` through canonical JSON serialization. Object key order therefore cannot create a false conflict, while array order and actual JSON value changes remain meaningful. Raw values and provenance remain attached to the separately retained candidates rather than affecting normalized-value equality.

When a group contains exactly one trusted existing confirmation, that candidate is selected with reason `user_confirmed`. Differing incoming values still produce an unresolved conflict and require review; they do not displace the confirmed selection.

Without a confirmation, the policy ranks `user` above `api`/`jsonld`, then `selector`, `readability`, `heuristic`, and `llm`. Equal method tiers use confidence, newer capture time, and finally candidate ID as deterministic tie-breakers. The result is explicitly labeled `policy_suggestion` and requires user review even when every normalized value agrees.

When normalized values differ, one schema-valid unresolved `FieldConflictV1` retains every candidate ID for the field. The reconciler does not manufacture a resolved conflict, discard a losing candidate, mutate a main entity, or convert provenance method into confirmation.

## Property and regression proof

The focused application suite contains nine tests. Deterministic cases cover every source-method tier, confidence/time/ID tie behavior, canonical object equality, confirmed-value precedence, forged incoming confirmation, ambiguous active confirmations, candidate/conflict ID collisions, candidate and conflict bounds, malformed candidates, and failed conflict-ID providers.

Two fast-check properties exercise 100 generated cases each:

- arbitrary bounded unconfirmed candidate sets produce identical output under reversed input order, retain the exact candidate-ID set, and retain every conflicting candidate ID; and
- arbitrary incoming methods, confidences, values, and order never displace a trusted existing confirmation or lose any candidate.

The retained machine-readable result is:

```json
{
  "retainedCandidates": 2,
  "confirmedSelectionPreserved": true,
  "incomingConfirmationRejected": true,
  "unresolvedConflictRetained": true,
  "policySelectionIsSuggestion": true
}
```

The unchanged shared schema-92 repository contract supplies the durable regression half of the proof in both browser and native SQLite. Its `retainFieldCandidates` case attempts `supersedeUnconfirmed` against a confirmed active value, receives `confirmed_field_value_requires_explicit_replacement`, and verifies the failed operation changed nothing. It then calls `replaceConfirmedFieldValue` transactionally and proves the replacement owns its own confirmation while the original row remains linked in the two-record history.

## Local verification

The final focused application invocation passed typecheck, lint, and all nine reconciliation tests with the exact CAP-005 record above. The retained final `pnpm verify` invocation then exited successfully and reproduced:

- formatting, 19 package-boundary policies, and 49 dependency/foundation records;
- typecheck, lint, and build across 22 packages;
- 64 unit files and 567 tests;
- 81.84% statements, 74.62% branches, 81.5% functions, and 84.41% lines;
- all 63 application-shell cases plus UI-foundation, performance, resilience, onboarding, document, and browser-storage suites;
- the schema-92 tracker repository manifest in browser SQLite and the native SQLite adapter;
- 12 native Vitest cases, 11 passing Rust tests plus one intentional secure-store harness exclusion, native secure-store/archive/backup proofs, and generated-contract drift checks;
- 520 npm and 498 Rust license records, workspace secret scanning, zero known npm vulnerabilities, and the existing 15 explicitly allowed Rust maintenance/unsoundness warnings; and
- a valid Changesets release record for `@coredrill/application`.

No dependency or lockfile change was required.

## Hosted clean-commit proof

The exact implementation commit completed [Foundation CI run 33317649195](https://github.com/seabAu/Coredrill/actions/runs/33317649195) successfully. The [aggregate quality job 99273947881](https://github.com/seabAu/Coredrill/actions/runs/33317649195/job/99273947881) emitted the exact CAP-005 record above in both unit and coverage passes, passed 64 test files and 567 tests each time, completed the full 63-case browser shell and recovery suites, found no known npm vulnerabilities, and retained the 15 reviewed Rust warnings.

The hosted adapter matrix independently re-ran the shared schema-92 repository manifest, including its `retainFieldCandidates` confirmed-value guard:

- [Chrome 151 job 99273947914](https://github.com/seabAu/Coredrill/actions/runs/33317649195/job/99273947914) and [Chrome 152 job 99273947748](https://github.com/seabAu/Coredrill/actions/runs/33317649195/job/99273947748) passed browser SQLite/OPFS and the complete app-shell/recovery matrix.
- [Firefox 153 job 99273947924](https://github.com/seabAu/Coredrill/actions/runs/33317649195/job/99273947924) and [Firefox 154 job 99273947919](https://github.com/seabAu/Coredrill/actions/runs/33317649195/job/99273947919) passed the same repository manifest.
- [Windows job 99273947887](https://github.com/seabAu/Coredrill/actions/runs/33317649195/job/99273947887), [macOS job 99273947896](https://github.com/seabAu/Coredrill/actions/runs/33317649195/job/99273947896), and [diagnostic Ubuntu job 99273947860](https://github.com/seabAu/Coredrill/actions/runs/33317649195/job/99273947860) passed the native repository contract, secure-store/backup checks, packaging, and launch proof.

The extension-transfer package lane and full-history secret scan also completed successfully. No feature-specific binary artifact is introduced by this pure application policy; the exact run, job logs, source tests, and cross-adapter repository executions are the retained hosted evidence.

## Reviewed files

- `packages/application/src/field-candidate-reconciliation.ts` — trust separation, validation, canonical equality, ranking, conflict construction, freezing, and content-free failures.
- `packages/application/test/field-candidate-reconciliation.test.ts` — deterministic, property, regression, and machine-readable proof.
- `packages/application/src/index.ts` — public application boundary exports.
- `packages/contracts/src/field-evidence.ts` and its tests — unchanged candidate, confirmation, provenance, and conflict contracts composed by this slice.
- `packages/storage-core/src/tracker-repositories.ts` and `tracker-contract-harness.ts` — unchanged durable candidate history and explicit confirmed-value replacement guard.
- `03-data-model.md` and `04-capture-extraction-sources.md` — implemented storage and capture reconciliation policy.
- `.changeset/retain-field-candidate-conflicts.md` — release/governance record.

## Scope and decisions

This slice adds no database migration, external dependency, connector, crawler, account, hosted service, UI promotion, AI integration, automatic conflict resolution, or automatic entity write. It composes the accepted field-evidence contracts and schema-92 candidate-history enforcement without changing an accepted decision, so no ADR is required.

`XTR-001` is the next smallest unblocked slice: implement the connector policy registry and runtime kill switch before any network connector. `GATE-1`, the representative participant study, and `FND-001` remain independently open on their recorded external owners; none is reinterpreted as complete here.
