# 11 — Decision register

This is the authority for **what has been decided, why, and what would justify revisiting it**. Implementation does not silently replace an accepted decision.

## Status vocabulary

- **Accepted:** current design baseline; implementation may proceed.
- **Provisional:** preferred choice pending a named spike or user test.
- **Deferred:** decision intentionally postponed; baseline must not depend on it.
- **Rejected:** evaluated and excluded from the baseline.
- **Superseded:** preserved for history and linked to its replacement.

## Change procedure

For a material change, add an ADR under `docs/adr/` using:

```text
Title / status / date
Problem and evidence
Constraints
Options considered
Decision and rationale
Consequences and migration
Security/privacy/source-policy impact
Documents, contracts, checklist IDs, and tests to update
Revisit trigger
```

The ADR, affected design docs, and checklist change in the same commit. A new dependency or implementation convenience is not by itself evidence to change a product decision.

## Product and scope

### D-001 — Standalone product

- **Status:** Accepted
- **Decision:** Coredrill is its own application. COMPOSR may share versioned prompt/model contracts later but is not its container or runtime dependency.
- **Why:** The product owns durable state, repeated workflows, specialized security/privacy rules, and multiple distribution modes.
- **Alternatives:** COMPOSR tool; Mindspace module; portfolio feature.
- **Revisit when:** Only if the standalone workflows fail to establish independent value after prototype testing.

### D-002 — Local-first, accountless baseline

- **Status:** Accepted
- **Decision:** Hosted PWA and desktop modes operate without an account or hosted database.
- **Why:** Satisfies privacy, zero-cost operation, offline use, downloadable-kit goal, and graceful independence from the developer's server.
- **Consequences:** Device/origin vaults are distinct before sync; backup education is mandatory.
- **Revisit when:** Never for the baseline promise. Accounts may be added only for opt-in services.

### D-003 — User-controlled assistance, not autonomous applying

- **Status:** Accepted
- **Decision:** V1 captures, analyzes, drafts, and tracks. It does not auto-submit, bulk apply, or send outreach.
- **Why:** Quality, truthfulness, platform terms, sensitive questions, and user agency.
- **Revisit when:** A narrowly scoped autofill proposal has a threat model, field-level preview, fixtures, explicit permissions, and no submit capability.

### D-004 — First-release scope hierarchy

- **Status:** Accepted
- **Decision:** Reliable local vault + tracking + capture/review comes before document AI; document AI before discovery/sync.
- **Why:** Later features depend on trusted data and recovery.
- **Revisit when:** Dependency evidence changes; not for demo appeal alone.

## Experience

### D-010 — Six-item primary navigation

- **Status:** Provisional
- **Decision:** Home, Pipeline, Documents, Career Profile, Network, Insights; Settings at shell bottom. Inbox/Board/Table/Discover live inside Pipeline. Applications are not a duplicate top-level area.
- **Why:** Competitive review showed broad feature sets become clearer when the pipeline stays the command center; user mental model is an opportunity moving through stages.
- **Alternatives:** Original ten-item navigation; tracker-only single screen; separate Jobs and Applications.
- **Gate:** Low-fidelity tests must show users can find capture review, submitted artifacts, and contacts.
- **Revisit when:** ≥2 of 5 representative users repeatedly mislocate the same major area after terminology refinement.

### D-011 — Board-first with table parity

- **Status:** Accepted
- **Decision:** Pipeline defaults to a visual board for orientation; a dense table is a first-class peer over the same records.
- **Why:** Huntr/Teal validate board comprehension; table is needed for comparison, filtering, and bulk review.
- **Revisit when:** User research shows a different default, but both views remain unless usage proves one unnecessary.

### D-012 — Contextual job workspace

- **Status:** Provisional
- **Decision:** Wide screens open a resizable side workspace while preserving pipeline context; small/deep-linked screens use a full route.
- **Why:** Adapts side-peek/command-center patterns without trapping content in a modal.
- **Gate:** Back, refresh, screen-reader, and mobile prototypes.
- **Revisit when:** Complexity or accessibility cost outweighs reduced navigation.

