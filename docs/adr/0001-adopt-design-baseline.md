# ADR-0001 — Adopt the Job Workspace design baseline

- **Status:** Accepted
- **Date:** 2026-08-21
- **Owners:** Project owner
- **Decision register IDs:** `D-001`–`D-004`, `D-011`, `D-013`, `D-014`, `D-020`, `D-021`, `D-024`, `D-026`, `D-028`, `D-030`–`D-034`, `D-040`–`D-042`, `D-050`, `D-051`, `D-053`
- **Checklist IDs:** `FND-008`

## Problem and evidence

The repository began empty while the implementation-ready product and architecture authority lived in an external design kit. Implementation needs a self-contained, reviewable baseline without silently promoting provisional choices or losing the original decision rationale.

Evidence and full alternatives are preserved in the repository-local [goal](../design/job-workspace-design-kit/GOAL.md), [decision register](../design/job-workspace-design-kit/11-decision-register.md), and numbered design documents.

## Constraints

- Accountless, local-first, offline-capable, and AI-disabled operation remain complete paths.
- SQLite is durable truth and adapters remain replaceable.
- External facts preserve provenance and user-confirmed values are not silently overwritten.
- User control, lawful sources, narrow permissions, truthful generation, and portable recovery outrank convenience.
- Provisional and Deferred decisions retain their explicit gates.

## Options considered

1. Keep the design kit external only, which makes clones incomplete and links fragile.
2. Convert every register item into a separate new ADR, which duplicates authority and risks changing statuses during transcription.
3. Adopt one umbrella ADR, copy the authoritative kit into the repository, and let future material changes receive focused ADRs.

## Decision and rationale

Adopt option 3. The repository imports the following Accepted register decisions as they stood on 2026-08-21. This table is a concise navigation summary; the linked decision register remains authoritative for each exact Decision sentence, rationale, consequence, and revisit trigger.

| ID      | Accepted decision summary                                                                         |
| ------- | ------------------------------------------------------------------------------------------------- |
| `D-001` | Job Workspace is a standalone application, not a COMPOSR runtime dependency.                      |
| `D-002` | Hosted PWA and desktop baseline require no account or hosted database.                            |
| `D-003` | V1 captures, analyzes, drafts, and tracks; it does not auto-submit, bulk apply, or send outreach. |
| `D-004` | Reliable local vault/tracking/capture precedes document AI; document AI precedes discovery/sync.  |
| `D-011` | Board and dense table are peer views over the same Pipeline records.                              |
| `D-013` | Show explainable evidence coverage, not an ATS score or hiring probability.                       |
| `D-014` | Use calm, professional, non-gamified interaction language.                                        |
| `D-020` | TypeScript owns shared logic; SQL owns schema/migrations; Rust is a thin native boundary.         |
| `D-021` | Use a React + Vite shared frontend rather than a server-first framework.                          |
| `D-024` | SQLite is canonical in every full app mode through shared repositories/migrations.                |
| `D-026` | Use reviewed SQL and focused repositories, not a full ORM.                                        |
| `D-028` | Python is optional only after a benchmark-backed ADR.                                             |
| `D-030` | Preserve field-level provenance and durable user confirmation.                                    |
| `D-031` | Prefer structured/API and deterministic extraction before heuristics/LLMs.                        |
| `D-032` | Extension capture is user-invoked with a bounded outbox, not a full vault.                        |
| `D-033` | Only approved sources/connectors with policy records and kill switches may ship.                  |
| `D-034` | Do not build on LinkedIn or Glassdoor scraping.                                                   |
| `D-040` | AI is optional and provider-neutral; template-only mode is complete.                              |
| `D-041` | Generated factual claims link to evidence or require visible review/override.                     |
| `D-042` | Documents are versioned and Applied retains exact submitted snapshots.                            |
| `D-050` | Describe actual local protection; do not equate local storage with encryption.                    |
| `D-051` | A checksummed portable archive is a core ownership/recovery feature.                              |
| `D-053` | Telemetry is off by default; diagnostics are local and privacy-safe.                              |

This ADR does **not** accept provisional `D-010`, `D-012`, `D-015`, `D-022`, `D-023`, `D-025`, or `D-027`, and does not activate deferred `D-052`.

## Consequences and migration

Clones contain their design and progress authority. Future implementation can link to stable repository paths. The cost is maintaining design/checklist changes alongside code; the change procedure makes that intentional. No runtime data or schema migration exists in this slice.

## Security, privacy, and source-policy impact

This adoption reduces ambiguity about prohibited data flows and sources. It adds no runtime, network request, permission, secret, database, or connector.

## Documents, contracts, checklist IDs, and tests to update

- Repository-local design kit and ADR index are the documentation proof.
- No runtime contract or migration is created.
- `FND-008` links this ADR index after review.
- Architecture/checklist checks prevent provisional runtime coupling in the foundation.

## Revisit trigger

Revisit an individual decision only when its register trigger or named gate produces evidence. Replace it through a focused ADR and same-change design/checklist updates; never edit this historical adoption record to disguise the change.
