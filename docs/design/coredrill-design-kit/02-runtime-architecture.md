# 02 — Runtime architecture and code organization

## Logical architecture

```text
React UI / application services
          |
     domain ports
  +-------+---------+------------+-------------+-------------+
  |                 |            |             |             |
StoragePort    ExtractionPort  AiPort     LaborDataPort  SyncPort(later)
  |                 |            |             |
  +-- Browser SQLite|            +-- none/local/BYOK/hosted
  +-- Native SQLite +-- TS DOM/API adapters   +-- BLS/O*NET/etc.
                     +-- optional Python worker

Browser extension -> versioned CaptureEnvelope -> Inbox ingestion
```

The domain layer cannot import Tauri, browser extension APIs, Better Auth, an AI-provider SDK, or a source-specific scraper.

## Monorepo

```text
coredrill/
  README.md
  AGENTS.md
  SECURITY.md
  LICENSE
  package.json
  pnpm-workspace.yaml
  turbo.json
  docs/
    adr/
    sources/
    privacy/
    runbooks/
    evals/
  apps/
    web/                       # Vite React PWA; static-hostable
    desktop/                   # Tauri shell using shared web UI
      src-tauri/
    extension/                 # WXT WebExtension
    sync-api/                  # future; absent from v1 deploy
    worker-python/             # optional; absent from baseline install
  packages/
    domain/                    # entities, value objects, policies, use cases
    contracts/                 # versioned JSON schemas/OpenAPI event contracts
    application/               # orchestration, commands, query DTOs
    ui/                        # shared components and feature views
    storage-core/              # DatabasePort, SQL migrations, repositories
    storage-browser/           # official SQLite WASM worker + OPFS
    storage-native/            # Tauri/native SQLite adapter
    capture-core/              # CaptureEnvelope, URL/source recognition
    extractors/                # JSON-LD, Greenhouse, Lever, generic DOM, manual
    extension-bridge/          # pairing/outbox/transfer protocol
    career-evidence/           # match and claims ledger
    prompt-engine/             # provider-neutral templates/context plans
    ai-adapters/               # local/BYOK/hosted adapters behind AiPort
    labor-data/                # SOC mapping and public data adapters
    documents/                 # import/export and document templates
    source-policy/             # connector registry and allow/deny enforcement
    search-filter/             # filter AST, SQL compiler, saved views
    observability/             # privacy-safe local diagnostics
    test-fixtures/             # licensed/synthetic captured pages and goldens
  migrations/
    0001_initial.sql
  fixtures/
    extractors/
    ai-evals/
    imports/
  tooling/
    scripts/
    eslint/
    typescript/
```

## Frontend baseline

- TypeScript, React, Vite, and a service-worker PWA layer.
- TanStack Router for typed routes; TanStack Query for async ports/caches; TanStack Table for jobs/import previews.
- Zustand for ephemeral UI preferences/workspace state, consistent with the user's ecosystem. SQLite remains the durable source of truth.
- Tailwind CSS, CSS-variable design tokens, and Radix primitives wrapped in locally owned components.
- React Hook Form + Zod for forms/contracts.
- Tiptap open-source core with a restricted schema for versioned document editing, subject to the Phase 0 round-trip/accessibility/export gate.
- `@mozilla/readability` and platform DOM APIs for generic content extraction.
- WXT for the cross-browser Manifest V3 extension.
- Tauri 2 for a small downloadable desktop shell.
- Vitest/Testing Library, Playwright, and fast-check for unit/component/E2E/property tests.

pnpm workspaces and Turborepo provide the repository task graph; ESLint/TypeScript/Prettier provide static checks. Packages are pinned during implementation after checking current maintenance, licenses, bundle impact, and browser/Tauri compatibility. The architecture does not depend on a hosted UI/editor/AI service. The complete selection, alternatives, and Phase 0 gates are in [10 — Technology stack](10-technology-stack.md).

## Storage port

Use one set of reviewed SQL migrations and repositories over a minimal asynchronous interface:

```ts
interface DatabaseSession {
  query<Row extends QueryRow>(statement: SqlStatement): Promise<readonly Row[]>;
  execute(statement: SqlStatement): Promise<ExecuteResult>;
}

type DatabaseTransaction = DatabaseSession;

interface DatabasePort extends DatabaseSession {
  transaction<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;
  exportPortable(): Promise<PortableDatabase>;
  diagnostics(): Promise<StorageDiagnostics>;
}
```

`SqlStatement` contains SQL plus bound parameters; repositories never concatenate user values. The transaction callback receives a deliberately narrowed session, so it cannot recursively open a transaction or perform export/diagnostic work. The adapter commits only when the callback fulfills, rolls back when it rejects, and preserves the callback's original error. Browser and native adapters must pass the same isolated database/repository contract suites, including the shared commit/rollback semantics suite.

`DB-008` froze the initial Phase 1 inventory as `phase-1-repository-contracts-v1`: five component suites and 15 explicitly ordered cases. `APP-007` evolved that reviewed aggregate to v2 by adding two durable-undo cases for a total of 17. `APP-008` advances it to `phase-1-repository-contracts-v3`: six component suites and 18 ordered cases, with the new diagnostic repository case proving immutable, bounded, privacy-safe local persistence. The aggregate factory rejects component suite/name/order drift before execution, and the manifest carries its ordered case list across browser automation protocols without relying on JSON object-member order. Fast Node SQLite, official SQLite WASM/OPFS, and native rusqlite execute that same aggregate; exact Chrome 151/152, Firefox 153/154, Windows, macOS, and diagnostic Ubuntu lanes provide hosted proof. See [repository-contract CI parity verification](../../proof/phase-1-repository-contract-ci-verification.md) for the v1 baseline, [durable mutation-undo verification](../../proof/phase-1-mutation-undo-application-verification.md) for v2, and [local diagnostic support-bundle verification](../../proof/phase-1-local-diagnostic-support-bundle-verification.md) for v3.