### D-013 — Evidence coverage, not ATS score

- **Status:** Accepted
- **Decision:** Present Strength/Partial/Gap/Unknown by requirement plus separate literal-term and parseability checks. Do not predict hiring chance or call a composite an employer ATS score.
- **Why:** These are different measurable questions; a single score creates false certainty and encourages dishonest keyword insertion.
- **Revisit when:** Terminology may change after comprehension tests; the explainability rule does not.

### D-014 — Calm, non-gamified design language

- **Status:** Accepted
- **Decision:** Neutral professional workspace, restrained accent, semantic status, no streaks/shame/AI spectacle.
- **Why:** Job search is stressful; attention and trust matter more than engagement loops.
- **Revisit when:** Visual tokens can evolve after brand work while preserving content/interaction rules.

### D-015 — Quick-start and guided onboarding

- **Status:** Provisional
- **Decision:** Users may create a vault and add one job immediately; full profile/AI/extension setup is a separate guided path.
- **Why:** Demonstrates value before asking for extensive personal data.
- **Gate:** First-run usability tests and storage-comprehension check.

## Architecture and stack

### D-020 — TypeScript-first implementation

- **Status:** Accepted
- **Decision:** TypeScript owns shared domain/application/UI/extension/extraction code; SQL owns schema; Rust is a thin native boundary.
- **Why:** Maximum reuse across browser, desktop, and extension with a strong typed contract.
- **Revisit when:** A measured hotspot or capability cannot be met safely within the boundary.

### D-021 — React + Vite shared frontend

- **Status:** Accepted
- **Decision:** Use React/Vite rather than a server-first web framework.
- **Why:** Static/offline PWA, Tauri reuse, existing ecosystem familiarity, and no required v1 server rendering.
- **Revisit when:** A public SEO/discovery site is built; that site can be separate without replacing the app shell.

### D-022 — Tauri 2 desktop shell

- **Status:** Accepted
- **Decision:** Tauri 2 packages the shared frontend on evidence-backed native targets and exposes only the reviewed SQLite, secure-store, and recovery capabilities. The local browser app plus portable export is the supported fallback where the native shell has an unresolved platform dependency risk.
- **Why:** Small system-webview distribution and Rust capability boundary.
- **Gate:** Architecture acceptance requires shared SQLite contracts, exact command permissions, path confinement, secure-store lifecycles, recovery, installable package evidence, and cross-platform dependency review. Public distribution separately requires signing/notarization, updater/provenance, clean-machine checks, and the release performance matrix.
- **Fallback:** Electron only if a documented blocking WebView/packaging issue cannot be isolated; a local web kit remains another fallback.
- **Phase 0 evidence (2026-08-24):** `NAT-001` through `NAT-008` pass the shared migration/transaction suite through `rusqlite`, confine canonical database and content-addressed-attachment roots under Tauri's platform app-data resolver, prove picker-owned checksummed recovery with atomic replacement and rollback, and package the same boundary for Windows NSIS, macOS app, and Linux AppImage. Exact Windows Credential Manager, macOS Keychain, and Linux Secret Service providers pass redacted store/status/delete lifecycles with no secret-read IPC or plaintext fallback. Windows and macOS are accepted native architecture targets; Linux native remains diagnostic because the compiled GTK3 path retains an unresolved RustSec unsoundness warning and unmaintained dependencies. See [ADR-0004](../../adr/0004-adopt-tauri-rusqlite-native-boundary.md) and [cross-platform native verification](../../proof/native-cross-platform-verification.md).

### D-023 — WXT extension

