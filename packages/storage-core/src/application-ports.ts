import {
  JobActivityError,
  JobPipelineError,
  VaultLifecycleError,
  type JobActivityPort,
  type JobPipelinePort,
  type VaultDiagnosticsDto,
  type VaultLifecyclePort,
  type VaultSessionDto,
} from "@coredrill/application";

import type { DatabasePort, DatabaseSession, StorageDiagnostics } from "./database-port.js";
import {
  PipelineRepositoryConflictError,
  changePipelineStatus,
  createPipelineRepositories,
  setNextAction,
} from "./pipeline-repositories.js";
import { createTrackerRepositories } from "./tracker-repositories.js";

const diagnosticsDto = (diagnostics: StorageDiagnostics): VaultDiagnosticsDto => {
  const issueCodes = new Set<VaultDiagnosticsDto["issueCodes"][number]>();
  if (diagnostics.readOnly) issueCodes.add("read-only");
  if (diagnostics.persistence === "memory") issueCodes.add("persistence-memory-only");
  if (diagnostics.health === "unavailable") issueCodes.add("storage-unavailable");
  return Object.freeze({
    health: diagnostics.health,
    persistence: diagnostics.persistence,
    readOnly: diagnostics.readOnly,
    schemaVersion: diagnostics.schemaVersion,
    issueCodes: Object.freeze([...issueCodes]),
  });
};

const sessionDto = async (
  database: DatabasePort,
  vaultId: Parameters<VaultLifecyclePort["open"]>[0]["vaultId"],
): Promise<VaultSessionDto> => {
  const vault = await createTrackerRepositories(database).vaults.findById(vaultId);
  if (vault === undefined) throw new VaultLifecycleError("not_found");
  return Object.freeze({
    vault: Object.freeze({ ...vault }),
    diagnostics: diagnosticsDto(await database.diagnostics()),
  });
};

/** Concrete SQLite composition for the adapter-neutral vault use cases. */
export const createDatabaseVaultLifecyclePort = (database: DatabasePort): VaultLifecyclePort =>
  Object.freeze({
    create: async (input: Parameters<VaultLifecyclePort["create"]>[0]) => {
      const diagnostics = await database.diagnostics();
      if (diagnostics.readOnly) throw new VaultLifecycleError("read_only");
      await database.transaction(async (transaction) => {
        const repositories = createTrackerRepositories(transaction);
        if ((await repositories.vaults.findById(input.vaultId)) !== undefined) {
          throw new VaultLifecycleError("already_exists");
        }
        await repositories.vaults.create({
          id: input.vaultId,
          name: input.name,
          schemaVersion: diagnostics.schemaVersion,
          createdAt: input.createdAt,
          lastOpenedAt: input.createdAt,
        });
      });
      return sessionDto(database, input.vaultId);
    },
    open: async (input: Parameters<VaultLifecyclePort["open"]>[0]) => {
      await database.transaction(async (transaction) => {
        const repositories = createTrackerRepositories(transaction);
        if ((await repositories.vaults.findById(input.vaultId)) === undefined) {
          throw new VaultLifecycleError("not_found");
        }
        await repositories.vaults.touch(input.vaultId, input.openedAt);
      });
      return sessionDto(database, input.vaultId);
    },
    diagnostics: async () => diagnosticsDto(await database.diagnostics()),
  });

const pipelineFailure = (error: unknown): never => {
  if (!(error instanceof PipelineRepositoryConflictError)) throw error;
  if (error.code === "pipeline_record_not_found") throw new JobPipelineError("not_found");
  if (error.code === "same_status") throw new JobPipelineError("same_status");
  if (error.code === "reopen_requires_explicit_confirmation") {
    throw new JobPipelineError("reopen_confirmation_required");
  }
  if (error.code === "pipeline_projection_conflict") {
    throw new JobPipelineError("projection_conflict");
  }
  throw new JobPipelineError("invalid_state");
};

