import {
  createJobActivityOperations,
  createJobPipelineOperations,
  createVaultDeletionOperations,
  createVaultOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type VaultDeletionPort,
} from "@coredrill/application";
import { entityId, instant, type EntityId } from "@coredrill/domain";

import {
  createDatabaseJobActivityPort,
  createDatabaseJobPipelinePort,
  createDatabaseVaultLifecyclePort,
} from "./application-ports.js";
import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";
import { createPipelineRepositories } from "./pipeline-repositories.js";
import {
  commitPortableArchiveRestoreV1,
  createPortableArchiveRestorePreviewV1,
  inspectPortableArchiveV1,
  type PortableArchiveRestorePortV1,
} from "./portable-archive-restore.js";
import { writePortableArchiveV1 } from "./portable-archive-writer.js";
import { createPortableDataExportV1 } from "./portable-data-export.js";
import {
  createPortableArchiveContentHashV1,
  createPortableVaultContentHashV1,
} from "./portable-vault-content-hash.js";

export const PHASE_1_CANONICAL_JOURNEY_VERSION = 1 as const;

export interface Phase1CanonicalJourneyRuntime {
  readonly runtime: "browser" | "windows-native";
  readonly prepareSource: () => Promise<DatabasePort>;
  readonly createVaultDeletionPort: (database: DatabasePort) => VaultDeletionPort;
  readonly prepareRestoreTarget: () => Promise<DatabasePort>;
  readonly createRestorePort: (
    database: DatabasePort,
    vaultId: EntityId<"vault">,
  ) => Promise<PortableArchiveRestorePortV1>;
  readonly readRestoredAttachment?: (
    database: DatabasePort,
    contentId: string,
  ) => Promise<Uint8Array | undefined>;
}

export interface Phase1CanonicalJourneyStep {
  readonly id:
    | "add_job"
    | "create_vault"
    | "delete_vault"
    | "export_archive"
    | "move_stages"
    | "restore_archive"
    | "schedule_interview"
    | "schedule_follow_up";
  readonly status: "passed";
  readonly summary: string;
}

export interface Phase1CanonicalJourneyProof {
  readonly version: typeof PHASE_1_CANONICAL_JOURNEY_VERSION;
  readonly runtime: Phase1CanonicalJourneyRuntime["runtime"];
  readonly adapterName: string;
  readonly schemaVersion: number;
  readonly vaultId: string;
  readonly vaultName: string;
  readonly jobId: string;
  readonly jobTitle: string;
  readonly applicationId: string;
  readonly finalStage: "Interviewing";
  readonly statusEventCount: 3;
  readonly interviewCount: 1;
  readonly nextActionCount: 1;
  readonly reminderCount: 1;
  readonly archiveSha256: string;
  readonly archiveByteLength: number;
  readonly contentSha256BeforeDelete: string;
  readonly contentSha256AfterRestore: string;
  readonly deletionStatus: "deleted";
  readonly restoreConflict: "none";
  readonly restoreCommitted: true;
  readonly restoredDatabaseMatchesArchive: true;
  readonly accountRequired: false;
  readonly networkRequired: false;
  readonly aiRequired: false;
  readonly steps: readonly Phase1CanonicalJourneyStep[];
}

interface MigrationLedgerRow extends QueryRow {
  readonly version: number;
  readonly name: string;
  readonly sha256: string;
  readonly applied_at: string;
}

interface CountRow extends QueryRow {
  readonly total: number;
}

interface RestoredJobRow extends QueryRow {
  readonly id: string;
  readonly title: string;
  readonly current_status_id: string | null;
}

