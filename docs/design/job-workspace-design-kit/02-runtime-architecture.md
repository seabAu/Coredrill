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
job-workspace/
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
interface DatabasePort {
  query<T>(statement: SqlStatement): Promise<readonly T[]>;
  execute(statement: SqlStatement): Promise<ExecuteResult>;
  transaction<T>(work: (tx: DatabasePort) => Promise<T>): Promise<T>;
  exportPortable(): Promise<PortableDatabase>;
  diagnostics(): Promise<StorageDiagnostics>;
}
```

`SqlStatement` contains SQL plus bound parameters; repositories never concatenate user values. Browser and native adapters must pass the same repository contract suite.

### Browser adapter

- Official SQLite WebAssembly in a dedicated Worker.
- OPFS persistence. Prefer the `opfs-sahpool` VFS for the initial single-writer UI because SQLite documents broad browser support, good performance, and no COOP/COEP requirement. Revisit `opfs-wl` for multi-tab behavior only with compatibility tests.
- The application owns a single database coordinator. Secondary tabs default read-only or show “vault open in another tab”; queued writes handle `SQLITE_BUSY` explicitly.
- Detect persistent-storage availability, quota, private mode, and eviction risk. Request persistent storage where supported and maintain export reminders.
- Serve the hosted app from its own origin; changing origin creates a different inaccessible browser vault.

### Native adapter

- Tauri commands or its reviewed SQL plugin expose parameterized SQLite operations.
- Database and attachments live in the OS application-data directory, not the repository.
- Use atomic portable exports and OS-native file pickers.
- Store provider secrets through OS keychain/secure-store integration; if unavailable, require an encrypted passphrase-backed secret store rather than plaintext config.

## Capture/extension bridge

The extension contains no full vault. It stores a bounded outbox of versioned, checksummed `CaptureEnvelope` records until acknowledged.

Transfer paths:

1. Chromium/Safari hosted web: tightly restricted `externally_connectable` origins and sender validation.
2. Firefox/web fallback: content-script bridge on the exact Job Workspace origin or explicit JSON export/import, because direct web-page external messaging is not uniformly available.
3. Desktop: native messaging host or paired loopback bridge in a later subphase; start with explicit outbox import if cross-platform installation becomes disproportionate.

Security requirements:

- exact allowed origins/extension IDs;
- one-time pairing secret where a native bridge exists;
- sequence/nonce, content hash, acknowledgement, retry, expiry, and deduplication;
- strict schema validation on both sides;
- no command that lets a page make the extension fetch an arbitrary URL;
- no AI/provider keys in the extension;
- `activeTab` and `scripting` only, with source-specific host access as optional permission.

## Application use cases

Commands are explicit and transactional:

- `CaptureJob`, `ReviewCapture`, `MergeCapture`, `CreateJob`, `ChangeStatus`.
- `RecordInteraction`, `ScheduleInterview`, `SetNextAction`.
- `ImportCareerDocument`, `ConfirmEvidence`, `MatchJobToProfile`.
- `DraftCoverLetter`, `DraftApplicationAnswer`, `AcceptDocumentVersion`.
- `RefreshSalaryEstimate`, `ImportConnectorResults`.
- `ExportVault`, `RestoreVault`, `DeleteVault`.

Queries return view DTOs and never leak adapter rows directly into UI components.

## Extraction port

```ts
interface Extractor {
  readonly id: string;
  readonly version: string;
  supports(input: CaptureInput): SupportScore;
  extract(input: CaptureInput, ctx: ExtractionContext): Promise<ExtractionResult>;
}
```

The registry executes permitted deterministic extractors, preserves candidates/conflicts, and produces field-level provenance. LLM normalization is a separate, opt-in postprocessor and cannot erase source candidates.

## AI port

```ts
interface AiPort {
  capabilities(): Promise<ModelCapabilities>;
  generateStructured<T>(request: StructuredGeneration<T>): Promise<GenerationResult<T>>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
```

Adapters:

- `DisabledAiAdapter` — templates/search still work.
- Local OpenAI-compatible/Ollama adapter — desktop/localhost.
- Direct BYOK provider adapters — explicit disclosure; key stays in secure store, never bundle/env committed.
- Future hosted adapter — authenticated, metered, privacy/retention contract.

The prompt engine builds a provider-neutral context plan. Provider SDK objects never enter domain records.

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

Initially, Job Workspace owns `prompt-engine` in a clean package and can import/export this JSON. After both apps prove the contract, extract it to an independently versioned shared package. Do not make Job Workspace call COMPOSR's UI/API, and do not delay v1 on a cross-repository package migration.

## Configuration

- Runtime config is validated once and injected.
- Build-time public config contains only non-secrets such as application origin and enabled local capabilities.
- Provider keys, pairing secrets, sync keys, and connector credentials are never public build variables.
- Feature flags default off for networked connectors, hosted AI, sync, telemetry, and experimental extractors.
