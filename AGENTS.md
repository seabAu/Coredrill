# Repository instructions

These instructions apply to the entire repository.

## Read before changing code

1. Read `README.md`, `SECURITY.md`, and every accepted ADR relevant to the task.
2. Read `docs/design/job-workspace-design-kit/GOAL.md`, `docs/design/job-workspace-design-kit/11-decision-register.md`, the relevant numbered design documents, and `docs/design/job-workspace-design-kit/LIVING-CHECKLIST.md` to the end.
3. Inspect current code, Git status, installed toolchain, and tests. Preserve unrelated user changes.

Authority order is: current user instruction; this file and `SECURITY.md`; `GOAL.md`, accepted ADRs, and the decision register; relevant design/source-policy records; the living checklist; documentation for exact installed versions; then tests and artifacts.

## Product invariants

- The baseline is accountless, local-first, offline-capable, and useful with AI disabled.
- SQLite is durable truth. Zustand and query caches are never canonical job, evidence, document, or sync storage.
- TypeScript owns shared domain/application/UI/extension/extraction logic; SQL owns migrations; Rust is a thin Tauri privilege boundary.
- Python is optional only after a benchmark-backed ADR and never becomes necessary for the baseline PWA.
- All external data enters through validated, versioned contracts.
- Every extracted field retains provenance. User-confirmed data is never silently overwritten.
- Raw captured content and imported files are untrusted input.
- No LinkedIn/Glassdoor scraping, general crawling, browser-history surveillance, CAPTCHA/access-control bypass, proxy rotation, auto-submit, auto-apply, or automated outreach.
- Do not broaden extension permissions or introduce a required hosted database/account for convenience.
- Do not present generated content as verified evidence or display an opaque ATS/hiring-probability score.
- Core export, restore, and deletion cannot depend on a paid or hosted service.

## Architecture boundaries

- `packages/domain` imports no application, adapter, UI, runtime, extension, provider, or source-specific package.
- `packages/contracts` contains versioned serialized boundaries and imports no runtime adapter.
- `packages/application` may depend on domain and contracts, but not concrete storage, UI, Tauri, browser-extension, source, or provider adapters.
- Runtime apps compose ports and adapters; shared packages never import from `apps/*`.
- UI code calls typed application commands/queries, never SQL, Tauri commands, or provider SDKs directly.
- Network/source/provider adapters remain replaceable behind ports and policy gates.

Import constraints are executable policy in `eslint.config.mjs` and are covered by an intentional-violation test. Update both when a new package class is added.

## Change discipline

- Work on one bounded checklist slice. Update `Current work` before implementation and attach reproducible proof before checking an item.
- If work changes an Accepted decision, stop and propose an ADR. Do not silently substitute a library, platform, data source, or architecture.
- Versions must come from current official documentation/release metadata, be reviewed, and be pinned in the lockfile.
- Add a Changeset for user-visible or package behavior changes and migration notes for schema/archive/contract changes.
- Never log or commit secrets, tokens, cookies, resumes, full private prompts, application answers, or raw private documents.
- Use synthetic or explicitly licensed fixtures and record their provenance.
- Use `apply_patch` for hand edits and avoid destructive Git/filesystem operations.

## Required checks

Run the narrowest relevant checks while iterating and `pnpm verify` before handoff. A checklist item is complete only when its listed proof exists. CI configuration without a completed remote run is not a green workflow proof.
