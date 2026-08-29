const component = <const Cases extends Readonly<Record<string, string>>>(
  suiteName: string,
  cases: Cases,
) =>
  Object.freeze({
    suiteName,
    cases: Object.freeze(cases),
  });

/**
 * Reviewed Phase 1 repository contract inventory. Case names are owned here so
 * browser and native adapters cannot silently maintain separate handwritten lists.
 */
const PHASE_1_REPOSITORY_CONTRACT_COMPONENTS = Object.freeze({
  tracker: component("phase-1-tracker-repositories", {
    migrateVaultSettings: "migrates vault settings and preserves typed JSON",
    persistSourceAggregate:
      "persists company contact job source snapshot and provenance with bound values",
    retainFieldCandidates: "retains field candidates and requires explicit confirmed replacement",
    rollbackInvalidAggregate: "enforces foreign keys and rolls back an invalid aggregate",
    persistLocalDevice: "persists a stable local device identity with monotonic audit fields",
    enforceDocumentIntegrity:
      "enforces document selection lineage and append-only integrity in SQLite",
  }),
  pipeline: component("phase-1-pipeline-repositories", {
    persistCustomStages: "stores custom stages without selecting default display vocabulary",
    changeStatus: "changes job and application status with atomic append-only history",
    persistScheduling:
      "persists interactions actions interviews and local reminders transactionally",
    undoStatusChange:
      "consumes a durable status undo token once without rewriting append-only history",
    undoNextAction:
      "consumes a durable next-action undo token once and restores scheduling consistency",
  }),
  view: component("phase-1-view-repositories", {
    assignTags: "assigns active tags idempotently and enforces job relationships",
    roundTripSavedViews: "round-trips versioned saved views with optimistic updates",
  }),
  document: component("phase-1-document-repositories", {
    persistVersions: "persists canonical IR versions with explicit immutable lineage",
    linkAttachments: "links jobs and content-addressed attachment manifests without storing bytes",
  }),
  jobSearch: component("phase-1-job-search", {
    accelerateWithFts5: "detects FTS5 and refreshes the accelerated lexical index",
    preserveFallback: "keeps normalized-token search functional with FTS5 disabled",
  }),
});

const PHASE_1_REPOSITORY_CONTRACT_CASES = Object.freeze(
  Object.values(PHASE_1_REPOSITORY_CONTRACT_COMPONENTS).flatMap(({ cases }) =>
    Object.values(cases),
  ),
);

export const PHASE_1_REPOSITORY_CONTRACT_MANIFEST = Object.freeze({
  schemaVersion: 2 as const,
  suiteName: "phase-1-repository-contracts-v2",
  components: PHASE_1_REPOSITORY_CONTRACT_COMPONENTS,
  caseNames: PHASE_1_REPOSITORY_CONTRACT_CASES,
});

export type Phase1RepositoryContractManifest = typeof PHASE_1_REPOSITORY_CONTRACT_MANIFEST;

export const PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES =
  PHASE_1_REPOSITORY_CONTRACT_MANIFEST.caseNames;
