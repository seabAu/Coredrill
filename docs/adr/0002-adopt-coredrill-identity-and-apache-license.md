# ADR-0002 — Adopt the Coredrill identity and Apache-2.0 license

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Project owner
- **Decision register IDs:** `D-054`, `D-055`; resolves the license portion of `Q-013` and narrows `Q-001`
- **Checklist IDs:** `FND-001`, `FND-006`, `DEP-001`

## Problem and evidence

The foundation used the temporary name Coredrill's predecessor and a restrictive placeholder license while product identity, repository availability, and public software permissions remained owner decisions. The owner selected **Coredrill**, created `https://github.com/seabAu/Coredrill`, and selected the Apache License 2.0. The remote's initial commit contains the canonical Apache-2.0 license text.

The working identity is therefore resolved well enough for repository development. Trademark, domain, and marketplace clearance remain required before a public landing page or store listing, and the sustainability model remains separate.

## Constraints

- Accountless, local-first, offline-capable, and AI-disabled operation remain complete paths.
- The free local core and complete export path cannot be weakened by a later business-model decision.
- Existing `JW-*` decision-inventory and test-matrix IDs remain stable historical identifiers.
- Repository history must be integrated without force-pushing or discarding either side.
- External contributions remain closed until contribution and private conduct-reporting routes are published.

## Options considered

1. Retain the temporary product name and restrictive license despite the owner's decisions.
2. Adopt Coredrill but keep the license unresolved, leaving package metadata and contributor terms inconsistent with the repository license.
3. Adopt Coredrill consistently across product, paths, package namespaces, and governance; adopt Apache-2.0 while keeping public-identity clearance and the sustainability model as separate open work.

## Decision and rationale

Adopt option 3. The repository, root package, documentation, design-kit path, and internal npm scope use `Coredrill`, `coredrill`, and `@coredrill/*` as appropriate. The repository uses the canonical Apache License 2.0 text and declares `Apache-2.0` in root package metadata.

This decision does not claim trademark or domain clearance and does not select a monetization model. It changes no accepted product, architecture, privacy, extraction, or AI constraint.

## Consequences and migration

Repository paths and internal workspace dependency names change before product APIs or durable data exist, so no runtime data or schema migration is needed. Existing clones must use the renamed design-kit path and package scope. The remote's unrelated one-file initial history is merged normally so both histories remain visible.

The former temporary restrictive license remains recoverable from Git history; the working tree now grants Apache-2.0 permissions. A later name conflict would require another focused ADR and mechanical namespace/path migration.

## Security, privacy, and source-policy impact

The change adds no runtime data flow, account, permission, network connector, secret, hosted database, or telemetry. A durable private vulnerability and conduct-reporting route is still required before public distribution or external contribution intake.

## Documents, contracts, checklist IDs, and tests to update

- Design/goal/decision-register changes: repository identity references, `D-054`, `D-055`, `Q-001`, and `Q-013`.
- Contracts/migrations: internal package scope only; no runtime contract, database schema, or archive migration.
- Checklist IDs: partial `FND-001`, hosted proof for `FND-006`, and the remaining clearance gate in `DEP-001`.
- Automated/manual proof: foundation-record identity/license assertions, full local gate, retained Git histories, and a green hosted Foundation CI run.

## Revisit trigger

Revisit the name before public listing if trademark/domain/marketplace evidence identifies a material conflict. Revisit the license only after concrete legal or distribution evidence; a business-model choice alone does not silently replace Apache-2.0.
