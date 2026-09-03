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
| [0005](0005-adopt-wxt-multisurface-extension-baseline.md)   | Accepted | `D-023`, resolved `Q-005`, and `EXT-001` through `EXT-008`; exact packages reproduced   |
| [0006](0006-adopt-tiptap-local-document-baseline.md)        | Accepted | `D-027`, resolved `Q-004`, and `EDT-001` through `EDT-006`; local import/export proven  |
| [0007](0007-patch-tiptap-prototype-manipulation.md)         | Accepted | Security patch to the exact Tiptap baseline in `D-027` and resolved `Q-004`             |

Provisional decisions `D-010`, `D-012`, and `D-015` retain their named Phase 0/usability gates. ADR-0003 promotes D-025 after exact hosted browser lanes passed and resolves Q-002 with an explicit unsupported-platform fallback. ADR-0004 accepts the Tauri 2 plus narrow `rusqlite` native boundary, resolves Q-003, and retains the local browser app plus portable export as the Linux fallback while native GTK3 risk remains unresolved. ADR-0005 accepts the exact WXT multi-surface, transfer/fallback, and reproducible store/source package baseline after clean-commit hosted proof. ADR-0006 accepts the restricted Tiptap/local import/export baseline after schema, sanitation, stress, keyboard semantics, tagged PDF, DOCX, and rendered-fixture proof; ADR-0007 supersedes only its exact Tiptap package pin with the first patched 3.30.4 release. Deferred `D-052` does not authorize a sync service or account dependency.
