# Contributing

Coredrill is in a public, pre-release foundation repository. The code is licensed under Apache-2.0, but external contributions are not accepted until the owner publishes contribution and private conduct-reporting routes. The workflow below governs owner-authorized work in the meantime.

## Before starting

1. Read `AGENTS.md`, `SECURITY.md`, the product goal, relevant accepted ADRs/design documents, and the living checklist.
2. Choose one bounded checklist item or range and record it in `Current work`.
3. State the modes, trust boundaries, offline/template-only behavior, proof, migrations, and explicit exclusions.
4. Inspect Git status and preserve unrelated work.

## Development workflow

- Use the pinned toolchain, `pnpm install --frozen-lockfile`, and exact `cargo-audit` 0.22.2 required by `pnpm verify`.
- Use the repository scripts for Turborepo tasks; they disable optional tool telemetry and the update notifier.
- Write or update the executable proof before marking a checklist item complete.
- Keep domain and application packages independent from concrete adapters and runtime apps.
- Use synthetic or licensed fixtures only; never commit personal career data or credentials.
- Add a Changeset for package/user-visible behavior and use the migration-note template for schema/archive/contract changes.
- Propose an ADR before changing an Accepted decision.

Run:

```powershell
pnpm verify
```

For a change based on Git history, use `pnpm check:affected`; pass an explicit base such as `pnpm check:affected -- HEAD^` when recording reproducible proof. Build and typecheck run sequentially so they cannot race over TypeScript outputs. CI always runs the full foundation gate on protected branches.

## Change description

Every handoff or future pull request should state:

- outcome and checklist IDs;
- files and contracts affected;
- security/privacy/source-policy impact;
- AI-disabled and offline behavior;
- migrations/backward compatibility;
- commands run and proof artifacts;
- known risks, blockers, and the next smallest slice.

## Commit and review expectations

Keep commits reviewable and do not combine unrelated formatting or generated churn with behavior changes. Unless explicitly marked otherwise in writing, an intentionally submitted contribution accepted for inclusion is licensed under Apache-2.0 as described by the repository license. No CLA or DCO is established yet; contribution intake and enforcement procedures must be published before contributions are opened.