- **Status:** Accepted
- **Decision:** WXT `0.21.4` builds the Manifest V3 targets. Chromium uses a side panel as its primary surface and exact-origin pull/ack transfer; Firefox uses a sidebar and checksummed manual export/import; both retain the popup fallback and exact inspected store packages.
- **Why:** Entry-point/manifest tooling and shared TypeScript/React support.
- **Gate:** Revisit only if a supported browser/store requirement cannot preserve the exact permission, CSP, transfer, or reproducible-package boundary, or measured accessibility/usability evidence rejects the primary/fallback surface split.
- **Fallback:** Browser-specific hand-authored manifests around the same capture packages.
- **Phase 0 evidence (2026-08-24):** `EXT-001` through `EXT-008` prove exact Chromium/Firefox WXT `0.21.4` MV3 side-panel/sidebar and popup builds, user-action capture, bounded checksummed outbox, durable SQLite-before-ack transfer, attempt-2 idempotent retry, Firefox checksummed JSON fallback, and hostile sender/message/oversize/wrong-origin-or-ID/expiry/replay rejection. Both unpacked builds and byte-identical store ZIPs pass exact manifest/file/CSP, remote-code, and secret inspection. The 45-file Firefox source-review ZIP rebuilds the exact production directory, store ZIP, and source ZIP from a frozen lockfile. Clean-commit [Foundation CI run 32764058550](https://github.com/seabAu/Coredrill/actions/runs/32764058550) passed every required job, and the downloaded artifact matched all local package hashes. Chromium has one reserved Phase 0 HTTPS external origin; Firefox has none and declares no data collection. The dependency gate rejected WXT `0.20.27` rather than suppressing its obsolete vulnerable runner subtree. See [ADR-0005](../../adr/0005-adopt-wxt-multisurface-extension-baseline.md), [capture/outbox verification](../../proof/extension-capture-outbox-verification.md), [transfer/fallback/security verification](../../proof/extension-transfer-fallback-security-verification.md), and [production-package verification](../../proof/extension-production-package-verification.md).

### D-024 — SQLite in every full app mode

- **Status:** Accepted
- **Decision:** Browser uses official SQLite WASM/OPFS; desktop uses native SQLite; repositories and migrations are shared.
- **Why:** Relational integrity, transactions, FTS/reporting, portable local data, and one domain model.
- **Revisit when:** Phase 0 proves an unsupported target cannot satisfy durability/recovery. That mode may be dropped or use an adapter without changing canonical semantics.
- **Phase 0 evidence (2026-08-24):** The browser adapter passes the accepted OPFS lifecycle matrix, while the native adapter passes the same migration/repository contracts and uses target-confined SQLite. Linux retains the browser full-app mode while its native shell is diagnostic, so canonical SQLite semantics remain unchanged; see [ADR-0004](../../adr/0004-adopt-tauri-rusqlite-native-boundary.md).

### D-025 — Browser `opfs-sahpool` single-writer baseline

- **Status:** Accepted
- **Decision:** Use official SQLite WASM in a dedicated Worker with `opfs-sahpool` and an origin-wide exclusive Web Lock. Support current/previous Chromium-family and Firefox desktop generations that pass the real lifecycle lanes; block unsupported Safari/mobile or missing-capability browsers with a supported-browser/future-native and portable-export fallback. Label storage `durable` only after a persistence grant and otherwise report honest best-effort/degraded diagnostics.
- **Why:** The failure, contention, crash/reload, export/restore, and deterministic benchmark matrix passed locally, and exact Chrome 152/151 plus branded Firefox 154/153 lifecycle lanes passed in [Foundation CI run 32712600336](https://github.com/seabAu/Coredrill/actions/runs/32712600336). SQLite documents broad support, high performance, and no COOP/COEP requirement, with the known single-connection trade-off; real Safari/mobile runners remain unavailable and are not simulated.
- **Phase 1 recovery-health evidence (2026-08-29):** `BKP-005` keeps
  persistence and quota observation passive, exposes `persist()` only through
  an explicit user action, and stores the optional 30-day export reminder in
  canonical SQLite with seven-day snooze and durable disable/enable controls.
  Granted, denied, error, unsupported, low/unknown quota, and
  expected-database-missing states remain separate and path-free. Exact Chrome
  152/151 and branded Firefox 154/153 lanes pass in [Foundation CI run
  33285567150](https://github.com/seabAu/Coredrill/actions/runs/33285567150);
  see [browser recovery-health verification](../../proof/phase-1-browser-vault-recovery-health-verification.md).
- **Revisit when:** Real Safari/macOS or mobile rows pass; multi-tab editing becomes a validated requirement; Web Locks/`opfs-sahpool` compatibility changes; or another VFS proves materially better without weakening offline deployment, portability, recovery, or support.

### D-026 — No full ORM

- **Status:** Accepted
- **Decision:** Reviewed SQL migrations and repository queries with bound parameters; minimal helpers permitted.
- **Why:** Preserve cross-adapter behavior and visibility into migrations/query features.
- **Revisit when:** Repetition causes measured defects and a candidate demonstrably preserves shared SQL/SQLite features.

### D-027 — Tiptap open-source core for structured editing

- **Status:** Accepted
- **Decision:** Use Tiptap open-source core 3.30.2 behind Coredrill's restricted schema and version-1 canonical document IR; use locally owned Mammoth/PDF.js/text proposal importers, `docx` 9.7.1 for controlled DOCX output, and semantic browser/Tauri print HTML/CSS for tagged PDF output.
- **Why:** Real-browser proof passes deterministic round-trip, hostile-paste sanitation, keyboard semantics, source-mapped local imports, scanned-PDF handling, a 2,100-block synthetic 100-page workload, tagged PDF structure, controlled DOCX packaging, and one-page visual parity for the final exports. Exact-pinned dependencies pass the repository advisory/license gates without any hosted editor, conversion, AI, or collaboration requirement.
- **Revisit when:** The schema expands materially; representative assistive-technology/user testing or the supported Word/PDF matrix exposes a blocking issue; a dependency adds unacceptable security, license, cloud, or maintenance risk; or another editor proves materially better behind the same versioned IR.
- **Fallback:** Lexical or a simpler Markdown/textarea editor behind the same canonical IR if an accepted-boundary regression cannot be isolated.
- **Phase 0 evidence (2026-08-24):** See [ADR-0006](../../adr/0006-adopt-tiptap-local-document-baseline.md), [document editor/export verification](../../proof/document-editor-export-verification.md), the [browser spike report](../../evidence/document-editor-spike-report.md), and the [accessibility smoke report](../../evidence/document-editor-accessibility-smoke.md).

### D-028 — Python is optional, not baseline

- **Status:** Accepted
- **Decision:** Python appears only behind a versioned optional worker after a benchmark-backed ADR.
- **Why:** Live DOM capture and shared contracts favor TypeScript; Python helps only specific NLP/document/batch workloads.
- **Revisit when:** OCR, parsing, or local-model requirements demonstrate a concrete quality/performance/package advantage.

## Data, capture, and sources

### D-030 — Field-level provenance

- **Status:** Accepted
- **Decision:** Every extracted candidate records source, excerpt/path, method, extractor version, time, and confidence; user confirmation is durable.
- **Why:** Trust, correction, debugging, source change, and AI evidence.
- **Revisit when:** Never remove; storage representation may evolve through migration.

### D-031 — Layered deterministic extraction

- **Status:** Accepted
- **Decision:** Structured data/API → source-specific deterministic adapter → generic DOM/readability → heuristic/LLM proposal → manual review.
- **Why:** Accuracy, reproducibility, policy control, and testability.
- **Revisit when:** Ordering may vary for a reviewed connector based on measured accuracy.

### D-032 — User-invoked extension and bounded outbox

- **Status:** Accepted
- **Decision:** `activeTab` capture only after user action; extension retains a small retryable outbox, not the full vault.
- **Why:** Least privilege, resilience, and smaller breach surface.
- **Revisit when:** A specific optional host permission has a clear feature, review, and disable path.

### D-033 — Approved sources only

- **Status:** Accepted
- **Decision:** Baseline sources are user-provided content, Schema.org JobPosting, reviewed Greenhouse/Lever/USAJOBS interfaces, and approved public labor datasets. Each network connector has a policy record/kill switch.
- **Why:** Compliance and maintainability are architecture concerns.
- **Revisit when:** A source's current terms/API/license are reviewed and documented.

### D-034 — No LinkedIn/Glassdoor scraping foundation

- **Status:** Accepted
- **Decision:** Do not build the product on automated scraping of LinkedIn or Glassdoor. User paste/manual capture remains available where lawful.
- **Why:** Their official terms/restrictions conflict with the proposed automated behavior and create unacceptable product dependency.
- **Revisit when:** Only a documented official/licensed integration changes the situation.

## AI and documents

### D-040 — AI optional and provider-neutral

- **Status:** Accepted
- **Decision:** Template-only mode is complete; local, direct BYOK, and future hosted adapters sit behind `AiPort`.
- **Why:** Zero-cost baseline, user choice, testability, and reduced lock-in.
- **Revisit when:** Adapters may change; the AI-disabled path remains.

### D-041 — Evidence-first generation and claim ledger

- **Status:** Accepted
- **Decision:** Context is assembled from selected evidence; generated factual claims link to evidence, are style-only, or require explicit review/override.
- **Why:** Prevent fabrication and make editing auditable.
- **Revisit when:** Never weaken silently; improve validation through evaluations.

### D-042 — Versioned documents and submitted snapshots

- **Status:** Accepted
- **Decision:** Regeneration creates a version/diff, user edits are preserved, and Applied stores the exact artifacts submitted.
- **Why:** Reproducibility and interview preparation.
- **Revisit when:** Storage/UX details may evolve; submitted artifact identity remains immutable.

## Security, privacy, sync, and operations

### D-050 — Local does not imply automatically encrypted

- **Status:** Accepted
- **Decision:** Explain actual storage/protection. Desktop secrets use OS secure storage; vault encryption is implemented only with a reviewed key/recovery design.
- **Why:** Avoid false privacy promises and unrecoverable data loss.
- **Revisit when:** Encryption spike establishes browser/desktop threat model, UX, key derivation, backup, and recovery.
- **Phase 0 evidence (2026-08-24):** `NAT-005` and `NAT-008` implement store/status/delete through exact target-confined Windows Credential Manager, macOS Keychain, and Linux Secret Service providers with no plaintext fallback, no secret-read IPC, stable redacted errors, owned-buffer zeroization, and one-time synthetic lifecycle proofs. Linux native support remains diagnostic because of the shell dependency risk, not because secret storage falls back to plaintext; see [secure-storage verification](../../proof/native-secure-storage-verification.md) and [cross-platform native verification](../../proof/native-cross-platform-verification.md).

### D-051 — Portable archive is a core feature

- **Status:** Accepted
- **Decision:** Versioned archive with database/data, attachments, manifest, checksums, and schema version; human-readable JSON/CSV export also exists.
- **Why:** Ownership, recovery, migration, and eventual sync independence.
- **Revisit when:** Format versions evolve compatibly.
- **Phase 0 evidence (2026-08-24):** `NAT-006` proves a versioned checksummed database-only recovery artifact through a Rust-owned native picker, including atomic replacement and rollback. It is intentionally not labeled the D-051 portable archive because attachments, manifest assembly, encryption metadata where applicable, and JSON/CSV exports remain BKP-001 and later delivery work; see [native archive verification](../../proof/native-archive-verification.md).
- **Phase 1 desktop backup evidence (2026-08-29):** `BKP-004` adds a
  pickerless, path-free Tauri checkpoint that creates a consistent SQLite
  online snapshot in managed app data, atomically publishes and rereads the
  existing checksummed database-recovery envelope, verifies integrity and
  schema before rotation, and never deletes the last known-good backup. Failed
  publish/verification preserves prior backups and the active vault; failed
  cleanup retains extra verified backups with an honest pending state. This is
  deliberately database-only and does not replace the full D-051 portable ZIP;
  see [desktop automatic backup version 1](desktop-automatic-backup-v1.md) and
  [desktop automatic backup verification](../../proof/phase-1-desktop-automatic-backup-verification.md).
- **Phase 1 writer evidence (2026-08-29):** `BKP-001` implements one shared
  TypeScript ZIP writer with fixed metadata/order, validated version-1 manifest,
  database and caller-supplied data projections, content-addressed attachment
  bytes, per-entry/whole-archive SHA-256, and explicit encryption mode `none`.
  The committed 3,533-byte golden archive reproduces exactly in Node and the
  browser bundle; missing/corrupt/unsafe/oversized inputs fail without a
  successful partial result. `BKP-002` still owns production JSON/CSV projection
  generation and `BKP-003` owns restore dry-run/commit; see [portable archive
  writer verification](../../proof/phase-1-portable-archive-writer-verification.md).
- **Phase 1 human-readable evidence (2026-08-29):** `BKP-002` projects all 29
  Phase 1 canonical user-data tables into 58 paired, deterministic JSON/CSV
  files from one schema-92 transaction. The strict version-1 JSON contract,
  canonical nested JSON, stable ordering, provenance and relationship fields,
  null/empty distinction, Unicode and RFC 4180 escaping, CSV formula hardening,
  limits, and fail-closed schema/query/value paths pass shared Node and real
  browser SQLite evidence. The SQLite database remains the lossless restore
  source; runtime, migration, derived-search, and diagnostic tables are
  explicitly excluded from the inspectable projections. See [portable data
  export version 1](portable-data-export-v1.md) and [human-readable export
  verification](../../proof/phase-1-human-readable-data-export-verification.md).
- **Phase 1 restore evidence (2026-08-29):** `BKP-003` implements a bounded,
  fail-closed version-1 ZIP reader; validates the exact manifest inventory and
  every checksum before temporary SQLite inspection; previews explicit
  empty/identical/same-vault/different-vault conflicts without mutation; and
  binds atomic commit to the exact database-and-attachment target snapshot.
  Corruption, unsupported versions/schema, vault mismatch, stale preview,
  replay, and injected commit failure preserve the old target. See [portable
  archive restore version 1](portable-archive-restore-v1.md) and [restore
  verification](../../proof/phase-1-portable-archive-restore-verification.md).

### D-052 — Future sync is opt-in and encrypted

- **Status:** Deferred
- **Decision:** Design IDs/events for future sync but do not deploy sync in v1. Future server stores encrypted content plus minimal routing metadata.
- **Why:** Sync multiplies identity, conflict, key recovery, privacy, and operations risk.
- **Prerequisites:** Stable local schema/export, multi-device conflict prototype, Authcore integration review, E2EE/key-recovery threat model, cost/abuse plan.

### D-053 — Telemetry default off

- **Status:** Accepted
- **Decision:** Privacy-safe local diagnostics first; any product telemetry is separate, opt-in, documented, and content-free.
- **Why:** Career data is sensitive and baseline must not require network activity.
- **Revisit when:** Public beta support needs are demonstrated and an event-level privacy review is complete.

### D-054 — Coredrill product and repository identity

- **Status:** Accepted
- **Decision:** Use Coredrill as the working product, repository, root-package, documentation, and internal package-scope identity. Preserve established `JW-*` governance and test-record IDs as stable historical identifiers.
- **Why:** The owner selected Coredrill and created the `seabAu/Coredrill` repository; one consistent identity avoids split paths and package namespaces while stable record IDs preserve traceability.
- **Revisit when:** Trademark, domain, marketplace, or public-identity clearance produces a material conflict before a public listing.

### D-055 — Apache-2.0 software license

- **Status:** Accepted
- **Decision:** License the Coredrill repository under Apache License 2.0. Keep the sustainability/business-model decision separate and preserve the free local core and complete export path.
- **Why:** The owner selected a permissive, established license with explicit patent terms; resolving source permissions does not require prematurely choosing a commercial model.
- **Revisit when:** Legal review identifies a concrete incompatibility or a future distribution includes material with different license obligations that must be isolated and documented.

## Resolved questions

| ID    | Question              | Resolution                                                                                                                                                                                                                                                                                     | Resolved   |
| ----- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q-002 | Browser support floor | [ADR-0003](../../adr/0003-adopt-browser-storage-support-floor.md) accepts current/previous Chromium-family and Firefox desktop after exact hosted lifecycle proof, with Safari/mobile and missing-capability browsers explicitly unsupported until their real rows pass; portable export is the fallback. | 2026-08-24 |
| Q-003 | Native SQLite adapter  | [ADR-0004](../../adr/0004-adopt-tauri-rusqlite-native-boundary.md) accepts the narrow first-party `rusqlite` command layer after shared-contract, confinement, recovery, secure-store, package, and cross-platform dependency proof. The official Tauri SQL plugin is not selected. Linux native remains diagnostic; the local browser app plus portable export is its supported fallback. | 2026-08-24 |
| Q-004 | Tiptap suitability | [ADR-0006](../../adr/0006-adopt-tiptap-local-document-baseline.md) accepts restricted Tiptap 3.30.2 behind canonical document IR 1 after round-trip, sanitation, stress, local import/export, rendered pagination, keyboard semantics, advisory, and license proof. | 2026-08-24 |
| Q-005 | Side panel vs popup fallback | [ADR-0005](../../adr/0005-adopt-wxt-multisurface-extension-baseline.md) accepts Chromium side panel and Firefox sidebar as the primary surfaces, retains a popup fallback on both targets, and keeps checksummed manual export/import as Firefox's supported transfer fallback after exact package and real-browser proof. | 2026-08-24 |

## Open questions and required evidence

| ID | Question | Needed evidence | Deadline/gate |
|---|---|---|---|
| Q-001 | Coredrill public-identity clearance | Trademark, domain, and marketplace checks for the selected working name; repository availability is proven | Before public landing/store listing |
| Q-006 | Exact default pipeline stages | Five-user terminology/usability test | Before Phase 1 UI lock |
| Q-007 | Browser vault lock/encryption | Threat model and recovery design | Before claiming encrypted browser vault |
| Q-008 | Local model support floor | Evaluation on realistic consumer hardware | Phase 4 |
| Q-009 | Direct BYOK in hosted PWA | Provider CORS, secret storage, disclosure, and abuse/security review | Phase 4 |
| Q-010 | Public discovery connectors | User demand, terms/license, rate limits, operating cost | Phase 5 |
| Q-011 | Map/calendar | Usability demand and privacy/provider cost | After beta |
| Q-012 | Optional sync | Stable local product, Authcore client, E2EE/conflict/key recovery | Phase 7 |
| Q-013 | Sustainability/business model | Sustainability plan that preserves the Apache-2.0 free local core and complete export | Before 1.0 |

## Rejected-pattern log

The following require a new decision, not opportunistic implementation:

- account wall before local use;
- cloud database as the only source of truth;
- background crawling or browser-history collection;
- auto-submit or bulk application;
- third-party contact enrichment without license/provenance;
- generated or guessed email addresses presented as facts;
- opaque ATS/hiring-probability score;
- silent AI prompt/model/provider changes for stored templates;
- remote fonts/assets/analytics in the core offline shell;
- destructive migration without tested export/restore;
- sync before conflict and key-recovery design;
- Python service required to run the baseline PWA.
