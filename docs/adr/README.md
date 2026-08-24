# Architecture decision records

ADRs record material choices and preserve why they changed. The [design decision register](../design/coredrill-design-kit/11-decision-register.md) remains the authority for Accepted, Provisional, Deferred, Rejected, and Superseded design choices.

## Process

1. Copy [`0000-template.md`](0000-template.md) to the next permanent number.
2. Add observed evidence, constraints, alternatives, impact, proof, and revisit trigger.
3. Use `Proposed` until the product owner accepts the change.
4. When an ADR changes an Accepted decision, update the decision register, affected design documents, contracts/tests, and living checklist in the same change.
5. Never delete or renumber an ADR; mark it Superseded and link its replacement.

## Index

| ADR                                                         | Status   | Decision/register coverage                                                              |
| ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| [0000](0000-template.md)                                    | Template | Required ADR fields                                                                     |
| [0001](0001-adopt-design-baseline.md)                       | Accepted | Repository adoption of every decision marked Accepted on 2026-08-21                     |
| [0002](0002-adopt-coredrill-identity-and-apache-license.md) | Accepted | `D-054`, `D-055`, the license portion of `Q-013`, and working-name selection in `Q-001` |
| [0003](0003-adopt-browser-storage-support-floor.md)         | Accepted | `D-025`, resolved `Q-002`, and `STG-004` through `STG-008`; exact hosted lanes passed   |
| [0004](0004-adopt-tauri-rusqlite-native-boundary.md)        | Accepted | `D-022`, `D-024`, resolved `Q-003`, and `NAT-001` through `NAT-008`                     |
| [0005](0005-adopt-wxt-multisurface-extension-baseline.md)   | Proposed | `D-023`, `Q-005`, and `EXT-001` through `EXT-008`; hosted package proof pending         |

Provisional decisions `D-010`, `D-012`, `D-015`, `D-023`, and `D-027` retain their named Phase 0/usability gates. ADR-0003 promotes D-025 after exact hosted browser lanes passed and resolves Q-002 with an explicit unsupported-platform fallback. ADR-0004 accepts the Tauri 2 plus narrow `rusqlite` native boundary, resolves Q-003, and retains the local browser app plus portable export as the Linux fallback while native GTK3 risk remains unresolved. ADR-0005 proposes the exact WXT multi-surface and package baseline; it remains Proposed until the clean-commit hosted package/rebuild lane and immutable artifact review pass. Deferred `D-052` does not authorize a sync service or account dependency.