`EVD-001` adds the independent `phase-3-career-repositories-v1` contract without rewriting the immutable Phase 1 manifest. Its two ordered cases round-trip all ten Career Profile repository areas and prove a related-source foreign-key failure rolls the complete transaction back. `EVD-002` advances that independent contract to v2 with a third case proving unsafe story privacy-tag content is rejected without persistence. Fast Node SQLite, official browser SQLite/OPFS, native rusqlite, and the exact Chrome/Firefox CI lanes execute the same ordered manifest. Verification/staleness/source-reference policy remains pure in `@coredrill/career-evidence`; SQLite stores the accepted five-state vocabulary, optional document pointer, and story privacy tags without giving the adapter authority to choose evidence for an external provider. These slices add no editor, import proposal, AI call, or network behavior.

`EVD-003` adds adapter-neutral manual Career Profile validation and commands in `@coredrill/application`, an accessible sectioned editor in `@coredrill/ui`, and browser composition that maps the narrow application port to the existing Career Profile repositories. The application boundary creates local identities and audit instants, rejects invalid full calendar dates, inverted ranges, unsafe URLs, unbounded text/lists, and current entries with end dates before the port, then revalidates copied immutable results. Evidence-bearing manual rows persist with `source_document_id = NULL` and `verification_state = user_confirmed`; the port exposes no import, network, or AI capability. Browser composition applies reviewed migrations before repository access, while reload proof confirms SQLite/OPFS remains durable truth rather than React state. See [manual Career Profile editor verification](../../proof/phase-3-career-profile-editors-verification.md).

`EVD-004` composes the existing lazy-loaded local `DocumentPort` implementation with a separate application proposal boundary. The document layer validates signatures and limits, extracts normalized blocks, hashes the supplied file, and retains page/paragraph/line mappings. The application layer recognizes only bounded field suggestions, assigns local import/proposal identities, and forces `evidenceStatus = proposal` plus `reviewState = pending`. Storage migrations `0113`–`0115` persist the immutable import metadata/source map and its field-level proposal rows transactionally. No application command in this slice can create Career Profile evidence, accept a proposal, confer verification, invoke AI, or perform network I/O. See [resume import proposal verification](../../proof/phase-3-resume-import-proposals-verification.md).

`EVD-005` adds a pure application conflict analyzer and one narrow resolution command/port. The analyzer compares grouped employment and skill proposals with saved evidence, while the command validates explicit accept, merge, or reject intent and requires a deliberate date policy before accepting employment. Storage migrations `0116`–`0119` add imported-skill evidence state and an append-only resolution/proposal-membership ledger. The repository resolves a complete group in one transaction: accepting creates only an imported row, merging validates a compatible existing target without mutating it, rejecting creates no profile row, and every path retains the immutable proposal/source chain. Browser composition stays local and applies migrations before resolution; no network or AI capability enters the port.

`EVD-006` adds a dedicated story application boundary and repository instead of extending the manual-entry port. The application command validates bounded Situation/Action/Result content, ordinary and privacy tags, optimistic row versions, and unique typed evidence references before storage. Migration `0120` records each link with both a typed identity and one concrete foreign key, so links can target only existing canonical Career Profile evidence. Story creation and edits commit their complete link set atomically; edits do not expose or rewrite source-document or verification fields. The shared career-repository contract now proves link replacement and rollback in Node, browser SQLite/OPFS, and native rusqlite without introducing network or AI capability.

`EVD-007` adds an Answer Library application boundary and transactional repository over the existing document/document-version aggregates. Commands validate question, answer, sensitivity, provenance, identity, and optimistic row versions before creating canonical document IR v1 and a SHA-256 content hash. Create writes the document, provenance row, first immutable version, and classification atomically. Edit appends a version before advancing the document row version in the same transaction, so stale saves roll back the uncommitted history row. Explicit “mark used” is a separate command and never implies generation, submission, outreach, or automatic reuse. Browser wiring uses only local SQLite/OPFS plus platform SHA-256 and remains accountless, offline-capable, and useful with AI disabled.

`EVD-008` extends portable export's reviewed human-readable projection through schema 126 without changing the version-1 archive contract. Schema-gated dataset and column metadata preserve readable exports from supported historical milestones while the current schema emits JSON and CSV for every durable user-data table not covered by an explicit reviewed exclusion. The cross-adapter recovery fixture now includes all canonical Career Profile evidence types, typed story links, resume-import proposal/resolution provenance, one sensitive Answer Library history, and two managed attachments. Browser and native restore proof compare that complete inventory, while repository tests prove evidence-link cascades and document-owned metadata deletion without prematurely removing shared attachment content.

`MAT-001` adds a pure requirement-category value object, an adapter-neutral command/query port, and a transactional repository over schema versions `127`–`129`. Creation succeeds only when the referenced provenance has an exact excerpt and its snapshot/source chain belongs to the same job. Storage retains the extracted category and confidence as immutable source facts; correction changes only the current category, durable confirmation bit, audit time, and optimistic row version. The Requirements UI exposes the five reviewed categories, confidence, exact excerpt, method, and pointer while explicitly separating later evidence coverage. The browser proof host exercises the correction journey without a network request, and SQLite repository plus browser/native migration/export/recovery lanes prove durable semantics.

`MAT-002` adds a bounded, versioned deterministic parser in `@coredrill/application` rather than another storage aggregate. It consumes provenance-bound heading, list-item, and paragraph blocks, applies stable heading context and explicit lexical rules, deduplicates normalized meanings, and returns immutable pending proposals with exact excerpts, source pointers, parser categories, and confidence. Parsing is a read-only query: only the separate explicit accept command may create a `job_requirement`, marking it user-confirmed while retaining the parser's source category even when the user selects a different current category. Rejection discards only the pending projection and cannot mutate source or provenance. The existing schema-129 repository remains the durable write seam, and the browser proof host exercises accept, recategorize, and reject behavior without adding network, AI, or extension capabilities.

