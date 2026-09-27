import {
  BROWSER_EXPORT_REMINDER_SETTING_KEY,
  AnswerLibraryError,
  CareerStoryError,
  VaultDeletionError,
  createCareerProfileOperations,
  createCareerStoryOperations,
  createAnswerLibraryOperations,
  createDefaultBrowserExportReminderPreference,
  createResumeImportOperations,
  createResumeImportReviewOperations,
  createVaultDeletionOperations,
  deriveBrowserExportReminderFromPreference,
  parseBrowserExportReminderPreference,
  serializeBrowserExportReminderPreference,
  updateBrowserExportReminderPreference,
  type BrowserExportReminder,
  type BrowserExportReminderPreferenceAction,
  type BrowserExportReminderPreferenceV1,
  type ApplicationOperationContext,
  type ApplicationResult,
  type AnswerLibraryEntryDto,
  type AnswerLibraryPort,
  type CreateAnswerLibraryEntryInput,
  type CreateAnswerLibraryEntryPortInput,
  type MarkAnswerLibraryEntryUsedInput,
  type UpdateAnswerLibraryEntryInput,
  type UpdateAnswerLibraryEntryPortInput,
  type CareerProfileEntryDto,
  type CareerProfilePort,
  type CareerStoryDto,
  type CareerStoryPort,
  type CreateCareerStoryInput,
  type CreateCareerStoryPortInput,
  type CreateManualCareerProfileEntryInput,
  type CreateManualCareerProfilePortInput,
  type DeleteVaultPortInput,
  type DeleteVaultInput,
  type PreviewVaultDeletionPortInput,
  type QueueResumeImportInput,
  type ResolveResumeImportGroupInput,
  type ResumeImportPort,
  type ResumeImportPortInput,
  type ResumeImportQueueItemDto,
  type ResumeImportResolutionDto,
  type ResumeImportResolutionPortInput,
  type ResumeImportReviewPort,
  type UpdateCareerStoryInput,
  type UpdateCareerStoryPortInput,
  type VaultDeletionPort,
  type VaultDeletionPreviewDto,
  type VaultDeletionResultDto,
} from "@coredrill/application";
import type { LocalDocumentInput } from "@coredrill/documents";
import {
  BrowserSqliteBusyError,
  BrowserStorageUnavailableError,
  BrowserVaultBusyError,
  BrowserAttachmentStore,
  createBrowserPortableArchiveRestorePortV1,
  openBrowserSqliteDatabase,
  type BrowserSqliteDatabase,
  type BrowserStorageHealthSnapshot,
} from "@coredrill/storage-browser";
import {
  applySqlMigrations,
  commitPortableArchiveRestoreV1,
  createPortableArchiveContentHashV1,
  createPortableDataExportV1,
  createPortableArchiveRestorePreviewV1,
  createPortableVaultContentHashV1,
  createCareerRepositoryContractSuite,
  createCareerRepositories,
  createCareerStoryRepository,
  createAnswerLibraryRepository,
  createResumeImportRepository,
  createResumeImportResolutionRepository,
  createPhase1RepositoryContractSuite,
  createTrackerRepositories,
  defineSqlMigrations,
  CAREER_REPOSITORY_CONTRACT_MANIFEST,
  PHASE_1_REPOSITORY_CONTRACT_MANIFEST,
  PortableArchiveRestoreError,
  runDatabaseContractSuite,
  runPhase1CanonicalJourney,
  inspectPortableArchiveV1,
  sqlStatement,
  writePortableArchiveV1,
  type DatabaseContractRunResult,
  type DatabasePort,
  type AnswerLibraryEntryRecord,
  type CareerStoryWithEvidence,
  type CareerRepositoryContractManifest,
  type Phase1RepositoryContractManifest,
  type Phase1CanonicalJourneyProof,
  type PortableArchiveRestoreCommitPayloadV1,
  type PortableArchiveRestorePortV1,
  type PortableArchiveRestoreTargetSnapshotV1,
  type PortableDatabase,
  type QueryRow,
  type StorageDiagnostics,
} from "@coredrill/storage-core";
import {
  entityId,
  generateEntityId,
  instant,
  type EntityId,
  type Instant,
} from "@coredrill/domain";

import initialMigrationSql from "../../../migrations/0001_vault.sql?raw";
import captureInboxMigrationSql from "../../../migrations/0002_capture_inbox.sql?raw";
import appSettingMigrationSql from "../../../migrations/0003_app_setting.sql?raw";
import locationMigrationSql from "../../../migrations/0004_location.sql?raw";
import companyMigrationSql from "../../../migrations/0005_company.sql?raw";
import contactMigrationSql from "../../../migrations/0006_contact.sql?raw";
import jobMigrationSql from "../../../migrations/0007_job.sql?raw";
import jobSourceMigrationSql from "../../../migrations/0008_job_source.sql?raw";
import sourceSnapshotMigrationSql from "../../../migrations/0009_source_snapshot.sql?raw";
import provenanceMigrationSql from "../../../migrations/0010_provenance.sql?raw";
import companyAliasMigrationSql from "../../../migrations/0011_company_alias.sql?raw";
import contactPointProvenanceMigrationSql from "../../../migrations/0012_contact_point_provenance.sql?raw";
import fieldValueMigrationSql from "../../../migrations/0013_field_value.sql?raw";
import statusDefinitionMigrationSql from "../../../migrations/0014_status_definition.sql?raw";
import jobCurrentStatusMigrationSql from "../../../migrations/0015_job_current_status.sql?raw";
import jobNextActionMigrationSql from "../../../migrations/0016_job_next_action.sql?raw";
import applicationMigrationSql from "../../../migrations/0017_application.sql?raw";
import statusEventMigrationSql from "../../../migrations/0018_status_event.sql?raw";
import interactionMigrationSql from "../../../migrations/0019_interaction.sql?raw";
import nextActionMigrationSql from "../../../migrations/0020_next_action.sql?raw";
import interviewMigrationSql from "../../../migrations/0021_interview.sql?raw";
import reminderMigrationSql from "../../../migrations/0022_reminder.sql?raw";
import tagMigrationSql from "../../../migrations/0023_tag.sql?raw";
import jobTagMigrationSql from "../../../migrations/0024_job_tag.sql?raw";
import savedViewMigrationSql from "../../../migrations/0025_saved_view.sql?raw";
import documentMigrationSql from "../../../migrations/0026_document.sql?raw";
import documentVersionMigrationSql from "../../../migrations/0027_document_version.sql?raw";
import documentJobLinkMigrationSql from "../../../migrations/0028_document_job_link.sql?raw";
import attachmentManifestMigrationSql from "../../../migrations/0029_attachment_manifest.sql?raw";
import documentVersionAttachmentMigrationSql from "../../../migrations/0030_document_version_attachment.sql?raw";
import documentStyleExampleMigrationSql from "../../../migrations/0031_document_style_example.sql?raw";
import deviceMigrationSql from "../../../migrations/0032_device.sql?raw";
import integrityProbeMigrationSql from "../../../migrations/0033_integrity_probe.sql?raw";
import validateExistingIntegrityMigrationSql from "../../../migrations/0034_validate_existing_integrity.sql?raw";
import dropIntegrityProbeMigrationSql from "../../../migrations/0035_drop_integrity_probe.sql?raw";
import applicationDocumentInsertGuardMigrationSql from "../../../migrations/0036_application_document_insert_guard.sql?raw";
import applicationDocumentUpdateGuardMigrationSql from "../../../migrations/0037_application_document_update_guard.sql?raw";
import documentKindUpdateGuardMigrationSql from "../../../migrations/0038_document_kind_update_guard.sql?raw";
import documentVersionLineageGuardMigrationSql from "../../../migrations/0039_document_version_lineage_guard.sql?raw";
import documentVersionUpdateGuardMigrationSql from "../../../migrations/0040_document_version_update_guard.sql?raw";
import documentVersionDeleteGuardMigrationSql from "../../../migrations/0041_document_version_delete_guard.sql?raw";
import sourceSnapshotUpdateGuardMigrationSql from "../../../migrations/0042_source_snapshot_update_guard.sql?raw";
import statusEventUpdateGuardMigrationSql from "../../../migrations/0043_status_event_update_guard.sql?raw";
import interactionUpdateGuardMigrationSql from "../../../migrations/0044_interaction_update_guard.sql?raw";
import attachmentManifestUpdateGuardMigrationSql from "../../../migrations/0045_attachment_manifest_update_guard.sql?raw";
import { createExtensionInbox, type ExtensionInboxApi } from "./extension-transfer.js";
import {
  runJobSearchBenchmark,
  runStorageBenchmark,
  type JobSearchBenchmarkResult,
  type StorageBenchmarkInput,
  type StorageBenchmarkResult,
} from "./storage-benchmark.js";
import {
  runPortableArchiveWriterProof,
  type PortableArchiveBrowserProof,
} from "./portable-archive-proof.js";

const DATABASE_NAME = "/coredrill-phase0.sqlite3";
const MIGRATION_APPLIED_AT = "2026-08-24T08:00:00.000Z";
const ADDITIONAL_MIGRATION_PATH = /\/(?<version>\d{4})_(?<name>[a-z0-9_]+)\.sql$/u;
const additionalMigrationSources = import.meta.glob("../../../migrations/*.sql", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Readonly<Record<string, string>>;

interface VaultRow extends QueryRow {
  readonly id: string;
  readonly name: string;
  readonly schema_version: number;
  readonly created_at: string;
  readonly last_opened_at: string;
}

interface VaultInput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastOpenedAt: string;
}

interface MigrationLedgerRow extends QueryRow {
  readonly version: number;
  readonly name: string;
  readonly sha256: string;
  readonly applied_at: string;
}

interface PortableDatabaseJson {
  readonly schemaVersion: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytesBase64: string;
}

interface OpenMigrationProof {
  readonly appliedVersions: readonly number[];
  readonly diagnostics: StorageDiagnostics;
}

interface OpenOptions {
  readonly expectedExisting?: boolean;
}

interface OpenAttempt {
  readonly code?: "sqlite_busy" | "storage_unavailable" | "vault_busy";
  readonly message?: string;
  readonly opened: boolean;
  readonly proof?: OpenMigrationProof;
}

interface BrowserExportReminderProof {
  readonly preference: BrowserExportReminderPreferenceV1;
  readonly reminder: BrowserExportReminder;
}

interface BrowserExportReminderUpdateInput {
  readonly action: BrowserExportReminderPreferenceAction;
  readonly nowUnixMs: number;
}

interface BrowserVaultDeletionPreviewInput {
  readonly vaultId: string;
  readonly previewId: string;
  readonly previewedAt: string;
}

interface BrowserVaultDeletionCommandInput extends DeleteVaultInput {
  readonly deletionId: string;
  readonly deletedAt: string;
}

interface Phase1RepositoryContractProof {
  readonly manifest: Phase1RepositoryContractManifest;
  readonly run: DatabaseContractRunResult;
}

interface CareerRepositoryContractProof {
  readonly manifest: CareerRepositoryContractManifest;
  readonly run: DatabaseContractRunResult;
}

interface HumanReadableExportInput {
  readonly generatedAt: string;
  readonly vaultId: string;
}

interface HumanReadableExportProof {
  readonly dataFileCount: number;
  readonly datasetCount: number;
  readonly datasetNames: readonly string[];
  readonly jsonFiles: number;
  readonly csvFiles: number;
  readonly rowCount: number;
  readonly sourceSchemaVersion: number;
}

