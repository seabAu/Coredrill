# Local vault bootstrap boundary

Status: application/SQLite prerequisite and complete local gate pass; fresh hosted verification and normal setup UI remain pending.

## Scope

`createVaultBootstrapOperations` reuses the existing validated create/open/diagnostic commands and adds `InspectLocalVaultQuery`. Inspection returns a copied/frozen current identity or explicit null plus content-free diagnostics; it does not invent an identity, invoke create/open, or promote mismatched operational schema metadata to healthy. A stored/current schema mismatch is explicitly degraded, while unavailable remains unavailable.

`createDatabaseVaultBootstrapPort` is scoped to one physical database. Its bounded identity query reads at most two roots in one SELECT and rejects ambiguity. Inspection calls no SQL write or transaction. Create checks absence and inserts in the same transaction; an existing identity is not replaced, even when the new proposed ID differs. Existing nameless job/source/company/settings records remain unchanged. Open validates the sole requested identity, rejects future schema metadata or backward audit instants, and updates only schema/open-time metadata. Its identity snapshot is captured within the committing transaction, not reread after another open could change it.

The existing generic lifecycle factory stays compatible with diagnostic fixtures. Schema remains 158; no stored format, dependency, permission or Accepted decision changes.

## Evidence

```text
pnpm exec vitest run packages/application/test/vault-bootstrap.test.ts packages/storage-core/test/tracker-repositories.test.ts
pnpm typecheck
pnpm lint
pnpm test:storage-native
COREDRILL_TEST_MATCH=storage-tracker-repositories.spec.mjs pnpm test:storage-browser
```

The 22 focused tests pass, as do all 34 typecheck tasks. Complete final-source `pnpm verify` passes, including lint, 135 unit files / 1,082 tests, coverage, all browser suites, real native contracts, recovery, policy and audits. The shared existing vault/settings and source-aggregate contract cases are strengthened without changing their ordered manifest identities. Node SQLite, real Rust/native SQLite and browser SQLite/OPFS pass: absent inspection, read-only observation, explicit naming, old-root operational refresh, rejection of an additional identity, exactly one successful concurrent initialization, ambiguity rejection without mutation, retained preferences, and unchanged pre-existing job/source rows. Node-specific fault tests prove rollback after the insert, read-only inspection without transaction/write capability, and preservation on future-schema or backward-clock rejection. Application tests reject malformed adapter facts and redact unknown errors. The repeated complete unit run is retained in ignored `test-results/local-vault-bootstrap-unit.json` with zero failures.

## Remaining work

This boundary is not yet composed into the normal application runtime or Quick start/Guided setup. It does not claim complete onboarding, identity badges, health projection, backup UI or a seed-free Phase 3 journey. Those remain the next production composition work under `Q3-005`; no milestone gate is closed by this prerequisite.