`MAT-003` adds an adapter-neutral requirement-evidence query and explicit select/remove commands. The storage repository combines exact canonical/alias skill matches, typed skill and story relations, accomplishment-parent relations, and bounded lexical evidence retrieval. It probes FTS5 at runtime and creates only a rebuildable acceleration table; failed or disabled FTS falls back to parameter-bound normalized-token predicates. Retrieval returns immutable candidates with their matched terms and reason codes, but it never changes the durable evidence set. Only the deliberate select/remove commands write `job_requirement_evidence_selection`. The shared repository aggregate advances to `phase-1-repository-contracts-v4`, adding accelerated and fallback cases that run unchanged in Node SQLite, browser SQLite/OPFS, and native rusqlite.

`MAT-004` extends that port with a pure `requirement-coverage-v1` rule and explicit optimistic set/reset commands. The deterministic read model treats Context as Not Applicable, treats absent selected evidence as Unknown rather than Gap, promotes only reviewed evidence with a structured relation to Strength, and otherwise returns Partial. Gap and every manual override remain deliberate user decisions. Schema `0133` stores only the user-reviewed state plus the requirement row version and canonical selected-evidence basis; a later input change keeps the decision and marks it stale rather than silently replacing it. The shared repository aggregate advances to `phase-1-repository-contracts-v5` and runs the same coverage transition contract in Node, browser SQLite/OPFS, and native rusqlite without network or AI capability.

`MAT-005` is a presentation-only projection in `@coredrill/ui`. It reads the accepted parser proposals, confirmed requirements, user-selected evidence, bounded query/matched terms, and per-requirement coverage decisions already present in the job-workspace model. Parseability counts, literal-term observations, and coverage-state counts are derived independently and are never persisted or combined. Suggested evidence does not enter the literal-term panel, no adapter or network capability is introduced, and no schema, migration, or contract version changes.

`MAT-006` adds the pure, bounded `application-question-policy-v1` classifier before any evidence or answer proposal seam. Work-authorization/legal and demographic/EEO/medical/disability questions resolve only from a direct user answer; profile, evidence, document, Answer Library, and generated candidates remain ignored. `requirement-coverage-v2` keeps those requirements Unknown regardless of unrelated selected evidence, while the storage repository short-circuits before search-content loading and rejects new evidence/coverage writes. The shared aggregate advances to `phase-1-repository-contracts-v6` with a 22nd negative case that proves matching profile evidence is not returned or persisted in Node, browser SQLite/OPFS, and native rusqlite. This slice adds no schema, migration, network, AI, autofill, or submission capability. See [sensitive-answer inference verification](../../proof/phase-3-sensitive-answer-inference-verification.md).

`MAT-007` adds the pure, bounded `requirement-coverage-rerun-v1` snapshot and diff seam. A rerun fresh-queries current coverage and selected evidence, including each item's latest immutable source-document version and content hash, then compares those facts with the caller's retained snapshot. Coverage, evidence, and provenance changes are reported at field level while a user-reviewed state and row version remain untouched; the result explicitly reports that no mutation occurred. The shared aggregate advances to `phase-1-repository-contracts-v7` with a 23rd case that edits linked evidence and creates a new document version, then proves the reviewed Gap is preserved but stale across Node, browser SQLite/OPFS, and native rusqlite. This slice adds no schema, migration, network, AI, or implicit write capability. See [requirement-coverage rerun verification](../../proof/phase-3-requirement-coverage-rerun-verification.md).

`DOC-001` extends the document port without beginning UI or the Mark Applied workflow. Schema `0134`–`0145` owns typed base/template/job-derivative relationships and one exact submitted snapshot per application attempt. The snapshot repository writes its header and ordered items in one `DatabasePort` transaction; a rejected item rolls the header back. Every item references an immutable document version, and file submissions additionally reference the existing content-addressed version/attachment tuple. Database guards bind resume and cover-letter items to the versions selected on the matching Applied application, constrain answer/other roles to their document kinds, and freeze the applied identity after a snapshot exists. The shared aggregate advances to `phase-1-repository-contracts-v8` with a 24th case that runs unchanged in Node SQLite, browser SQLite/OPFS, and native rusqlite. Portable export version 1 retains schema-133 compatibility and emits 54 datasets/108 JSON and CSV files at schema 145; the SQLite archive remains lossless recovery truth.

`DOC-003` composes the accepted restricted Tiptap adapter through a validated application port and a dedicated durable editor-draft repository. Schemas `0146`–`0148` add one optimistic draft per document and database guards that bind it to the latest immutable version. Debounced autosave updates only that draft; explicit Create version validates the exact saved content and row version, appends an immutable child, consumes the draft, and updates document recency in one transaction. The shared aggregate advances to `phase-1-repository-contracts-v9` with a 25th cross-adapter rollback/concurrency case. The UI adds no network, AI, generation, export, or submission capability.

`APP-001` adds adapter-neutral vault lifecycle orchestration in `@coredrill/application`. `CreateVaultCommand` and `OpenVaultCommand` validate caller input before the port, bind local UUIDv7 identities and operation instants to the requested action, and revalidate the returned session; `GetVaultDiagnosticsQuery` exposes only reviewed health, persistence, schema, read-only, and issue-code fields. All returned values are copied and frozen, adapter details are omitted, and typed or unknown port failures become stable content-free application errors. Concrete browser/native composition remains outside the application package. See [vault application verification](../../proof/phase-1-vault-application-verification.md).

`APP-002` adds adapter-neutral manual `CreateJob` and `ChangeStatus` operations in the same package. Manual creation validates before generating local identity/time values and persists neutral projections without inventing source or provenance state. Status change makes one port call whose contract requires every projection update and the append-only event to commit atomically; the existing storage-core `changePipelineStatus` transaction is the matching durable seam. Returned jobs/events are revalidated, copied, and frozen, while typed or unknown port failures become stable content-free application errors. New manual jobs have no current status, so this slice does not resolve or silently preempt `Q-006`. Concrete browser/native composition remains outside the package. See [manual job pipeline application verification](../../proof/phase-1-manual-job-pipeline-application-verification.md).

