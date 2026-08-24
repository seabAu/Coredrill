# Coredrill

Coredrill is a standalone, local-first workspace for capturing job opportunities, managing an application pipeline, grounding application materials in truthful career evidence, and making explainable decisions about where to focus.

> [!IMPORTANT]
> This repository is in Phase 0. It contains governance and build foundations only. It does not yet contain a usable product, database implementation, capture extension, AI integration, or hosted service.

## Product promise

- Useful without an account, hosted database, paid service, or AI provider.
- Offline-capable core workflows with SQLite as durable truth.
- Field-level provenance for external facts and no silent overwrite of user-confirmed values.
- Evidence-grounded drafting with explicit user review; no auto-apply, auto-submit, or automated outreach.
- User-triggered capture with narrow permissions; no LinkedIn/Glassdoor scraping or general crawling.
- Complete export and restore remain core product capabilities.

The concise product outcome is in the [goal statement](docs/design/coredrill-design-kit/00-goal-statement.md). The full execution charter is [GOAL.md](docs/design/coredrill-design-kit/GOAL.md).

## Design and decision authority

Read these before implementation work:

1. [AGENTS.md](AGENTS.md) and [SECURITY.md](SECURITY.md)
2. [Product goal](docs/design/coredrill-design-kit/GOAL.md)
3. [ADR index](docs/adr/README.md) and [decision register](docs/design/coredrill-design-kit/11-decision-register.md)
4. Relevant numbered design documents under [`docs/design/coredrill-design-kit/`](docs/design/coredrill-design-kit/README.md)
5. [Living implementation checklist](docs/design/coredrill-design-kit/LIVING-CHECKLIST.md)

The repository-local design kit is the implementation copy supplied on 2026-08-21; its living checklist evolves with proven work. Its provenance and authority rules are recorded in [docs/design/README.md](docs/design/README.md).

## Repository shape

```text
apps/          Product runtime entry points (web, desktop, extension)
packages/      Shared domain, contracts, adapters, and tooling boundaries
migrations/    Shared reviewed SQL migrations
fixtures/      Synthetic or licensed test inputs
docs/          ADRs, design authority, policies, and runbooks
tooling/       Repository checks and shared configuration
```

Reserved Phase 0 directories document intended ownership only. Their presence does not mean a provisional runtime choice has passed its required spike.

## Development

Prerequisites are pinned in [`.node-version`](.node-version), [`rust-toolchain.toml`](rust-toolchain.toml), and the `packageManager` field in [`package.json`](package.json).

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:coverage
pnpm check:policy
```

Use `pnpm verify` for the complete local foundation gate. See [CONTRIBUTING.md](CONTRIBUTING.md) for the change workflow.

## Privacy and security

Do not place real resumes, application answers, provider keys, cookies, tokens, or captured private pages in the repository or fixtures. Report suspected vulnerabilities using [SECURITY.md](SECURITY.md); support requests should follow [SUPPORT.md](SUPPORT.md).

## License status

Coredrill is licensed under the [Apache License 2.0](LICENSE). The separate sustainability and business-model decision remains open under `Q-013`; it must preserve the free local core and complete export path.

External contributions remain closed during the private foundation phase until the owner publishes contribution and private conduct-reporting routes. See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
