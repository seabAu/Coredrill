# Living implementation checklist

This file is the single progress ledger. `GOAL.md` defines the outcome; numbered design documents define behavior; `11-decision-register.md` defines accepted choices. This checklist records what is actually proven.

Last design update: 2026-08-30
Current milestone: Phase 2 — capture and approved extraction (`GATE-0` and `GATE-1` external-evidence blockers remain open)
Current work item: `XTR-006` — USAJOBS adapter/configuration under reviewed current requirements
Next recommended slice: `XTR-007` after `XTR-006` proof

## How to use this file

- IDs are permanent. Never renumber or reuse an ID; append new ones.
- `[ ]` means not proven. `[x]` means complete with linked/reproducible proof.
- Track the single active slice in “Current work” below; do not invent a third checkbox state.
- A code commit is not proof by itself. Proof is a test, artifact, screenshot, report, fixture result, or reviewed document.
- If an item changes an Accepted decision, stop, write an ADR, and update every affected doc/checklist item in the same commit.
- If blocked, leave the item unchecked and add a dated entry in the blocker log with the next action.
- Do not close a milestone gate until all required child items and its end-to-end journey pass.
- Optional items are labeled **Optional**; all others are release requirements for their milestone.
- Security, privacy, accessibility, migration, and recovery work is part of the feature, not a final cleanup phase.

## Current work

| Field | Value |
|---|---|
| Milestone | Phase 2, with the independent Phase 0 and Phase 1 evidence gates retained below |
| Item range | `XTR-006` |
| Branch/worktree | `main` / repository root |
| Started | 2026-08-30 |
| Expected proof | Current official USAJOBS Search API, authentication, rate-limit, API-consumer terms, and privacy review; one exact-destination user-configured-credential connector record with review deadline and kill switch; deterministic bounded GET-only search/configuration descriptors that never expose a key value; and synthetic response fixtures proving faithful field mapping, attribution, raw evidence, and provenance |
| Blocker | None for `XTR-006`. `GATE-1` remains open because `Q1-001` and the manual portion of `Q1-003` require unavailable external targets; the participant study and `FND-001` also remain independently blocked. |
| Next handoff | Formalize the current USAJOBS public-search and registered-consumer boundary, then implement the smallest non-executing BYOK configuration/request contract and pure response adapter. Do not ship a shared key, secret-read/logging path, executing network client, status/internal-job access, automatic application, broad redistribution, entity writes, AI inference, or expanded extension permissions in this slice. |

## Milestone status

| Phase | Outcome | Status | Gate |
|---|---|---|---|
| 0 | Repository, UX prototypes, and risky platform assumptions proven | Blocked on representative human validation | `GATE-0` |
| 1 | Complete local tracker and recovery loop | Implementation complete; gate blocked on external performance/accessibility evidence | `GATE-1` |
| 2 | Safe capture, review, and approved extraction | In progress | `GATE-2` |
| 3 | Career evidence and versioned documents | Not started | `GATE-3` |
| 4 | Optional evidence-grounded AI assistance | Not started | `GATE-4` |
| 5 | Salary context and compliant discovery | Not started | `GATE-5` |
| 6 | Public-beta hardening and distribution | Not started | `GATE-6` |
| 7 | Optional hosted sync/service capabilities | Deferred | `GATE-7` |

## Design baseline (completed)

- [x] **DSN-001** Record standalone/local-first product thesis. — Proof: [README](README.md), [goal](GOAL.md)
- [x] **DSN-002** Specify UI, screens, journeys, responsive behavior, and error states. — Proof: [01](01-product-ui-and-journeys.md), [09](09-interface-system.md)
- [x] **DSN-003** Specify runtime architecture, ports, monorepo, and capture bridge. — Proof: [02](02-runtime-architecture.md)
- [x] **DSN-004** Specify entities, indexes, migrations, provenance, and sync readiness. — Proof: [03](03-data-model.md)
- [x] **DSN-005** Specify extraction tiers, compliant sources, connector policy, and Python boundary. — Proof: [04](04-capture-extraction-sources.md)
- [x] **DSN-006** Specify evidence-first generation, document behavior, and salary logic. — Proof: [05](05-ai-documents-salary.md)
- [x] **DSN-007** Specify security, privacy, sync, deployment, and test strategy. — Proof: [06](06-security-sync-deployment-testing.md)
- [x] **DSN-008** Research category leaders and derive adopt/adapt/reject patterns. — Proof: [08](08-competitive-patterns.md)
- [x] **DSN-009** Select the language and technology direction with fallback gates. — Proof: [10](10-technology-stack.md)
- [x] **DSN-010** Create revisable decision authority and open-question log. — Proof: [11](11-decision-register.md)
- [x] **DSN-011** Create phased Codex execution guidance. — Proof: [07](07-delivery-plan-codex.md), this checklist

---

# Phase 0 — Foundations and risk retirement

## Repository and governance