`APP-003` adds adapter-neutral `SetNextAction`, `RecordInteraction`, `ScheduleInterview`, and `ScheduleReminder` operations. Application context supplies immutable local identity/audit time; interactions cannot be future-dated, while newly scheduled interviews and reminders must be future instants with recognized canonical IANA zones. A scheduled next action retains UTC plus its explicit IANA interpretation, while an unscheduled action invents neither. Returned records are revalidated, copied, and frozen, and the local activity port has no network or outreach capability. Existing storage-core activity repositories remain the durable seam, including the atomic next-action/job-projection transaction. See [job activity application verification](../../proof/phase-1-job-activity-application-verification.md).

`APP-004` adds adapter-neutral `CreateCompany` and `CreateContact` operations. Manual company origin is explicit so source-backed company fields cannot bypass the capture/evidence boundary. Manual contacts are user-confirmed without invented confidence; source-backed contacts remain unconfirmed and require one provenance reference for every populated imported field. The local port atomically receives the contact plus value-bound provenance links and exposes no enrichment, guessing, messaging, outreach, or network capability. See [company/contact application verification](../../proof/phase-1-company-contact-application-verification.md).

`APP-005` adds adapter-neutral Pipeline counts, ordered board groups, one stable keyset paginator shared by table and board, and the detailed job-workspace DTO. Every query is bound to an application-owned snapshot instant and validates returned order, cursor, uniqueness, aggregate counts, archive/filter scope, and cross-entity relationships before exposing copied immutable data. The port is read-only and has no mutation or network capability. Concrete browser/native query composition remains outside this application slice. See [Pipeline query application verification](../../proof/phase-1-pipeline-query-application-verification.md).

`APP-006` adds adapter-neutral saved job-view commands in `@coredrill/search-filter`, the package already assigned the filter AST, SQL compiler, and saved views. It reuses the shared application command/result primitives without reversing the application package dependency boundary. Create/update validate the versioned filter plus exact presentation/sort/group settings before a local port call; duplicate accepts no caller-supplied copied AST; archive is an optimistic timestamped update rather than deletion. Returned records are revalidated and deeply frozen. Concrete browser/native port composition remains outside this slice. See [saved job-view application verification](../../proof/phase-1-saved-job-view-application-verification.md).

`APP-007` makes successful `ChangeStatusCommand` and `SetNextActionCommand` results explicitly undoable. Each edit and its application-generated UUIDv7 undo token commit in one SQLite transaction; `ConsumeUndoTokenCommand` exposes a narrow local port that returns stable safe replay, stale-target, storage, and permission failures. A token retains the exact post-edit projection and row-version preconditions and can transition from fresh to consumed only once. Status undo restores the job and optional application projections without updating or deleting the original append-only status event. Next-action undo dismisses the created action and any linked pending reminders, then restores the prior job projection. Any later target edit makes the token stale, and the transaction rolls back without partial restoration or token consumption. The token itself does not expire; the interface owns the at-least-ten-second undo affordance, while the durable boundary allows safe recovery whenever the exact state still matches. See [durable mutation-undo verification](../../proof/phase-1-mutation-undo-application-verification.md).

`APP-008` adds `RecordDiagnosticEventCommand` and `CopySupportBundleQuery` over a narrow local `DiagnosticLogPort`. The application owns event identity, operation time, and application version; `@coredrill/observability` sanitizes raw attributes through the reviewed fail-closed allowlist before any append. SQLite schema versions 88–92 store strict immutable events, reject content-bearing or malformed attribute JSON even below TypeScript, index deterministic newest-first reads, and retain only the newest 1,000 records. `SupportBundleV1` is a local-copy contract containing at most 200 revalidated unique events in deterministic newest-first order. No automatic delivery, network capability, error free text, path, or private job/applicant content crosses this boundary, and product telemetry remains a separate future opt-in contract. See [local diagnostic support-bundle verification](../../proof/phase-1-local-diagnostic-support-bundle-verification.md).

`Q1-005` supplies the previously deferred concrete SQLite composition for the
vault, manual-job/status, and activity ports without moving adapter knowledge
into `@coredrill/application`. One adapter-neutral canonical runner invokes the
production commands and repositories to create a vault and job, append three
status events, schedule an interview and follow-up/reminder, write a verified
portable archive, delete app-managed vault data through the typed deletion
boundary, and restore into a clean target. The browser app shell binds that
runner to official SQLite WASM/OPFS; the Windows proof binds the same runner to
the Rust JSON-lines native service. Both regenerate the same logical vault hash
after restore even though their adapter-specific SQLite archive bytes differ.
See [Phase 1 canonical journey verification](../../proof/phase-1-canonical-journey-verification.md).

`PortableDatabase` is the adapter-neutral database-byte/checksum/schema-version handoff. Archive assembly adds the versioned manifest, human-readable JSON/CSV data, attachment inventory, migration history, per-entry SHA-256 checksums, and explicit encryption state required by the portable-archive contract.

`BKP-003` adds the corresponding restore coordinator in `@coredrill/storage-core`. Inspection accepts only the exact bounded version-1 ZIP inventory, validates the whole archive when an expected digest exists, rejects unsafe/duplicate/compressed/oversized entries, verifies every recorded length and SHA-256, and asks an adapter to inspect copied SQLite bytes only in temporary state. A preview exposes immutable archive/target summaries, explicit empty/identical/same-vault/different-vault conflict classes, the required confirmation, and attachment add/reuse/remove counts; archive bytes and the adapter capability remain private. Commit rechecks the exact target snapshot for database or attachment drift, revalidates the retained archive, and requires the adapter to atomically replace database and attachment state or preserve the old target. See [portable archive restore version 1](portable-archive-restore-v1.md).

`BKP-007` composes that coordinator with production browser and native ports. One committed synthetic schema-92 archive carries all 58 data files and a real content-addressed attachment into empty targets. The [portable vault content hash version 1](portable-vault-content-hash-v1.md) compares the 29 canonical JSON projections and verified attachment bytes while deliberately excluding adapter-specific SQLite page layout and redundant CSV projections. The source archive, restored browser vault, and restored native vault must produce one identical canonical SHA-256 before the recovery drill passes.

