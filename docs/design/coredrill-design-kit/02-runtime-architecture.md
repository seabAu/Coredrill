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

`PortableDatabase` is the adapter-neutral database-byte/checksum/schema-version handoff. Archive assembly adds the versioned manifest, human-readable JSON/CSV data, attachment inventory, migration history, per-entry SHA-256 checksums, and explicit encryption state required by the portable-archive contract.

### Browser adapter

- Official SQLite WebAssembly in a dedicated Worker.
- OPFS persistence. Use the accepted `opfs-sahpool` VFS for the single-writer UI because SQLite documents broad browser support, good performance, and no COOP/COEP requirement. Revisit `opfs-wl` for multi-tab behavior only with compatibility tests and a validated editing requirement.
- The application owns a single database coordinator guarded by an origin-wide exclusive Web Lock. Secondary tabs receive a controlled retryable “vault open in another tab” handoff; SQLite busy/locked results are separately typed and retryable.
- Observe persistent-storage grant, quota, and expected-database presence without fingerprinting private mode. Request persistent storage only from an explicit user action and maintain visible export/recovery guidance.
- Serve the hosted app from its own origin; changing origin creates a different inaccessible browser vault.

The Phase 0 `STG-001`–`STG-003` implementation now proves the first vertical storage path. `@coredrill/storage-browser` starts the official SQLite WASM package only inside a dedicated Worker, disables unrelated browser VFSes, installs `opfs-sahpool` under a Coredrill-owned OPFS directory, and opens a reviewed absolute database filename. Its versioned internal message protocol exposes only parameterized query/execute, serialized `BEGIN IMMEDIATE` transactions, diagnostics, portable export/restore, close, and delete operations. Foreign keys are enabled and verified on every open.

The browser coordinator serializes public operations so the Phase 0 path has one writer per Worker. Restore verifies byte length and SHA-256 before replacement, reopens the imported database, and requires both `PRAGMA integrity_check = 'ok'` and the expected `user_version`. The automated Edge proof covers migration, commit, rollback, close/reopen durability, clean-context restore, corruption rejection, byte-for-byte re-export, and delete. The completed `STG-004`–`STG-008` proof additionally covers observable persistence/quota/missing-data diagnostics, second-tab handoff, abrupt reload recovery, corrupt-database preservation, deterministic capacity benchmarks, and exact current/previous Chrome and Firefox execution.

Accepted [ADR-0003](../../adr/0003-adopt-browser-storage-support-floor.md) adds three permanent boundaries. First, the main-thread coordinator inspects OPFS, persistent-storage grant, quota state, and whether an expected database existed; it reports stable warnings and never equates a successful OPFS open with a persistence grant. Persistence requests are explicit user actions, not an open side effect. Second, an origin-wide exclusive Web Lock is acquired before the Worker installs the SAH pool, so another tab receives a typed retryable handoff rather than racing a second connection. Third, restore validates a temporary imported database before replacing the target and attempts recovery from the original bytes if final replacement fails. Exact hosted Chrome 152/151 and Firefox 154/153 lanes passed on commit `0271aaa65b793e530b092e0ce35c59f9ff6b7728`; D-025 is Accepted.

### Native adapter

- `NAT-001` through `NAT-008` establish an accepted capability-gated Tauri boundary with a strict, versioned operation protocol over a narrow `rusqlite` 0.40.1 service. The shared TypeScript `DatabasePort`, reviewed SQL migration ledger, and repository contracts remain the public surface; Rust/Tauri/SQLite types do not cross into storage-core.
- Opaque session identifiers retain one native connection for callback transactions. Query/execute separation, tagged bound values, request/value/result limits, unknown-field denial, serialized access, foreign keys, `trusted_schema = OFF`, WAL, and content-free errors are enforced at the privileged boundary.
- `NAT-004` forwards Tauri's exact platform-resolved application-data directory into one canonical Rust layout. Databases live under `databases/`; content-addressed attachment paths live under `attachments/sha256/<first-byte>/<second-byte>/<lowercase-sha256>`. Managed directories and existing leaf paths are canonicalized and confined on every use, SQLite opens with `SQLITE_OPEN_NOFOLLOW`, and no arbitrary or absolute attachment path crosses IPC.
- Use atomic exports and OS-native file pickers. The Phase 0 database-recovery artifact must remain explicitly distinct from the later full portable archive with attachments and human-readable exports.
- Store provider secrets through OS keychain/secure-store integration; if unavailable, require an encrypted passphrase-backed secret store rather than plaintext config.

`NAT-005` and `NAT-008` implement that rule with one separately allowlisted, versioned Rust command and exact target-confined providers: Windows Credential Manager, macOS Keychain, and Linux Secret Service. IPC exposes store/status/delete only; retrieved material remains inside Rust and is zeroized before a boolean status response. Operations are serialized, platform errors become stable content-free failures, and an unavailable backend fails closed without SQLite/config/environment fallback. Linux native remains diagnostic because of the shell dependency graph; the secure-store boundary itself passes its ephemeral Secret Service lifecycle.

`NAT-006` adds a third exact custom command for a database-only recovery artifact. The official native dialog is opened inside Rust on a worker thread; no path crosses IPC and no dialog/filesystem JavaScript permission is granted. Export uses SQLite's online-backup API, streams a version/schema/length/SHA-256 header and standalone database bytes, and atomically replaces a same-directory temporary file. Restore verifies length, digest, SQLite integrity, and the current schema in managed temporary storage before closing the connection. It creates a recovery snapshot, atomically replaces and reopens the database, and rolls back to the snapshot if any post-replacement step fails. The real lifecycle proves cancellation, managed-path rejection, corrupt-input preservation, injected post-replacement recovery, successful restore, and close/reopen durability; see [native archive verification](../../proof/native-archive-verification.md).

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

## Application use cases

Commands are explicit and transactional:

- `CaptureJob`, `ReviewCapture`, `MergeCapture`, `CreateJob`, `ChangeStatus`.
- `RecordInteraction`, `ScheduleInterview`, `SetNextAction`.
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