interface PortableArchiveRestoreProofInput {
  readonly archiveId: string;
  readonly generatedAt: string;
  readonly vaultId: string;
  readonly previewName: string;
  readonly staleName: string;
}

interface PortableArchiveRestoreProof {
  readonly archiveSha256: string;
  readonly archiveByteLength: number;
  readonly dataFileCount: number;
  readonly attachmentCount: number;
  readonly corruptionRejected: boolean;
  readonly corruptionPreservedTarget: boolean;
  readonly conflict: "same_vault_replace";
  readonly requiredConfirmation: "replace_same_vault";
  readonly previewPreservedTarget: boolean;
  readonly staleTargetRejected: boolean;
  readonly staleTargetPreserved: boolean;
  readonly committed: true;
  readonly restoredDatabaseSha256: string;
  readonly restoredDatabaseMatchesArchive: boolean;
  readonly restoredVaultName: string;
}

interface PortableRecoveryFixtureInput {
  readonly archiveId: string;
  readonly generatedAt: string;
  readonly vaultId: string;
}

interface PortableRecoveryFixture {
  readonly archiveByteLength: number;
  readonly archiveSha256: string;
  readonly archiveBytesBase64: string;
  readonly databaseSha256: string;
  readonly contentSha256: string;
  readonly attachmentContentIds: readonly string[];
  readonly dataFileCount: number;
  readonly attachmentCount: number;
  readonly phase3Inventory: Phase3RecoveryInventory;
}

interface PortableRecoveryRestoreInput {
  readonly archiveBytesBase64: string;
  readonly archiveSha256: string;
  readonly generatedAt: string;
  readonly vaultId: string;
}

interface PortableRecoveryRestoreProof {
  readonly contentSha256: string;
  readonly databaseSha256: string;
  readonly databaseMatchesArchive: boolean;
  readonly attachmentContentIds: readonly string[];
  readonly attachmentCount: number;
  readonly conflict: "none";
  readonly committed: true;
  readonly phase3Inventory: Phase3RecoveryInventory;
}

interface Phase3RecoveryInventory {
  readonly jobRequirements: number;
  readonly careerEvidence: number;
  readonly stories: number;
  readonly storyEvidenceLinks: number;
  readonly skillEvidenceLinks: number;
  readonly requirementEvidenceSelections: number;
  readonly importRuns: number;
  readonly importProposals: number;
  readonly importResolutions: number;
  readonly importResolutionLinks: number;
  readonly answerEntries: number;
  readonly answerVersions: number;
  readonly attachmentManifests: number;
  readonly attachmentLinks: number;
}

export interface CoredrillStorageSpikeApi {
  createAnswerLibraryEntry(
    input: CreateAnswerLibraryEntryInput,
  ): Promise<ApplicationResult<AnswerLibraryEntryDto>>;
  updateAnswerLibraryEntry(
    input: UpdateAnswerLibraryEntryInput,
  ): Promise<ApplicationResult<AnswerLibraryEntryDto>>;
  markAnswerLibraryEntryUsed(
    input: MarkAnswerLibraryEntryUsedInput,
  ): Promise<ApplicationResult<AnswerLibraryEntryDto>>;
  listAnswerLibraryEntries(): Promise<ApplicationResult<readonly AnswerLibraryEntryDto[]>>;
  createManualCareerProfileEntry(
    input: CreateManualCareerProfileEntryInput,
  ): Promise<ApplicationResult<CareerProfileEntryDto>>;
  listManualCareerProfileEntries(): Promise<ApplicationResult<readonly CareerProfileEntryDto[]>>;
  createCareerStory(input: CreateCareerStoryInput): Promise<ApplicationResult<CareerStoryDto>>;
  updateCareerStory(input: UpdateCareerStoryInput): Promise<ApplicationResult<CareerStoryDto>>;
  listCareerStories(): Promise<ApplicationResult<readonly CareerStoryDto[]>>;
  listPendingResumeImports(): Promise<ApplicationResult<readonly ResumeImportQueueItemDto[]>>;
  queueResumeImport(
    input: LocalDocumentInput,
  ): Promise<ApplicationResult<ResumeImportQueueItemDto>>;
  resolveResumeImportGroup(
    input: ResolveResumeImportGroupInput,
  ): Promise<ApplicationResult<ResumeImportResolutionDto>>;
  openAndMigrate(options?: OpenOptions): Promise<OpenMigrationProof>;
  tryOpenAndMigrate(options?: OpenOptions): Promise<OpenAttempt>;
  writeVault(input: VaultInput): Promise<void>;
  proveRollback(input: VaultInput): Promise<boolean>;
  listVaults(): Promise<readonly VaultRow[]>;
  exportPortable(): Promise<PortableDatabaseJson>;
  restorePortable(portable: PortableDatabaseJson): Promise<void>;
  diagnostics(): Promise<StorageDiagnostics>;
  storageHealth(): Promise<BrowserStorageHealthSnapshot>;
  requestPersistentStorage(): Promise<BrowserStorageHealthSnapshot>;
  getBrowserExportReminder(nowUnixMs: number): Promise<BrowserExportReminderProof>;
  updateBrowserExportReminder(
    input: BrowserExportReminderUpdateInput,
  ): Promise<BrowserExportReminderProof>;
  previewVaultDeletion(
    input: BrowserVaultDeletionPreviewInput,
  ): Promise<ApplicationResult<VaultDeletionPreviewDto>>;
  deleteVault(
    input: BrowserVaultDeletionCommandInput,
  ): Promise<ApplicationResult<VaultDeletionResultDto>>;
  close(): Promise<void>;
  delete(): Promise<boolean>;
  runBenchmark(input: StorageBenchmarkInput): Promise<StorageBenchmarkResult>;
  runJobSearchBenchmark(input: StorageBenchmarkInput): Promise<JobSearchBenchmarkResult>;
  runPhase1RepositoryContracts(): Promise<Phase1RepositoryContractProof>;
  runCareerRepositoryContracts(): Promise<CareerRepositoryContractProof>;
  runPhase1CanonicalJourney(): Promise<Phase1CanonicalJourneyProof>;
  runPortableArchiveWriterProof(): Promise<PortableArchiveBrowserProof>;
  exportHumanReadable(input: HumanReadableExportInput): Promise<HumanReadableExportProof>;
  runPortableArchiveRestoreProof(
    input: PortableArchiveRestoreProofInput,
  ): Promise<PortableArchiveRestoreProof>;
  createPortableRecoveryFixture(
    input: PortableRecoveryFixtureInput,
  ): Promise<PortableRecoveryFixture>;
  restorePortableRecoveryFixture(
    input: PortableRecoveryRestoreInput,
  ): Promise<PortableRecoveryRestoreProof>;
}

declare global {
  var coredrillStorageSpike: CoredrillStorageSpikeApi;
  var coredrillExtensionInbox: ExtensionInboxApi;
}

let database: BrowserSqliteDatabase | undefined;
let databaseOpen: Promise<BrowserSqliteDatabase> | undefined;
let attachmentStore: BrowserAttachmentStore | undefined;
const statusElement = document.querySelector<HTMLElement>("#status");

const setStatus = (message: string): void => {
  if (statusElement !== null) statusElement.textContent = message;
};

const sha256Text = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const additionalMigrations = async () =>
  Promise.all(
    Object.entries(additionalMigrationSources)
      .map(([sourcePath, sql]) => {
        const match = ADDITIONAL_MIGRATION_PATH.exec(sourcePath.replaceAll("\\", "/"));
        if (match?.groups === undefined) {
          throw new Error(`Migration source path ${sourcePath} is invalid.`);
        }
        return {
          version: Number(match.groups["version"]),
          name: match.groups["name"]?.replaceAll("_", "-") ?? "",
          sql,
        };
      })
      .filter((migration) => migration.version > 45)
      .sort((left, right) => left.version - right.version)
      .map(async (migration) => ({
        ...migration,
        sha256: await sha256Text(migration.sql),
      })),
  );