### Browser adapter

- Official SQLite WebAssembly in a dedicated Worker.
- OPFS persistence. Use the accepted `opfs-sahpool` VFS for the single-writer UI because SQLite documents broad browser support, good performance, and no COOP/COEP requirement. Revisit `opfs-wl` for multi-tab behavior only with compatibility tests and a validated editing requirement.
- The application owns a single database coordinator guarded by an origin-wide exclusive Web Lock. Secondary tabs receive a controlled retryable “vault open in another tab” handoff; SQLite busy/locked results are separately typed and retryable.
- Observe persistent-storage grant, quota, and expected-database presence without fingerprinting private mode. Request persistent storage only from an explicit user action and maintain visible export/recovery guidance.
- Serve the hosted app from its own origin; changing origin creates a different inaccessible browser vault.

The Phase 0 `STG-001`–`STG-003` implementation now proves the first vertical storage path. `@coredrill/storage-browser` starts the official SQLite WASM package only inside a dedicated Worker, disables unrelated browser VFSes, installs `opfs-sahpool` under a Coredrill-owned OPFS directory, and opens a reviewed absolute database filename. Its versioned internal message protocol exposes only parameterized query/execute, serialized `BEGIN IMMEDIATE` transactions, diagnostics, portable export/restore, close, and delete operations. Foreign keys are enabled and verified on every open.

The version-3 browser storage protocol separates non-mutating candidate inspection from commit. Candidate bytes are imported under a temporary SAH-pool name and must pass `trusted_schema = OFF`, full integrity, exact current schema, exactly one vault row, and manifest-bound vault identity checks before the target can be considered. Restore additionally binds replacement to the target database SHA-256 observed by preview. The existing recovery snapshot remains in place until replacement, reopen, integrity, and schema validation succeed.

The browser coordinator serializes public operations so the Phase 0 path has one writer per Worker. Restore verifies byte length and SHA-256 before replacement, reopens the imported database, and requires both `PRAGMA integrity_check = 'ok'` and the expected `user_version`. The automated Edge proof covers migration, commit, rollback, close/reopen durability, clean-context restore, corruption rejection, byte-for-byte re-export, and delete. The completed `STG-004`–`STG-008` proof additionally covers observable persistence/quota/missing-data diagnostics, second-tab handoff, abrupt reload recovery, corrupt-database preservation, deterministic capacity benchmarks, and exact current/previous Chrome and Firefox execution.

Accepted [ADR-0003](../../adr/0003-adopt-browser-storage-support-floor.md) adds three permanent boundaries. First, the main-thread coordinator inspects OPFS, persistent-storage grant, quota state, and whether an expected database existed; it reports stable warnings and never equates a successful OPFS open with a persistence grant. Persistence requests are explicit user actions, not an open side effect. Second, an origin-wide exclusive Web Lock is acquired before the Worker installs the SAH pool, so another tab receives a typed retryable handoff rather than racing a second connection. Third, restore validates a temporary imported database before replacing the target and attempts recovery from the original bytes if final replacement fails. Exact hosted Chrome 152/151 and Firefox 154/153 lanes passed on commit `0271aaa65b793e530b092e0ce35c59f9ff6b7728`; D-025 is Accepted.

`BKP-005` makes the first boundary user-facing. Passive open and refresh cannot
call `navigator.storage.persist()`; a separate serialized method is invoked
only by the explicit Vault & Backup action. Its immutable path-free snapshot
keeps persistence, quota, and expected-database evidence separate. A strict
version-1 preference in canonical SQLite records the optional 30-day portable
export reminder, seven-day snooze, disable/enable choice, and successful-export
instant. See [browser vault recovery health version 1](browser-vault-recovery-health-v1.md).

`BKP-006` adds a preview-bound `VaultDeletionPort`. The browser adapter hashes
the current portable database state, rechecks the sole vault row/name and exact
typed phrase, then uses the existing serialized Worker deletion operation. A
wrong phrase or stale preview preserves the database; a successful reopen is a
clean migrated profile. Its original proof vault had zero attachment,
automatic-backup, and secret counts. `BKP-007` adds the production OPFS
content-addressed attachment store; deletion now inventories and removes those
bytes and reports `cleanup_pending` rather than a clean result if OPFS cleanup
does not finish.

### Native adapter

- `NAT-001` through `NAT-008` establish an accepted capability-gated Tauri boundary with a strict, versioned operation protocol over a narrow `rusqlite` 0.40.1 service. The shared TypeScript `DatabasePort`, reviewed SQL migration ledger, and repository contracts remain the public surface; Rust/Tauri/SQLite types do not cross into storage-core.
- Opaque session identifiers retain one native connection for callback transactions. Query/execute separation, tagged bound values, request/value/result limits, unknown-field denial, serialized access, foreign keys, `trusted_schema = OFF`, WAL, and content-free errors are enforced at the privileged boundary.
- `NAT-004` forwards Tauri's exact platform-resolved application-data directory into one canonical Rust layout. Databases live under `databases/`; content-addressed attachment paths live under `attachments/sha256/<first-byte>/<second-byte>/<lowercase-sha256>`. Managed directories and existing leaf paths are canonicalized and confined on every use, SQLite opens with `SQLITE_OPEN_NOFOLLOW`, and no arbitrary or absolute attachment path crosses IPC.
- Use atomic exports and OS-native file pickers. The Phase 0 database-recovery artifact must remain explicitly distinct from the later full portable archive with attachments and human-readable exports.
- Store provider secrets through OS keychain/secure-store integration; if unavailable, require an encrypted passphrase-backed secret store rather than plaintext config.