const IDS = Object.freeze({
  vault: entityId("vault", "0199a100-0000-7000-8000-000000000001"),
  job: entityId("job", "0199a100-0000-7000-8000-000000000002"),
  savedStatus: entityId("status_definition", "0199a100-0000-7000-8000-000000000003"),
  appliedStatus: entityId("status_definition", "0199a100-0000-7000-8000-000000000004"),
  interviewingStatus: entityId("status_definition", "0199a100-0000-7000-8000-000000000005"),
  application: entityId("application", "0199a100-0000-7000-8000-000000000006"),
  statusEvents: Object.freeze([
    entityId("status-event", "0199a100-0000-7000-8000-000000000007"),
    entityId("status-event", "0199a100-0000-7000-8000-000000000008"),
    entityId("status-event", "0199a100-0000-7000-8000-000000000009"),
  ]),
  statusUndoTokens: Object.freeze([
    entityId("mutation-undo-token", "0199a100-0000-7000-8000-00000000000a"),
    entityId("mutation-undo-token", "0199a100-0000-7000-8000-00000000000b"),
    entityId("mutation-undo-token", "0199a100-0000-7000-8000-00000000000c"),
  ]),
  interview: entityId("interview", "0199a100-0000-7000-8000-00000000000d"),
  nextAction: entityId("next-action", "0199a100-0000-7000-8000-00000000000e"),
  nextActionUndoToken: entityId("mutation-undo-token", "0199a100-0000-7000-8000-00000000000f"),
  reminder: entityId("reminder", "0199a100-0000-7000-8000-000000000010"),
  archive: entityId("portable-archive", "0199a100-0000-7000-8000-000000000011"),
  previewOperation: entityId("application-operation", "0199a100-0000-7000-8000-000000000012"),
  deleteOperation: entityId("application-operation", "0199a100-0000-7000-8000-000000000013"),
});

const TIMES = Object.freeze({
  vault: instant("2026-08-30T12:00:00.000Z"),
  statuses: instant("2026-08-30T12:00:10.000Z"),
  job: instant("2026-08-30T12:01:00.000Z"),
  saved: instant("2026-08-30T12:02:00.000Z"),
  applied: instant("2026-08-30T12:03:00.000Z"),
  interviewing: instant("2026-08-30T12:04:00.000Z"),
  interviewScheduled: instant("2026-08-30T12:05:00.000Z"),
  followUpScheduled: instant("2026-08-30T12:06:00.000Z"),
  reminderScheduled: instant("2026-08-30T12:07:00.000Z"),
  interviewStarts: instant("2026-09-02T15:00:00.000Z"),
  reminderAt: instant("2026-09-02T18:00:00.000Z"),
  followUpDue: instant("2026-09-03T15:00:00.000Z"),
  archive: instant("2026-08-30T12:08:00.000Z"),
  preview: instant("2026-08-30T12:09:00.000Z"),
  deleted: instant("2026-08-30T12:10:00.000Z"),
});

const operationContext = (suffix: number, initiatedAt: string): ApplicationOperationContext =>
  Object.freeze({
    operationId: entityId(
      "application-operation",
      `0199a101-0000-7000-8000-${suffix.toString(16).padStart(12, "0")}`,
    ),
    initiatedAt: instant(initiatedAt),
  });

const success = <Value>(result: ApplicationResult<Value>, action: string): Value => {
  if (!result.ok) throw new Error(`${action} failed with ${result.error.code}.`);
  return result.value;
};

const step = (id: Phase1CanonicalJourneyStep["id"], summary: string): Phase1CanonicalJourneyStep =>
  Object.freeze({ id, status: "passed", summary });

const COUNT_SQL = Object.freeze({
  application: "SELECT count(*) AS total FROM application",
  interview: "SELECT count(*) AS total FROM interview",
  next_action: "SELECT count(*) AS total FROM next_action",
  reminder: "SELECT count(*) AS total FROM reminder",
  status_event: "SELECT count(*) AS total FROM status_event",
});

const singletonCount = async (
  database: DatabasePort,
  table: keyof typeof COUNT_SQL,
): Promise<number> => {
  const rows = await database.query<CountRow>(sqlStatement(COUNT_SQL[table]));
  const total = rows[0]?.total;
  if (!Number.isSafeInteger(total) || total === undefined) {
    throw new Error("Canonical journey count result is invalid.");
  }
  return total;
};

/**
 * Runs the Phase 1 accountless recovery loop over a real adapter. The runner
 * intentionally composes production commands/repositories and never exposes a
 * network, account, or AI capability.
 */