const migrations = async () =>
  defineSqlMigrations([
    {
      version: 1,
      name: "vault",
      sha256: await sha256Text(initialMigrationSql),
      sql: initialMigrationSql,
    },
    {
      version: 2,
      name: "capture-inbox",
      sha256: await sha256Text(captureInboxMigrationSql),
      sql: captureInboxMigrationSql,
    },
    {
      version: 3,
      name: "app-setting",
      sha256: await sha256Text(appSettingMigrationSql),
      sql: appSettingMigrationSql,
    },
    {
      version: 4,
      name: "location",
      sha256: await sha256Text(locationMigrationSql),
      sql: locationMigrationSql,
    },
    {
      version: 5,
      name: "company",
      sha256: await sha256Text(companyMigrationSql),
      sql: companyMigrationSql,
    },
    {
      version: 6,
      name: "contact",
      sha256: await sha256Text(contactMigrationSql),
      sql: contactMigrationSql,
    },
    {
      version: 7,
      name: "job",
      sha256: await sha256Text(jobMigrationSql),
      sql: jobMigrationSql,
    },
    {
      version: 8,
      name: "job-source",
      sha256: await sha256Text(jobSourceMigrationSql),
      sql: jobSourceMigrationSql,
    },
    {
      version: 9,
      name: "source-snapshot",
      sha256: await sha256Text(sourceSnapshotMigrationSql),
      sql: sourceSnapshotMigrationSql,
    },
    {
      version: 10,
      name: "provenance",
      sha256: await sha256Text(provenanceMigrationSql),
      sql: provenanceMigrationSql,
    },
    {
      version: 11,
      name: "company-alias",
      sha256: await sha256Text(companyAliasMigrationSql),
      sql: companyAliasMigrationSql,
    },
    {
      version: 12,
      name: "contact-point-provenance",
      sha256: await sha256Text(contactPointProvenanceMigrationSql),
      sql: contactPointProvenanceMigrationSql,
    },
    {
      version: 13,
      name: "field-value",
      sha256: await sha256Text(fieldValueMigrationSql),
      sql: fieldValueMigrationSql,
    },
    {
      version: 14,
      name: "status-definition",
      sha256: await sha256Text(statusDefinitionMigrationSql),
      sql: statusDefinitionMigrationSql,
    },
    {
      version: 15,
      name: "job-current-status",
      sha256: await sha256Text(jobCurrentStatusMigrationSql),
      sql: jobCurrentStatusMigrationSql,
    },
    {
      version: 16,
      name: "job-next-action",
      sha256: await sha256Text(jobNextActionMigrationSql),
      sql: jobNextActionMigrationSql,
    },
    {
      version: 17,
      name: "application",
      sha256: await sha256Text(applicationMigrationSql),
      sql: applicationMigrationSql,
    },
    {
      version: 18,
      name: "status-event",
      sha256: await sha256Text(statusEventMigrationSql),
      sql: statusEventMigrationSql,
    },
    {
      version: 19,
      name: "interaction",
      sha256: await sha256Text(interactionMigrationSql),
      sql: interactionMigrationSql,
    },
    {
      version: 20,
      name: "next-action",
      sha256: await sha256Text(nextActionMigrationSql),
      sql: nextActionMigrationSql,
    },
    {
      version: 21,
      name: "interview",
      sha256: await sha256Text(interviewMigrationSql),
      sql: interviewMigrationSql,
    },
    {
      version: 22,
      name: "reminder",
      sha256: await sha256Text(reminderMigrationSql),
      sql: reminderMigrationSql,
    },
    {
      version: 23,
      name: "tag",
      sha256: await sha256Text(tagMigrationSql),
      sql: tagMigrationSql,
    },
    {
      version: 24,
      name: "job-tag",
      sha256: await sha256Text(jobTagMigrationSql),
      sql: jobTagMigrationSql,
    },
    {
      version: 25,
      name: "saved-view",
      sha256: await sha256Text(savedViewMigrationSql),
      sql: savedViewMigrationSql,
    },
    {
      version: 26,
      name: "document",
      sha256: await sha256Text(documentMigrationSql),
      sql: documentMigrationSql,
    },
    {
      version: 27,
      name: "document-version",
      sha256: await sha256Text(documentVersionMigrationSql),
      sql: documentVersionMigrationSql,
    },
    {
      version: 28,
      name: "document-job-link",
      sha256: await sha256Text(documentJobLinkMigrationSql),
      sql: documentJobLinkMigrationSql,
    },
    {
      version: 29,
      name: "attachment-manifest",
      sha256: await sha256Text(attachmentManifestMigrationSql),
      sql: attachmentManifestMigrationSql,
    },
    {
      version: 30,
      name: "document-version-attachment",
      sha256: await sha256Text(documentVersionAttachmentMigrationSql),
      sql: documentVersionAttachmentMigrationSql,
    },
    {
      version: 31,
      name: "document-style-example",
      sha256: await sha256Text(documentStyleExampleMigrationSql),
      sql: documentStyleExampleMigrationSql,
    },
    {
      version: 32,
      name: "device",
      sha256: await sha256Text(deviceMigrationSql),
      sql: deviceMigrationSql,
    },
    {
      version: 33,
      name: "integrity-probe",
      sha256: await sha256Text(integrityProbeMigrationSql),
      sql: integrityProbeMigrationSql,
    },
    {
      version: 34,
      name: "validate-existing-integrity",
      sha256: await sha256Text(validateExistingIntegrityMigrationSql),
      sql: validateExistingIntegrityMigrationSql,
    },
    {
      version: 35,
      name: "drop-integrity-probe",
      sha256: await sha256Text(dropIntegrityProbeMigrationSql),
      sql: dropIntegrityProbeMigrationSql,
    },
    {
      version: 36,
      name: "application-document-insert-guard",
      sha256: await sha256Text(applicationDocumentInsertGuardMigrationSql),
      sql: applicationDocumentInsertGuardMigrationSql,
    },
    {
      version: 37,
      name: "application-document-update-guard",
      sha256: await sha256Text(applicationDocumentUpdateGuardMigrationSql),
      sql: applicationDocumentUpdateGuardMigrationSql,
    },
    {
      version: 38,
      name: "document-kind-update-guard",
      sha256: await sha256Text(documentKindUpdateGuardMigrationSql),
      sql: documentKindUpdateGuardMigrationSql,
    },
    {
      version: 39,
      name: "document-version-lineage-guard",
      sha256: await sha256Text(documentVersionLineageGuardMigrationSql),
      sql: documentVersionLineageGuardMigrationSql,
    },
    {
      version: 40,
      name: "document-version-update-guard",
      sha256: await sha256Text(documentVersionUpdateGuardMigrationSql),
      sql: documentVersionUpdateGuardMigrationSql,
    },
    {
      version: 41,
      name: "document-version-delete-guard",
      sha256: await sha256Text(documentVersionDeleteGuardMigrationSql),
      sql: documentVersionDeleteGuardMigrationSql,
    },
    {
      version: 42,
      name: "source-snapshot-update-guard",
      sha256: await sha256Text(sourceSnapshotUpdateGuardMigrationSql),
      sql: sourceSnapshotUpdateGuardMigrationSql,
    },
    {
      version: 43,
      name: "status-event-update-guard",
      sha256: await sha256Text(statusEventUpdateGuardMigrationSql),
      sql: statusEventUpdateGuardMigrationSql,
    },
    {
      version: 44,
      name: "interaction-update-guard",
      sha256: await sha256Text(interactionUpdateGuardMigrationSql),
      sql: interactionUpdateGuardMigrationSql,
    },
    {
      version: 45,
      name: "attachment-manifest-update-guard",
      sha256: await sha256Text(attachmentManifestUpdateGuardMigrationSql),
      sql: attachmentManifestUpdateGuardMigrationSql,
    },
    ...(await additionalMigrations()),
  ]);

const getDatabase = async (options: OpenOptions = {}): Promise<BrowserSqliteDatabase> => {
  if (database !== undefined) return database;

  databaseOpen ??= openBrowserSqliteDatabase({
    databaseName: DATABASE_NAME,
    expectedExisting: options.expectedExisting ?? false,
  });

  try {
    database = await databaseOpen;
    return database;
  } catch (error) {
    databaseOpen = undefined;
    throw error;
  } finally {
    if (database !== undefined) databaseOpen = undefined;
  }
};

interface CareerEntryRecordBase {
  readonly id: CareerProfileEntryDto["id"];
  readonly createdAt: CareerProfileEntryDto["createdAt"];
  readonly rowVersion: number;
}

const careerEntryDto = (
  record: CareerEntryRecordBase,
  kind: CareerProfileEntryDto["kind"],
  primaryLabel: string,
  secondaryLabel: string | null,
  startDate: CareerProfileEntryDto["startDate"] = null,
  endDate: CareerProfileEntryDto["endDate"] = null,
  current = false,
  verificationState: CareerProfileEntryDto["verificationState"] = null,
): CareerProfileEntryDto =>
  Object.freeze({
    id: record.id,
    kind,
    primaryLabel,
    secondaryLabel,
    startDate,
    endDate,
    current,
    verificationState,
    createdAt: record.createdAt,
    rowVersion: record.rowVersion,
  });

const getCareerRepositories = async () => {
  const client = await getDatabase();
  await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
  return createCareerRepositories(client);
};