`NAT-005` and `NAT-008` implement that rule with one separately allowlisted, versioned Rust command and exact target-confined providers: Windows Credential Manager, macOS Keychain, and Linux Secret Service. IPC exposes store/status/delete only; retrieved material remains inside Rust and is zeroized before a boolean status response. Operations are serialized, platform errors become stable content-free failures, and an unavailable backend fails closed without SQLite/config/environment fallback. Linux native remains diagnostic because of the shell dependency graph; the secure-store boundary itself passes its ephemeral Secret Service lifecycle.

`NAT-006` adds a third exact custom command for a database-only recovery artifact. The official native dialog is opened inside Rust on a worker thread; no path crosses IPC and no dialog/filesystem JavaScript permission is granted. Export uses SQLite's online-backup API, streams a version/schema/length/SHA-256 header and standalone database bytes, and atomically replaces a same-directory temporary file. Restore verifies length, digest, SQLite integrity, and the current schema in managed temporary storage before closing the connection. It creates a recovery snapshot, atomically replaces and reopens the database, and rolls back to the snapshot if any post-replacement step fails. The real lifecycle proves cancellation, managed-path rejection, corrupt-input preservation, injected post-replacement recovery, successful restore, and close/reopen durability; see [native archive verification](../../proof/native-archive-verification.md).

`BKP-004` extends that exact archive command with a pickerless automatic-backup
operation. Rust owns the clock and a canonical per-database `backups/` directory
under Tauri app-data. It creates an online SQLite snapshot, publishes the
checksummed recovery envelope atomically, rereads and restores it into temporary
state for integrity/schema verification, and only then removes older verified
backups. Retention is bounded from one through 90; the new known-good backup is
never a prune candidate, and cleanup failure retains extra backups with an
explicit warning. No path crosses IPC. See [desktop automatic backup version
1](desktop-automatic-backup-v1.md).

`BKP-006` adds a fourth exact Tauri command that composes the native storage and
OS-secret services inside Rust. Preview validates the single vault, strict
provider registry, attachment manifests across other managed databases,
physical content-addressed files, and the target backup directory without
returning paths or provider IDs. Delete revalidates the opaque preview and exact
phrase, closes only the target session, stages database/WAL/SHM, unshared
attachments, and that database's backups by same-volume rename, then removes
vault-scoped secrets. Staging or secret failure restores and reopens usable
content; final purge failure returns `cleanup_pending`, with only a
purge-approved marker eligible for bounded startup retry. See [vault deletion
version 1](vault-deletion-v1.md).

`NAT-007` packages that same boundary as an unsigned Windows current-user NSIS installer. The main window remains hidden until the bundled page reports Tauri's finished page-load event; the proof-only launch flag keeps it hidden while the native title supplies a deterministic readiness signal. Five warmups plus 20 measured launches record installer/application size, hashes, signature state, WebView2 version, startup, and aggregate app/WebView2 working-set and private memory. The isolated lifecycle proves install, launch, contract-probe exclusion, uninstall, and app-data preservation. These Windows 10 and hosted-runner measurements are diagnostics, not the unexecuted Windows 11 25H2/HW-WIN-REF release-performance gate; see [native package verification](../../proof/native-windows-package-verification.md).

[ADR-0004](../../adr/0004-adopt-tauri-rusqlite-native-boundary.md) accepts the Tauri 2 plus narrow first-party `rusqlite` boundary for Windows and macOS after `NAT-008` cross-platform dependency, secure-store, and package proof. The same Linux AppImage and Secret Service paths remain in diagnostic CI, but Linux users retain the local browser app plus portable export while the GTK3 dependency graph carries an unresolved RustSec unsoundness warning and unmaintained dependencies. Public signing/notarization, updater/provenance, clean-machine behavior, and reference-hardware performance remain release gates; see [cross-platform native verification](../../proof/native-cross-platform-verification.md).

## Capture/extension bridge

The extension contains no full vault. It stores a bounded outbox of versioned, checksummed `CaptureEnvelope` records until acknowledged.

Transfer paths:

1. Chromium/Safari hosted web: tightly restricted `externally_connectable` origins and sender validation.
2. Firefox/web fallback: content-script bridge on the exact Coredrill origin or explicit JSON export/import, because direct web-page external messaging is not uniformly available.
3. Desktop: native messaging host or paired loopback bridge in a later subphase; start with explicit outbox import if cross-platform installation becomes disproportionate.

Security requirements:

- exact allowed origins/extension IDs;
- one-time pairing secret where a native bridge exists;
- sequence/nonce, content hash, acknowledgement, retry, expiry, and deduplication;
- strict schema validation on both sides;
- no command that lets a page make the extension fetch an arbitrary URL;
- no AI/provider keys in the extension;
- `activeTab` and `scripting` only, with source-specific host access as optional permission.

The Phase 0 `EXT-004` through `EXT-006` implementation proves this boundary without selecting a public product domain. Chromium's production test artifact permits only the reserved `https://app.coredrill.test` origin and requires matching sender origin, URL origin, top-level frame, ordinary tab, and non-incognito context. Pull increments the stored attempt before returning an offer; the web receiver revalidates the exact extension ID, request, envelope, checksum, expiry, nonce, and sequence, commits migration-0002 `capture_inbox` data to SQLite, and only then acknowledges. Exact retries deduplicate; conflicting replay identifiers fail closed. Firefox has no external origin or content script and uses a bounded checksummed JSON export/import fallback with the same durable inbox rules. The reserved test origin must be replaced by the selected isolated public app origin and reproven before release.

`PEX-001` adds a pure, exact-shape version-1 state resolver above that bridge.
Permission-needed takes precedence over transfer facts, an acknowledged
transfer takes precedence over queued work, and queued work takes precedence
over page recognition. The companion catalog is immutable and fails closed
when state copy, action IDs, permission detail, or required recovery paths are
missing. It neither reads the outbox nor invents an acknowledgement; runtime
facts remain owned by the existing privileged boundary and later production
transfer slice.

