/** Storage ports, shared repository contracts, and migration coordination. */
export {
  advancingAuditTimestamp,
  auditTimestamps,
  type AuditTimestamps,
} from "./audit-integrity.js";
export {
  createTransactionSemanticsSuite,
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  runDatabaseContractSuite,
  type DatabaseContractAdapter,
  type DatabaseContractCase,
  type DatabaseContractRunResult,
  type DatabaseContractSuite,
  type TransactionContractProbe,
} from "./contract-harness.js";
export {
  createPipelineRepositoryContractSuite,
  type PipelineRepositoryContractSetup,
} from "./pipeline-contract-harness.js";
export {
  createDocumentRepositoryContractSuite,
  type DocumentRepositoryContractSetup,
} from "./document-contract-harness.js";
export {
  createDiagnosticRepositoryContractSuite,
  type DiagnosticRepositoryContractSetup,
} from "./diagnostic-contract-harness.js";
export { DiagnosticEventRepository, LOCAL_DIAGNOSTIC_LOG_LIMITS } from "./diagnostic-repository.js";
export {
  AttachmentManifestRepository,
  DocumentRepository,
  DocumentRepositoryConflictError,
  DocumentVersionRepository,
  createDocumentRepositories,
  type DocumentRepositories,
  type DocumentRepositoryConflictCode,
  type NewAttachmentManifest,
  type NewDocument,
  type NewDocumentVersion,
  type NewDocumentVersionAttachment,
} from "./document-repositories.js";
export type {
  AttachmentManifestRecord,
  DocumentKind,
  DocumentRecord,
  DocumentVersionAttachmentRecord,
  DocumentVersionRecord,
} from "./document-records.js";
export {
  ApplicationRepository,
  InteractionRepository,
  InterviewRepository,
  MutationUndoTokenRepository,
  NextActionRepository,
  PipelineRepositoryConflictError,
  ReminderRepository,
  StatusDefinitionRepository,
  StatusEventRepository,
  changePipelineStatus,
  completeNextAction,
  consumeMutationUndoToken,
  createPipelineRepositories,
  setNextAction,
  type ConsumeMutationUndoTokenInput,
  type NewApplication,
  type NewInteraction,
  type NewInterview,
  type NewNextAction,
  type NewReminder,
  type NewStatusDefinition,
  type PipelineRepositories,
  type PipelineRepositoryConflictCode,
} from "./pipeline-repositories.js";
export type {
  ApplicationRecord,
  InteractionDirection,
  InteractionRecord,
  InterviewRecord,
  MutationUndoKind,
  MutationUndoTokenRecord,
  NextActionRecord,
  NextActionState,
  ReminderRecord,
  ReminderState,
  StatusDefinitionRecord,
  StatusEventRecord,
  UndoableNextActionRecord,
  UndoableStatusChangeRecord,
} from "./pipeline-records.js";
export {
  createTrackerRepositoryContractSuite,
  type TrackerRepositoryContractSetup,
} from "./tracker-contract-harness.js";
export {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type DatabaseTransaction,
  type ExecuteResult,
  type PortableDatabase,
  type QueryRow,
  type SqlStatement,
  type SqlValue,
  type StorageDiagnostics,
  type StorageHealth,
  type StoragePersistence,
} from "./database-port.js";
export {
  createJobSearchContractSuite,
  type JobSearchContractSetup,
} from "./job-search-contract-harness.js";
export {
  createPhase1RepositoryContractSuite,
  type Phase1RepositoryContractSetup,
} from "./phase-1-repository-contract-harness.js";
export {
  PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES,
  PHASE_1_REPOSITORY_CONTRACT_MANIFEST,
  type Phase1RepositoryContractManifest,
} from "./repository-contract-manifest.js";
export {
  JOB_SEARCH_LIMITS,
  JobSearchRepository,
  normalizeJobSearchTokens,
  openJobSearchRepository,
  type JobSearchCapability,
  type JobSearchFallbackReason,
  type JobSearchInput,
  type JobSearchMode,
  type JobSearchResponse,
  type JobSearchResult,
  type OpenJobSearchOptions,
} from "./job-search.js";
export {
  applySqlMigrations,
  defineSqlMigrations,
  type MigrationResult,
  type SqlMigration,
} from "./migrations.js";
export {
  PORTABLE_ARCHIVE_CONTAINER_VERSION,
  PORTABLE_ARCHIVE_FILE_EXTENSION,
  PORTABLE_ARCHIVE_MANIFEST_PATH,
  PORTABLE_ARCHIVE_MEDIA_TYPE,
  PORTABLE_ARCHIVE_WRITER_LIMITS,
  PortableArchiveWriterError,
  writePortableArchiveV1,
  type PortableArchiveAttachmentReferenceV1,
  type PortableArchiveDataFileSourceV1,
  type PortableArchiveV1,
  type PortableArchiveVaultV1,
  type PortableArchiveWriterErrorCode,
  type PortableArchiveWriterInputV1,
} from "./portable-archive-writer.js";
export {
  AppSettingRepository,
  CompanyRepository,
  ContactRepository,
  DeviceRepository,
  FieldValueRepository,
  JobRepository,
  JobSourceRepository,
  LocationRepository,
  ProvenanceRepository,
  TrackerRepositoryConflictError,
  VaultRepository,
  createTrackerRepositories,
  replaceConfirmedFieldValue,
  type ConfirmedFieldValueReplacement,
  type NewAppSetting,
  type NewCompany,
  type NewCompanyAlias,
  type NewContact,
  type NewContactPointProvenance,
  type NewDevice,
  type NewFieldValue,
  type NewJob,
  type NewJobSource,
  type NewLocation,
  type NewProvenance,
  type NewSourceSnapshot,
  type TrackerRepositories,
  type TrackerRepositoryConflictCode,
} from "./tracker-repositories.js";
export type {
  AppSettingRecord,
  CompanyAliasRecord,
  CompanyRecord,
  ContactPointProvenanceRecord,
  ContactRecord,
  DeviceRecord,
  FieldConfirmationRecord,
  FieldValueRecord,
  JobRecord,
  JobSourceRecord,
  LocationPrecision,
  LocationRecord,
  ProvenanceExtractionMethod,
  ProvenanceRecord,
  SourceSnapshotRecord,
  VaultRecord,
} from "./tracker-records.js";
export {
  createViewRepositoryContractSuite,
  type ViewRepositoryContractSetup,
} from "./view-contract-harness.js";
export {
  SavedViewRepository,
  TagRepository,
  ViewRepositoryConflictError,
  createViewRepositories,
  type NewSavedView,
  type NewTag,
  type SavedViewUpdate,
  type ViewRepositories,
  type ViewRepositoryConflictCode,
} from "./view-repositories.js";
export type { SavedViewRecord, SavedViewScope, TagRecord } from "./view-records.js";
