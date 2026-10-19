# Pipeline presentation capabilities

Date: 2026-10-19. Checklist context: `Q3-005`, prerequisite only.

## Scope

The Board represents a null-status job as explicit Unassigned metadata with no
semantic category. Invalid metadata fails closed; Unassigned is not a move
destination. Move/open/undo controls reflect callback availability. Table edit,
configuration, selection and open controls independently reflect their handlers.
An open Table draft survives temporary loss of editing capability and a failed
save. Multiple view instances have distinct landmark and stage-heading labels.

No schema, dependency, permission, or Accepted decision changes. The Changeset
covers UI and web package behavior. SQLite remains canonical storage.

## Executable evidence

- `packages/ui/test/pipeline-board.test.tsx` and
  `packages/ui/test/pipeline-table.test.tsx`: 14 tests passed before final cursor
  refinement. New assertions initially failed against the former implementation.
- `pnpm typecheck`: all 33 tasks passed during iteration.
- `e2e/pipeline-presentation.spec.mjs`: explicit synthetic presentation catalog,
  handler-backed keyboard request, disabled actions, rejected Unassigned and
  unknown-job drops, draft retention across handler removal/restoration and
  failed save, 320-pixel forced-colors/reduced-motion reflow, zero axe violations,
  no storage runtime and zero external requests.
- The final-source UI-foundations run passed all six tests, including browser
  assertions for default cursor and native touch scrolling when drag is
  unavailable.
- Visually inspected `pipeline-readonly-board-320.png` and
  `pipeline-readonly-table-320.png` in the ignored UI-foundations results. Text
  and controls remain within the page; Board/Table use their local scroll areas.

During browser iteration, duplicate landmark/heading labels were repaired with
namespaced IDs and view labels rather than suppressing axe. A disappearing draft
was repaired by retaining the active editor while disabling save and inputs.
The disabled option is verified through its native `disabled` property and
adversarial drop guards, not an ambiguous option-enabled matcher.

## Limits

The catalog is explicitly synthetic. Its callback records a request only; it
does not claim to persist or move a job. This proof does not establish production
Board/Table navigation, native UI runtime selection, or the unseeded canonical
journey. Those remain required under `Q3-005`; no milestone gate closes here.

## Final gate

Final-source `pnpm verify` exited 0: formatting, boundaries, foundation records,
33 typecheck tasks, 22 lint tasks, 130 unit files / 1,040 tests, coverage, builds,
contrast/extraction/extension checks, six UI-foundations tests, 76 application
shell tests, diagnostic performance, nine resilience tests, seven onboarding
tests, 13 document-browser tests, nine browser-storage tests, native Rust and
13 native-adapter tests, secure-store/archive/backup proofs, schemas, licenses,
secrets, dependency audits and Changesets status. Rust reports 11 passing unit
tests plus one intentionally ignored platform-secret test; the separate
Windows secure-store proof passes. npm reports no known vulnerabilities; Cargo
retains ten allowed warnings. No policy checks were weakened.

The first gate stopped at strict lint findings for redundant optional chaining
after capability narrowing. Those expressions were corrected and the full gate
was rerun successfully. Clean-commit hosted verification remains pending.
