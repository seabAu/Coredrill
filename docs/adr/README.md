# Architecture decision records

ADRs record material choices and preserve why they changed. The [design decision register](../design/job-workspace-design-kit/11-decision-register.md) remains the authority for Accepted, Provisional, Deferred, Rejected, and Superseded design choices.

## Process

1. Copy [`0000-template.md`](0000-template.md) to the next permanent number.
2. Add observed evidence, constraints, alternatives, impact, proof, and revisit trigger.
3. Use `Proposed` until the product owner accepts the change.
4. When an ADR changes an Accepted decision, update the decision register, affected design documents, contracts/tests, and living checklist in the same change.
5. Never delete or renumber an ADR; mark it Superseded and link its replacement.

## Index

| ADR                                   | Status   | Decision/register coverage                                          |
| ------------------------------------- | -------- | ------------------------------------------------------------------- |
| [0000](0000-template.md)              | Template | Required ADR fields                                                 |
| [0001](0001-adopt-design-baseline.md) | Accepted | Repository adoption of every decision marked Accepted on 2026-08-21 |

Provisional decisions `D-010`, `D-012`, `D-015`, `D-022`, `D-023`, `D-025`, and `D-027` retain their named Phase 0/usability gates. Deferred `D-052` does not authorize a sync service or account dependency.