export const runPhase1CanonicalJourney = async (
  runtime: Phase1CanonicalJourneyRuntime,
): Promise<Phase1CanonicalJourneyProof> => {
  const database = await runtime.prepareSource();
  const diagnostics = await database.diagnostics();
  const vaultOperations = createVaultOperations({
    lifecycle: createDatabaseVaultLifecyclePort(database),
    createVaultId: () => IDS.vault,
  });
  const pipelineOperations = createJobPipelineOperations({
    pipeline: createDatabaseJobPipelinePort(database),
    createJobId: () => IDS.job,
    createStatusEventId: (() => {
      let index = 0;
      return () => {
        const id = IDS.statusEvents[index];
        index += 1;
        if (id === undefined) throw new Error("Canonical status-event identities were exhausted.");
        return id;
      };
    })(),
    createUndoTokenId: (() => {
      let index = 0;
      return () => {
        const id = IDS.statusUndoTokens[index];
        index += 1;
        if (id === undefined) throw new Error("Canonical status undo identities were exhausted.");
        return id;
      };
    })(),
  });
  const activityOperations = createJobActivityOperations({
    activity: createDatabaseJobActivityPort(database),
    createNextActionId: () => IDS.nextAction,
    createUndoTokenId: () => IDS.nextActionUndoToken,
    createInteractionId: () => entityId("interaction", "0199a100-0000-7000-8000-000000000014"),
    createInterviewId: () => IDS.interview,
    createReminderId: () => IDS.reminder,
  });

  const vault = success(
    await vaultOperations.createVaultCommand.execute(
      { name: "Canonical local job search" },
      operationContext(1, TIMES.vault),
    ),
    "create vault",
  );

  await database.transaction(async (transaction) => {
    const statuses = createPipelineRepositories(transaction).statusDefinitions;
    await statuses.create({
      id: IDS.savedStatus,
      name: "Saved",
      category: "saved",
      color: "blue",
      isSystem: true,
      sortOrder: 10,
      terminal: false,
      archivedAt: null,
      createdAt: TIMES.statuses,
      updatedAt: TIMES.statuses,
    });
    await statuses.create({
      id: IDS.appliedStatus,
      name: "Applied",
      category: "applied",
      color: "indigo",
      isSystem: true,
      sortOrder: 20,
      terminal: false,
      archivedAt: null,
      createdAt: TIMES.statuses,
      updatedAt: TIMES.statuses,
    });
    await statuses.create({
      id: IDS.interviewingStatus,
      name: "Interviewing",
      category: "interview",
      color: "violet",
      isSystem: true,
      sortOrder: 30,
      terminal: false,
      archivedAt: null,
      createdAt: TIMES.statuses,
      updatedAt: TIMES.statuses,
    });
  });

  const job = success(
    await pipelineOperations.createJobCommand.execute(
      {
        title: "Research Operations Lead",
        descriptionText: "Coordinate ethical, evidence-led research operations.",
        employmentType: "full_time",
        workplaceType: "remote",
      },
      operationContext(2, TIMES.job),
    ),
    "add job",
  );
  success(
    await pipelineOperations.changeStatusCommand.execute(
      { jobId: job.id, toStatusId: IDS.savedStatus, note: "Saved for review." },
      operationContext(3, TIMES.saved),
    ),
    "move to Saved",
  );

  await database.transaction(async (transaction) => {
    await createPipelineRepositories(transaction).applications.create({
      id: IDS.application,
      jobId: IDS.job,
      appliedAt: TIMES.applied,
      channel: "manual",
      currentStatusId: IDS.savedStatus,
      selectedResumeVersionId: null,
      selectedCoverLetterVersionId: null,
      notes: "Submitted outside Coredrill; no automated application action occurred.",
      archivedAt: null,
      createdAt: TIMES.applied,
      updatedAt: TIMES.applied,
    });
  });
  success(
    await pipelineOperations.changeStatusCommand.execute(
      {
        jobId: job.id,
        applicationId: IDS.application,
        toStatusId: IDS.appliedStatus,
        note: "Marked applied after user-controlled submission.",
      },
      operationContext(4, TIMES.applied),
    ),
    "move to Applied",
  );
  success(
    await pipelineOperations.changeStatusCommand.execute(
      {
        jobId: job.id,
        applicationId: IDS.application,
        toStatusId: IDS.interviewingStatus,
        note: "Interview invitation received.",
      },
      operationContext(5, TIMES.interviewing),
    ),
    "move to Interviewing",
  );

  const interview = success(
    await activityOperations.scheduleInterviewCommand.execute(
      {
        applicationId: IDS.application,
        stageName: "Hiring manager interview",
        startsAt: TIMES.interviewStarts,
        timeZone: "America/New_York",
        durationMinutes: 45,
        locationOrUrl: "Video call details stored locally",
        preparationNotes: "Review the role evidence and prepare questions.",
      },
      operationContext(6, TIMES.interviewScheduled),
    ),
    "schedule interview",
  );
  const nextAction = success(
    await activityOperations.setNextActionCommand.execute(
      {
        jobId: job.id,
        applicationId: IDS.application,
        title: "Send interview follow-up",
        dueAt: TIMES.followUpDue,
        timeZone: "America/New_York",
      },
      operationContext(7, TIMES.followUpScheduled),
    ),
    "schedule follow-up",
  );
  success(
    await activityOperations.scheduleReminderCommand.execute(
      {
        jobId: job.id,
        nextActionId: nextAction.nextAction.id,
        interviewId: interview.id,
        remindAt: TIMES.reminderAt,
        timeZone: "America/New_York",
        note: "Prepare the user-controlled follow-up; do not send automatically.",
      },
      operationContext(8, TIMES.reminderScheduled),
    ),
    "schedule follow-up reminder",
  );

  const dataBundle = await createPortableDataExportV1({
    database,
    generatedAt: TIMES.archive,
    vaultId: IDS.vault,
  });
  const portable = await database.exportPortable();
  const migrationRows = await database.query<MigrationLedgerRow>(
    sqlStatement(
      "SELECT version, name, sha256, applied_at FROM coredrill_schema_migration ORDER BY version",
    ),
  );
  const archive = await writePortableArchiveV1({
    archiveId: IDS.archive,
    createdAt: TIMES.archive,
    createdByVersion: "0.0.0",
    vault: {
      id: IDS.vault,
      schemaVersion: portable.schemaVersion,
      migrationHistory: migrationRows.map((row) => ({
        version: row.version,
        name: row.name,
        sha256: row.sha256,
        appliedAt: row.applied_at,
      })),
    },
    database: portable,
    dataFiles: dataBundle.dataFiles,
    attachments: [],
    readAttachment: () => Promise.resolve(undefined),
  });
  const inspected = await inspectPortableArchiveV1({
    bytes: archive.bytes,
    expectedSchemaVersion: portable.schemaVersion,
    expectedArchiveSha256: archive.sha256,
  });
  const contentBeforeDelete = await createPortableArchiveContentHashV1(inspected);

  const deletionOperations = createVaultDeletionOperations(
    runtime.createVaultDeletionPort(database),
  );
  const deletionPreview = success(
    await deletionOperations.previewVaultDeletionQuery.execute(
      { vaultId: IDS.vault },
      Object.freeze({ operationId: IDS.previewOperation, initiatedAt: TIMES.preview }),
    ),
    "preview vault deletion",
  );
  const deletion = success(
    await deletionOperations.deleteVaultCommand.execute(
      {
        vaultId: IDS.vault,
        previewId: deletionPreview.previewId,
        confirmation: deletionPreview.requiredConfirmation,
      },
      Object.freeze({ operationId: IDS.deleteOperation, initiatedAt: TIMES.deleted }),
    ),
    "delete vault",
  );
  if (deletion.status !== "deleted") {
    throw new Error("Canonical vault deletion completed with cleanup still pending.");
  }

  const restoredDatabase = await runtime.prepareRestoreTarget();
  const restorePort = await runtime.createRestorePort(restoredDatabase, IDS.vault);
  const restorePreview = await createPortableArchiveRestorePreviewV1({
    archiveBytes: archive.bytes,
    expectedSchemaVersion: portable.schemaVersion,
    expectedArchiveSha256: archive.sha256,
    port: restorePort,
  });
  if (restorePreview.conflict !== "none" || restorePreview.requiredConfirmation !== "commit") {
    throw new Error("Canonical restore target is not clean.");
  }
  const restored = await commitPortableArchiveRestoreV1({
    preview: restorePreview,
    confirmation: "commit",
  });
  const restoredPortable = await restoredDatabase.exportPortable();
  const contentAfterRestore = await createPortableVaultContentHashV1({
    database: restoredDatabase,
    generatedAt: TIMES.archive,
    vaultId: IDS.vault,
    readAttachment: (contentId) =>
      runtime.readRestoredAttachment?.(restoredDatabase, contentId) ?? Promise.resolve(undefined),
  });

  const restoredJobs = await restoredDatabase.query<RestoredJobRow>(
    sqlStatement("SELECT id, title, current_status_id FROM job ORDER BY id"),
  );
  const restoredJob = restoredJobs[0];
  const statusEventCount = await singletonCount(restoredDatabase, "status_event");
  const applicationCount = await singletonCount(restoredDatabase, "application");
  const interviewCount = await singletonCount(restoredDatabase, "interview");
  const nextActionCount = await singletonCount(restoredDatabase, "next_action");
  const reminderCount = await singletonCount(restoredDatabase, "reminder");
  if (
    restoredJobs.length !== 1 ||
    restoredJob?.id !== IDS.job ||
    restoredJob.title !== job.title ||
    restoredJob.current_status_id !== IDS.interviewingStatus ||
    statusEventCount !== 3 ||
    applicationCount !== 1 ||
    interviewCount !== 1 ||
    nextActionCount !== 1 ||
    reminderCount !== 1 ||
    contentAfterRestore.sha256 !== contentBeforeDelete.sha256 ||
    restoredPortable.sha256 !== inspected.database.sha256
  ) {
    throw new Error("Canonical journey restore did not reproduce the saved local workflow.");
  }

  return Object.freeze({
    version: PHASE_1_CANONICAL_JOURNEY_VERSION,
    runtime: runtime.runtime,
    adapterName: diagnostics.adapterName,
    schemaVersion: diagnostics.schemaVersion,
    vaultId: vault.vault.id,
    vaultName: vault.vault.name,
    jobId: job.id,
    jobTitle: job.title,
    applicationId: IDS.application,
    finalStage: "Interviewing",
    statusEventCount: 3,
    interviewCount: 1,
    nextActionCount: 1,
    reminderCount: 1,
    archiveSha256: archive.sha256,
    archiveByteLength: archive.byteLength,
    contentSha256BeforeDelete: contentBeforeDelete.sha256,
    contentSha256AfterRestore: contentAfterRestore.sha256,
    deletionStatus: "deleted",
    restoreConflict: restorePreview.conflict,
    restoreCommitted: restored.committed,
    restoredDatabaseMatchesArchive: true,
    accountRequired: false,
    networkRequired: false,
    aiRequired: false,
    steps: Object.freeze([
      step("create_vault", `Created local vault ${vault.vault.name}.`),
      step("add_job", `Added ${job.title} through CreateJobCommand.`),
      step("move_stages", "Moved Saved → Applied → Interviewing with three durable events."),
      step("schedule_interview", `Scheduled ${interview.stageName} in America/New_York.`),
      step("schedule_follow_up", `Scheduled ${nextAction.nextAction.title} and its reminder.`),
      step("export_archive", `Exported verified archive ${archive.sha256}.`),
      step("delete_vault", "Deleted app-managed local vault data after exact confirmation."),
      step(
        "restore_archive",
        `Restored and matched canonical content ${contentAfterRestore.sha256}.`,
      ),
    ]),
  });
};