- [ ] **FND-001** Create repository, license, `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md`, code of conduct, and support policy. — Proof: [Coredrill identity and Apache-2.0 proven; durable private conduct and vulnerability routes remain blocked](../../proof/identity-license-hosting-verification.md#outcome)
- [x] **FND-002** Configure pnpm workspaces, Turborepo, committed lockfile, and toolchain-version files. — Proof: [frozen clean-clone install/build](../../proof/foundation-verification.md#clean-clone-proof)
- [x] **FND-003** Create the approved `apps/`, `packages/`, `migrations/`, `fixtures/`, and `docs/` skeleton without placeholder runtime coupling. — Proof: [tree and 19-policy architecture check](../../proof/foundation-verification.md#reviewed-repository-evidence)
- [x] **FND-004** Configure TypeScript strict project references and import-boundary rules. — Proof: [19-project typecheck and intentional violation tests](../../proof/foundation-verification.md#local-gate-results)
- [x] **FND-005** Configure ESLint, Prettier, unit tests, coverage output, and affected-task commands. — Proof: [local and Git-history affected command results](../../proof/foundation-verification.md#local-gate-results)
- [x] **FND-006** Configure GitHub Actions for install, typecheck, lint, unit, dependency/license, and secret checks. — Proof: [green hosted Foundation CI run #1 plus local gate](../../proof/identity-license-hosting-verification.md#outcome)
- [x] **FND-007** Add Changesets and release-note/migration-note templates. — Proof: [sample changeset and templates](../../proof/foundation-verification.md#reviewed-repository-evidence)
- [x] **FND-008** Add ADR template and copy the accepted design decisions into repository docs with links back to this kit. — Proof: [ADR index and accepted-baseline ADR](../../proof/foundation-verification.md#reviewed-repository-evidence)
- [x] **FND-009** Record exact current stable dependency selections, versions, licenses, maintainers, and known advisories. — Proof: [reviewed inventory, drift validator, and all-severity audit](../../proof/foundation-baselines-verification.md#outcome)
- [x] **FND-010** Establish reference hardware, OS, browser, accessibility, and performance test matrix. — Proof: [`JW-TM-001` v1.0.0 and executable validation](../../proof/foundation-baselines-verification.md#outcome)

## Domain and contracts

- [x] **DOM-001** Define branded IDs, date-only/instant/time-zone types, money/rate units, URL, source reference, and confidence value objects. — Proof: [unit/property tests and verification report](../../proof/domain-foundations-verification.md#dom-001-value-object-proof)
- [x] **DOM-002** Define status semantic categories and validated custom-stage mapping. — Proof: [category-pair and guarded-transition tests](../../proof/domain-foundations-verification.md#dom-002-status-proof)
- [x] **DOM-003** Define versioned `CaptureEnvelope` JSON Schema and generated TypeScript/Zod boundary validator. — Proof: [round-trip/invalid fixtures, size validation, and schema-drift gate](../../proof/capture-provenance-contracts-verification.md#dom-003-capture-envelope-proof)
- [x] **DOM-004** Define field candidate/provenance/conflict/user-confirmation contracts. — Proof: [contract examples and tests](../../proof/capture-provenance-contracts-verification.md#dom-004-evidence-contract-proof)
- [x] **DOM-005** Define portable-archive manifest and checksum contract. — Proof: [generated schema, complete sample, and invalid-invariant tests](../../proof/archive-database-contracts-verification.md#dom-005-portable-archive-proof)
- [x] **DOM-006** Define `DatabasePort`, repository contracts, and transaction semantics. — Proof: [adapter-neutral isolated contract harness and broken-adapter tests](../../proof/archive-database-contracts-verification.md#dom-006-database-contract-proof)
- [x] **DOM-007** Define `ExtractionPort`, `AiPort`, `LaborDataPort`, `DocumentPort`, and deferred `SyncPort`. — Proof: [public API inventory and executable synthetic adapters](../../proof/remaining-domain-contracts-verification.md#dom-007-provider-neutral-port-proof)
- [x] **DOM-008** Define application command/query/result/error conventions. — Proof: [command and view-query examples with typed result/error tests](../../proof/remaining-domain-contracts-verification.md#dom-008-application-operation-proof)
- [x] **DOM-009** Define privacy-safe diagnostic event schema with forbidden-field tests. — Proof: [generated schema, allowlist, redaction, and sentinel tests](../../proof/remaining-domain-contracts-verification.md#dom-009-diagnostic-event-proof)

## Browser SQLite/OPFS spike

- [x] **STG-001** Run official SQLite WASM in a dedicated Worker and open an `opfs-sahpool` database. — Proof: [official adapter diagnostics and browser log](../../proof/browser-sqlite-opfs-verification.md#stg-001-official-sqlite-workeropfs-proof)
- [x] **STG-002** Apply shared migration, transact, query, close, reopen, and verify durability. — Proof: [shared migration and automated durability/rollback test](../../proof/browser-sqlite-opfs-verification.md#stg-002-migration-transaction-and-durability-proof)
- [x] **STG-003** Export a portable database/archive and restore it into a clean origin/profile. — Proof: [checksum, corruption rejection, clean-context restore, and delete E2E](../../proof/browser-sqlite-opfs-verification.md#stg-003-portable-database-restore-proof)
- [x] **STG-004** Test Chromium, Firefox, and Safari current/previous stable support or document exact unsupported fallbacks. — Proof: [exact Chrome/Firefox jobs plus explicit unavailable Safari/mobile fallback](../../proof/browser-storage-platform-verification.md#stg-004-compatibility-evidence)
- [x] **STG-005** Test private browsing, denied persistence, quota pressure, storage eviction diagnostics, and corrupted database behavior. — Proof: [deterministic failure matrix and fail-safe corrupt restore](../../proof/browser-storage-platform-verification.md#stg-005-failure-matrix)
- [x] **STG-006** Test second-tab contention, read-only/handoff UX, crash/reload, and `SQLITE_BUSY` recovery. — Proof: [multi-context Web Lock handoff, abrupt reload, and typed busy recovery](../../proof/browser-storage-platform-verification.md#stg-006-contention-and-crash-proof)
- [x] **STG-007** Measure create/migrate/search/import/export/startup on reference data sizes. — Proof: [clean-commit 100/2,000/10,000-record benchmark and raw artifact](../../proof/browser-storage-platform-verification.md#stg-007-diagnostic-benchmark)
- [x] **STG-008** Decide VFS/browser support and update D-025/Q-002. — Proof: [accepted ADR-0003 and decision-register promotion](../../proof/browser-storage-platform-verification.md#stg-008-accepted-decision)

## Tauri/native spike

- [x] **NAT-001** Scaffold Tauri 2 shell with strict capability allowlist and shared Vite frontend. — Proof: [release-mode `coredrill.exe`, CSP, and one-command capability smoke build](../../proof/native-sqlite-tauri-verification.md#nat-001-desktop-shell-proof)
- [x] **NAT-002** Compare official SQL plugin and a narrow `rusqlite` command adapter against requirements. — Proof: [reviewed provisional adapter decision matrix](../../proof/native-sqlite-tauri-verification.md#nat-002-native-adapter-decision-matrix)
- [x] **NAT-003** Run the same repository/migration contract suite against native SQLite. — Proof: [five-test real-process transaction/migration/repository report](../../proof/native-sqlite-tauri-verification.md#nat-003-shared-contract-proof)
- [x] **NAT-004** Store database/attachments in OS app-data and validate path canonicalization. — Proof: [pinned-Tauri resolver, canonical content-addressed layout, and Windows junction/reparse-point tests](../../proof/native-sqlite-tauri-verification.md#nat-004-os-app-data-and-path-confinement-proof)
- [x] **NAT-005** Store/delete a test provider secret through OS secure storage without logging it. — Proof: [redacted Windows Credential Manager lifecycle and clean hosted checkout](../../proof/native-secure-storage-verification.md#redacted-integration-proof)
- [x] **NAT-006** Export/restore with native file picker and atomic replacement behavior. — Proof: [picker-owned checksummed archive, corruption rejection, atomic replacement, recovery, and clean hosted checkout](../../proof/native-archive-verification.md#end-to-end-failure-and-recovery-proof)
- [x] **NAT-007** Build installable artifact for the first target OS and record size/startup/memory. — Proof: [clean-commit NSIS artifact, installed lifecycle, and raw size/startup/memory manifests](../../proof/native-windows-package-verification.md#clean-commit-artifact-and-benchmark)
- [x] **NAT-008** Decide native adapter and update D-022/D-024/Q-003. — Proof: [ADR-backed cross-platform dependency, secure-store, package, sanitized-manifest, and fallback decision](../../proof/native-cross-platform-verification.md#hosted-clean-commit-proof)

## Extension spike

- [x] **EXT-001** Scaffold WXT MV3 extension with side-panel and popup fallback entrypoints. — Proof: [hosted clean-commit Chromium build and exact manifest](../../proof/extension-capture-outbox-verification.md#hosted-clean-commit-proof)
- [x] **EXT-002** Capture title/company/URL/selected text under a user `activeTab` action. — Proof: [user-action fixture, permission boundary, and provenance-retaining envelope](../../proof/extension-capture-outbox-verification.md#capture-fixture-and-envelope-proof)
- [x] **EXT-003** Validate and store a bounded, checksummed outbox item. — Proof: [bounded checksummed outbox tests and hosted aggregate gate](../../proof/extension-capture-outbox-verification.md#local-verification)
- [x] **EXT-004** Transfer idempotently to a hosted app origin with acknowledgement and retry. — Proof: [clean-commit hosted SQLite-before-ack, acknowledgement-loss, attempt-2 retry, and exact deduplication E2E](../../proof/extension-transfer-fallback-security-verification.md#hosted-clean-commit-proof)
- [x] **EXT-005** Prove Firefox fallback/manual export path. — Proof: [hosted Firefox checksummed JSON import, corrupt-checksum rejection, and idempotent duplicate report](../../proof/extension-transfer-fallback-security-verification.md#hosted-clean-commit-proof)
- [x] **EXT-006** Test malicious page messages, oversized input, replay, wrong origin/ID, and expired capture. — Proof: [focused security suite plus hostile live-boundary cases](../../proof/extension-transfer-fallback-security-verification.md#security-and-compatibility-tests)
- [x] **EXT-007** Inspect production manifest/bundle for permissions, CSP, remote code, and secret leakage. — Proof: [exact unpacked/store-ZIP inspection, remote-code/secret scans, clean source rebuild, and downloaded immutable artifact review](../../proof/extension-production-package-verification.md#hosted-clean-commit-proof)
- [x] **EXT-008** Decide WXT/side-panel baseline and update D-023/Q-005. — Proof: [accepted WXT multi-surface baseline and resolved side-panel/sidebar/popup decision](../../adr/0005-adopt-wxt-multisurface-extension-baseline.md)

## Editor/export spike

- [x] **EDT-001** Define restricted Tiptap document schema and versioned intermediate representation. — Proof: [version-1 generated JSON Schema](../../../packages/documents/schemas/document-ir.v1.schema.json), [canonical IR fixture](../../../packages/documents/test/fixtures/document-ir.v1.valid.json), and [schema/normalization tests](../../../packages/documents/test/document-ir.test.ts)
- [x] **EDT-002** Test edit/undo/paste sanitation/version round-trip and 100-page stress case. — Proof: [browser test report and measured 100-page results](../../evidence/document-editor-spike-report.md) backed by the [reproducible Playwright suite](../../../e2e/document-editor.spec.mjs)
- [x] **EDT-003** Import representative DOCX/PDF/text fixtures with source mapping and failure messages. — Proof: [checked-in import goldens](../../../fixtures/imports/expected-imports.json), [synthetic fixtures and regeneration instructions](../../../fixtures/imports/README.md), and [real-browser import/failure tests](../../../e2e/document-editor.spec.mjs)
- [x] **EDT-004** Export accessible DOCX and PDF fixtures and visually compare pagination. — Proof: [synthetic exports, regeneration guide, and final page renders](../../../fixtures/exports/README.md) plus [verification report](../../proof/document-editor-export-verification.md)
- [x] **EDT-005** Complete keyboard/screen-reader editor smoke test. — Proof: [keyboard, semantic, and manual visual smoke report](../../evidence/document-editor-accessibility-smoke.md) backed by the [real-browser suite](../../../e2e/document-editor.spec.mjs)
- [x] **EDT-006** Decide Tiptap baseline and update D-027/Q-004. — Proof: [ADR-0006](../../adr/0006-adopt-tiptap-local-document-baseline.md) and the updated [decision register](11-decision-register.md)

## UX prototype and validation

- [x] **UXR-001** Create low-fidelity shell, Home, Pipeline Board/Table, Inbox review, job workspace, and document studio prototypes. — Proof: [runnable low-fidelity prototype](../../../prototypes/phase-0/README.md) and [browser/visual verification](../../proof/ux-prototype-preparation-verification.md)
- [x] **UXR-002** Create mobile quick-add, Pipeline, job detail, and network-preflight prototypes. — Proof: [same responsive prototype and local-only fixture](../../../prototypes/phase-0/README.md) with [mobile interaction/visual proof](../../proof/ux-prototype-preparation-verification.md#browser-interaction-and-visual-smoke)
- [x] **UXR-003** Prepare neutral sample vault and ten scripted usability tasks from the interface spec. — Proof: [versioned synthetic disposable vault](../../../prototypes/phase-0/sample-vault.v1.json) and [moderated ten-task study script](../../../prototypes/phase-0/usability-study-script.md)
- [ ] **UXR-004** Test with at least five representative users including keyboard-heavy and nontechnical participants. — Proof: _anonymized findings_
- [ ] **UXR-005** Validate storage-location comprehension and quick-start versus guided onboarding. — Proof: _results_
- [ ] **UXR-006** Validate capture triage, Board/Table discovery, job-detail context, and exact submitted-document retrieval. — Proof: _results_
- [ ] **UXR-007** Validate Evidence coverage language and AI/data-destination comprehension. — Proof: _results_
- [ ] **UXR-008** Resolve Q-006 and update D-010/D-012/D-015/interface spec. — Proof: _decision updates_

## Phase 0 gate

- [ ] **GATE-0** All mandatory Phase 0 items pass; repository builds from a clean clone; the selected browser/native/extension/editor choices have written evidence; no release-blocking open question remains for Phase 1. — Proof: _Phase 0 gate report_

---

# Phase 1 — Local tracker and recovery loop

## Database and repositories

- [x] **DB-001** Implement initial schema and migration ledger for vault/settings. — Proof: [shared schema and adapter verification](../../proof/phase-1-tracker-foundations-verification.md)
- [x] **DB-002** Implement companies, contacts, jobs, job sources/snapshots, field candidates, and provenance. — Proof: [shared schema and repository verification](../../proof/phase-1-tracker-foundations-verification.md)
- [x] **DB-003** Implement stages, applications/status history, interactions, next actions, interviews, and reminders. — Proof: [shared pipeline persistence and transaction verification](../../proof/phase-1-pipeline-persistence-verification.md)
- [x] **DB-004** Implement tags, saved views, filter AST serialization, and safe SQL compiler. — Proof: [shared filter, tag, and saved-view verification](../../proof/phase-1-filter-views-verification.md)
- [x] **DB-005** Implement documents/versions/attachments manifest skeleton without AI dependency. — Proof: [shared document, version, and attachment-manifest verification](../../proof/phase-1-document-manifest-verification.md)
- [x] **DB-006** Implement audit timestamps, tombstones/future-sync IDs, and integrity constraints. — Proof: [shared audit, identity, upgrade, and integrity verification](../../proof/phase-1-audit-integrity-verification.md)
- [x] **DB-007** Implement indexes and FTS5 capability detection/fallback. — Proof: [indexed lexical search, FTS5 detection/fallback, and benchmark verification](../../proof/phase-1-job-search-verification.md)
- [x] **DB-008** Run identical repository contract suite in browser and native CI jobs. — Proof: [versioned repository-contract inventory and browser/native CI parity verification](../../proof/phase-1-repository-contract-ci-verification.md)

## Application services

- [x] **APP-001** Implement vault create/open/diagnostics command flow. — Proof: [accountless vault lifecycle and redacted diagnostics use-case verification](../../proof/phase-1-vault-application-verification.md)
- [x] **APP-002** Implement manual `CreateJob` and transactional `ChangeStatus` with timeline event. — Proof: [manual job creation and atomic status-change application verification](../../proof/phase-1-manual-job-pipeline-application-verification.md)
- [x] **APP-003** Implement `SetNextAction`, reminders, interviews, and interactions. — Proof: [next-action, interaction, interview, and local-reminder application verification](../../proof/phase-1-job-activity-application-verification.md)
- [x] **APP-004** Implement company/contact relationship commands with provenance rules. — Proof: [company/contact relationship and provenance application verification](../../proof/phase-1-company-contact-application-verification.md)
- [x] **APP-005** Implement Pipeline queries, counts, board groups, table pagination, and job workspace DTO. — Proof: [Pipeline counts, board groups, shared pagination, and job-workspace application verification](../../proof/phase-1-pipeline-query-application-verification.md)
- [x] **APP-006** Implement validated filter/sort/group/saved-view commands. — Proof: [validated filter, sort, group, and saved job-view application verification](../../proof/phase-1-saved-job-view-application-verification.md)
- [x] **APP-007** Implement undo token for status/next-action edits with durable consistency. — Proof: [durable, single-use status and next-action mutation-undo verification](../../proof/phase-1-mutation-undo-application-verification.md)
- [x] **APP-008** Implement local diagnostic log and user-copyable redacted support bundle. — Proof: [privacy-safe local diagnostic log and support-bundle verification](../../proof/phase-1-local-diagnostic-support-bundle-verification.md)

## Shell and core UI

- [x] **UI-001** Implement design tokens, themes, density modes, typography, icon wrapper, focus styles, and reduced motion. — Proof: [component catalog, contrast report, accessibility checks, and hosted artifacts](../../proof/phase-1-ui-foundations-verification.md)
- [x] **UI-002** Implement responsive application shell, navigation, vault health, global search, command menu, and Add menu. — Proof: [responsive application-shell, accessibility, and hosted artifact verification](../../proof/phase-1-application-shell-verification.md)
- [x] **UI-003** Implement Quick start and Guided setup with disposable demo vault. — Proof: [local-first paths, deferral, accessibility, and demo-vault isolation verification](../../proof/phase-1-onboarding-verification.md)
- [x] **UI-004** Implement Home attention queue, due actions, recent items, and optional snapshot. — Proof: [ordered local attention queue, empty state, accessibility, and hosted artifact verification](../../proof/phase-1-home-attention-queue-verification.md)
- [x] **UI-005** Implement Pipeline header, view switch, filter chips, saved views, and selection/bulk-action shell. — Proof: [peer-view invariance, local controls, selection-only bulk actions, accessibility, and hosted artifact verification](../../proof/phase-1-pipeline-control-surface-verification.md)
- [x] **UI-006** Implement accessible Board with drag, keyboard move, semantic stages, undo, and virtualization. — Proof: [semantic stages, contextual cards, pointer and keyboard moves, fail-closed reopen, undo, virtualization, accessibility, and hosted artifact verification](../../proof/phase-1-pipeline-board-verification.md)
- [x] **UI-007** Implement virtualized Table with pinned/configurable columns and safe inline editing. — Proof: [semantic Table, per-view columns, bounded version-aware edits, 2,000-row performance, accessibility, and hosted artifact verification](../../proof/phase-1-pipeline-table-verification.md)
- [x] **UI-008** Implement contextual/full-page Job workspace with route/back/refresh/scroll restoration. — Proof: [stable route, shared frame, exact Pipeline restoration, responsive, refresh/deep-link, accessibility, and hosted artifact verification](../../proof/phase-1-job-workspace-navigation-verification.md)
- [x] **UI-009** Implement Overview, Timeline, Company, and Source skeleton tabs. — Proof: [Overview facts/actions, semantic timeline, company context, source provenance/freshness, accessibility, local-only and hosted artifact verification](../../proof/phase-1-job-workspace-core-tabs-verification.md)
- [x] **UI-010** Implement Network companies/contacts/interactions views. — Proof: [company relationships, provenance-bound contacts, append-only interaction log, reminder controls, responsive accessibility, local-only and hosted artifact verification](../../proof/phase-1-network-workspace-verification.md)
- [x] **UI-011** Implement scoped and global local search with result keyboard navigation. — Proof: [bounded local matching, explicit scopes, keyboard navigation, stable routes, accessibility, and hosted artifact verification](../../proof/phase-1-local-search-verification.md)
- [x] **UI-012** Implement all Phase 1 loading/empty/partial/error/offline/permission states. — Proof: [validated state catalog, recovery semantics, responsive accessibility, visual review, and hosted artifact verification](../../proof/phase-1-workspace-state-catalog-verification.md)

## Backup, export, restore, delete

- [x] **BKP-001** Implement portable archive writer with manifest, database/data, attachments, and checksums. — Proof: [deterministic golden archive, entry integrity, fail-closed validation, and hosted Chrome/Firefox reproduction](../../proof/phase-1-portable-archive-writer-verification.md)
- [x] **BKP-002** Implement human-readable JSON and CSV exports with documented field mapping. — Proof: [strict schema, exact 29-dataset field mapping, byte-exact JSON/CSV fixtures, archive integration, and hosted Chrome/Firefox production projection](../../proof/phase-1-human-readable-data-export-verification.md)
- [x] **BKP-003** Implement restore dry run, version/checksum validation, conflict preview, and transactional commit. — Proof: [bounded fail-closed archive validation, immutable conflict preview, stale-target protection, transactional failure preservation, and hosted Chrome/Firefox restore reproduction](../../proof/phase-1-portable-archive-restore-verification.md)
- [x] **BKP-004** Implement desktop automatic backup rotation without deleting last known-good backup. — Proof: [managed path-free checkpoints, verify-before-rotate retention, failure-safe preservation, restorable final artifact, and hosted Windows/macOS/Ubuntu reproduction](../../proof/phase-1-desktop-automatic-backup-verification.md)
- [x] **BKP-005** Implement browser persistence/quota health and export reminder without manipulative prompts. — Proof: [passive observation, explicit request, durable neutral reminder, accessible Settings, and exact Chrome/Firefox verification](../../proof/phase-1-browser-vault-recovery-health-verification.md)
- [x] **BKP-006** Implement typed-confirmation vault deletion, secret cleanup, and recoverability warning. — Proof: [exact confirmation, scoped deletion, rollback, credential cleanup, honest deferred purge, accessibility, and cross-platform hosted verification](../../proof/phase-1-vault-deletion-verification.md)
- [x] **BKP-007** Restore a Phase 1 vault into clean browser and desktop installations and compare canonical hashes. — Proof: [same committed schema-92 archive, attachment, and canonical content hash in production browser and native targets](../../proof/phase-1-clean-recovery-verification.md)

## Phase 1 quality

- [ ] **Q1-001** Meet reference-data startup/query/board/table performance budgets or record approved adjustment. — Proof: [production benchmark harness and clean-commit diagnostic; exact `HW-WIN-REF` execution still required](../../proof/phase-1-reference-data-performance-verification.md)
- [x] **Q1-002** Pass offline, refresh, crash, storage-denied, quota, and second-tab journeys. — Proof: [production PWA, OPFS preservation, typed storage failures, writer handoff, and exact Chrome 151/152 E2E matrix](../../proof/phase-1-resilience-e2e-verification.md)
- [ ] **Q1-003** Pass Phase 1 WCAG automated/manual matrix. — Proof: [available automated matrix passes; exact manual targets remain blocked](../../proof/phase-1-accessibility-verification.md)
- [x] **Q1-004** Complete threat review for SQL, XSS, IPC, attachments, paths, and diagnostics. — Proof: [reviewed trust-boundary matrix, closed/triaged finding log, adversarial tests, and cross-platform hosted verification](../../proof/phase-1-threat-review.md)
- [x] **Q1-005** Run canonical journey: create vault → add job → move stages → schedule interview/follow-up → export → delete → restore. — Proof: [shared production-command runner, recorded browser app-shell journey, Windows native-process journey, clean restore, and cross-adapter canonical hash](../../proof/phase-1-canonical-journey-verification.md)
- [ ] **GATE-1** Phase 1 canonical journey passes in browser and first desktop OS; recovery is proven; no account/network/AI is required. — Proof: _Phase 1 gate report_

---

# Phase 2 — Capture, review, and approved extraction

## Capture core

- [x] **CAP-001** Implement capture envelope, source snapshot reference, checksum, nonce/sequence, expiry, and version compatibility. — Proof: [strict contract, property tests, reusable checksum verification, and hosted clean-commit matrix](../../proof/phase-2-capture-envelope-verification.md)
- [x] **CAP-002** Implement ingestion idempotency and duplicate suggestions by source ID, canonical URL, content hash, and fuzzy title/company. — Proof: [transactional exact/content idempotency, explainable fixture/property suggestions, real-browser E2E, and hosted clean-commit matrix](../../proof/phase-2-capture-ingestion-verification.md)
- [x] **CAP-003** Implement manual form, paste text/URL, saved HTML/text, and JSON capture paths. — Proof: [validated local routes, hostile-content/no-fetch E2E, and hosted clean-commit matrix](../../proof/phase-2-supplied-capture-verification.md)
- [x] **CAP-004** Implement sanitized source preview and excerpt/path navigation. — Proof: [hash-verified inert preview, hostile XSS fixtures, excerpt/path focus, cross-font reflow, and hosted clean-commit matrix](../../proof/phase-2-source-preview-verification.md)
- [x] **CAP-005** Preserve all field candidates/conflicts without overwriting user-confirmed values. — Proof: [strict reconciliation, permutation properties, forged-confirmation rejection, durable confirmed-value regression, and hosted matrix](../../proof/phase-2-field-candidate-reconciliation-verification.md)

## Extractors and policy

- [x] **XTR-001** Implement connector policy registry and runtime kill switch before network connectors. — Proof: [strict immutable records, exact-destination authorization, runtime kills, independent manual capture, synthetic/property tests, and hosted clean-commit matrix](../../proof/phase-2-connector-policy-verification.md)
- [x] **XTR-002** Implement Schema.org `JobPosting` parser with nested/array/malformed fixtures. — Proof: [43-of-43 exact golden candidates, per-field accuracy, bounded malformed-input tests, provenance, and hosted clean-commit matrix](../../proof/phase-2-schema-org-job-posting-verification.md)
- [x] **XTR-003** Implement selected-text and conservative generic DOM/Readability extractor. — Proof: [27-of-27 exact golden candidates, bounded detached DOM/Readability extraction, provenance, regression hardening, and hosted clean-commit matrix](../../proof/phase-2-generic-job-document-verification.md)
- [x] **XTR-004** Implement Greenhouse public postings adapter under reviewed current interface/terms. — Proof: [current interface/policy review, exact GET-only descriptor, 19-of-19 synthetic golden candidates, applicant-data rejection, and hosted clean-commit matrix](../../proof/phase-2-greenhouse-public-posting-verification.md)
- [x] **XTR-005** Implement Lever public postings adapter under reviewed current interface/terms. — Proof: [current interface/policy review, exact global/EU GET-only descriptors, 21-of-21 synthetic golden candidates, applicant-data rejection, and hosted clean-commit matrix](../../proof/phase-2-lever-public-posting-verification.md)
- [ ] **XTR-006** Implement USAJOBS adapter/configuration under reviewed current requirements. — Proof: _policy record + contract tests_
- [ ] **XTR-007** Implement normalization for title/company/location/work mode/salary/currency/date/source without erasing raw values. — Proof: _property/golden tests_
- [ ] **XTR-008** Publish per-field precision, coverage, and confidence calibration by adapter/version. — Proof: _generated report_
- [ ] **XTR-009** Implement connector attribution, cache/retention, rate limit, retry/backoff, and last-review display. — Proof: _integration/policy tests_
- [ ] **XTR-010** Add explicit disabled records/tests for prohibited/unreviewed sources, including LinkedIn/Glassdoor automation. — Proof: _policy fixtures_

## Review inbox

- [ ] **REV-001** Implement Inbox queue, counts, keyboard selection, and review routing. — Proof: _E2E test_
- [ ] **REV-002** Implement field groups with candidate, method, confidence, source excerpt, confirmation, and conflict UI. — Proof: _component/E2E tests_
- [ ] **REV-003** Implement Accept high-confidence fields without accepting conflicts/unknowns. — Proof: _rule tests_
- [ ] **REV-004** Implement Merge, Snooze, Discard/undo, and Save job flows. — Proof: _transaction/E2E tests_
- [ ] **REV-005** Implement expired/changed/blocked source, unsupported page, and manual fallback states. — Proof: _state fixtures_
- [ ] **REV-006** Implement listing freshness and source-diff representation without automatic trusted-field overwrite. — Proof: _diff tests_

## Production extension

- [ ] **PEX-001** Implement recognized/unrecognized/needs-input/queued/transferred/permission states. — Proof: _state catalog_
- [ ] **PEX-002** Implement side-panel preview, page-selection correction, note, and source/freshness display. — Proof: _browser E2E_
- [ ] **PEX-003** Implement bounded persistent outbox, retry/backoff, expiry warning, export, and post-ack cleanup. — Proof: _crash/restart tests_
- [ ] **PEX-004** Implement exact app-origin/extension-ID validation and compatibility handshake. — Proof: _security tests_
- [ ] **PEX-005** Implement hosted app transfer and Firefox/manual fallback. — Proof: _browser matrix_
- [ ] **PEX-006** Add optional source permissions only through policy-reviewed enable flow. — Proof: _manifest/settings test_
- [ ] **PEX-007** Run malicious-page, prompt-injection-text, huge-page, SPA-change, iframe, redirect, and replay fixtures. — Proof: _security report_
- [ ] **PEX-008** Draft accurate extension privacy disclosure and store listing from actual build permissions. — Proof: _reviewed draft_

## Phase 2 quality

- [ ] **Q2-001** Measure capture-to-reviewed-record median and correction rate in representative tests. — Proof: _usability/accuracy report_
- [ ] **Q2-002** Verify no acknowledged capture is lost across browser/app crash and upgrade. — Proof: _fault-injection test_
- [ ] **Q2-003** Pass review Inbox keyboard/screen-reader and mobile workflows. — Proof: _a11y report_
- [ ] **Q2-004** Pass connector source-policy, attribution, retention, rate-limit, and kill-switch audit. — Proof: _audit_
- [ ] **Q2-005** Run canonical journey: extension capture → outbox → Inbox review/conflict → save → source diff → manual correction. — Proof: _recorded E2E artifact_
- [ ] **GATE-2** Phase 2 safely captures and reviews representative jobs with measured extraction quality and no prohibited scraping dependency. — Proof: _Phase 2 gate report_

---

# Phase 3 — Career evidence and versioned documents

## Career profile and evidence

- [ ] **EVD-001** Implement employment, education, project, skill, accomplishment, certification, publication, volunteer, story, and preference repositories. — Proof: _schema/repository tests_
- [ ] **EVD-002** Implement evidence source/verification/staleness and privacy-tag state. — Proof: _domain tests_
- [ ] **EVD-003** Implement manual Career Profile editors and safe date/range validation. — Proof: _component/E2E tests_
- [ ] **EVD-004** Import PDF/DOCX/text resume into a proposal queue without auto-verification. — Proof: _golden import tests_
- [ ] **EVD-005** Implement duplicate role/date/skill conflict resolution and source excerpts. — Proof: _E2E tests_
- [ ] **EVD-006** Implement Situation/Action/Result stories and evidence linking. — Proof: _use-case/UI tests_
- [ ] **EVD-007** Implement reusable Answer Library with sensitivity classification, source, last-used, and version history. — Proof: _tests_
- [ ] **EVD-008** Ensure deletion/exports include all evidence relationships and attachments. — Proof: _recovery tests_

## Requirements and evidence coverage

- [ ] **MAT-001** Implement requirement categories, confidence, source excerpt, and manual correction. — Proof: _domain/UI tests_
- [ ] **MAT-002** Implement deterministic requirement parsing baseline and proposal review. — Proof: _golden fixtures_
- [ ] **MAT-003** Implement evidence candidate retrieval using relations, FTS, and user selection. — Proof: _retrieval eval_
- [ ] **MAT-004** Implement Strength/Partial/Gap/Unknown/Not Applicable decisions with explanation. — Proof: _rule tests_
- [ ] **MAT-005** Implement separate parseability, literal-term, and qualification-evidence panels. — Proof: _UI comprehension test_
- [ ] **MAT-006** Prevent automatic inference of sensitive eligibility/demographic answers. — Proof: _negative tests_
- [ ] **MAT-007** Re-run and diff coverage after evidence/document edits. — Proof: _integration test_

## Documents and versions

- [ ] **DOC-001** Implement document, base/template, job derivative, version, attachment, and submitted-snapshot model. — Proof: _repository tests_
- [ ] **DOC-002** Implement Documents views: All, Resumes, Cover letters, Answers, Templates, Submitted. — Proof: _E2E tests_
- [ ] **DOC-003** Implement structured editor with safe paste, autosave/recovery, undo, version creation, and comparison. — Proof: _component/fault tests_
- [ ] **DOC-004** Implement deterministic cover-letter and answer templates for AI-disabled mode. — Proof: _golden outputs_
- [ ] **DOC-005** Implement job/application document set selection and preparation status. — Proof: _use-case/UI tests_
- [ ] **DOC-006** Implement DOCX/PDF/text export with preview, metadata, and warnings. — Proof: _rendered goldens_
- [ ] **DOC-007** Implement Mark Applied flow that snapshots exact submitted artifacts and answers. — Proof: _E2E test_
- [ ] **DOC-008** Implement import/export round-trip without silent content or evidence-link loss. — Proof: _round-trip report_
- [ ] **DOC-009** Implement document accessibility, print, pagination, and high-zoom tests. — Proof: _manual/visual report_

## Phase 3 quality

- [ ] **Q3-001** Run resume import review with varied layouts, corrupt files, scanned PDFs, and large documents. — Proof: _fixture report_
- [ ] **Q3-002** Validate Evidence coverage terminology/actions with representative users. — Proof: _research report_
- [ ] **Q3-003** Verify template-only user can prepare and export a truthful application set offline. — Proof: _E2E test_
- [ ] **Q3-004** Complete document parser/editor/export threat review. — Proof: _security report_
- [ ] **Q3-005** Run canonical journey: import resume → confirm evidence → compare job → prepare documents → mark Applied → retrieve submitted set. — Proof: _recorded E2E artifact_
- [ ] **GATE-3** Phase 3 produces versioned, recoverable application materials and transparent evidence coverage without AI. — Proof: _Phase 3 gate report_

---

# Phase 4 — Evidence-grounded AI assistance

## AI boundary and provider setup

- [ ] **AIP-001** Implement `DisabledAiAdapter` and keep every AI entry point useful or clearly unavailable in template-only mode. — Proof: _E2E tests_
- [ ] **AIP-002** Implement provider capability model, structured request/result/error records, cancellation, and bounded retry. — Proof: _contract tests_
- [ ] **AIP-003** Implement local OpenAI-compatible endpoint adapter with explicit connection test and model capabilities. — Proof: _integration tests_
- [ ] **AIP-004** Evaluate official provider SDKs versus a provider-agnostic SDK inside adapters; record decision without leaking SDK types. — Proof: _ADR_
- [ ] **AIP-005** Implement first direct BYOK adapter only after CORS/secret/retention review for browser and secure-store review for desktop. — Proof: _security/policy record_
- [ ] **AIP-006** Implement provider settings with exact data-flow, credential location, last use, test, disable, and delete controls. — Proof: _UI/E2E tests_
- [ ] **AIP-007** Implement per-run network preflight and remembered-choice rules. — Proof: _privacy tests_
- [ ] **AIP-008** Prove keys/prompts/documents never enter logs, crash reports, URLs, extension storage, or public build config. — Proof: _secret/privacy audit_

## Prompt engine and context planning

- [ ] **PRM-001** Implement versioned `PromptTemplateV1`, variable schema, output schema, and migration/import/export. — Proof: _contract/golden tests_
- [ ] **PRM-002** Implement context-plan builder from selected job requirements, evidence, style examples, and user instructions. — Proof: _unit/eval cases_
- [ ] **PRM-003** Enforce token/context budgets, deterministic ordering, private-field minimization, and explicit truncation. — Proof: _property/eval tests_
- [ ] **PRM-004** Delimit job/source content as untrusted data and ignore embedded instructions. — Proof: _prompt-injection eval_
- [ ] **PRM-005** Record provider/model/template/context references/hashes/parameters/validation/user disposition for every run. — Proof: _generation record test_
- [ ] **PRM-006** Add advanced prompt/context trace that is understandable and secret-redacted. — Proof: _UI/privacy review_
- [ ] **PRM-007** Implement safe generation cancellation, timeout, invalid-schema repair limit, and retry idempotency. — Proof: _fault tests_

## Claim ledger and drafting

- [ ] **CLM-001** Define factual, style-only, inferred, and user-asserted claim categories. — Proof: _domain tests_
- [ ] **CLM-002** Link generated factual claim spans to evidence IDs/source excerpts. — Proof: _round-trip tests_
- [ ] **CLM-003** Block or visibly flag unsupported factual claims before acceptance/export. — Proof: _negative E2E tests_
- [ ] **CLM-004** Implement user override with reason/audit record; never relabel an override as verified evidence. — Proof: _use-case tests_
- [ ] **CLM-005** Implement cover-letter drafting from context plan with length/tone/template controls. — Proof: _eval set + UI tests_
- [ ] **CLM-006** Implement job-specific application-answer drafting with sensitivity classification and answer-library reuse. — Proof: _eval set + E2E tests_
- [ ] **CLM-007** Implement selection-based revision, diff, accept/reject, and pin phrasing without overwriting user edits. — Proof: _editor tests_
- [ ] **CLM-008** Implement explanation for why evidence/requirement was included and what remained unknown. — Proof: _comprehension test_
- [ ] **CLM-009** Snapshot accepted generation into a document version while retaining trace/claim ledger. — Proof: _repository/E2E test_

## AI evaluation and safety

- [ ] **EVAL-001** Create licensed/synthetic frozen cases spanning career levels, gaps, role changes, remote work, and incomplete listings. — Proof: _fixture manifest_
- [ ] **EVAL-002** Define rubrics for factual support, requirement relevance, voice, specificity, privacy, and refusal. — Proof: _rubric review_
- [ ] **EVAL-003** Add adversarial listings containing instructions, encoded text, data-exfiltration attempts, and false user claims. — Proof: _red-team set_
- [ ] **EVAL-004** Establish model/provider baseline reports; never compare models only on prose preference. — Proof: _eval report_
- [ ] **EVAL-005** Gate prompt/model/template changes on no-regression thresholds and reviewer sampling. — Proof: _CI/eval job_
- [ ] **EVAL-006** Measure unsupported-claim rate before/after inspector and user correction rate. — Proof: _quality report_
- [ ] **EVAL-007** Test model unavailable, rate limit, partial stream, malformed output, context overflow, and cancellation recovery. — Proof: _fault matrix_

## Phase 4 quality

- [ ] **Q4-001** Validate AI-disabled, local, and first BYOK modes independently; unavailable mode cannot break document editing. — Proof: _mode matrix_
- [ ] **Q4-002** Confirm users understand which data leaves device and can cancel before transfer. — Proof: _usability report_
- [ ] **Q4-003** Confirm generated claims have evidence/flag/override state through edit, export, backup, and restore. — Proof: _integrity test_
- [ ] **Q4-004** Complete AI provider, prompt injection, secret, retention, and native-fetch security review. — Proof: _security report_
- [ ] **Q4-005** Run canonical journey: choose mode → preview context/destination → draft → catch unsupported claim → revise → accept version → export. — Proof: _recorded E2E artifact_
- [ ] **GATE-4** Phase 4 provides optional, provider-neutral, evidence-grounded drafting without weakening local/template-only operation. — Proof: _Phase 4 gate report_

---

# Phase 5 — Salary context and compliant discovery

## Salary intelligence

- [ ] **SAL-001** Implement disclosed-compensation parser for range/single value, hourly/annual, currency, interval, bonus/equity caveats, and raw source. — Proof: _property/golden tests_
- [ ] **SAL-002** Implement transparent annual/hourly normalization with configurable hours/weeks and no silent currency conversion. — Proof: _unit/property tests_
- [ ] **SAL-003** Implement title/skills → O*NET-SOC candidate mapping with user override and confidence. — Proof: _mapping eval_
- [ ] **SAL-004** Implement geography mapping with remote/multi-location/unknown handling. — Proof: _fixture tests_
- [ ] **SAL-005** Implement reviewed BLS public-data adapter with release date, geography/occupation granularity, caching, and attribution. — Proof: _policy/contract tests_
- [ ] **SAL-006** Implement reviewed O*NET and CareerOneStop adapters only for allowed data/endpoints. — Proof: _policy/contract tests_
- [ ] **SAL-007** Keep employer-specific observations separate from public market percentiles and label sample limitations. — Proof: _domain/UI tests_
- [ ] **SAL-008** Implement explainable negotiation band from disclosed range, public data, user floor/target, and caveats. — Proof: _formula tests + explanation snapshots_
- [ ] **SAL-009** Implement salary view with source links, release dates, units, confidence, and “why this range.” — Proof: _UI/a11y tests_
- [ ] **SAL-010** Test missing/stale/coarse/ambiguous data, extreme units, international currencies, and user overrides. — Proof: _edge-case report_

## Approved discovery/import

- [ ] **DSC-001** Validate user need and define Discover as saved connector results, not an uncontrolled crawler. — Proof: _research + decision_
- [ ] **DSC-002** Implement saved searches/preferences as local query objects independent of any provider. — Proof: _domain tests_
- [ ] **DSC-003** Implement one reviewed public job-source connector if it has current lawful terms, usable data, and acceptable cost/rate limits. — Proof: _source-policy record + contract tests_
- [ ] **DSC-004** Show source/attribution/freshness and require review before a result becomes a trusted job. — Proof: _E2E test_
- [ ] **DSC-005** Implement connector disable/kill behavior that preserves already imported user records. — Proof: _policy test_
- [ ] **DSC-006** Deduplicate discovery results against local jobs without silent merge. — Proof: _fixture tests_
- [ ] **DSC-007** **Optional** Evaluate additional Greenhouse/Lever board indexing only with explicit server/robots/terms/load policy. — Proof: _ADR/policy review_

## Insights

- [ ] **INS-001** Implement pipeline funnel and semantic-stage conversion with underlying-record drilldown. — Proof: _query/UI tests_
- [ ] **INS-002** Implement time-in-stage/response distributions with censored/unknown data handling. — Proof: _statistical tests_
- [ ] **INS-003** Implement source outcomes with sample size and no causal language. — Proof: _UI/content review_
- [ ] **INS-004** Implement application activity, salary, and cross-job evidence-gap reports. — Proof: _query/UI tests_
- [ ] **INS-005** Implement table equivalents, small-sample labels, optional goal hiding, and CSV export. — Proof: _a11y/E2E tests_
- [ ] **INS-006** Keep personal metrics local unless the user explicitly exports a research report. — Proof: _network/privacy test_

## Phase 5 quality

- [ ] **Q5-001** Validate salary explanations with varied occupations/geographies and a domain reviewer where feasible. — Proof: _review report_
- [ ] **Q5-002** Audit every Phase 5 source for license/terms/auth/rate/retention/attribution and last-review date. — Proof: _source registry audit_
- [ ] **Q5-003** Verify no connector failure blocks local jobs, documents, salary records already cached, or export. — Proof: _offline/fault tests_
- [ ] **Q5-004** Run canonical journey: map occupation/location → fetch public context → explain band → override mapping → preserve citations in notes/export. — Proof: _recorded E2E artifact_
- [ ] **GATE-5** Phase 5 supplies caveated salary context and any discovery capability through documented, disableable, compliant adapters. — Proof: _Phase 5 gate report_

---

# Phase 6 — Public-beta hardening and distribution

## Security and privacy

- [ ] **SEC-001** Update threat model for shipped surfaces, assets, data flows, and trust boundaries. — Proof: _reviewed threat model_
- [ ] **SEC-002** Verify production CSP, Trusted Types decision, sanitizer rules, dependency/remote-code inventory, and no `unsafe-eval`. — Proof: _header/build report_
- [ ] **SEC-003** Audit Tauri commands/capabilities, filesystem paths, URL opening, updater, secure storage, and native fetch allowlists. — Proof: _security audit_
- [ ] **SEC-004** Audit extension permissions/messages/outbox/content-script isolation and store disclosures. — Proof: _security audit_
- [ ] **SEC-005** Audit SQL, archive extraction, attachment names/types/sizes, document parser, and formula/CSV injection. — Proof: _security tests_
- [ ] **SEC-006** Audit AI/source egress, redirects, logs, diagnostics, keys, prompts, and deletion. — Proof: _privacy/security audit_
- [ ] **SEC-007** Run dependency, license, secret, static-analysis, and artifact malware/signature checks. — Proof: _CI/release reports_
- [ ] **SEC-008** Publish privacy notice, security policy, data-flow reference, supported-source policy, and vulnerability-reporting route. — Proof: _public docs_
- [ ] **SEC-009** Perform independent review or structured self-review against the threat model; triage all findings. — Proof: _finding log_

## Accessibility and usability

- [x] **A11Y-001** Pass automated axe suite for every core route/state/theme/density. — Proof: [59-case local and exact Chrome 151/152 application-shell matrix](../../proof/phase-1-accessibility-verification.md)
- [ ] **A11Y-002** Complete keyboard-only canonical journeys with visible focus and no traps. — Proof: _manual report_
- [ ] **A11Y-003** Complete NVDA + Chromium/Firefox and VoiceOver + Safari smoke matrix where available. — Proof: _manual report_
- [ ] **A11Y-004** Validate board/list semantics, announced moves, tables, dialogs, editor, toasts, errors, and charts. — Proof: _a11y report_
- [ ] **A11Y-005** Validate 200% zoom, text resize, high contrast, reduced motion, touch targets, and mobile orientation. — Proof: _visual/manual report_
- [ ] **A11Y-006** Resolve critical/serious findings and document remaining minor exceptions with owners. — Proof: _issue links_
- [ ] **USR-001** Repeat canonical usability study on implementation with at least five representative users. — Proof: _findings_
- [ ] **USR-002** Validate first-job activation, storage/backup comprehension, evidence coverage, and network preflight. — Proof: _metrics/report_
- [ ] **USR-003** Resolve release-blocking recurring usability problems and update decision register. — Proof: _changes + retest_

## Reliability, migrations, and performance

- [ ] **REL-001** Build representative small/medium/large vault fixtures with attachments and long history. — Proof: _fixture manifest_
- [ ] **REL-002** Test every migration from all supported beta schema versions in browser and desktop. — Proof: _migration matrix_
- [ ] **REL-003** Test backup/restore under interrupted write, corrupted archive, missing attachment, disk full/quota, and newer version. — Proof: _fault report_
- [ ] **REL-004** Run extension/app compatibility for current and previous capture contracts. — Proof: _matrix_
- [ ] **REL-005** Meet or explicitly revise startup, interaction, import, search, export, and memory budgets. — Proof: _benchmark report_
- [ ] **REL-006** Test offline-first install/update, stale service worker, cache corruption, and origin migration guidance. — Proof: _PWA report_
- [ ] **REL-007** Test desktop update/migration failure and rollback/recovery runbook. — Proof: _release rehearsal_
- [ ] **REL-008** Run 24-hour soak with repeated capture/import/edit/export and verify no data/hash drift. — Proof: _soak report_

## Documentation and support

- [ ] **DOCS-001** Write install/run guides for hosted PWA, desktop installer, repository clone, and extension. — Proof: _fresh-user test_
- [ ] **DOCS-002** Write Quick start, Guided setup, capture, tracking, evidence, documents, AI modes, salary, and Insights user guides. — Proof: _docs review_
- [ ] **DOCS-003** Write backup, restore, export, deletion, browser-origin, storage-limit, and disaster-recovery guides. — Proof: _recovery drill by another person_
- [ ] **DOCS-004** Write privacy/network/provider/connector explanations in plain language. — Proof: _comprehension review_
- [ ] **DOCS-005** Write developer architecture, data model, contracts, fixtures, testing, ADR, and release guides. — Proof: _clean-clone contributor test_
- [ ] **DOCS-006** Write troubleshooting and redacted-diagnostics instructions. — Proof: _support scenario test_
- [ ] **DOCS-007** Document known limitations, unsupported browsers/sources, and deferred capabilities. — Proof: _release docs_

## Distribution and beta operations

- [ ] **DEP-001** Complete trademark/domain/marketplace clearance for the selected Coredrill identity and update Q-001. — Proof: [`ADR-0002` records working-name selection; public clearance remains](../../adr/0002-adopt-coredrill-identity-and-apache-license.md)
- [ ] **DEP-002** Configure dedicated PWA origin, HTTPS, headers, WASM/Worker MIME, immutable assets, and service-worker scope. — Proof: _deployment audit_
- [ ] **DEP-003** Publish signed/checksummed desktop artifact for supported OS with SBOM and migration notes. — Proof: _release artifacts_
- [ ] **DEP-004** Publish/sideload extension with permission/privacy review and compatible app-version range. — Proof: _store/package artifact_
- [ ] **DEP-005** Create release signing, secrets, updater, rollback, incident, connector-kill, and origin-migration runbooks. — Proof: _rehearsal records_
- [ ] **DEP-006** Establish privacy-safe feedback/bug channel that does not request vault contents by default. — Proof: _published route/template_
- [ ] **DEP-007** Define beta cohort, support capacity, release stop conditions, and issue severity policy. — Proof: _beta plan_
- [ ] **DEP-008** Perform clean-machine installation and full canonical journey on each supported platform. — Proof: _release matrix_

## Public beta gate

- [ ] **BETA-001** User can reach first reviewed job without account/profile/AI. — Proof: _activation E2E/usability_
- [ ] **BETA-002** User can complete truthful template-only application and retrieve exact submitted artifacts. — Proof: _E2E_
- [ ] **BETA-003** AI-assisted application passes claim ledger, preflight, and privacy checks. — Proof: _E2E/eval_
- [ ] **BETA-004** Full archive restores in clean browser and desktop builds with verified hashes. — Proof: _recovery report_
- [ ] **BETA-005** Extension capture survives disconnect/crash/update and requests only reviewed permissions. — Proof: _fault/security report_
- [ ] **BETA-006** Critical/serious security, privacy, accessibility, migration, and data-loss issues are zero. — Proof: _release issue query_
- [ ] **BETA-007** Source registry is current; prohibited/unreviewed connectors are absent or disabled. — Proof: _audit_
- [ ] **BETA-008** Release docs and support runbooks pass a fresh-user rehearsal. — Proof: _rehearsal report_
- [ ] **GATE-6** Product owner signs the public-beta checklist after reviewing all proof and open questions. — Proof: _dated signed gate report_

---

# Phase 7 — Optional hosted sync and services

This phase is deliberately deferred. Re-open only after `GATE-6`, demonstrated multi-device demand, and a new scope/operations decision.

## Discovery and design gates

- [ ] **SYN-001** Document validated user need and minimum sync/service scope; reject feature-count justification. — Proof: _research report_
- [ ] **SYN-002** Integrate Authcore as an OIDC client without moving local vault access behind login. — Proof: _architecture/threat review_
- [ ] **SYN-003** Threat-model E2EE, device enrollment, key derivation/storage, recovery, revocation, account deletion, and metadata leakage. — Proof: _reviewed model_
- [ ] **SYN-004** Prototype conflicts for scalar edits, stage moves, timelines, evidence, documents, attachments, and deletion. — Proof: _conflict simulation_
- [ ] **SYN-005** Define encrypted protocol/event/schema versions and server-visible metadata. — Proof: _contracts + privacy review_
- [ ] **SYN-006** Define hosted AI retention, abuse, rate, billing, provider, deletion, and incident policies. — Proof: _operations design_
- [ ] **SYN-007** Define cost budgets, quotas, backup, monitoring, regional/data-residency, and shutdown/export plan. — Proof: _operating model_
- [ ] **SYN-008** Accept or reject optional service milestone through a new ADR and goal revision. — Proof: _decision_

## Optional implementation

- [ ] **SYN-010** Implement opt-in device enrollment and local generation/storage of sync keys. — Proof: _security/E2E tests_
- [ ] **SYN-011** Implement encrypted change/attachment transport with idempotency and replay protection. — Proof: _protocol tests_
- [ ] **SYN-012** Implement offline queue, deterministic conflict handling, user conflict UI, and device revocation. — Proof: _multi-device tests_
- [ ] **SYN-013** Implement minimal encrypted server storage, routing metadata, quotas, backups, deletion, and audit. — Proof: _service tests/audit_
- [ ] **SYN-014** Implement recovery flow that explains precisely what can/cannot be recovered; no developer backdoor to content. — Proof: _recovery ceremony test_
- [ ] **SYN-015** Implement hosted AI adapter as separately consented, metered, observable, and deletable. — Proof: _privacy/billing/E2E tests_
- [ ] **SYN-016** Preserve complete local/offline/export function during service outage or account closure. — Proof: _chaos/offboarding test_
- [ ] **SYN-017** Complete external security/privacy review before public availability. — Proof: _audit + remediation_
- [ ] **GATE-7** Optional service meets its own security, privacy, reliability, cost, and local-independence gates. — Proof: _Phase 7 gate report_

---

# Cross-cutting ledgers

## Open blockers

| Date | Item | Blocker | Checks attempted | Owner/next action | Status |
|---|---|---|---|---|---|
| 2026-08-21 | `FND-001` | `Q-013` left the public license unresolved, and no durable private conduct/security reporting address was supplied. | Reviewed the goal, decision register, and every governance path; installed a restrictive temporary notice and kept external contributions closed. | Superseded by the 2026-08-24 follow-up below. | Superseded |
| 2026-08-21 | `FND-006` | No GitHub remote existed, so the required green workflow URL could not be produced locally. | Configured commit-pinned jobs, ran the full local equivalent, and verified a frozen isolated-clone install/build. | Superseded by the 2026-08-24 follow-up below. | Superseded |
| 2026-08-24 | `FND-001` | Apache-2.0 and the Coredrill identity are proven, but no durable private conduct or vulnerability-reporting route is published. | Added `ADR-0002`, `D-054`, `D-055`, canonical license text, package metadata checks, governance wording, full local proof, and a public Security-page inspection. | Owner: publish repository-specific private conduct and vulnerability routes before external contribution intake/public distribution. | Open |
| 2026-08-24 | `FND-006` | The remote was attached, but no green hosted Foundation CI URL had been recorded. | Integrated both histories at `f8d9a18`; [Foundation CI run #1](https://github.com/seabAu/Coredrill/actions/runs/32694914029) completed successfully, including the full-history secret scan. | None; retain the URL as proof and keep future `main` runs green. | Resolved |
| 2026-08-24 | `UXR-004` through `UXR-008` | The remaining Phase 0 UX gate requires at least five representative human sessions, including keyboard-heavy and nontechnical participants; Codex cannot manufacture participant evidence. | Built and browser-tested the disposable desktop/mobile prototypes, synthetic vault, ten-task moderated script, observation rubric, privacy rule, and stop/synthesis criteria. | Owner: recruit the required participants or authorize access to an appropriate research cohort; then run/anonymize the study and return findings for synthesis and decision updates. | Open |
| 2026-08-30 | `Q1-001` | The accepted performance claim requires `HW-WIN-REF` (Intel Core i5-12400, 8 GiB) on Windows 11 25H2, but that target remains planned and is not available to this workspace. | Added a fail-closed production-build harness; the clean `1004ccd` Edge 152 diagnostic on `HW-LOCAL-DIAG` recorded 20 startup and 50 query/board/table samples with zero failures and p95 values below the design thresholds. Hosted and local nonconformant runners were not relabeled as reference hardware. | Owner: provision the exact reference target and run `pnpm test:performance` with conformant bindings, or explicitly approve a documented adjustment only after reviewing a retained failure artifact. | Open |
| 2026-08-30 | `Q1-003` | The accepted manual accessibility matrix requires NVDA 2026.1.1 on `HW-WIN-REF`, VoiceOver/Safari on `HW-MAC-REF`, iOS VoiceOver on `HW-IOS-REF`, and version-recorded TalkBack on `HW-ANDROID-REF`; none is available to this workspace. Screen magnification and 200% browser text-resize review also require a retained manual result. | Audited the reference matrix and installed tools; NVDA is absent, `HW-WIN-REF` remains planned, and the macOS, iOS, and Android reference targets are recorded unavailable. Existing exact-Chrome axe, keyboard, forced-colors, reduced-motion, and 320-pixel evidence can be expanded and retained, but automation is not represented as conformance. | Owner: provision the recorded targets and execute the manual scripts with exact browser/AT versions; Codex continues the available automated matrix and then the independent `Q1-004` review. | Open |
| 2026-08-30 | `GATE-1` | The canonical browser/Windows journey and recovery proof pass, but required child items `Q1-001` and `Q1-003` remain open on unavailable reference hardware and manual assistive-technology targets. | Completed `Q1-005` with one shared production-command runner, exact browser request recording, real Windows native-process execution, clean delete/restore, and an identical cross-adapter logical content hash. Re-reviewed every Phase 1 quality checkbox without treating diagnostic or automated evidence as the missing conformance proof. | Owner: complete the exact `Q1-001` and `Q1-003` actions above. Continue with independent unblocked implementation slices without marking Phase 1 or `GATE-1` complete. | Open |

## Accepted scope changes

| Date | ADR | Checklist IDs added/changed | Goal/design documents updated | Summary |
|---|---|---|---|---|
| 2026-08-24 | [`ADR-0002`](../../adr/0002-adopt-coredrill-identity-and-apache-license.md) | `FND-001`, `FND-006`, `DEP-001`; `Q-001`/`Q-013` narrowed | `README.md`, decision register, design-kit identity/path, package scope, governance/proof records | Adopt Coredrill and Apache-2.0 without changing product architecture; retain public-name clearance, business-model, and private-reporting gates. |
| 2026-08-24 | [`ADR-0004`](../../adr/0004-adopt-tauri-rusqlite-native-boundary.md) | `NAT-001` through `NAT-008`; D-022 accepted, D-024 retained, Q-003 resolved | Decision register, runtime architecture, technology stack, security/testing, application-boundary, and proof records | Accept the narrow Tauri 2/`rusqlite` native boundary for Windows/macOS; keep Linux native diagnostic with the local browser app and portable export as its supported fallback. |

## Proof index

Keep proof close to each checkbox. For large milestone reports, also index them here.

| Gate | Commit/tag | Test/report/artifact links | Reviewed by/date |
|---|---|---|---|
| `GATE-0` | `0a1c8bd` | [Foundation](../../proof/foundation-verification.md), [dependency/reference baselines](../../proof/foundation-baselines-verification.md), [identity/license/hosting follow-up](../../proof/identity-license-hosting-verification.md), [cross-platform native decision/proof](../../proof/native-cross-platform-verification.md), and [hosted Foundation CI](https://github.com/seabAu/Coredrill/actions/runs/32746186411) | Automated local and hosted gates / 2026-08-24 |
| `GATE-1` | — | — | — |
| `GATE-2` | — | — | — |
| `GATE-3` | — | — | — |
| `GATE-4` | — | — | — |
| `GATE-5` | — | — | — |
| `GATE-6` | — | — | — |
| `GATE-7` | — | — | — |

## Release decision checklist

Before any tagged release, answer in its release notes:

- [ ] Which schema, archive, capture, prompt, and sync contract versions are included?
- [ ] Which migrations run, and has restore been tested from every supported prior version?
- [ ] Which browsers/OSs and extension versions are supported by evidence?
- [ ] Did permissions, CSP, dependencies, licenses, secrets, and artifacts pass review?
- [ ] Did offline/template-only operation regress?
- [ ] Did any provider/source terms, retention, attribution, credentials, or endpoints change?
- [ ] Did any AI prompt/model/template change pass its evaluation gate?
- [ ] Are user-visible network/data-flow disclosures still accurate?
- [ ] Can users export, restore, and delete data without the hosted service?
- [ ] Are known limitations and rollback/recovery instructions published?

## First Codex work request

Use this when implementation begins:

> Start Phase 0 with `FND-001` through `FND-008`. Read `AGENTS.md`, `GOAL.md`, `10-technology-stack.md`, `11-decision-register.md`, and the relevant architecture/security documents before editing. Create only the repository/governance/build skeleton; do not implement product features. Run clean-install, typecheck, lint, and test proof. Update Current work and each completed checkbox with concrete evidence. If a selected tool has a material incompatibility, record an ADR proposal rather than silently substituting it.