`PEX-003` adds a strict version-1 retry record beside the unchanged outbox
contract and upgrades the private browser-storage aggregate from version 1 to
version 2 in place. A legacy attempted item becomes immediately eligible with
a visible migration error fact; new and persisted items retain deterministic
five-second-to-five-minute exponential schedules capped at ten automatic
attempts. Transfer selection skips not-due or exhausted items without
reordering durable queue state. The service worker persists an incremented
attempt and schedule before returning an offer, removes outbox and retry facts
only after an exact acknowledgement, and preserves the prior durable value if
browser storage rejects a write. Full persistent-profile restart and quota
fault tests exercise those boundaries. The version-1 Firefox export remains
compatible. `PEX-004` adds a separate strict version-1 compatibility preflight
before every Chromium pull. The web app sends its exact HTTPS origin, intended
extension ID, accepted transfer and capture versions, and bounded required
capabilities. The extension compares the declared origin with the
authenticated external-message sender, compares the intended ID with its own
runtime ID, selects only transfer version 1 and capture-envelope version 1,
and returns the exact reviewed pull/ack capability set. The web receiver
revalidates every echoed identity and negotiated fact before it can request
outbox data. Unknown fields, unsupported versions/capabilities, and identity
mismatches fail closed. The reserved `.test` origin remains evidence-only;
public hosted-app selection and end-to-end deployment compatibility remain
owned by `PEX-005`.

`Q2-002` extends that persistent-profile proof through a second full restart
after acknowledgement. The reopened extension must retain an empty outbox,
while the reopened app must retain exactly one receipt with the original
envelope ID, checksum, and semantic content hash. A separate SQLite regression
creates that acknowledged receipt at schema 2 and upgrades through schema 101,
requiring exact selected-row equality and one receipt afterward. Combined with
the version-1-to-version-2 extension-state migration, this covers both durable
stores across crash and upgrade without treating an unacknowledged retry item
as data loss.

`PEX-007` adds no bridge capability. It hardens the serialized active-page
function with iterative bounded JSON-LD discovery and extends the Chromium
matrix across malicious/prompt-shaped text, deep and oversized pages,
redirected top-level identity, cross-origin iframe isolation, and SPA changes.
The previously queued envelope remains immutable, while the existing bridge
fixture continues to reject replay after acknowledgement. Host and optional
host permissions remain empty.

`CAP-001` centralizes capture-version dispatch at those outbox and receiver boundaries. V1 is currently both the current and only accepted version; adding V2 must retain a V1 reader so the accepted set becomes current plus previous. The envelope UUID is the pre-ingestion source-snapshot identity used by every candidate provenance reference, expiry must follow capture time, and the semantic content checksum is independently reproducible. This semantic checksum intentionally excludes envelope/replay identity, while the existing transport checksum authenticates the complete canonical envelope.

`CAP-002` extends the same schema-92 receiver transaction without adding a second canonical store. The `capture_inbox` uniqueness constraints classify exact transport retries, fresh envelopes with already-durable semantic content, and conflicting replay identities separately; both safe duplicate classes can be acknowledged, while conflicts roll back. The receiver returns the incoming envelope identity plus the durable receipt identity when they differ. It reads saved `job`/`company`/`job_source`/`source_snapshot` identity data through parameterized SQLite queries and passes neutral candidates to a bounded, deterministic `@coredrill/application` policy. That policy returns reason-coded suggestions for source ID, canonical URL, content hash, and transparent title/company similarity only. It has no adapter dependency and performs no merge, confirmation, or trusted-field mutation.

`CAP-003` composes manual, paste, and file input through that same receiver instead of creating a parallel import store. The web entry boundary normalizes safe HTTP(S) URLs without fetching them, converts detached saved HTML to inert text, bounds plain text and JSON file size/complexity, and then asks `@coredrill/capture-core` to construct and strictly validate the V1 envelope. The schema-92 transaction allocates the local sender sequence, verifies the complete transport checksum/expiry through the existing outbox contract, and inserts the receipt before reporting success. `received_via = "manual_export"` remains the existing user-supplied import transport channel; the envelope's `captureMethod` and `sourceKind` distinguish manual entry, pasted listing, and saved text/HTML/JSON. This preserves compatibility with the accepted Phase 1 recovery archive and requires no migration. Supplied title/company values are provenance-bearing `user` candidates and are not silently promoted to job truth.

`CAP-004` reads the existing durable envelope JSON only while the Pipeline Inbox is active. `@coredrill/capture-core` strictly revalidates the envelope and recomputes its semantic content hash before projecting preview sections or field evidence; one invalid or hash-drifted receipt fails the preview closed. Retained HTML requires a caller-provided detached text renderer, and the web renderer removes executable, embedding, media, SVG/MathML, style, and metadata elements before returning normalized text. The UI receives strings and renders them through React text nodes only. Section paths and candidate provenance pointers remain explicit, and activating either one focuses the inert source region and highlights a matching excerpt when retained. Previewing never fetches the source, mutates durable records, or creates a second canonical store, so schema 92 remains unchanged.

`REV-004` adds an adapter-neutral capture-review repository over schema 101.
The immutable `capture_inbox` receipt remains the replay/deduplication source;
`capture_review_item` owns pending, snoozed, discarded, and resolved lifecycle
state. Save and Merge materialize validated envelope evidence only after a fresh
semantic-hash check, then atomically write source/snapshot/provenance/candidates,
explicit confirmations, the new or selected job relationship, and resolved
queue state. Merge never rewrites the target job's canonical fields. Row-version
and content-hash preconditions reject replay or stale UI state. Snooze, wake,
discard, and single-use undo are independent guarded transactions. None of
these paths fetches or refreshes a source.

`REV-005` introduces a pure version-1 application projection above the durable
receipt and review repository. It accepts only bounded local observations:
retained section/candidate counts, an optional listing validity value, an
exact-host checked-in policy result, and the existing reason-coded duplicate
suggestions. Stable precedence is blocked, expired, changed, unsupported, then
available. The projection cannot read storage, fetch, extract, confirm, or
mutate; the web composition supplies current local observations and the UI
renders the immutable result. Policy-blocked results prevent promotion, while
the existing manual/paste dialog provides fallback without creating a second
capture path or changing schema 101.