const careerProfilePort: CareerProfilePort = Object.freeze({
  createManualEntry: async (input: CreateManualCareerProfilePortInput) => {
    const repositories = await getCareerRepositories();
    switch (input.kind) {
      case "basics": {
        const stored = await repositories.preferences.insert({
          id: input.id,
          displayName: input.displayName,
          summary: input.summary,
          targetRoles: input.targetRoles,
          locationId: input.locationId,
          workPreferences: { workModes: [...input.workPreferences.workModes] },
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(stored, "basics", stored.displayName, null);
      }
      case "employment": {
        const stored = await repositories.employment.insert({
          id: input.id,
          organization: input.organization,
          role: input.role,
          startDate: input.startDate,
          endDate: input.endDate,
          current: input.current,
          description: input.description,
          sourceDocumentId: input.sourceDocumentId,
          verificationState: input.verificationState,
          archivedAt: input.archivedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(
          stored,
          "employment",
          stored.role,
          stored.organization,
          stored.startDate,
          stored.endDate,
          stored.current,
          "user_confirmed",
        );
      }
      case "education": {
        const stored = await repositories.education.insert({
          id: input.id,
          institution: input.institution,
          credential: input.credential,
          field: input.field,
          startDate: input.startDate,
          endDate: input.endDate,
          details: input.details,
          sourceDocumentId: input.sourceDocumentId,
          verificationState: input.verificationState,
          archivedAt: input.archivedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(
          stored,
          "education",
          stored.credential,
          stored.institution,
          stored.startDate,
          stored.endDate,
          false,
          "user_confirmed",
        );
      }
      case "project": {
        const stored = await repositories.projects.insert({
          id: input.id,
          name: input.name,
          summary: input.summary,
          url: input.url,
          startDate: input.startDate,
          endDate: input.endDate,
          sourceDocumentId: input.sourceDocumentId,
          verificationState: input.verificationState,
          archivedAt: input.archivedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(
          stored,
          "project",
          stored.name,
          null,
          stored.startDate,
          stored.endDate,
          false,
          "user_confirmed",
        );
      }
      case "skill": {
        const stored = await repositories.skills.insert({
          id: input.id,
          canonicalName: input.canonicalName,
          category: input.category,
          aliases: input.aliases,
          sourceDocumentId: input.sourceDocumentId,
          verificationState: input.verificationState,
          archivedAt: input.archivedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(
          stored,
          "skill",
          stored.canonicalName,
          stored.category,
          null,
          null,
          false,
          stored.verificationState === "imported" ? "imported" : "user_confirmed",
        );
      }
      case "accomplishment": {
        const stored = await repositories.accomplishments.insert({
          id: input.id,
          parentType: input.parentType,
          parentId: input.parentId,
          action: input.action,
          result: input.result,
          metrics: input.metrics,
          sourceDocumentId: input.sourceDocumentId,
          verificationState: input.verificationState,
          archivedAt: input.archivedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(
          stored,
          "accomplishment",
          stored.action,
          stored.result,
          null,
          null,
          false,
          "user_confirmed",
        );
      }
      case "certification": {
        const stored = await repositories.certifications.insert({
          id: input.id,
          name: input.name,
          issuer: input.issuer,
          issuedDate: input.issuedDate,
          expiresDate: input.expiresDate,
          credentialUrl: input.credentialUrl,
          sourceDocumentId: input.sourceDocumentId,
          verificationState: input.verificationState,
          archivedAt: input.archivedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(
          stored,
          "certification",
          stored.name,
          stored.issuer,
          stored.issuedDate,
          stored.expiresDate,
          false,
          "user_confirmed",
        );
      }
      case "publication": {
        const stored = await repositories.publications.insert({
          id: input.id,
          title: input.title,
          publisher: input.publisher,
          publishedDate: input.publishedDate,
          url: input.url,
          summary: input.summary,
          sourceDocumentId: input.sourceDocumentId,
          verificationState: input.verificationState,
          archivedAt: input.archivedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(
          stored,
          "publication",
          stored.title,
          stored.publisher,
          stored.publishedDate,
          null,
          false,
          "user_confirmed",
        );
      }
      case "volunteer": {
        const stored = await repositories.volunteer.insert({
          id: input.id,
          organization: input.organization,
          role: input.role,
          startDate: input.startDate,
          endDate: input.endDate,
          current: input.current,
          description: input.description,
          sourceDocumentId: input.sourceDocumentId,
          verificationState: input.verificationState,
          archivedAt: input.archivedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return careerEntryDto(
          stored,
          "volunteer",
          stored.role,
          stored.organization,
          stored.startDate,
          stored.endDate,
          stored.current,
          "user_confirmed",
        );
      }
    }
  },
  listManualEntries: async () => {
    const repositories = await getCareerRepositories();
    const [
      basics,
      employment,
      education,
      projects,
      skills,
      accomplishments,
      certifications,
      publications,
      volunteer,
    ] = await Promise.all([
      repositories.preferences.get(),
      repositories.employment.listActive(),
      repositories.education.listActive(),
      repositories.projects.listActive(),
      repositories.skills.listActive(),
      repositories.accomplishments.listActive(),
      repositories.certifications.listActive(),
      repositories.publications.listActive(),
      repositories.volunteer.listActive(),
    ]);
    const entries: CareerProfileEntryDto[] = [
      ...(basics === null ? [] : [careerEntryDto(basics, "basics", basics.displayName, null)]),
      ...employment.map((stored) =>
        careerEntryDto(
          stored,
          "employment",
          stored.role,
          stored.organization,
          stored.startDate,
          stored.endDate,
          stored.current,
          "user_confirmed",
        ),
      ),
      ...education.map((stored) =>
        careerEntryDto(
          stored,
          "education",
          stored.credential,
          stored.institution,
          stored.startDate,
          stored.endDate,
          false,
          "user_confirmed",
        ),
      ),
      ...projects.map((stored) =>
        careerEntryDto(
          stored,
          "project",
          stored.name,
          null,
          stored.startDate,
          stored.endDate,
          false,
          "user_confirmed",
        ),
      ),
      ...skills.map((stored) =>
        careerEntryDto(
          stored,
          "skill",
          stored.canonicalName,
          stored.category,
          null,
          null,
          false,
          stored.verificationState === "imported" ? "imported" : "user_confirmed",
        ),
      ),
      ...accomplishments.map((stored) =>
        careerEntryDto(
          stored,
          "accomplishment",
          stored.action,
          stored.result,
          null,
          null,
          false,
          "user_confirmed",
        ),
      ),
      ...certifications.map((stored) =>
        careerEntryDto(
          stored,
          "certification",
          stored.name,
          stored.issuer,
          stored.issuedDate,
          stored.expiresDate,
          false,
          "user_confirmed",
        ),
      ),
      ...publications.map((stored) =>
        careerEntryDto(
          stored,
          "publication",
          stored.title,
          stored.publisher,
          stored.publishedDate,
          null,
          false,
          "user_confirmed",
        ),
      ),
      ...volunteer.map((stored) =>
        careerEntryDto(
          stored,
          "volunteer",
          stored.role,
          stored.organization,
          stored.startDate,
          stored.endDate,
          stored.current,
          "user_confirmed",
        ),
      ),
    ];
    entries.sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
    );
    return Object.freeze(entries);
  },
});

const CAREER_ENTITY_TYPE_BY_KIND = Object.freeze({
  basics: "candidate-profile",
  employment: "experience",
  education: "education",
  project: "project",
  skill: "skill",
  accomplishment: "accomplishment",
  certification: "certification",
  publication: "publication",
  volunteer: "volunteer-experience",
} as const);

const careerProfileOperations = createCareerProfileOperations({
  careerProfile: careerProfilePort,
  createId: (kind) => generateEntityId(CAREER_ENTITY_TYPE_BY_KIND[kind]),
});

const getCareerStoryRepository = async () => {
  const client = await getDatabase();
  await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
  return createCareerStoryRepository(client);
};

const careerStoryDto = (value: CareerStoryWithEvidence): CareerStoryDto =>
  Object.freeze({
    id: value.id,
    title: value.title,
    situation: value.situation,
    action: value.action,
    result: value.result,
    tags: Object.freeze([...value.tags]),
    privacyTags: Object.freeze([...value.privacyTags]),
    linkedEvidence: Object.freeze(
      value.linkedEvidence.map(({ evidenceId, evidenceKind }) =>
        Object.freeze({ evidenceId, evidenceKind }),
      ),
    ),
    sourceDocumentId: value.sourceDocumentId,
    verificationState: value.verificationState,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    rowVersion: value.rowVersion,
  });

const careerStoryPort: CareerStoryPort = Object.freeze({
  createStory: async (input: CreateCareerStoryPortInput) => {
    const repository = await getCareerStoryRepository();
    const stored = await repository.create(
      {
        id: input.id,
        title: input.title,
        situation: input.situation,
        action: input.action,
        result: input.result,
        tags: input.tags,
        privacyTags: input.privacyTags,
        sourceDocumentId: input.sourceDocumentId,
        verificationState: input.verificationState,
        archivedAt: input.archivedAt,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
      input.linkedEvidence.map(({ evidenceId, evidenceKind }) => ({ evidenceId, evidenceKind })),
    );
    return careerStoryDto(stored);
  },
  updateStory: async (input: UpdateCareerStoryPortInput) => {
    const repository = await getCareerStoryRepository();
    try {
      return careerStoryDto(
        await repository.update(
          {
            id: input.id,
            title: input.title,
            situation: input.situation,
            action: input.action,
            result: input.result,
            tags: input.tags,
            privacyTags: input.privacyTags,
            expectedRowVersion: input.expectedRowVersion,
            updatedAt: input.updatedAt,
          },
          input.linkedEvidence.map(({ evidenceId, evidenceKind }) => ({
            evidenceId,
            evidenceKind,
          })),
        ),
      );
    } catch {
      throw new CareerStoryError("conflict");
    }
  },
  listStories: async () => {
    const repository = await getCareerStoryRepository();
    return Object.freeze((await repository.listActive()).map(careerStoryDto));
  },
});

const careerStoryOperations = createCareerStoryOperations({
  careerStories: careerStoryPort,
  createId: () => generateEntityId("anecdote"),
});

const getAnswerLibraryRepository = async () => {
  const client = await getDatabase();
  await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
  return createAnswerLibraryRepository(client);
};

const answerLibraryDto = (value: AnswerLibraryEntryRecord): AnswerLibraryEntryDto =>
  Object.freeze({
    ...value,
    currentVersion: Object.freeze({ ...value.currentVersion }),
    versions: Object.freeze(value.versions.map((version) => Object.freeze({ ...version }))),
  });

const answerLibraryPort: AnswerLibraryPort = Object.freeze({
  createAnswer: async (input: CreateAnswerLibraryEntryPortInput) => {
    const repository = await getAnswerLibraryRepository();
    return answerLibraryDto(await repository.create(input));
  },
  updateAnswer: async (input: UpdateAnswerLibraryEntryPortInput) => {
    const repository = await getAnswerLibraryRepository();
    try {
      return answerLibraryDto(await repository.update(input));
    } catch {
      throw new AnswerLibraryError("conflict");
    }
  },
  markAnswerUsed: async (id: EntityId<"document">, expectedRowVersion: number, usedAt: Instant) => {
    const repository = await getAnswerLibraryRepository();
    try {
      return answerLibraryDto(await repository.markUsed(id, expectedRowVersion, usedAt));
    } catch {
      throw new AnswerLibraryError("conflict");
    }
  },
  listAnswers: async () => {
    const repository = await getAnswerLibraryRepository();
    return Object.freeze((await repository.listActive()).map(answerLibraryDto));
  },
});

const hashText = async (value: string): Promise<string> => {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const answerLibraryOperations = createAnswerLibraryOperations({
  answers: answerLibraryPort,
  createId: (kind) => generateEntityId(kind),
  hashText,
});

const resumeImportPort: ResumeImportPort = Object.freeze({
  enqueue: async (input: ResumeImportPortInput) => {
    const client = await getDatabase();
    await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
    return createResumeImportRepository(client).enqueue(input);
  },
  listPending: async () => {
    const client = await getDatabase();
    await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
    return createResumeImportRepository(client).listPending();
  },
});

const resumeImportOperations = createResumeImportOperations({
  createId: (kind) => generateEntityId(kind),
  resumeImports: resumeImportPort,
});

const resumeImportReviewPort: ResumeImportReviewPort = Object.freeze({
  resolve: async (input: ResumeImportResolutionPortInput) => {
    const client = await getDatabase();
    await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
    return createResumeImportResolutionRepository(client).resolve(input);
  },
});

const resumeImportReviewOperations = createResumeImportReviewOperations({
  createId: (kind) => generateEntityId(kind),
  review: resumeImportReviewPort,
});

const careerProfileOperationContext = (): ApplicationOperationContext =>
  Object.freeze({
    operationId: generateEntityId("application-operation"),
    initiatedAt: instant(new Date().toISOString()),
  });

const resumeImportInput = async (input: LocalDocumentInput): Promise<QueueResumeImportInput> => {
  const { documentIrToPlainText, importLocalDocument } =
    await import("@coredrill/documents/browser");
  const imported = await importLocalDocument({ ...input, bytes: Uint8Array.from(input.bytes) });
  const blocks = imported.mappings.map((mapping) => {
    const match = /^\/document\/content\/(?<index>\d+)$/u.exec(mapping.targetPath);
    const index = Number(match?.groups?.["index"]);
    const block = imported.structuredDocument.document.content[index];
    if (!Number.isSafeInteger(index) || block === undefined) {
      throw new TypeError("Imported resume mapping does not reference a retained document block.");
    }
    return Object.freeze({
      sourceExcerpt: mapping.sourceExcerpt,
      sourcePointer: mapping.sourcePointer,
      text: documentIrToPlainText({
        specVersion: imported.structuredDocument.specVersion,
        document: { type: "doc", content: [block] },
      }),
    });
  });
  return Object.freeze({
    blocks: Object.freeze(blocks),
    source: Object.freeze({
      byteLength: imported.source.byteLength,
      fileName: imported.source.fileName,
      format: imported.source.format,
      mediaType: imported.source.mediaType,
      ...(imported.summary.pageCount === undefined
        ? {}
        : { pageCount: imported.summary.pageCount }),
      sha256: imported.source.sha256,
    }),
    warnings: Object.freeze(imported.warnings.map(({ message }) => message)),
  });
};

const getAttachmentStore = async (): Promise<BrowserAttachmentStore> => {
  attachmentStore ??= await BrowserAttachmentStore.open();
  return attachmentStore;
};

const readBrowserExportReminder = async (
  nowUnixMs: number,
): Promise<BrowserExportReminderProof> => {
  const client = await getDatabase();
  await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
  const stored = await createTrackerRepositories(client).settings.get(
    BROWSER_EXPORT_REMINDER_SETTING_KEY,
  );
  const preference =
    stored === undefined
      ? createDefaultBrowserExportReminderPreference()
      : parseBrowserExportReminderPreference(stored.value);
  return Object.freeze({
    preference,
    reminder: deriveBrowserExportReminderFromPreference(preference, nowUnixMs),
  });
};

const writeBrowserExportReminder = async (
  input: BrowserExportReminderUpdateInput,
): Promise<BrowserExportReminderProof> => {
  const current = await readBrowserExportReminder(input.nowUnixMs);
  const preference = updateBrowserExportReminderPreference(
    current.preference,
    input.action,
    input.nowUnixMs,
  );
  const client = await getDatabase();
  await createTrackerRepositories(client).settings.put({
    key: BROWSER_EXPORT_REMINDER_SETTING_KEY,
    updatedAt: instant(new Date(input.nowUnixMs).toISOString()),
    value: serializeBrowserExportReminderPreference(preference),
  });
  return Object.freeze({
    preference,
    reminder: deriveBrowserExportReminderFromPreference(preference, input.nowUnixMs),
  });
};

interface BrowserVaultDeletionSnapshot {
  readonly attachmentFiles: number;
  readonly databaseSha256: string;
  readonly vaultId: string;
  readonly vaultName: string;
}

const browserVaultDeletionSnapshots = new Map<string, BrowserVaultDeletionSnapshot>();

const browserVaultDeletionPort: VaultDeletionPort = Object.freeze({
  preview: async (input: PreviewVaultDeletionPortInput) => {
    const client = await getDatabase();
    await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
    const rows = await client.query<VaultRow>(
      sqlStatement(
        "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
      ),
    );
    const vault = rows[0];
    if (vault === undefined) throw new VaultDeletionError("not_found");
    if (rows.length !== 1 || vault.id !== input.vaultId) {
      throw new VaultDeletionError("invalid_state");
    }
    const portable = await client.exportPortable();
    const attachmentRows = await client.query<{ readonly count: number } & QueryRow>(
      sqlStatement("SELECT count(*) AS count FROM attachment_manifest"),
    );
    const attachmentFiles = attachmentRows[0]?.count;
    if (!Number.isSafeInteger(attachmentFiles) || attachmentFiles === undefined) {
      throw new VaultDeletionError("invalid_state");
    }
    browserVaultDeletionSnapshots.set(
      input.previewId,
      Object.freeze({
        attachmentFiles,
        databaseSha256: portable.sha256,
        vaultId: vault.id,
        vaultName: vault.name,
      }),
    );
    while (browserVaultDeletionSnapshots.size > 16) {
      const oldest = browserVaultDeletionSnapshots.keys().next().value;
      if (oldest === undefined) break;
      browserVaultDeletionSnapshots.delete(oldest);
    }
    const reminder = await readBrowserExportReminder(new Date(input.previewedAt).getTime());
    const lastSuccessfulPortableExportAt =
      reminder.preference.lastSuccessfulExportAtUnixMs === null
        ? null
        : instant(new Date(reminder.preference.lastSuccessfulExportAtUnixMs).toISOString());
    return Object.freeze({
      vaultId: entityId("vault", vault.id),
      vaultName: vault.name,
      storageMode: "browser",
      inventory: Object.freeze({
        attachmentFiles,
        managedBackups: 0,
        providerSecrets: 0,
        sharedAttachmentFiles: 0,
      }),
      lastSuccessfulPortableExportAt,
    });
  },
  delete: async (input: DeleteVaultPortInput) => {
    const snapshot = browserVaultDeletionSnapshots.get(input.previewId);
    if (snapshot?.vaultId !== input.vaultId) {
      throw new VaultDeletionError("stale_preview");
    }
    const client = await getDatabase();
    const rows = await client.query<VaultRow>(
      sqlStatement(
        "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
      ),
    );
    const vault = rows[0];
    if (rows.length !== 1 || vault?.id !== snapshot.vaultId) {
      throw new VaultDeletionError("stale_preview");
    }
    if (input.confirmation !== `DELETE ${vault.name}`) {
      throw new VaultDeletionError("confirmation_mismatch");
    }
    const portable = await client.exportPortable();
    if (portable.sha256 !== snapshot.databaseSha256 || vault.name !== snapshot.vaultName) {
      throw new VaultDeletionError("stale_preview");
    }
    const deleted = await client.delete();
    if (!deleted) throw new VaultDeletionError("cleanup_failed");
    database = undefined;
    let attachmentCleanupPending = false;
    try {
      await (await getAttachmentStore()).deleteAll();
      attachmentStore = undefined;
    } catch {
      attachmentCleanupPending = true;
    }
    browserVaultDeletionSnapshots.delete(input.previewId);
    return Object.freeze({
      deletionId: input.deletionId,
      vaultId: input.vaultId,
      status: attachmentCleanupPending ? "cleanup_pending" : "deleted",
      deleted: Object.freeze({
        attachmentFiles: attachmentCleanupPending ? 0 : snapshot.attachmentFiles,
        managedBackups: 0,
        providerSecrets: 0,
        sharedAttachmentFiles: 0,
      }),
      externalPortableArchivesAffected: false,
    });
  },
});

const browserVaultDeletionOperations = createVaultDeletionOperations(browserVaultDeletionPort);

const logOpenProof = (diagnostics: StorageDiagnostics): void => {
  console.info(
    `COREDRILL_STORAGE ${JSON.stringify({
      event: "storage.open",
      adapter: diagnostics.adapterName,
      persistence: diagnostics.persistence,
      schemaVersion: diagnostics.schemaVersion,
      details: diagnostics.details,
    })}`,
  );
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const toPortableDatabase = (portable: PortableDatabaseJson): PortableDatabase => ({
  schemaVersion: portable.schemaVersion,
  byteLength: portable.byteLength,
  sha256: portable.sha256,
  bytes: base64ToBytes(portable.bytesBase64),
});

interface AttachmentExportRow extends QueryRow {
  readonly content_id: string;
  readonly media_type: string;
  readonly byte_length: number;
  readonly logical_name: string | null;
}

interface CountRow extends QueryRow {
  readonly count: number;
}

const readCount = async (client: DatabasePort, sql: string): Promise<number> => {
  const rows = await client.query<CountRow>(sqlStatement(sql));
  const count = rows[0]?.count;
  if (rows.length !== 1 || typeof count !== "number" || !Number.isSafeInteger(count)) {
    throw new Error("The representative recovery inventory is invalid.");
  }
  return count;
};

const readPhase3RecoveryInventory = async (
  client: DatabasePort,
): Promise<Phase3RecoveryInventory> =>
  Object.freeze({
    jobRequirements: await readCount(client, "SELECT count(*) AS count FROM job_requirement"),
    careerEvidence: await readCount(
      client,
      `SELECT
         (SELECT count(*) FROM experience) +
         (SELECT count(*) FROM education) +
         (SELECT count(*) FROM project) +
         (SELECT count(*) FROM skill) +
         (SELECT count(*) FROM accomplishment) +
         (SELECT count(*) FROM certification) +
         (SELECT count(*) FROM publication) +
         (SELECT count(*) FROM volunteer_experience) AS count`,
    ),
    stories: await readCount(client, "SELECT count(*) AS count FROM anecdote"),
    storyEvidenceLinks: await readCount(
      client,
      "SELECT count(*) AS count FROM anecdote_evidence_link",
    ),
    skillEvidenceLinks: await readCount(client, "SELECT count(*) AS count FROM skill_evidence"),
    requirementEvidenceSelections: await readCount(
      client,
      "SELECT count(*) AS count FROM job_requirement_evidence_selection",
    ),
    importRuns: await readCount(client, "SELECT count(*) AS count FROM import_run"),
    importProposals: await readCount(
      client,
      "SELECT count(*) AS count FROM career_import_proposal",
    ),
    importResolutions: await readCount(
      client,
      "SELECT count(*) AS count FROM career_import_resolution",
    ),
    importResolutionLinks: await readCount(
      client,
      "SELECT count(*) AS count FROM career_import_resolution_proposal",
    ),
    answerEntries: await readCount(client, "SELECT count(*) AS count FROM answer_library_entry"),
    answerVersions: await readCount(client, "SELECT count(*) AS count FROM answer_library_version"),
    attachmentManifests: await readCount(
      client,
      "SELECT count(*) AS count FROM attachment_manifest",
    ),
    attachmentLinks: await readCount(
      client,
      "SELECT count(*) AS count FROM document_version_attachment",
    ),
  });

const seedRepresentativePhase1Vault = async (
  client: BrowserSqliteDatabase,
  vaultId: string,
): Promise<readonly string[]> => {
  const createdAt = "2026-08-29T23:50:00.000Z";
  const attachmentBytes = new TextEncoder().encode(
    "Synthetic Coredrill resume attachment for the BKP-007 recovery drill.\n",
  );
  const attachmentContentId = await sha256Text(new TextDecoder().decode(attachmentBytes));
  const answerAttachmentBytes = new TextEncoder().encode(
    "Synthetic Coredrill Answer Library attachment for the EVD-008 recovery drill.\n",
  );
  const answerAttachmentContentId = await sha256Text(
    new TextDecoder().decode(answerAttachmentBytes),
  );
  await (
    await getAttachmentStore()
  ).put({
    contentId: attachmentContentId,
    byteLength: attachmentBytes.byteLength,
    sha256: attachmentContentId,
    bytes: attachmentBytes,
  });
  await (
    await getAttachmentStore()
  ).put({
    contentId: answerAttachmentContentId,
    byteLength: answerAttachmentBytes.byteLength,
    sha256: answerAttachmentContentId,
    bytes: answerAttachmentBytes,
  });

  const companyId = "0198d9d4-0000-7000-8000-000000000001";
  const jobId = "0198d9d4-0000-7000-8000-000000000002";
  const statusId = "0198d9d4-0000-7000-8000-000000000003";
  const applicationId = "0198d9d4-0000-7000-8000-000000000004";
  const statusEventId = "0198d9d4-0000-7000-8000-000000000005";
  const nextActionId = "0198d9d4-0000-7000-8000-000000000006";
  const reminderId = "0198d9d4-0000-7000-8000-000000000007";
  const tagId = "0198d9d4-0000-7000-8000-000000000008";
  const documentId = "0198d9d4-0000-7000-8000-000000000009";
  const documentVersionId = "0198d9d4-0000-7000-8000-00000000000a";
  const experienceId = "0198d9d4-0000-7000-8000-00000000000b";
  const educationId = "0198d9d4-0000-7000-8000-00000000000c";
  const projectId = "0198d9d4-0000-7000-8000-00000000000d";
  const skillId = "0198d9d4-0000-7000-8000-00000000000e";
  const accomplishmentId = "0198d9d4-0000-7000-8000-00000000000f";
  const certificationId = "0198d9d4-0000-7000-8000-000000000010";
  const publicationId = "0198d9d4-0000-7000-8000-000000000011";
  const volunteerId = "0198d9d4-0000-7000-8000-000000000012";
  const anecdoteId = "0198d9d4-0000-7000-8000-000000000013";
  const candidateProfileId = "0198d9d4-0000-7000-8000-000000000014";
  const importRunId = "0198d9d4-0000-7000-8000-000000000015";
  const employmentProposalId = "0198d9d4-0000-7000-8000-000000000016";
  const skillProposalId = "0198d9d4-0000-7000-8000-000000000017";
  const employmentResolutionId = "0198d9d4-0000-7000-8000-000000000018";
  const skillResolutionId = "0198d9d4-0000-7000-8000-000000000019";
  const answerDocumentId = "0198d9d4-0000-7000-8000-00000000001a";
  const answerVersionId = "0198d9d4-0000-7000-8000-00000000001b";
  const jobSourceId = "0198d9d4-0000-7000-8000-00000000001c";
  const sourceSnapshotId = "0198d9d4-0000-7000-8000-00000000001d";
  const provenanceId = "0198d9d4-0000-7000-8000-00000000001e";
  const requirementId = "0198d9d4-0000-7000-8000-00000000001f";
  const skillEvidenceId = "0198d9d4-0000-7000-8000-000000000020";
  await client.transaction(async (transaction) => {
    await transaction.execute(
      sqlStatement(
        `INSERT INTO company(
           id, canonical_name, website_url, domain, notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          "Northstar Systems",
          "https://northstar.example/",
          "northstar.example",
          "Synthetic recovery fixture company.",
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO status_definition(
           id, name, category, color, is_system, sort_order, terminal, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 1, 0, 0, ?, ?)`,
        [statusId, "Saved", "saved", "blue", createdAt, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO job(
           id, company_id, title, normalized_title, description_text, employment_type,
           workplace_type, seniority, remote_region_json, date_posted, valid_through,
           current_status_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          jobId,
          companyId,
          "Senior Platform Engineer",
          "senior platform engineer",
          "Build reliable local-first systems with TypeScript, Rust, and SQLite.",
          "full_time",
          "remote",
          "senior",
          JSON.stringify({ regions: ["US"] }),
          "2026-08-28",
          "2026-09-30",
          statusId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO application(
           id, job_id, current_status_id, notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          applicationId,
          jobId,
          statusId,
          "Prepare a tailored local application.",
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO job_source(
           id, job_id, connector_id, external_id, canonical_url, first_seen_at,
           last_seen_at, content_hash, is_primary, created_at, updated_at
         ) VALUES (?, ?, 'fixture', 'platform-engineer', ?, ?, ?, ?, 1, ?, ?)`,
        [
          jobSourceId,
          jobId,
          "https://northstar.example/jobs/platform-engineer",
          createdAt,
          createdAt,
          "c".repeat(64),
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO source_snapshot(
           id, job_source_id, captured_at, extractor_id, extractor_version, raw_text,
           content_hash, retention_class, created_at
         ) VALUES (?, ?, ?, 'fixture-jsonld', '1.0.0', ?, ?, 'standard', ?)`,
        [
          sourceSnapshotId,
          jobSourceId,
          createdAt,
          "You will lead cross-functional delivery.",
          "d".repeat(64),
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO provenance(
           id, source_snapshot_id, extraction_method, source_pointer, source_excerpt,
           confidence, captured_at, created_at
         ) VALUES (?, ?, 'jsonld', '/description/requirements/0', ?, 0.91, ?, ?)`,
        [
          provenanceId,
          sourceSnapshotId,
          "You will lead cross-functional delivery.",
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO job_requirement(
           id, job_id, category, source_category, normalized_text, raw_text,
           provenance_id, confidence, user_confirmed, sort_order, created_at, updated_at
         ) VALUES (?, ?, 'responsibility', 'required', ?, ?, ?, 0.91, 1, 0, ?, ?)`,
        [
          requirementId,
          jobId,
          "Lead cross-functional delivery",
          "You will lead cross-functional delivery.",
          provenanceId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO status_event(
           id, job_id, application_id, from_status_id, to_status_id, occurred_at, note, created_at
         ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
        [
          statusEventId,
          jobId,
          applicationId,
          statusId,
          createdAt,
          "Added to the pipeline.",
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO next_action(
           id, job_id, application_id, title, due_at, timezone, state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          nextActionId,
          jobId,
          applicationId,
          "Tailor resume",
          "2026-08-31T15:00:00.000Z",
          "America/New_York",
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO reminder(
           id, job_id, next_action_id, remind_at, timezone, state, note, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [
          reminderId,
          jobId,
          nextActionId,
          "2026-08-31T14:30:00.000Z",
          "America/New_York",
          "Recovery fixture reminder.",
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        "INSERT INTO tag(id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [tagId, "Priority", "amber", createdAt, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement("INSERT INTO job_tag(job_id, tag_id, created_at) VALUES (?, ?, ?)", [
        jobId,
        tagId,
        createdAt,
      ]),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO document(id, kind, title, source, created_at, updated_at)
         VALUES (?, 'resume', ?, 'user', ?, ?)`,
        [documentId, "Platform resume", createdAt, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO document_version(
           id, document_id, version_number, content_ir_version, content_ir_json, content_plain,
           created_by, created_at, parent_version_id, content_hash, label
         ) VALUES (?, ?, 1, 1, ?, ?, 'user', ?, NULL, ?, ?)`,
        [
          documentVersionId,
          documentId,
          JSON.stringify({ specVersion: 1, type: "doc", content: [] }),
          "Senior Platform Engineer resume",
          createdAt,
          await sha256Text("Senior Platform Engineer resume"),
          "Recovery proof",
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO attachment_manifest(content_id, media_type, byte_length, created_at)
         VALUES (?, 'text/plain', ?, ?)`,
        [attachmentContentId, attachmentBytes.byteLength, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO document_version_attachment(
           document_version_id, content_id, purpose, logical_name, sort_order, created_at
         ) VALUES (?, ?, 'source', 'resume-source.txt', 0, ?)`,
        [documentVersionId, attachmentContentId, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO document_job_link(document_id, job_id, purpose, created_at)
         VALUES (?, ?, 'application', ?)`,
        [documentId, jobId, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO experience(
           id, organization, role, start_date, end_date, is_current, description,
           source_document_id, verification_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?, 'source_backed', ?, ?)`,
        [
          experienceId,
          "Northstar Systems",
          "Platform Engineer",
          "2023-01-01",
          "Built reliable local-first systems.",
          documentId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO education(
           id, institution, credential, field, start_date, end_date, details,
           source_document_id, verification_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'source_backed', ?, ?)`,
        [
          educationId,
          "Example State University",
          "Bachelor of Science",
          "Computer Science",
          "2017-09-01",
          "2021-05-31",
          "Synthetic recovery fixture education.",
          documentId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO project(
           id, name, summary, url, start_date, end_date, source_document_id,
           verification_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'source_backed', ?, ?)`,
        [
          projectId,
          "Offline application workspace",
          "Created a resilient local-first workflow.",
          "https://example.test/projects/offline-workspace",
          "2025-01-01",
          "2025-06-30",
          documentId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO skill(
           id, canonical_name, category, aliases_json, source_document_id,
           verification_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'source_backed', ?, ?)`,
        [skillId, "SQLite", "Data", JSON.stringify(["sqlite3"]), documentId, createdAt, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO accomplishment(
           id, parent_type, parent_id, action, result, metrics_json, source_document_id,
           verification_state, created_at, updated_at
         ) VALUES (?, 'experience', ?, ?, ?, ?, ?, 'source_backed', ?, ?)`,
        [
          accomplishmentId,
          experienceId,
          "Introduced deterministic recovery checks.",
          "Reduced recovery uncertainty with verified archives.",
          JSON.stringify({ fixtures: 1 }),
          documentId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO certification(
           id, name, issuer, issued_date, expires_date, credential_url,
           source_document_id, verification_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, ?, ?, 'source_backed', ?, ?)`,
        [
          certificationId,
          "Synthetic Systems Certification",
          "Example Institute",
          "2025-02-01",
          "https://example.test/credentials/systems",
          documentId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO publication(
           id, title, publisher, published_date, url, summary, source_document_id,
           verification_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'source_backed', ?, ?)`,
        [
          publicationId,
          "Recoverable local-first applications",
          "Example Engineering Review",
          "2025-04-15",
          "https://example.test/publications/local-first",
          "Synthetic recovery fixture publication.",
          documentId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO volunteer_experience(
           id, organization, role, start_date, end_date, is_current, description,
           source_document_id, verification_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?, 'source_backed', ?, ?)`,
        [
          volunteerId,
          "Community Technology Lab",
          "Mentor",
          "2024-03-01",
          "Mentored contributors on accessible local software.",
          documentId,
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO anecdote(
           id, title, situation, action, result, tags_json, privacy_tags_json, source_document_id,
           verification_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'source_backed', ?, ?)`,
        [
          anecdoteId,
          "Protected a local recovery path",
          "A local-first workflow needed deterministic recovery proof.",
          "Built cross-adapter archive, relationship, and attachment checks.",
          "Browser and native restores retained the same logical content.",
          JSON.stringify(["reliability"]),
          JSON.stringify(["confidential"]),
          documentId,
          createdAt,
          createdAt,
        ],
      ),
    );
    const evidenceLinks = [
      ["employment", experienceId, "experience_id"],
      ["education", educationId, "education_id"],
      ["project", projectId, "project_id"],
      ["skill", skillId, "skill_id"],
      ["accomplishment", accomplishmentId, "accomplishment_id"],
      ["certification", certificationId, "certification_id"],
      ["publication", publicationId, "publication_id"],
      ["volunteer", volunteerId, "volunteer_experience_id"],
    ] as const;
    for (const [kind, evidenceId, concreteColumn] of evidenceLinks) {
      await transaction.execute(
        sqlStatement(
          `INSERT INTO anecdote_evidence_link(
             anecdote_id, evidence_kind, evidence_id, ${concreteColumn}, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
          [anecdoteId, kind, evidenceId, evidenceId, createdAt],
        ),
      );
    }
    await transaction.execute(
      sqlStatement(
        `INSERT INTO skill_evidence(
           id, skill_id, evidence_kind, evidence_id, experience_id,
           narrative, verification_state, created_at
         ) VALUES (?, ?, 'employment', ?, ?, ?, 'source_backed', ?)`,
        [
          skillEvidenceId,
          skillId,
          experienceId,
          experienceId,
          "Used SQLite while building reliable local-first systems.",
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO job_requirement_evidence_selection(
           requirement_id, evidence_kind, evidence_id, experience_id, selected_at
         ) VALUES (?, 'employment', ?, ?, ?)`,
        [requirementId, experienceId, experienceId, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO candidate_profile(
           id, display_name, summary, target_roles_json, work_preferences_json,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          candidateProfileId,
          "Casey Example",
          "Synthetic recovery fixture candidate profile.",
          JSON.stringify(["Platform Engineer"]),
          JSON.stringify({ workplaceTypes: ["remote"] }),
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO import_run(
           id, kind, source_name, source_format, source_media_type, source_byte_length,
           source_hash, source_mapping_json, started_at, completed_at, status, summary_json
         ) VALUES (?, 'resume', ?, 'text', 'text/plain', ?, ?, ?, ?, ?, 'completed', ?)`,
        [
          importRunId,
          "synthetic-resume.txt",
          attachmentBytes.byteLength,
          attachmentContentId,
          JSON.stringify([{ sourcePointer: "line:1", target: "employment" }]),
          createdAt,
          createdAt,
          JSON.stringify({ proposalCount: 2 }),
        ],
      ),
    );
    const importProposals = [
      [
        employmentProposalId,
        "employment",
        "role",
        "employment:0",
        "Platform Engineer",
        "line:1",
        "Platform Engineer at Northstar Systems",
      ],
      [skillProposalId, "skill", "canonicalName", "skill:sqlite", "SQLite", "line:2", "SQLite"],
    ] as const;
    for (const proposal of importProposals) {
      await transaction.execute(
        sqlStatement(
          `INSERT INTO career_import_proposal(
             id, import_run_id, target_kind, field_name, group_key, proposed_value,
             source_pointer, source_excerpt, confidence, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.95, ?)`,
          [proposal[0], importRunId, ...proposal.slice(1), createdAt],
        ),
      );
    }
    const importResolutions = [
      [employmentResolutionId, "employment:0", "employment", experienceId, employmentProposalId],
      [skillResolutionId, "skill:sqlite", "skill", skillId, skillProposalId],
    ] as const;
    for (const [resolutionId, groupKey, targetKind, targetId, proposalId] of importResolutions) {
      await transaction.execute(
        sqlStatement(
          `INSERT INTO career_import_resolution(
             id, import_run_id, group_key, target_kind, decision, target_id,
             resolved_values_json, resolved_at
           ) VALUES (?, ?, ?, ?, 'merged_existing', ?, ?, ?)`,
          [resolutionId, importRunId, groupKey, targetKind, targetId, "{}", createdAt],
        ),
      );
      await transaction.execute(
        sqlStatement(
          `INSERT INTO career_import_resolution_proposal(resolution_id, proposal_id, linked_at)
           VALUES (?, ?, ?)`,
          [resolutionId, proposalId, createdAt],
        ),
      );
    }
    await transaction.execute(
      sqlStatement(
        `INSERT INTO document(id, kind, title, source, created_at, updated_at)
         VALUES (?, 'application_answer', ?, 'answer_library', ?, ?)`,
        [answerDocumentId, "Why this company?", createdAt, createdAt],
      ),
    );
    const answerText =
      "I connect reliable local-first engineering with the role's user-owned data goals.";
    await transaction.execute(
      sqlStatement(
        `INSERT INTO document_version(
           id, document_id, version_number, content_ir_version, content_ir_json, content_plain,
           created_by, created_at, parent_version_id, content_hash, label
         ) VALUES (?, ?, 1, 1, ?, ?, 'user', ?, NULL, ?, ?)`,
        [
          answerVersionId,
          answerDocumentId,
          JSON.stringify({ specVersion: 1, type: "doc", content: [] }),
          answerText,
          createdAt,
          await sha256Text(answerText),
          "Recovery proof answer",
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO answer_library_entry(
           document_id, source_kind, source_job_id, source_context, last_used_at, created_at
         ) VALUES (?, 'application', ?, ?, ?, ?)`,
        [
          answerDocumentId,
          jobId,
          "Captured from the synthetic Northstar application.",
          createdAt,
          createdAt,
        ],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO answer_library_version(document_version_id, question, sensitivity)
         VALUES (?, ?, 'sensitive')`,
        [answerVersionId, "Why do you want to work here?"],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO attachment_manifest(content_id, media_type, byte_length, created_at)
         VALUES (?, 'text/plain', ?, ?)`,
        [answerAttachmentContentId, answerAttachmentBytes.byteLength, createdAt],
      ),
    );
    await transaction.execute(
      sqlStatement(
        `INSERT INTO document_version_attachment(
           document_version_id, content_id, purpose, logical_name, sort_order, created_at
         ) VALUES (?, ?, 'supporting_evidence', 'answer-context.txt', 0, ?)`,
        [answerVersionId, answerAttachmentContentId, createdAt],
      ),
    );
    const vault = await transaction.query<VaultRow>(
      sqlStatement("SELECT id, name, schema_version, created_at, last_opened_at FROM vault"),
    );
    if (vault.length !== 1 || vault[0]?.id !== vaultId) {
      throw new Error("The representative recovery fixture changed vault identity.");
    }
  });
  return Object.freeze([attachmentContentId, answerAttachmentContentId].sort());
};

const createCurrentPortableArchive = async (input: PortableRecoveryFixtureInput) => {
  const client = await getDatabase();
  const dataBundle = await createPortableDataExportV1({
    database: client,
    generatedAt: input.generatedAt,
    vaultId: input.vaultId,
  });
  const portable = await client.exportPortable();
  const migrationRows = await client.query<MigrationLedgerRow>(
    sqlStatement(
      "SELECT version, name, sha256, applied_at FROM coredrill_schema_migration ORDER BY version",
    ),
  );
  const attachmentRows = await client.query<AttachmentExportRow>(
    sqlStatement(
      `SELECT attachment_manifest.content_id, attachment_manifest.media_type,
              attachment_manifest.byte_length, min(document_version_attachment.logical_name) AS logical_name
       FROM attachment_manifest
       LEFT JOIN document_version_attachment
         ON document_version_attachment.content_id = attachment_manifest.content_id
       GROUP BY attachment_manifest.content_id, attachment_manifest.media_type,
                attachment_manifest.byte_length
       ORDER BY attachment_manifest.content_id`,
    ),
  );
  const store = await getAttachmentStore();
  const archive = await writePortableArchiveV1({
    archiveId: input.archiveId,
    createdAt: input.generatedAt,
    createdByVersion: "0.0.0",
    vault: {
      id: input.vaultId,
      schemaVersion: portable.schemaVersion,
      migrationHistory: migrationRows.map((row) => ({
        version: row.version,
        name: row.name,
        appliedAt: row.applied_at,
        sha256: row.sha256,
      })),
    },
    database: portable,
    dataFiles: dataBundle.dataFiles,
    attachments: attachmentRows.map((row) => ({
      contentId: row.content_id,
      sha256: row.content_id,
      mediaType: row.media_type,
      byteLength: row.byte_length,
      ...(row.logical_name === null ? {} : { logicalName: row.logical_name }),
    })),
    readAttachment: (contentId) => store.read(contentId),
  });
  return Object.freeze({ archive, portable });
};

const createBrowserContractAdapter = () => {
  let sequence = 1;
  return {
    name: "official-sqlite-wasm-opfs-sahpool",
    createIsolatedDatabase: async () => {
      const client = await openBrowserSqliteDatabase({
        databaseName: `/coredrill-phase-1-contract-${String(sequence)}.sqlite3`,
        expectedExisting: false,
      });
      sequence += 1;
      return client;
    },
    disposeIsolatedDatabase: async (client: DatabasePort) => {
      await (client as BrowserSqliteDatabase).delete();
    },
  };
};

const api: CoredrillStorageSpikeApi = {
  createAnswerLibraryEntry: async (input) =>
    answerLibraryOperations.createAnswerCommand.execute(input, careerProfileOperationContext()),
  createCareerStory: async (input) =>
    careerStoryOperations.createStoryCommand.execute(input, careerProfileOperationContext()),
  createManualCareerProfileEntry: async (input) =>
    careerProfileOperations.createManualEntryCommand.execute(
      input,
      careerProfileOperationContext(),
    ),
  listManualCareerProfileEntries: async () =>
    careerProfileOperations.listManualEntriesQuery.execute(
      undefined,
      careerProfileOperationContext(),
    ),
  listCareerStories: async () =>
    careerStoryOperations.listStoriesQuery.execute(undefined, careerProfileOperationContext()),
  listAnswerLibraryEntries: async () =>
    answerLibraryOperations.listAnswersQuery.execute(undefined, careerProfileOperationContext()),
  listPendingResumeImports: async () =>
    resumeImportOperations.listPendingQuery.execute(undefined, careerProfileOperationContext()),
  queueResumeImport: async (input) => {
    let normalized: QueueResumeImportInput;
    try {
      normalized = await resumeImportInput(input);
    } catch {
      return Object.freeze({
        ok: false as const,
        error: Object.freeze({
          code: "validation" as const,
          message:
            "This local resume could not be read safely. Choose a supported PDF, DOCX, Markdown, or text file.",
          retryable: false,
        }),
      });
    }
    return resumeImportOperations.queueCommand.execute(normalized, careerProfileOperationContext());
  },
  resolveResumeImportGroup: async (input) =>
    resumeImportReviewOperations.resolveCommand.execute(input, careerProfileOperationContext()),
  markAnswerLibraryEntryUsed: async (input) =>
    answerLibraryOperations.markAnswerUsedCommand.execute(input, careerProfileOperationContext()),
  updateAnswerLibraryEntry: async (input) =>
    answerLibraryOperations.updateAnswerCommand.execute(input, careerProfileOperationContext()),
  updateCareerStory: async (input) =>
    careerStoryOperations.updateStoryCommand.execute(input, careerProfileOperationContext()),
  openAndMigrate: async (options = {}) => {
    const client = await getDatabase(options);
    const result = await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
    const diagnostics = await client.diagnostics();
    logOpenProof(diagnostics);
    setStatus(
      diagnostics.health === "ready"
        ? "Vault ready"
        : "Vault ready with storage warnings; export a backup before relying on this profile.",
    );
    return Object.freeze({ appliedVersions: result.appliedVersions, diagnostics });
  },
  tryOpenAndMigrate: async (options = {}) => {
    try {
      return Object.freeze({ opened: true, proof: await api.openAndMigrate(options) });
    } catch (error) {
      if (
        error instanceof BrowserVaultBusyError ||
        error instanceof BrowserStorageUnavailableError ||
        error instanceof BrowserSqliteBusyError
      ) {
        setStatus(error.message);
        return Object.freeze({
          opened: false,
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  },
  writeVault: async (input) => {
    const client = await getDatabase();
    await client.transaction(async (transaction) => {
      await transaction.execute(
        sqlStatement(
          "INSERT INTO vault(id, name, schema_version, created_at, last_opened_at) VALUES (?, ?, 1, ?, ?)",
          [input.id, input.name, input.createdAt, input.lastOpenedAt],
        ),
      );
    });
  },
  proveRollback: async (input) => {
    const client = await getDatabase();
    const rejection = new Error("intentional browser storage rollback proof");
    try {
      await client.transaction(async (transaction) => {
        await transaction.execute(
          sqlStatement(
            "INSERT INTO vault(id, name, schema_version, created_at, last_opened_at) VALUES (?, ?, 1, ?, ?)",
            [input.id, input.name, input.createdAt, input.lastOpenedAt],
          ),
        );
        throw rejection;
      });
    } catch (error) {
      if (error !== rejection) throw error;
    }
    const rows = await client.query(sqlStatement("SELECT id FROM vault WHERE id = ?", [input.id]));
    return rows.length === 0;
  },
  listVaults: async () => {
    const client = await getDatabase();
    return client.query<VaultRow>(
      sqlStatement(
        "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
      ),
    );
  },
  exportPortable: async () => {
    const portable = await (await getDatabase()).exportPortable();
    return Object.freeze({
      schemaVersion: portable.schemaVersion,
      byteLength: portable.byteLength,
      sha256: portable.sha256,
      bytesBase64: bytesToBase64(portable.bytes),
    });
  },
  restorePortable: async (portable) => {
    await (await getDatabase()).restorePortable(toPortableDatabase(portable));
  },
  diagnostics: async () => (await getDatabase()).diagnostics(),
  storageHealth: async () => (await getDatabase()).refreshStorageHealth(),
  requestPersistentStorage: async () => (await getDatabase()).requestPersistentStorage(),
  getBrowserExportReminder: readBrowserExportReminder,
  updateBrowserExportReminder: writeBrowserExportReminder,
  previewVaultDeletion: async (input) => {
    const context: ApplicationOperationContext = Object.freeze({
      operationId: entityId("application-operation", input.previewId),
      initiatedAt: instant(input.previewedAt),
    });
    return browserVaultDeletionOperations.previewVaultDeletionQuery.execute(
      { vaultId: input.vaultId },
      context,
    );
  },
  deleteVault: async (input) => {
    const context: ApplicationOperationContext = Object.freeze({
      operationId: entityId("application-operation", input.deletionId),
      initiatedAt: instant(input.deletedAt),
    });
    return browserVaultDeletionOperations.deleteVaultCommand.execute(
      {
        vaultId: input.vaultId,
        previewId: input.previewId,
        confirmation: input.confirmation,
      },
      context,
    );
  },
  close: async () => {
    if (database === undefined) return;
    await database.close();
    database = undefined;
  },
  delete: async () => {
    const client = await getDatabase();
    await (await getAttachmentStore()).deleteAll();
    const deleted = await client.delete();
    database = undefined;
    attachmentStore = undefined;
    return deleted;
  },
  runBenchmark: (input) => runStorageBenchmark(input),
  runJobSearchBenchmark: async (input) => runJobSearchBenchmark(input, await migrations()),
  runPortableArchiveWriterProof,
  exportHumanReadable: async (input) => {
    const bundle = await createPortableDataExportV1({
      database: await getDatabase(),
      generatedAt: input.generatedAt,
      vaultId: input.vaultId,
    });
    return Object.freeze({
      dataFileCount: bundle.dataFiles.length,
      datasetCount: bundle.datasetCount,
      datasetNames: Object.freeze(bundle.datasets.map((dataset) => dataset.dataset)),
      jsonFiles: bundle.dataFiles.filter((file) => file.format === "json").length,
      csvFiles: bundle.dataFiles.filter((file) => file.format === "csv").length,
      rowCount: bundle.rowCount,
      sourceSchemaVersion: bundle.sourceSchemaVersion,
    });
  },
  runPortableArchiveRestoreProof: async (input) => {
    const client = await getDatabase();
    const originalVaults = await client.query<VaultRow>(
      sqlStatement(
        "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
      ),
    );
    const originalVault = originalVaults[0];
    if (originalVaults.length !== 1 || originalVault?.id !== input.vaultId) {
      throw new Error("The restore proof requires exactly one matching source vault.");
    }

    const dataBundle = await createPortableDataExportV1({
      database: client,
      generatedAt: input.generatedAt,
      vaultId: input.vaultId,
    });
    const portable = await client.exportPortable();
    const migrationRows = await client.query<MigrationLedgerRow>(
      sqlStatement(
        "SELECT version, name, sha256, applied_at FROM coredrill_schema_migration ORDER BY version",
      ),
    );
    const archive = await writePortableArchiveV1({
      archiveId: input.archiveId,
      createdAt: input.generatedAt,
      createdByVersion: "0.0.0",
      vault: {
        id: input.vaultId,
        schemaVersion: portable.schemaVersion,
        migrationHistory: migrationRows.map((row) => ({
          version: row.version,
          name: row.name,
          appliedAt: row.applied_at,
          sha256: row.sha256,
        })),
      },
      database: portable,
      dataFiles: dataBundle.dataFiles,
      attachments: [],
      readAttachment: () => Promise.resolve(undefined),
    });

    const inspectTarget = async (): Promise<PortableArchiveRestoreTargetSnapshotV1> => {
      const targetDatabase = await client.exportPortable();
      const vaults = await client.query<VaultRow>(
        sqlStatement(
          "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
        ),
      );
      if (vaults.length === 0) {
        return Object.freeze({
          state: "empty" as const,
          fingerprint: targetDatabase.sha256,
          attachmentContentIds: Object.freeze([] as const),
        });
      }
      const vault = vaults[0];
      if (vaults.length !== 1 || vault === undefined) {
        throw new Error("The restore proof target must contain at most one vault.");
      }
      return Object.freeze({
        state: "present" as const,
        fingerprint: targetDatabase.sha256,
        vaultId: vault.id,
        schemaVersion: targetDatabase.schemaVersion,
        databaseSha256: targetDatabase.sha256,
        attachmentContentIds: Object.freeze([]),
      });
    };

    const restorePort: PortableArchiveRestorePortV1 = Object.freeze({
      inspectTarget,
      inspectDatabase: async (database: PortableDatabase) => {
        const inspection = await client.inspectPortable(database, input.vaultId);
        return Object.freeze({
          integrity: inspection.integrity,
          schemaVersion: inspection.schemaVersion,
          vaultId: inspection.vaultId,
        });
      },
      commit: async (payload: PortableArchiveRestoreCommitPayloadV1) => {
        if (payload.attachments.length !== 0) {
          throw new Error("The browser restore proof has no attachment payload.");
        }
        await client.restorePortable(payload.database, {
          expectedTargetSha256: payload.expectedTargetFingerprint,
          expectedVaultId: payload.vaultId,
        });
      },
    });

    const beforeCorruption = await client.exportPortable();
    let corruptionRejected = false;
    try {
      await createPortableArchiveRestorePreviewV1({
        archiveBytes: archive.bytes.slice(0, -17),
        expectedSchemaVersion: dataBundle.sourceSchemaVersion,
        port: restorePort,
      });
    } catch (error) {
      corruptionRejected =
        error instanceof PortableArchiveRestoreError && error.code === "archive_corrupt";
      if (!corruptionRejected) throw error;
    }
    const afterCorruption = await client.exportPortable();
    const corruptionPreservedTarget = afterCorruption.sha256 === beforeCorruption.sha256;

    await client.execute(
      sqlStatement("UPDATE vault SET name = ? WHERE id = ?", [input.previewName, input.vaultId]),
    );
    const stalePreview = await createPortableArchiveRestorePreviewV1({
      archiveBytes: archive.bytes,
      expectedSchemaVersion: dataBundle.sourceSchemaVersion,
      expectedArchiveSha256: archive.sha256,
      port: restorePort,
    });
    const previewVaults = await client.query<VaultRow>(
      sqlStatement(
        "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
      ),
    );
    const previewPreservedTarget = previewVaults[0]?.name === input.previewName;

    await client.execute(
      sqlStatement("UPDATE vault SET name = ? WHERE id = ?", [input.staleName, input.vaultId]),
    );
    let staleTargetRejected = false;
    try {
      await commitPortableArchiveRestoreV1({
        preview: stalePreview,
        confirmation: "replace_same_vault",
      });
    } catch (error) {
      staleTargetRejected =
        error instanceof PortableArchiveRestoreError && error.code === "stale_target";
      if (!staleTargetRejected) throw error;
    }
    const staleVaults = await client.query<VaultRow>(
      sqlStatement(
        "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
      ),
    );
    const staleTargetPreserved = staleVaults[0]?.name === input.staleName;

    const preview = await createPortableArchiveRestorePreviewV1({
      archiveBytes: archive.bytes,
      expectedSchemaVersion: dataBundle.sourceSchemaVersion,
      expectedArchiveSha256: archive.sha256,
      port: restorePort,
    });
    if (
      preview.conflict !== "same_vault_replace" ||
      preview.requiredConfirmation !== "replace_same_vault"
    ) {
      throw new Error("The restore proof did not produce the expected overwrite conflict.");
    }
    const result = await commitPortableArchiveRestoreV1({
      preview,
      confirmation: "replace_same_vault",
    });
    const restoredVaults = await client.query<VaultRow>(
      sqlStatement(
        "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
      ),
    );
    const restored = await client.exportPortable();

    return Object.freeze({
      archiveSha256: archive.sha256,
      archiveByteLength: archive.byteLength,
      dataFileCount: archive.manifest.dataFiles.length,
      attachmentCount: archive.manifest.attachments.length,
      corruptionRejected,
      corruptionPreservedTarget,
      conflict: preview.conflict,
      requiredConfirmation: preview.requiredConfirmation,
      previewPreservedTarget,
      staleTargetRejected,
      staleTargetPreserved,
      committed: result.committed,
      restoredDatabaseSha256: restored.sha256,
      restoredDatabaseMatchesArchive: restored.sha256 === portable.sha256,
      restoredVaultName: restoredVaults[0]?.name ?? "",
    });
  },
  createPortableRecoveryFixture: async (input) => {
    const client = await getDatabase();
    const attachmentContentIds = await seedRepresentativePhase1Vault(client, input.vaultId);
    const phase3Inventory = await readPhase3RecoveryInventory(client);
    const { archive, portable } = await createCurrentPortableArchive(input);
    const inspected = await inspectPortableArchiveV1({
      bytes: archive.bytes,
      expectedSchemaVersion: portable.schemaVersion,
      expectedArchiveSha256: archive.sha256,
    });
    const content = await createPortableArchiveContentHashV1(inspected);
    return Object.freeze({
      archiveByteLength: archive.byteLength,
      archiveSha256: archive.sha256,
      archiveBytesBase64: bytesToBase64(archive.bytes),
      databaseSha256: portable.sha256,
      contentSha256: content.sha256,
      attachmentContentIds,
      dataFileCount: archive.manifest.dataFiles.length,
      attachmentCount: archive.manifest.attachments.length,
      phase3Inventory,
    });
  },
  restorePortableRecoveryFixture: async (input) => {
    const client = await getDatabase();
    const archiveBytes = base64ToBytes(input.archiveBytesBase64);
    const schemaVersion = (await client.diagnostics()).schemaVersion;
    const inspected = await inspectPortableArchiveV1({
      bytes: archiveBytes,
      expectedSchemaVersion: schemaVersion,
      expectedArchiveSha256: input.archiveSha256,
    });
    if (inspected.manifest.vault.id !== input.vaultId) {
      throw new Error("The recovery fixture changed vault identity.");
    }
    const store = await getAttachmentStore();
    const port = createBrowserPortableArchiveRestorePortV1({
      database: client,
      attachments: store,
      expectedVaultId: input.vaultId,
    });
    const preview = await createPortableArchiveRestorePreviewV1({
      archiveBytes,
      expectedSchemaVersion: schemaVersion,
      expectedArchiveSha256: input.archiveSha256,
      port,
    });
    if (preview.conflict !== "none" || preview.requiredConfirmation !== "commit") {
      throw new Error("The recovery fixture target is not clean.");
    }
    const result = await commitPortableArchiveRestoreV1({
      preview,
      confirmation: "commit",
    });
    const restored = await client.exportPortable();
    const content = await createPortableVaultContentHashV1({
      database: client,
      generatedAt: input.generatedAt,
      vaultId: input.vaultId,
      readAttachment: (contentId) => store.read(contentId),
    });
    const attachmentRows = await client.query<{ readonly content_id: string } & QueryRow>(
      sqlStatement("SELECT content_id FROM attachment_manifest ORDER BY content_id"),
    );
    const phase3Inventory = await readPhase3RecoveryInventory(client);
    return Object.freeze({
      contentSha256: content.sha256,
      databaseSha256: restored.sha256,
      databaseMatchesArchive: restored.sha256 === inspected.database.sha256,
      attachmentContentIds: Object.freeze(attachmentRows.map((row) => row.content_id)),
      attachmentCount: attachmentRows.length,
      conflict: preview.conflict,
      committed: result.committed,
      phase3Inventory,
    });
  },
  runPhase1RepositoryContracts: async () => {
    await api.close();
    const reviewedMigrations = await migrations();
    const run = await runDatabaseContractSuite(
      createBrowserContractAdapter(),
      createPhase1RepositoryContractSuite({
        expectedFts5: true,
        migrate: async (client) => {
          await applySqlMigrations(client, reviewedMigrations, MIGRATION_APPLIED_AT);
        },
      }),
    );
    return Object.freeze({
      manifest: PHASE_1_REPOSITORY_CONTRACT_MANIFEST,
      run,
    });
  },
  runCareerRepositoryContracts: async () => {
    await api.close();
    const reviewedMigrations = await migrations();
    const run = await runDatabaseContractSuite(
      createBrowserContractAdapter(),
      createCareerRepositoryContractSuite({
        migrate: async (client) => {
          await applySqlMigrations(client, reviewedMigrations, MIGRATION_APPLIED_AT);
        },
      }),
    );
    return Object.freeze({
      manifest: CAREER_REPOSITORY_CONTRACT_MANIFEST,
      run,
    });
  },
  runPhase1CanonicalJourney: async () =>
    runPhase1CanonicalJourney({
      runtime: "browser",
      prepareSource: async () => {
        const client = await getDatabase();
        await (await getAttachmentStore()).deleteAll();
        await client.delete();
        database = undefined;
        attachmentStore = undefined;
        const source = await getDatabase();
        await applySqlMigrations(source, await migrations(), MIGRATION_APPLIED_AT);
        return source;
      },
      createVaultDeletionPort: () => browserVaultDeletionPort,
      prepareRestoreTarget: async () => {
        const target = await getDatabase();
        await applySqlMigrations(target, await migrations(), MIGRATION_APPLIED_AT);
        return target;
      },
      createRestorePort: async (target, vaultId) =>
        createBrowserPortableArchiveRestorePortV1({
          database: target as BrowserSqliteDatabase,
          attachments: await getAttachmentStore(),
          expectedVaultId: vaultId,
        }),
      readRestoredAttachment: async (_target, contentId) =>
        (await getAttachmentStore()).read(contentId),
    }),
};

globalThis.coredrillStorageSpike = Object.freeze(api);
globalThis.coredrillExtensionInbox = createExtensionInbox(async () => {
  const client = await getDatabase();
  await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
  return client;
});