/** Concrete SQLite composition for manual jobs and atomic status projection changes. */
export const createDatabaseJobPipelinePort = (database: DatabasePort): JobPipelinePort =>
  Object.freeze({
    createManualJob: async (input: Parameters<JobPipelinePort["createManualJob"]>[0]) => {
      try {
        return await database.transaction(async (transaction) => {
          const jobs = createTrackerRepositories(transaction).jobs;
          if ((await jobs.findById(input.id)) !== undefined) {
            throw new JobPipelineError("already_exists");
          }
          await jobs.create({ ...input, archivedAt: input.archivedAt });
          const stored = await jobs.findById(input.id);
          if (stored === undefined) throw new JobPipelineError("invalid_state");
          return Object.freeze({
            id: stored.id,
            companyId: stored.companyId,
            title: stored.title,
            currentStatusId: stored.currentStatusId,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt,
            rowVersion: stored.rowVersion,
          });
        });
      } catch (error) {
        return pipelineFailure(error);
      }
    },
    changeStatus: async (input: Parameters<JobPipelinePort["changeStatus"]>[0]) => {
      try {
        const changed = await changePipelineStatus(database, input);
        return Object.freeze({
          statusEvent: Object.freeze({ ...changed.statusEvent }),
          undoToken: Object.freeze({ ...changed.undoToken }),
        });
      } catch (error) {
        return pipelineFailure(error);
      }
    },
  });

const activityFailure = (error: unknown): never => {
  if (!(error instanceof PipelineRepositoryConflictError)) throw error;
  if (error.code === "pipeline_record_not_found") throw new JobActivityError("not_found");
  if (error.code === "pipeline_projection_conflict") {
    throw new JobActivityError("scheduling_conflict");
  }
  throw new JobActivityError("invalid_state");
};

const withinTransaction = async <Value>(
  database: DatabasePort,
  work: (session: DatabaseSession) => Promise<Value>,
): Promise<Value> => database.transaction(work);

/** Concrete SQLite composition for local interactions, interviews, reminders, and next actions. */
export const createDatabaseJobActivityPort = (database: DatabasePort): JobActivityPort =>
  Object.freeze({
    setNextAction: async (input: Parameters<JobActivityPort["setNextAction"]>[0]) => {
      try {
        const stored = await setNextAction(database, input, input.undoTokenId);
        return Object.freeze({
          nextAction: Object.freeze({ ...stored.nextAction }),
          undoToken: Object.freeze({ ...stored.undoToken }),
        });
      } catch (error) {
        return activityFailure(error);
      }
    },
    recordInteraction: async (input: Parameters<JobActivityPort["recordInteraction"]>[0]) => {
      try {
        return await withinTransaction(database, async (transaction) => {
          const interactions = createPipelineRepositories(transaction).interactions;
          await interactions.append(input);
          const stored = await interactions.findById(input.id);
          if (stored === undefined) throw new JobActivityError("invalid_state");
          return Object.freeze({ ...stored });
        });
      } catch (error) {
        return activityFailure(error);
      }
    },
    scheduleInterview: async (input: Parameters<JobActivityPort["scheduleInterview"]>[0]) => {
      try {
        return await withinTransaction(database, async (transaction) => {
          const interviews = createPipelineRepositories(transaction).interviews;
          await interviews.create(input);
          const stored = await interviews.findById(input.id);
          if (stored === undefined) throw new JobActivityError("invalid_state");
          return Object.freeze({ ...stored });
        });
      } catch (error) {
        return activityFailure(error);
      }
    },
    scheduleReminder: async (input: Parameters<JobActivityPort["scheduleReminder"]>[0]) => {
      try {
        return await withinTransaction(database, async (transaction) => {
          const reminders = createPipelineRepositories(transaction).reminders;
          await reminders.create(input);
          const stored = await reminders.findById(input.id);
          if (stored === undefined) throw new JobActivityError("invalid_state");
          return Object.freeze({ ...stored });
        });
      } catch (error) {
        return activityFailure(error);
      }
    },
  });