`REV-006` adds a second pure version-1 application projection for two caller-
supplied immutable snapshots. Exact IDs, increasing capture instants, hashes,
unique bounded requirement keys, locations, deadline, and structured
compensation are validated before comparison. The result is a deeply frozen
DTO with stable added/removed/changed categories and literal false refresh and
trusted-mutation flags. It depends on no adapter and creates no persistence or
network port; the Source-tab component renders the DTO without deriving or
writing canonical job truth.

## Application use cases

Commands are explicit and transactional:

- `CaptureJob`, `ReviewCapture`, `MergeCapture`, `CreateJob`, `ChangeStatus`.
- `RecordInteraction`, `ScheduleInterview`, `ScheduleReminder`, `SetNextAction`.
- `ImportCareerDocument`, `ConfirmEvidence`, `MatchJobToProfile`.
- `DraftCoverLetter`, `DraftApplicationAnswer`, `AcceptDocumentVersion`.
- `RefreshSalaryEstimate`, `ImportConnectorResults`.
- `ExportVault`, `RestoreVault`, `DeleteVault`.

Queries return view DTOs and never leak adapter rows directly into UI components.

Application operations use stable PascalCase names ending in `Command` or `Query` and return a discriminated `ApplicationResult<T>` rather than adapter rows or provider exceptions. Commands declare their transactional requirement; queries declare read-only behavior. Failures use a small stable error-code vocabulary plus safe user-facing text. Diagnostic events record only the stable operation/error code, never the free-text message or input DTO.

## Extraction port

```ts
interface ExtractionPort<Payload, Candidate> {
  readonly id: string;
  readonly version: string;
  supports(input: ExtractionInput<Payload>): ExtractionSupport;
  extract(
    input: ExtractionInput<Payload>,
    ctx: PortRequestContext,
  ): Promise<ExtractionResult<Candidate>>;
}
```

The generic parameters bind an already validated boundary payload and its versioned candidate contract without making the domain import serialized-contract runtime code. The registry executes permitted deterministic extractors, preserves candidates/conflicts, and produces field-level provenance. It never fetches an arbitrary URL on behalf of the payload. LLM normalization is a separate, opt-in postprocessor and cannot erase source candidates.

## AI port

```ts
interface AiPort {
  capabilities(): Promise<ModelCapabilities>;
  generateStructured<Output, Schema, ContextManifest>(
    request: StructuredGenerationRequest<Schema, ContextManifest>,
  ): Promise<GenerationResult<Output>>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
```

Adapters:

- `DisabledAiAdapter` — templates/search still work.
- Local OpenAI-compatible/Ollama adapter — desktop/localhost.
- Direct BYOK provider adapters — explicit disclosure; key stays in secure store, never bundle/env committed.
- Future hosted adapter — authenticated, metered, privacy/retention contract.

The prompt engine builds a provider-neutral context plan. Provider SDK objects never enter domain records.

## Labor-data and document ports

`LaborDataPort` searches occupation mappings and retrieves occupation/geography statistics. Every result carries provider, dataset/release, retrieval time, source URL, and license URL. Salary statistics stay occupation-wide and return the warning needed to prevent an employer-specific label.

`DocumentPort` performs local PDF/DOCX/Markdown/plain-text import and PDF/DOCX/Markdown/plain-text export. Imported evidence is explicitly a proposal until user confirmation. Export accepts an immutable document-version ID and canonical structured blocks, then returns bytes, media type, extension, checksum, and content-free warning codes. The port does not own document version history or mutate an accepted version.

## Deferred sync port

The baseline `SyncPort` exposes capability discovery only and returns the fixed `deferred`/`not-available-in-baseline` state. It has no push, pull, cursor, server, or account API. Those methods require the later E2EE, conflict, tombstone, attachment, compaction, device-removal, and key-recovery ADR required by D-052.

## Search

- SQLite indexes and FTS5 when verified in both builds.
- Small-corpus fallback to normalized token search if FTS5 is unavailable.
- Phase 1 retrieval is lexical plus structured tags/relations.
- Embeddings are optional phase 2. At personal scale, store vectors with model/version and calculate similarity locally; do not introduce a server/vector database prematurely.

Phase 1 implements this boundary with migration-owned regular indexes, a normal content view, stable search identities, and a durable content-revision signal. The search repository performs an actual temporary-virtual-table probe before it creates a rebuildable external-content FTS5 artifact; numbered migrations and durable triggers never require the module. A failed probe, initialization, or query degrades to the same bounded all-token contract through escaped parameter-bound normalized-token predicates. Browser SQLite/OPFS and native rusqlite run the shared accelerated and forced-fallback contracts; the [DB-007 verification report](../../proof/phase-1-job-search-verification.md) records query-plan assertions and clean reference/stress benchmarks.

Phase 3 applies the same capability-gated pattern to Career Profile evidence. A migration-owned union view normalizes every supported evidence kind, while exact skill/alias and typed relation traversal remain independent of FTS. Candidate order is deterministic and explainable, results are bounded, and an explicit user-maintained selection relation is the only source of requirement context. `MAT-004` derives explainable per-requirement coverage only from that reviewed selection and keeps user overrides separate; embeddings and AI reranking remain deferred.

## COMPOSR relationship

Define an exportable contract:

```ts
type PromptTemplateV1 = {
  id: string;
  version: number;
  purpose: string;
  variables: readonly VariableSpec[];
  messages: readonly MessageTemplate[];
  outputSchema?: JsonSchema;
};
```

Initially, Coredrill owns `prompt-engine` in a clean package and can import/export this JSON. After both apps prove the contract, extract it to an independently versioned shared package. Do not make Coredrill call COMPOSR's UI/API, and do not delay v1 on a cross-repository package migration.

## Configuration

- Runtime config is validated once and injected.
- Build-time public config contains only non-secrets such as application origin and enabled local capabilities.
- Provider keys, pairing secrets, sync keys, and connector credentials are never public build variables.
- Feature flags default off for networked connectors, hosted AI, sync, telemetry, and experimental extractors.
