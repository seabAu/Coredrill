import { dateOnly, entityId, instant, timeZone } from "@coredrill/domain";
import {
  AppliedStageError,
  MutationUndoError,
  createPipelineQueryOperations,
  createJobTimelineQuery,
  JobTimelineError,
  JobActivityError,
  NextActionCompletionError,
  createCompleteNextActionCommand,
  createJobNextActionsQuery,
  JobNextActionsError,
  NextActionDismissalError,
  createDismissNextActionCommand,
} from "@coredrill/application";
import { createDatabaseNextActionCompletionPort } from "./next-action-completion-repository.js";
import { createDatabaseNextActionDismissalPort } from "./next-action-dismissal-repository.js";
import { createJobNextActionsRepository } from "./job-next-actions-repository.js";
import {
  createDatabaseMutationUndoPort,
  createDatabaseJobActivityPort,
} from "./application-ports.js";
import { createAppliedStageRepository } from "./applied-stage-repository.js";
import { createPipelineQueryRepository } from "./pipeline-query-repository.js";
import { createJobTimelineRepository } from "./job-timeline-repository.js";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import {
  sqlStatement,
  type DatabasePort,
  type QueryRow,
  type SqlStatement,
} from "./database-port.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import {
  PipelineRepositoryConflictError,
  changePipelineStatus,
  completeNextAction,
  dismissNextAction,
  consumeMutationUndoToken,
  createPipelineRepositories,
  setNextAction,
} from "./pipeline-repositories.js";
import { createTrackerRepositories } from "./tracker-repositories.js";

export interface PipelineRepositoryContractSetup {
  readonly migrate: (database: DatabasePort, throughVersion?: number) => Promise<void>;
}

const IDS = Object.freeze({
  saved: entityId("status_definition", "0198e103-0000-7000-8000-000000000001"),
  applied: entityId("status_definition", "0198e103-0000-7000-8000-000000000002"),
  rejected: entityId("status_definition", "0198e103-0000-7000-8000-000000000003"),
  job: entityId("job", "0198e103-0000-7000-8000-000000000004"),
  application: entityId("application", "0198e103-0000-7000-8000-000000000005"),
  additionalApplication: entityId("application", "0198e103-0000-7000-8000-000000000006"),
  appliedEvent: entityId("status-event", "0198e103-0000-7000-8000-000000000007"),
  rejectedEvent: entityId("status-event", "0198e103-0000-7000-8000-000000000008"),
  reopenedEvent: entityId("status-event", "0198e103-0000-7000-8000-000000000009"),
  interaction: entityId("interaction", "0198e103-0000-7000-8000-00000000000a"),
  nextAction: entityId("next-action", "0198e103-0000-7000-8000-00000000000b"),
  interview: entityId("interview", "0198e103-0000-7000-8000-00000000000c"),
  reminder: entityId("reminder", "0198e103-0000-7000-8000-00000000000d"),
  appliedUndo: entityId("mutation-undo-token", "0198e103-0000-7000-8000-00000000000e"),
  rejectedUndo: entityId("mutation-undo-token", "0198e103-0000-7000-8000-00000000000f"),
  reopenedUndo: entityId("mutation-undo-token", "0198e103-0000-7000-8000-000000000010"),
  nextActionUndo: entityId("mutation-undo-token", "0198e103-0000-7000-8000-000000000011"),
  replacementAction: entityId("next-action", "0198e103-0000-7000-8000-000000000012"),
  replacementActionUndo: entityId("mutation-undo-token", "0198e103-0000-7000-8000-000000000013"),
  replacementReminder: entityId("reminder", "0198e103-0000-7000-8000-000000000014"),
  staleAction: entityId("next-action", "0198e103-0000-7000-8000-000000000015"),
  staleActionUndo: entityId("mutation-undo-token", "0198e103-0000-7000-8000-000000000016"),
  completionReminder: entityId("reminder", "0198e103-0000-7000-8000-000000000017"),
  standaloneReminder: entityId("reminder", "0198e103-0000-7000-8000-000000000018"),
  dismissedReminder: entityId("reminder", "0198e103-0000-7000-8000-000000000019"),
  foreignReminder: entityId("reminder", "0198e103-0000-7000-8000-00000000001a"),
  dismissalAction: entityId("next-action", "0198e103-0000-7000-8000-00000000001b"),
  laterAction: entityId("next-action", "0198e103-0000-7000-8000-00000000001c"),
  dismissalReminder: entityId("reminder", "0198e103-0000-7000-8000-00000000001d"),
  firedDismissalReminder: entityId("reminder", "0198e103-0000-7000-8000-00000000001e"),
  foreignDismissalReminder: entityId("reminder", "0198e103-0000-7000-8000-00000000001f"),
});

const CREATED_AT = instant("2026-08-25T14:00:00.000Z");
const APPLIED_AT = instant("2026-08-25T14:05:00.000Z");
const REJECTED_AT = instant("2026-08-25T14:10:00.000Z");
const REOPENED_AT = instant("2026-08-25T14:15:00.000Z");
const ACTION_DUE_AT = instant("2026-08-27T13:00:00.000Z");
const INTERVIEW_AT = instant("2026-08-28T15:00:00.000Z");
const REMINDER_AT = instant("2026-08-28T13:00:00.000Z");
const FINAL_UNDO_AT = instant("2026-08-29T16:00:00.000Z");
const EASTERN = timeZone("America/New_York");

const assertContract = (condition: boolean, message: string): void => {
  if (!condition) throw new DatabaseContractViolation(message);
};

const expectFailure = async (
  operation: () => Promise<unknown>,
  predicate: (error: unknown) => boolean,
  message: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    if (predicate(error)) return;
    throw error;
  }
  throw new DatabaseContractViolation(message);
};

const createStatuses = async (database: DatabasePort): Promise<void> => {
  const statuses = createPipelineRepositories(database).statusDefinitions;
  await statuses.create({
    id: IDS.saved,
    name: "Synthetic review queue",
    category: "saved",
    color: "slate",
    isSystem: false,
    sortOrder: 10,
    terminal: false,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await statuses.create({
    id: IDS.applied,
    name: "Synthetic submitted",
    category: "applied",
    color: "blue",
    isSystem: false,
    sortOrder: 20,
    terminal: false,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await statuses.create({
    id: IDS.rejected,
    name: "Synthetic closed outcome",
    category: "rejected",
    color: "gray",
    isSystem: false,
    sortOrder: 30,
    terminal: true,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
};

const newApplication = (id = IDS.application) => ({
  id,
  jobId: IDS.job,
  appliedAt: null,
  channel: null,
  currentStatusId: IDS.saved,
  selectedResumeVersionId: null,
  selectedCoverLetterVersionId: null,
  notes: "Synthetic application fixture.",
  archivedAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
});

const createPipelineAggregate = async (database: DatabasePort): Promise<void> => {
  await createStatuses(database);
  await createTrackerRepositories(database).jobs.create({
    id: IDS.job,
    companyId: null,
    title: "Synthetic systems role",
    normalizedTitle: "systems role",
    descriptionText: "Synthetic role used only for transaction proof.",
    employmentType: "full_time",
    workplaceType: "remote",
    seniority: "mid",
    locationId: null,
    remoteRegion: { countries: ["US"] },
    datePosted: dateOnly("2026-08-25"),
    validThrough: null,
    currentStatusId: IDS.saved,
    nextActionAt: null,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await createPipelineRepositories(database).applications.create(newApplication());
};

export const createPipelineRepositoryContractSuite = (
  setup: PipelineRepositoryContractSetup,
): DatabaseContractSuite =>
  defineDatabaseContractSuite(PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.pipeline.suiteName, [
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.pipeline.cases.persistCustomStages,
      run: async (database) => {
        await setup.migrate(database);
        await createPipelineAggregate(database);
        const repositories = createPipelineRepositories(database);
        const storedStatus = await repositories.statusDefinitions.findById(IDS.saved);
        const storedApplication = await repositories.applications.findById(IDS.application);
        const queries = createPipelineQueryOperations({
          pipelineQueries: createPipelineQueryRepository(database),
        });
        const context = {
          operationId: entityId("application-operation", "0198e103-0000-7000-8000-000000000030"),
          initiatedAt: REOPENED_AT,
        };
        const counts = await queries.getPipelineCountsQuery.execute({}, context);
        const groups = await queries.getPipelineBoardGroupsQuery.execute({}, context);
        const page = await queries.listPipelineJobsQuery.execute({ limit: 1 }, context);
        const workspace = await queries.getJobWorkspaceQuery.execute({ jobId: IDS.job }, context);
        assertContract(
          counts.ok && counts.value.all === 1 && counts.value.needsAction === 0,
          "Concrete Pipeline counts did not read stored jobs.",
        );
        assertContract(
          groups.ok &&
            groups.value.length === 4 &&
            groups.value[0]?.statusId === null &&
            groups.value.find((group) => group.statusId === IDS.saved)?.jobCount === 1,
          "Concrete Board groups lost the stored or unassigned stage.",
        );
        assertContract(
          page.ok &&
            page.value.items[0]?.id === IDS.job &&
            !page.value.hasMore &&
            page.value.nextCursor === null,
          "Concrete Pipeline page did not preserve stored identity.",
        );
        assertContract(
          workspace.ok &&
            workspace.value.application?.id === IDS.application &&
            workspace.value.job.status?.id === IDS.saved &&
            workspace.value.timelineItemCount === 0,
          "Concrete workspace did not preserve application relationships.",
        );
        const stageInput = {
          id: entityId("status_definition", "0198e103-0000-7000-8000-000000000020"),
          name: "Explicit submitted stage",
          createdAt: CREATED_AT,
        };
        const stages = createAppliedStageRepository(database);
        const created = (await stages.create(stageInput)) as { id: string; created: boolean };
        const reused = (await stages.create({
          ...stageInput,
          id: entityId("status_definition", "0198e103-0000-7000-8000-000000000021"),
        })) as { id: string; created: boolean };
        assertContract(
          created.id === stageInput.id &&
            created.created &&
            reused.id === stageInput.id &&
            !reused.created,
          "Explicit Applied stage creation/reuse did not retain identity.",
        );
        await expectFailure(
          () => stages.create({ ...stageInput, name: "Synthetic review queue" }),
          (error) => error instanceof AppliedStageError && error.code === "conflict",
          "Applied stage creation reused an incompatible category.",
        );
        assertContract(
          JSON.stringify(await repositories.applications.findById(IDS.application)) ===
            JSON.stringify(storedApplication),
          "Stage creation changed application selections or submission state.",
        );
        const unchangedJob = await createTrackerRepositories(database).jobs.findById(IDS.job);
        assertContract(
          unchangedJob?.currentStatusId === IDS.saved &&
            (await database.query(sqlStatement("SELECT id FROM status_event"))).length === 0,
          "Stage creation changed job status or timeline.",
        );
        assertContract(
          storedStatus?.name === "Synthetic review queue" && !storedStatus.isSystem,
          "Custom status definition did not round-trip.",
        );
        assertContract(
          storedApplication?.currentStatusId === IDS.saved,
          "Application did not retain its initial status.",
        );

        await expectFailure(
          () => repositories.applications.create(newApplication(IDS.additionalApplication)),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "additional_application_requires_explicit_authorization",
          "An additional application was created without explicit authorization.",
        );
        await repositories.applications.create(newApplication(IDS.additionalApplication), {
          allowAdditionalAttempt: true,
        });
        assertContract(
          (await repositories.applications.findById(IDS.additionalApplication)) !== undefined,
          "Explicitly authorized additional application did not persist.",
        );
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.pipeline.cases.changeStatus,
      run: async (database) => {
        await setup.migrate(database);
        await createPipelineAggregate(database);
        const viewed = { jobRowVersion: 1, currentStatusId: IDS.saved, applicationRowVersion: 1 };
        for (const contextChange of [
          { expected: { ...viewed, jobRowVersion: 2 } },
          { expected: { ...viewed, currentStatusId: IDS.rejected } },
          { expected: { ...viewed, applicationRowVersion: 2 } },
          { applicationId: null, expected: { ...viewed, applicationRowVersion: null } },
        ]) {
          await expectFailure(
            () =>
              changePipelineStatus(database, {
                eventId: IDS.appliedEvent,
                undoTokenId: IDS.appliedUndo,
                jobId: IDS.job,
                applicationId: IDS.application,
                toStatusId: IDS.applied,
                occurredAt: APPLIED_AT,
                note: null,
                ...contextChange,
              }),
            (error) =>
              error instanceof PipelineRepositoryConflictError &&
              error.code === "pipeline_projection_conflict",
            "A stale or omitted viewed application context changed status.",
          );
        }
        assertContract(
          (await createTrackerRepositories(database).jobs.findById(IDS.job))?.rowVersion === 1 &&
            (await createPipelineRepositories(database).statusEvents.listForJob(IDS.job)).length ===
              0 &&
            (await database.query(sqlStatement("SELECT id FROM mutation_undo_token"))).length === 0,
          "Rejected viewed-state preconditions left a partial status/event/undo mutation.",
        );
        const strictInput = {
          eventId: IDS.appliedEvent,
          undoTokenId: IDS.appliedUndo,
          jobId: IDS.job,
          applicationId: IDS.application,
          toStatusId: IDS.applied,
          occurredAt: APPLIED_AT,
          note: null,
          expected: viewed,
        };
        await createPipelineRepositories(database).applications.create(
          newApplication(IDS.additionalApplication),
          { allowAdditionalAttempt: true },
        );
        await expectFailure(
          () => changePipelineStatus(database, strictInput),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "pipeline_projection_conflict",
          "An ambiguous active-application set was silently resolved.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE application SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
            [APPLIED_AT, APPLIED_AT, IDS.additionalApplication],
          ),
        );
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
            [APPLIED_AT, APPLIED_AT, IDS.job],
          ),
        );
        await expectFailure(
          () =>
            changePipelineStatus(database, {
              ...strictInput,
              expected: { ...viewed, jobRowVersion: 2 },
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "pipeline_projection_conflict",
          "An archived job accepted an interactive status mutation.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = NULL, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
            [APPLIED_AT, IDS.job],
          ),
        );
        await expectFailure(
          () =>
            changePipelineStatus(database, {
              ...strictInput,
              expected: { ...viewed, jobRowVersion: 3 },
              requireSubmissionSnapshot: true,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "submission_review_required",
          "An interactive Applied move bypassed the document-submission review.",
        );
        await changePipelineStatus(database, {
          eventId: IDS.appliedEvent,
          undoTokenId: IDS.appliedUndo,
          jobId: IDS.job,
          applicationId: IDS.application,
          toStatusId: IDS.applied,
          occurredAt: APPLIED_AT,
          note: "Synthetic submission.",
          expected: { ...viewed, jobRowVersion: 3 },
        });
        await changePipelineStatus(database, {
          eventId: IDS.rejectedEvent,
          undoTokenId: IDS.rejectedUndo,
          jobId: IDS.job,
          applicationId: IDS.application,
          toStatusId: IDS.rejected,
          occurredAt: REJECTED_AT,
          note: "Synthetic closed outcome.",
        });

        await expectFailure(
          () =>
            changePipelineStatus(database, {
              eventId: IDS.reopenedEvent,
              undoTokenId: IDS.reopenedUndo,
              jobId: IDS.job,
              applicationId: IDS.application,
              toStatusId: IDS.applied,
              occurredAt: REOPENED_AT,
              note: null,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "reopen_requires_explicit_confirmation",
          "A terminal status reopened without explicit confirmation.",
        );

        await expectFailure(
          () =>
            changePipelineStatus(database, {
              eventId: IDS.appliedEvent,
              undoTokenId: IDS.reopenedUndo,
              jobId: IDS.job,
              applicationId: IDS.application,
              toStatusId: IDS.applied,
              occurredAt: REOPENED_AT,
              note: "This duplicate event must roll back both projections.",
              allowReopen: true,
            }),
          () => true,
          "A duplicate timeline event unexpectedly committed.",
        );

        const repositories = createPipelineRepositories(database);
        const jobAfterRollback = await createTrackerRepositories(database).jobs.findById(IDS.job);
        const applicationAfterRollback = await repositories.applications.findById(IDS.application);
        const eventsAfterRollback = await repositories.statusEvents.listForJob(IDS.job);
        assertContract(
          jobAfterRollback?.currentStatusId === IDS.rejected &&
            applicationAfterRollback?.currentStatusId === IDS.rejected,
          "Failed timeline append did not roll back both status projections.",
        );
        assertContract(
          eventsAfterRollback.length === 2,
          "Failed status transaction mutated append-only history.",
        );

        await changePipelineStatus(database, {
          eventId: IDS.reopenedEvent,
          undoTokenId: IDS.reopenedUndo,
          jobId: IDS.job,
          applicationId: IDS.application,
          toStatusId: IDS.applied,
          occurredAt: REOPENED_AT,
          note: "Explicit synthetic reopen.",
          allowReopen: true,
        });
        const reopened = await repositories.applications.findById(IDS.application);
        assertContract(
          reopened?.currentStatusId === IDS.applied,
          "Explicit reopen did not persist.",
        );
        assertContract(
          (await repositories.statusEvents.listForJob(IDS.job)).length === 3,
          "Successful status history did not remain append-only.",
        );
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.pipeline.cases.persistScheduling,
      run: async (database) => {
        await setup.migrate(database, 158);
        assertContract(
          (await database.diagnostics()).schemaVersion === 158,
          "Task index upgrade fixture did not start at schema 158.",
        );
        await createPipelineAggregate(database);
        const repositories = createPipelineRepositories(database);
        await repositories.interactions.append({
          id: IDS.interaction,
          jobId: IDS.job,
          contactId: null,
          type: "email",
          occurredAt: APPLIED_AT,
          direction: "outbound",
          summary: "Synthetic follow-up note.",
          nextActionAt: ACTION_DUE_AT,
          createdAt: APPLIED_AT,
          updatedAt: APPLIED_AT,
        });
        await setNextAction(
          database,
          {
            id: IDS.nextAction,
            jobId: IDS.job,
            applicationId: IDS.application,
            interactionId: IDS.interaction,
            title: "Send a concise synthetic follow-up",
            dueAt: ACTION_DUE_AT,
            timeZone: EASTERN,
            state: "pending",
            completedAt: null,
            createdAt: APPLIED_AT,
            updatedAt: APPLIED_AT,
          },
          IDS.nextActionUndo,
        );
        await repositories.interviews.create({
          id: IDS.interview,
          applicationId: IDS.application,
          stageName: "Synthetic technical conversation",
          startsAt: INTERVIEW_AT,
          timeZone: EASTERN,
          durationMinutes: 60,
          locationOrUrl: "https://interview.example/synthetic-room",
          contactIds: [],
          preparationNotes: "Synthetic preparation notes.",
          outcome: null,
          createdAt: APPLIED_AT,
          updatedAt: APPLIED_AT,
        });
        await repositories.reminders.create({
          id: IDS.reminder,
          jobId: IDS.job,
          nextActionId: IDS.nextAction,
          interviewId: IDS.interview,
          remindAt: REMINDER_AT,
          timeZone: EASTERN,
          state: "pending",
          note: "Synthetic local reminder.",
          firedAt: null,
          createdAt: APPLIED_AT,
          updatedAt: APPLIED_AT,
        });

        const jobWithAction = await createTrackerRepositories(database).jobs.findById(IDS.job);
        const interaction = await repositories.interactions.findById(IDS.interaction);
        const action = await repositories.nextActions.findById(IDS.nextAction);
        const interview = await repositories.interviews.findById(IDS.interview);
        assertContract(
          jobWithAction?.nextActionAt === ACTION_DUE_AT && action?.state === "pending",
          "Next-action projection did not commit with its record.",
        );
        assertContract(interaction?.direction === "outbound", "Interaction did not persist.");
        assertContract(interview?.timeZone === EASTERN, "Interview time zone did not persist.");

        await repositories.reminders.markFired(IDS.reminder, REMINDER_AT);
        const reminder = await repositories.reminders.findById(IDS.reminder);
        assertContract(
          reminder?.state === "fired" && reminder.firedAt === REMINDER_AT,
          "Reminder firing did not persist atomically.",
        );

        if (jobWithAction === undefined || action === undefined)
          throw new DatabaseContractViolation("Completion fixture has no viewed task owner.");
        for (const [id, nextActionId, state] of [
          [IDS.completionReminder, IDS.nextAction, "pending"],
          [IDS.standaloneReminder, null, "pending"],
          [IDS.dismissedReminder, IDS.nextAction, "dismissed"],
        ] as const) {
          await repositories.reminders.create({
            id,
            jobId: IDS.job,
            nextActionId,
            interviewId: null,
            remindAt: REMINDER_AT,
            timeZone: EASTERN,
            state,
            note: "Synthetic terminal-task reminder preservation.",
            firedAt: null,
            createdAt: APPLIED_AT,
            updatedAt: APPLIED_AT,
          });
        }
        const retainedReminders = JSON.stringify({
          fired: reminder,
          standalone: await repositories.reminders.findById(IDS.standaloneReminder),
          dismissed: await repositories.reminders.findById(IDS.dismissedReminder),
        });
        const completionExpected = {
          jobId: IDS.job,
          jobRowVersion: jobWithAction.rowVersion,
          nextActionRowVersion: action.rowVersion,
        };
        const completionPort = createDatabaseNextActionCompletionPort(database);
        const completionState = async () =>
          JSON.stringify({
            jobs: await database.query(sqlStatement("SELECT * FROM job ORDER BY id")),
            actions: await database.query(sqlStatement("SELECT * FROM next_action ORDER BY id")),
            reminders: await database.query(sqlStatement("SELECT * FROM reminder ORDER BY id")),
            tokens: await database.query(
              sqlStatement("SELECT * FROM mutation_undo_token ORDER BY id"),
            ),
            applications: await database.query(
              sqlStatement("SELECT * FROM application ORDER BY id"),
            ),
            interactions: await database.query(
              sqlStatement("SELECT * FROM interaction ORDER BY id"),
            ),
            events: await database.query(sqlStatement("SELECT * FROM status_event ORDER BY id")),
          });
        for (const expected of [
          { ...completionExpected, jobRowVersion: jobWithAction.rowVersion + 1 },
          { ...completionExpected, nextActionRowVersion: action.rowVersion + 1 },
          { ...completionExpected, jobId: entityId("job", IDS.additionalApplication) },
        ]) {
          const before = await completionState();
          await expectFailure(
            () => completeNextAction(database, IDS.nextAction, REOPENED_AT, expected),
            (error) =>
              error instanceof PipelineRepositoryConflictError &&
              error.code === "pipeline_projection_conflict",
            "Completion accepted stale or wrong-owner viewed context.",
          );
          await expectFailure(
            () =>
              completionPort.complete({
                jobId: expected.jobId,
                nextActionId: IDS.nextAction,
                expected: {
                  jobRowVersion: expected.jobRowVersion,
                  nextActionRowVersion: expected.nextActionRowVersion,
                },
                completedAt: REOPENED_AT,
              }),
            (error) => error instanceof NextActionCompletionError && error.code === "conflict",
            "Concrete completion port lost captured ownership or failure vocabulary.",
          );
          assertContract(
            (await completionState()) === before,
            "Rejected task completion left partial job/action/reminder/undo writes.",
          );
        }
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
            [REOPENED_AT, REOPENED_AT, IDS.job],
          ),
        );
        const beforeArchivedCompletion = await completionState();
        await expectFailure(
          () =>
            completeNextAction(database, IDS.nextAction, REOPENED_AT, {
              ...completionExpected,
              jobRowVersion: jobWithAction.rowVersion + 1,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "pipeline_projection_conflict",
          "Completion accepted a current-version archived owner.",
        );
        assertContract(
          (await completionState()) === beforeArchivedCompletion,
          "Archived task completion left partial writes.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = NULL, row_version = row_version + 1 WHERE id = ?",
            [IDS.job],
          ),
        );
        const beforeInterruptedCompletion = await completionState();
        const interruption = new Error("Synthetic final job-projection interruption.");
        const interruptedDatabase: DatabasePort = {
          query: <Row extends QueryRow>(statement: SqlStatement) => database.query<Row>(statement),
          execute: (statement) => database.execute(statement),
          diagnostics: () => database.diagnostics(),
          exportPortable: () => database.exportPortable(),
          transaction: (work) =>
            database.transaction((session) =>
              work({
                query: <Row extends QueryRow>(statement: SqlStatement) =>
                  session.query<Row>(statement),
                execute: (statement) => {
                  if (statement.sql.startsWith("UPDATE job")) throw interruption;
                  return session.execute(statement);
                },
              }),
            ),
        };
        await expectFailure(
          () =>
            completeNextAction(interruptedDatabase, IDS.nextAction, REOPENED_AT, {
              ...completionExpected,
              jobRowVersion: jobWithAction.rowVersion + 2,
            }),
          (error) => error === interruption,
          "Completion did not reach the injected final projection failure.",
        );
        assertContract(
          (await completionState()) === beforeInterruptedCompletion,
          "Interrupted completion left task/reminder/job partial writes.",
        );
        const completion = await createCompleteNextActionCommand(completionPort).execute(
          {
            jobId: IDS.job,
            nextActionId: IDS.nextAction,
            expected: {
              jobRowVersion: jobWithAction.rowVersion + 2,
              nextActionRowVersion: action.rowVersion,
            },
          },
          {
            operationId: entityId("application-operation", IDS.nextActionUndo),
            initiatedAt: REOPENED_AT,
          },
        );
        assertContract(
          completion.ok &&
            completion.value.completedAt === REOPENED_AT &&
            completion.value.jobRowVersion === jobWithAction.rowVersion + 3 &&
            completion.value.nextActionRowVersion === action.rowVersion + 1,
          "Completion command/port did not acknowledge the exact durable version transition.",
        );
        const completed = await repositories.nextActions.findById(IDS.nextAction);
        const dismissedPending = await repositories.reminders.findById(IDS.completionReminder);
        assertContract(
          dismissedPending?.state === "dismissed" &&
            dismissedPending.firedAt === null &&
            dismissedPending.rowVersion === 2 &&
            dismissedPending.updatedAt === REOPENED_AT,
          "Completion left a linked reminder pending or lost its dismissal audit.",
        );
        assertContract(
          JSON.stringify({
            fired: await repositories.reminders.findById(IDS.reminder),
            standalone: await repositories.reminders.findById(IDS.standaloneReminder),
            dismissed: await repositories.reminders.findById(IDS.dismissedReminder),
          }) === retainedReminders,
          "Completion rewrote fired, dismissed or unrelated reminder history.",
        );
        const jobAfterCompletion = await createTrackerRepositories(database).jobs.findById(IDS.job);
        assertContract(
          completed?.state === "completed" && jobAfterCompletion?.nextActionAt === null,
          "Completing the action did not refresh the job projection.",
        );
        const beforeReplay = await completionState();
        await expectFailure(
          () =>
            completeNextAction(database, IDS.nextAction, REOPENED_AT, {
              ...completionExpected,
              jobRowVersion: jobAfterCompletion?.rowVersion ?? 1,
              nextActionRowVersion: completed?.rowVersion ?? 1,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "next_action_not_pending",
          "Completion replay was accepted.",
        );
        assertContract(
          (await completionState()) === beforeReplay,
          "Completion replay left partial writes.",
        );
        for (const [id, dueAt, zone] of [
          [IDS.replacementAction, ACTION_DUE_AT, EASTERN],
          [IDS.staleAction, null, null],
        ] as const) {
          await setNextAction(
            database,
            {
              id,
              jobId: IDS.job,
              applicationId: null,
              interactionId: null,
              title: `Literal é中🙂 <task> ${id}`,
              dueAt,
              timeZone: zone,
              state: "pending",
              completedAt: null,
              createdAt: REOPENED_AT,
              updatedAt: REOPENED_AT,
            },
            id === IDS.replacementAction ? IDS.replacementActionUndo : IDS.staleActionUndo,
          );
        }
        if (jobAfterCompletion === undefined)
          throw new DatabaseContractViolation("Missing task query fixture owner.");
        const otherTaskJobId = entityId("job", IDS.additionalApplication);
        await createTrackerRepositories(database).jobs.create({
          ...jobAfterCompletion,
          id: otherTaskJobId,
          title: "Other synthetic task owner",
          nextActionAt: null,
          currentStatusId: IDS.saved,
        });
        await repositories.applications.create({
          ...newApplication(IDS.additionalApplication),
          jobId: otherTaskJobId,
        });
        await setNextAction(
          database,
          {
            id: entityId("next-action", IDS.interview),
            jobId: otherTaskJobId,
            applicationId: null,
            interactionId: null,
            title: "OTHER_JOB_TASK_DO_NOT_LEAK",
            dueAt: null,
            timeZone: null,
            state: "pending",
            completedAt: null,
            createdAt: REOPENED_AT,
            updatedAt: REOPENED_AT,
          },
          entityId("mutation-undo-token", IDS.interview),
        );
        const beforeIndexUpgrade = await completionState();
        const ledgerBeforeIndex = await database.query(
          sqlStatement(
            "SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version",
          ),
        );
        await setup.migrate(database, 159);
        assertContract(
          (await completionState()) === beforeIndexUpgrade,
          "Task list index migration changed retained data/history.",
        );
        const taskIndex = await database.query(
          sqlStatement("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?", [
            "next_action_job_created_idx",
          ]),
        );
        assertContract(taskIndex.length === 1, "Task-list query index is missing after upgrade.");
        assertContract(
          (await database.diagnostics()).schemaVersion === 159,
          "Task index upgrade did not advance to schema 159.",
        );
        const ledgerAfterIndex = await database.query(
          sqlStatement(
            "SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version",
          ),
        );
        assertContract(
          ledgerAfterIndex.length === 159 &&
            JSON.stringify(ledgerAfterIndex.slice(0, 158)) === JSON.stringify(ledgerBeforeIndex),
          "Task index upgrade rewrote prior migration identities/checksums.",
        );
        const beforeReminderIndex = await completionState();
        await setup.migrate(database, 160);
        assertContract(
          (await completionState()) === beforeReminderIndex,
          "Reminder index upgrade rewrote retained data/history.",
        );
        const reminderIndex = await database.query(
          sqlStatement("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?", [
            "reminder_next_action_job_state_idx",
          ]),
        );
        assertContract(
          reminderIndex.length === 1,
          "Terminal reminder lookup index is missing after upgrade.",
        );
        assertContract(
          (await database.diagnostics()).schemaVersion === 160,
          "Reminder index upgrade did not advance to schema 160.",
        );
        const reminderLedger = await database.query(
          sqlStatement(
            "SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version",
          ),
        );
        assertContract(
          reminderLedger.length === 160 &&
            JSON.stringify(reminderLedger.slice(0, 159)) === JSON.stringify(ledgerAfterIndex),
          "Reminder index upgrade changed prior migration identities/checksums.",
        );
        const reminderPlanKinds = new Set<"guard" | "pending">();
        const observedResolutionStates = new Set<"completed" | "dismissed">();
        const observedResolutionDatabase: DatabasePort = {
          query: <Row extends QueryRow>(statement: SqlStatement) => database.query<Row>(statement),
          execute: (statement) => database.execute(statement),
          diagnostics: () => database.diagnostics(),
          exportPortable: () => database.exportPortable(),
          transaction: (work) =>
            database.transaction((session) => {
              const assertReminderPlan = async (
                statement: SqlStatement,
                kind: "guard" | "pending",
              ) => {
                const plan = await session.query(
                  sqlStatement(`EXPLAIN QUERY PLAN ${statement.sql}`, statement.parameters),
                );
                const details = plan.map((row) => String(row["detail"]));
                assertContract(
                  details.some(
                    (detail) =>
                      detail.includes("SEARCH reminder") &&
                      detail.includes("reminder_next_action_job_state_idx"),
                  ) && details.every((detail) => !detail.includes("SCAN reminder")),
                  "Terminal reminder lookup scans instead of searching its task/owner/state index.",
                );
                if (kind === "pending")
                  assertContract(
                    details.some((detail) =>
                      detail.includes("next_action_id=? AND job_id=? AND state=?"),
                    ),
                    "Pending reminder predicate did not seek task, owner and state.",
                  );
                reminderPlanKinds.add(kind);
              };
              return work({
                query: async <Row extends QueryRow>(statement: SqlStatement) => {
                  if (statement.sql.includes("FROM reminder WHERE next_action_id"))
                    await assertReminderPlan(statement, "guard");
                  return session.query<Row>(statement);
                },
                execute: async (statement) => {
                  if (statement.sql.startsWith("UPDATE next_action")) {
                    const state = statement.parameters[0];
                    if (state === "completed" || state === "dismissed")
                      observedResolutionStates.add(state);
                  }
                  if (statement.sql.startsWith("UPDATE reminder")) {
                    const where = statement.sql.indexOf("WHERE ");
                    assertContract(
                      where >= 0 && statement.parameters.length === 3,
                      "Reminder write changed its reviewed audit/predicate parameter layout.",
                    );
                    // Explain its exact selection predicate with a SELECT: native query confinement
                    // remains read-only, and the original UPDATE still executes exactly once below.
                    await assertReminderPlan(
                      sqlStatement(
                        `SELECT id FROM reminder ${statement.sql.slice(where)}`,
                        statement.parameters.slice(1),
                      ),
                      "pending",
                    );
                  }
                  return session.execute(statement);
                },
              });
            }),
        };
        const taskPlanKinds = new Set<"initial" | "cursor">();
        const observedTaskDatabase: DatabasePort = {
          query: <Row extends QueryRow>(statement: SqlStatement) => database.query<Row>(statement),
          execute: (statement) => database.execute(statement),
          diagnostics: () => database.diagnostics(),
          exportPortable: () => database.exportPortable(),
          transaction: (work) =>
            database.transaction((session) =>
              work({
                execute: (statement) => session.execute(statement),
                query: async <Row extends QueryRow>(statement: SqlStatement) => {
                  if (statement.sql.includes("FROM next_action n LEFT JOIN")) {
                    const plan = await session.query(
                      sqlStatement(`EXPLAIN QUERY PLAN ${statement.sql}`, statement.parameters),
                    );
                    const details = plan.map((row) => String(row["detail"]));
                    assertContract(
                      details.some((detail) =>
                        detail.includes("SEARCH n USING INDEX next_action_job_created_idx"),
                      ) &&
                        details.every(
                          (detail) => !detail.includes("SCAN n") && !detail.includes("TEMP B-TREE"),
                        ),
                      "Actual task-list query scans or sorts instead of using its job/creation index.",
                    );
                    if (statement.sql.includes("n.created_at <=")) {
                      assertContract(
                        details.some((detail) => detail.includes("created_at<?")),
                        "Task cursor did not seek its creation-time range.",
                      );
                      taskPlanKinds.add("cursor");
                    } else taskPlanKinds.add("initial");
                  }
                  return session.query<Row>(statement);
                },
              }),
            ),
        };
        const taskPort = createJobNextActionsRepository(observedTaskDatabase);
        const taskQuery = createJobNextActionsQuery(taskPort);
        const queryContext = {
          operationId: entityId("application-operation", IDS.nextActionUndo),
          initiatedAt: REOPENED_AT,
        };
        const beforeTaskReads = await completionState();
        const firstTasks = await taskQuery.execute({ jobId: IDS.job, limit: 1 }, queryContext);
        assertContract(
          firstTasks.ok &&
            firstTasks.value.items[0]?.id === IDS.replacementAction &&
            firstTasks.value.hasMore,
          "Task query did not bound or deterministically order the first pending record.",
        );
        if (!firstTasks.ok || firstTasks.value.nextCursor === null)
          throw new DatabaseContractViolation("Missing task-page cursor.");
        const firstTaskCursor = firstTasks.value.nextCursor;
        const otherTasks = await taskQuery.execute({ jobId: otherTaskJobId }, queryContext);
        assertContract(
          otherTasks.ok &&
            otherTasks.value.items.length === 1 &&
            otherTasks.value.items[0]?.title === "OTHER_JOB_TASK_DO_NOT_LEAK",
          "Job task scope mixed records belonging to different jobs.",
        );
        const crossJobCursor = await taskQuery.execute(
          { jobId: otherTaskJobId, after: firstTaskCursor },
          queryContext,
        );
        assertContract(
          !crossJobCursor.ok && crossJobCursor.error.code === "validation",
          "A task cursor was reused for another job.",
        );
        const secondTasks = await taskQuery.execute(
          { jobId: IDS.job, limit: 1, after: firstTaskCursor },
          queryContext,
        );
        assertContract(
          secondTasks.ok &&
            secondTasks.value.items[0]?.id === IDS.staleAction &&
            secondTasks.value.items[0].dueAt === null &&
            secondTasks.value.items[0].timeZone === null &&
            secondTasks.value.hasMore,
          "Task query lost the tied unscheduled record or its null schedule pair.",
        );
        if (!secondTasks.ok || secondTasks.value.nextCursor === null)
          throw new DatabaseContractViolation("Missing second task-page cursor.");
        const finalTasks = await taskQuery.execute(
          { jobId: IDS.job, limit: 1, after: secondTasks.value.nextCursor },
          queryContext,
        );
        assertContract(
          finalTasks.ok &&
            finalTasks.value.items[0]?.id === IDS.nextAction &&
            finalTasks.value.items[0].state === "completed" &&
            finalTasks.value.items[0].completedAt === REOPENED_AT &&
            !finalTasks.value.hasMore &&
            finalTasks.value.nextCursor === null,
          "Task query hid completed history, lost its completion instant or invented another page.",
        );
        await expectFailure(
          () =>
            taskPort.listPage({
              jobId: IDS.job,
              includeArchived: false,
              limit: 1,
              after: { ...firstTaskCursor, id: entityId("next-action", IDS.interview) },
            }),
          (error) => error instanceof JobNextActionsError && error.code === "cursor_invalidated",
          "Task query accepted a forged missing anchor.",
        );
        await expectFailure(
          () =>
            taskPort.listPage({
              jobId: IDS.job,
              includeArchived: false,
              limit: 1,
              after: { ...firstTaskCursor, rowVersion: firstTaskCursor.rowVersion + 1 },
            }),
          (error) => error instanceof JobNextActionsError && error.code === "cursor_invalidated",
          "Task query ignored the captured anchor row version.",
        );
        assertContract(
          (await completionState()) === beforeTaskReads,
          "Task page reads changed durable state.",
        );
        assertContract(
          taskPlanKinds.has("initial") && taskPlanKinds.has("cursor"),
          "Task list did not prove both initial and cursor range plans.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE next_action SET application_id = ?, row_version = row_version + 1 WHERE id = ?",
            [IDS.additionalApplication, IDS.nextAction],
          ),
        );
        const beforeInvalidTaskRead = await completionState();
        const invalidTaskPage = await taskQuery.execute({ jobId: IDS.job }, queryContext);
        assertContract(
          !invalidTaskPage.ok && invalidTaskPage.error.code === "internal",
          "Task read accepted an application belonging to another job.",
        );
        assertContract(
          (await completionState()) === beforeInvalidTaskRead,
          "Invalid task linkage read changed stored data.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE next_action SET application_id = ?, row_version = row_version + 1 WHERE id = ?",
            [IDS.application, IDS.nextAction],
          ),
        );
        const viewedTask = firstTasks.value.items[0];
        if (viewedTask === undefined)
          throw new DatabaseContractViolation("Missing viewed completion task.");
        await repositories.reminders.create({
          id: IDS.foreignReminder,
          jobId: otherTaskJobId,
          nextActionId: viewedTask.id,
          interviewId: null,
          remindAt: REMINDER_AT,
          timeZone: EASTERN,
          state: "pending",
          note: "Synthetic deliberately corrupt cross-job reminder.",
          firedAt: null,
          createdAt: REOPENED_AT,
          updatedAt: REOPENED_AT,
        });
        const beforeForeignReminderCompletion = await completionState();
        await expectFailure(
          () =>
            completeNextAction(observedResolutionDatabase, viewedTask.id, REOPENED_AT, {
              jobId: IDS.job,
              jobRowVersion: firstTasks.value.jobRowVersion,
              nextActionRowVersion: viewedTask.rowVersion,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "pipeline_projection_conflict",
          "Completion accepted a reminder linked to a different job.",
        );
        assertContract(
          (await completionState()) === beforeForeignReminderCompletion,
          "Foreign-linked reminder rejection changed task/reminder/job/history state.",
        );
        // Repair only this deliberately corrupted synthetic fixture; product code must not reassign it.
        await database.execute(
          sqlStatement(
            "UPDATE reminder SET job_id = ?, row_version = row_version + 1 WHERE id = ? AND job_id = ?",
            [IDS.job, IDS.foreignReminder, otherTaskJobId],
          ),
        );
        await completeNextAction(observedResolutionDatabase, viewedTask.id, REOPENED_AT, {
          jobId: IDS.job,
          jobRowVersion: firstTasks.value.jobRowVersion,
          nextActionRowVersion: viewedTask.rowVersion,
        });
        const repairedReminder = await repositories.reminders.findById(IDS.foreignReminder);
        assertContract(
          repairedReminder?.state === "dismissed" &&
            repairedReminder.rowVersion === 3 &&
            repairedReminder.updatedAt === REOPENED_AT &&
            repairedReminder.firedAt === null,
          "Owned reminder was not dismissed after the explicit synthetic ownership repair.",
        );
        const beforeStaleTaskRead = await completionState();
        const changedTasks = await taskQuery.execute(
          { jobId: IDS.job, limit: 1, after: firstTaskCursor },
          queryContext,
        );
        assertContract(
          !changedTasks.ok && changedTasks.error.code === "conflict",
          "Task pagination silently rebased after a real canonical completion.",
        );
        assertContract(
          (await completionState()) === beforeStaleTaskRead,
          "Stale task page rejection wrote data.",
        );
        const dismissedTaskId = entityId("next-action", IDS.replacementReminder);
        const dismissedTaskUndoId = entityId("mutation-undo-token", IDS.replacementReminder);
        await setNextAction(
          database,
          {
            id: dismissedTaskId,
            jobId: IDS.job,
            applicationId: null,
            interactionId: null,
            title: "Retained dismissed task",
            dueAt: null,
            timeZone: null,
            state: "pending",
            completedAt: null,
            createdAt: REOPENED_AT,
            updatedAt: REOPENED_AT,
          },
          dismissedTaskUndoId,
        );
        await consumeMutationUndoToken(database, {
          id: dismissedTaskUndoId,
          consumedAt: REOPENED_AT,
        });
        for (const [id, dueAt] of [
          [IDS.dismissalAction, ACTION_DUE_AT],
          [IDS.laterAction, INTERVIEW_AT],
        ] as const) {
          await setNextAction(
            database,
            {
              id,
              jobId: IDS.job,
              applicationId: null,
              interactionId: null,
              title: "Synthetic deliberate dismissal and remaining due projection",
              dueAt,
              timeZone: EASTERN,
              state: "pending",
              completedAt: null,
              createdAt: REOPENED_AT,
              updatedAt: REOPENED_AT,
            },
            entityId("mutation-undo-token", id),
          );
        }
        for (const [id, state] of [
          [IDS.dismissalReminder, "pending"],
          [IDS.firedDismissalReminder, "fired"],
        ] as const) {
          await repositories.reminders.create({
            id,
            jobId: IDS.job,
            nextActionId: IDS.dismissalAction,
            interviewId: null,
            remindAt: REMINDER_AT,
            timeZone: EASTERN,
            state,
            note: "Synthetic dismissal reminder",
            firedAt: state === "fired" ? REMINDER_AT : null,
            createdAt: REOPENED_AT,
            updatedAt: REOPENED_AT,
          });
        }
        const dismissalOwner = await createTrackerRepositories(database).jobs.findById(IDS.job);
        if (dismissalOwner?.nextActionAt !== ACTION_DUE_AT)
          throw new DatabaseContractViolation("Dismissal fixture has no earliest scheduled owner.");
        const dismissalExpected = {
          jobId: IDS.job,
          jobRowVersion: dismissalOwner.rowVersion,
          nextActionRowVersion: 1,
        };
        const dismissalPort = createDatabaseNextActionDismissalPort(observedResolutionDatabase);
        const beforeMissingDismissal = await completionState();
        await expectFailure(
          () =>
            Promise.resolve(
              Reflect.apply(dismissNextAction, undefined, [
                database,
                IDS.dismissalAction,
                FINAL_UNDO_AT,
              ]),
            ),
          (error) => error instanceof TypeError,
          "Dismissal accepted missing viewed expectations.",
        );
        assertContract(
          (await completionState()) === beforeMissingDismissal,
          "Missing dismissal expectations wrote data.",
        );
        for (const expected of [
          { ...dismissalExpected, jobRowVersion: dismissalExpected.jobRowVersion + 1 },
          { ...dismissalExpected, nextActionRowVersion: 2 },
          { ...dismissalExpected, jobId: otherTaskJobId },
        ]) {
          const before = await completionState();
          await expectFailure(
            () =>
              dismissalPort.dismiss({
                jobId: expected.jobId,
                nextActionId: IDS.dismissalAction,
                expected: {
                  jobRowVersion: expected.jobRowVersion,
                  nextActionRowVersion: expected.nextActionRowVersion,
                },
                dismissedAt: FINAL_UNDO_AT,
              }),
            (error) => error instanceof NextActionDismissalError && error.code === "conflict",
            "Dismissal port lost viewed ownership/version guards.",
          );
          assertContract(
            (await completionState()) === before,
            "Rejected dismissal left partial writes.",
          );
        }
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = ?, row_version = row_version + 1 WHERE id = ?",
            [FINAL_UNDO_AT, IDS.job],
          ),
        );
        const beforeArchivedDismissal = await completionState();
        await expectFailure(
          () =>
            dismissNextAction(database, IDS.dismissalAction, FINAL_UNDO_AT, {
              ...dismissalExpected,
              jobRowVersion: dismissalExpected.jobRowVersion + 1,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "pipeline_projection_conflict",
          "Dismissal accepted a current archived job.",
        );
        assertContract(
          (await completionState()) === beforeArchivedDismissal,
          "Archived dismissal wrote data.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = NULL, row_version = row_version + 1 WHERE id = ?",
            [IDS.job],
          ),
        );
        const currentDismissalExpected = {
          ...dismissalExpected,
          jobRowVersion: dismissalExpected.jobRowVersion + 2,
        };
        await repositories.reminders.create({
          id: IDS.foreignDismissalReminder,
          jobId: otherTaskJobId,
          nextActionId: IDS.dismissalAction,
          interviewId: null,
          remindAt: REMINDER_AT,
          timeZone: EASTERN,
          state: "pending",
          note: "Synthetic corrupt dismissal owner",
          firedAt: null,
          createdAt: REOPENED_AT,
          updatedAt: REOPENED_AT,
        });
        const beforeForeignDismissal = await completionState();
        await expectFailure(
          () =>
            dismissNextAction(
              database,
              IDS.dismissalAction,
              FINAL_UNDO_AT,
              currentDismissalExpected,
            ),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "pipeline_projection_conflict",
          "Dismissal accepted a foreign linked reminder.",
        );
        assertContract(
          (await completionState()) === beforeForeignDismissal,
          "Foreign dismissal changed either job's records.",
        );
        // Explicit synthetic fixture repair only; never a product data-reassignment path.
        await database.execute(
          sqlStatement(
            "UPDATE reminder SET job_id = ?, row_version = row_version + 1 WHERE id = ?",
            [IDS.job, IDS.foreignDismissalReminder],
          ),
        );
        const beforeInterruptedDismissal = await completionState();
        await expectFailure(
          () =>
            dismissNextAction(
              interruptedDatabase,
              IDS.dismissalAction,
              FINAL_UNDO_AT,
              currentDismissalExpected,
            ),
          (error) => error === interruption,
          "Dismissal did not reach the injected late projection failure.",
        );
        assertContract(
          (await completionState()) === beforeInterruptedDismissal,
          "Interrupted dismissal left partial task/reminder/job writes.",
        );
        const preservedDismissalFacts = JSON.stringify({
          fired: await repositories.reminders.findById(IDS.firedDismissalReminder),
          unrelated: await repositories.reminders.findById(IDS.standaloneReminder),
          tokens: await database.query(
            sqlStatement("SELECT * FROM mutation_undo_token ORDER BY id"),
          ),
          applications: await database.query(sqlStatement("SELECT * FROM application ORDER BY id")),
          events: await database.query(sqlStatement("SELECT * FROM status_event ORDER BY id")),
          otherJob: await createTrackerRepositories(database).jobs.findById(otherTaskJobId),
        });
        const beforeDismissalPage = await taskQuery.execute(
          { jobId: IDS.job, limit: 1 },
          queryContext,
        );
        if (!beforeDismissalPage.ok || beforeDismissalPage.value.nextCursor === null)
          throw new DatabaseContractViolation("Dismissal cursor fixture is missing.");
        const dismissal = await createDismissNextActionCommand(dismissalPort).execute(
          {
            jobId: IDS.job,
            nextActionId: IDS.dismissalAction,
            expected: {
              jobRowVersion: currentDismissalExpected.jobRowVersion,
              nextActionRowVersion: 1,
            },
          },
          {
            operationId: entityId("application-operation", IDS.dismissalAction),
            initiatedAt: FINAL_UNDO_AT,
          },
        );
        assertContract(
          dismissal.ok &&
            dismissal.value.dismissedAt === FINAL_UNDO_AT &&
            dismissal.value.jobRowVersion === currentDismissalExpected.jobRowVersion + 1 &&
            dismissal.value.nextActionRowVersion === 2,
          "Dismissal command/port acknowledgement lost terminal state, time or versions.",
        );
        const dismissedAction = await repositories.nextActions.findById(IDS.dismissalAction);
        const afterDismissalOwner = await createTrackerRepositories(database).jobs.findById(
          IDS.job,
        );
        const dismissedLinkedReminder = await repositories.reminders.findById(
          IDS.dismissalReminder,
        );
        assertContract(
          dismissedAction?.state === "dismissed" &&
            dismissedAction.completedAt === null &&
            dismissedAction.updatedAt === FINAL_UNDO_AT &&
            afterDismissalOwner?.nextActionAt === INTERVIEW_AT &&
            dismissedLinkedReminder?.state === "dismissed" &&
            dismissedLinkedReminder.rowVersion === 2,
          "Dismissal lost retained task/reminder facts or the remaining earliest due projection.",
        );
        assertContract(
          JSON.stringify({
            fired: await repositories.reminders.findById(IDS.firedDismissalReminder),
            unrelated: await repositories.reminders.findById(IDS.standaloneReminder),
            tokens: await database.query(
              sqlStatement("SELECT * FROM mutation_undo_token ORDER BY id"),
            ),
            applications: await database.query(
              sqlStatement("SELECT * FROM application ORDER BY id"),
            ),
            events: await database.query(sqlStatement("SELECT * FROM status_event ORDER BY id")),
            otherJob: await createTrackerRepositories(database).jobs.findById(otherTaskJobId),
          }) === preservedDismissalFacts,
          "Dismissal rewrote fired/unrelated/audit/other-job history or consumed undo.",
        );
        const beforeDismissalReplay = await completionState();
        await expectFailure(
          () =>
            dismissalPort.dismiss({
              jobId: IDS.job,
              nextActionId: IDS.dismissalAction,
              expected: {
                jobRowVersion: currentDismissalExpected.jobRowVersion + 1,
                nextActionRowVersion: 2,
              },
              dismissedAt: FINAL_UNDO_AT,
            }),
          (error) => error instanceof NextActionDismissalError && error.code === "conflict",
          "Dismissal replay was accepted with fresh versions.",
        );
        assertContract(
          (await completionState()) === beforeDismissalReplay,
          "Dismissal replay wrote data.",
        );
        const invalidDismissalCursor = await taskQuery.execute(
          { jobId: IDS.job, after: beforeDismissalPage.value.nextCursor },
          queryContext,
        );
        assertContract(
          !invalidDismissalCursor.ok && invalidDismissalCursor.error.code === "conflict",
          "Dismissal did not invalidate an old task page.",
        );
        assertContract(
          reminderPlanKinds.has("guard") &&
            reminderPlanKinds.has("pending") &&
            observedResolutionStates.has("completed") &&
            observedResolutionStates.has("dismissed"),
          "Both terminal actions did not exercise indexed reminder ownership/update predicates.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
            [FINAL_UNDO_AT, FINAL_UNDO_AT, IDS.job],
          ),
        );
        const hiddenTasks = await taskQuery.execute({ jobId: IDS.job }, queryContext);
        const archivedTasks = await taskQuery.execute(
          { jobId: IDS.job, includeArchived: true },
          queryContext,
        );
        assertContract(
          !hiddenTasks.ok &&
            hiddenTasks.error.code === "not_found" &&
            archivedTasks.ok &&
            archivedTasks.value.items.length === 6 &&
            archivedTasks.value.items.some(
              (item) =>
                item.id === dismissedTaskId &&
                item.state === "dismissed" &&
                item.completedAt === null,
            ),
          "Task query ignored explicit archived read scope or lost retained records.",
        );
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.pipeline.cases.undoStatusChange,
      run: async (database) => {
        await setup.migrate(database);
        await createPipelineAggregate(database);
        const repositories = createPipelineRepositories(database);

        const reversible = await changePipelineStatus(database, {
          eventId: IDS.appliedEvent,
          undoTokenId: IDS.appliedUndo,
          jobId: IDS.job,
          applicationId: IDS.application,
          toStatusId: IDS.applied,
          occurredAt: APPLIED_AT,
          note: "Synthetic reversible submission.",
        });
        assertContract(
          reversible.undoToken.kind === "status_change" &&
            reversible.undoToken.consumedAt === null &&
            reversible.undoToken.statusEventId === IDS.appliedEvent,
          "Status edit did not return its fresh durable undo token.",
        );

        const consumed = await createDatabaseMutationUndoPort(database).consume({
          id: IDS.appliedUndo,
          consumedAt: REJECTED_AT,
        });
        const restoredJob = await createTrackerRepositories(database).jobs.findById(IDS.job);
        const restoredApplication = await repositories.applications.findById(IDS.application);
        const retainedEvents = await repositories.statusEvents.listForJob(IDS.job);
        assertContract(
          consumed.consumedAt === REJECTED_AT && consumed.rowVersion === 2,
          "Status undo token did not complete its single consume transition.",
        );
        await expectFailure(
          () =>
            createDatabaseMutationUndoPort(database).consume({
              id: IDS.appliedUndo,
              consumedAt: REOPENED_AT,
            }),
          (error) => error instanceof MutationUndoError && error.code === "already_consumed",
          "Undo composition did not retain its stable replay error.",
        );
        assertContract(
          restoredJob?.currentStatusId === IDS.saved &&
            restoredApplication?.currentStatusId === IDS.saved,
          "Status undo did not restore both projections.",
        );
        assertContract(
          retainedEvents.length === 1 && retainedEvents[0]?.id === IDS.appliedEvent,
          "Status undo rewrote append-only history.",
        );
        await expectFailure(
          () =>
            consumeMutationUndoToken(database, {
              id: IDS.appliedUndo,
              consumedAt: REOPENED_AT,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "undo_token_already_consumed",
          "A consumed status undo token was replayed.",
        );

        await changePipelineStatus(database, {
          eventId: IDS.rejectedEvent,
          undoTokenId: IDS.rejectedUndo,
          jobId: IDS.job,
          applicationId: IDS.application,
          toStatusId: IDS.applied,
          occurredAt: REOPENED_AT,
          note: null,
        });
        await changePipelineStatus(database, {
          eventId: IDS.reopenedEvent,
          undoTokenId: IDS.reopenedUndo,
          jobId: IDS.job,
          applicationId: IDS.application,
          toStatusId: IDS.rejected,
          occurredAt: FINAL_UNDO_AT,
          note: null,
        });
        await expectFailure(
          () =>
            consumeMutationUndoToken(database, {
              id: IDS.rejectedUndo,
              consumedAt: FINAL_UNDO_AT,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "undo_target_changed",
          "A stale status undo token overwrote a later edit.",
        );
        const staleToken = await repositories.undoTokens.findById(IDS.rejectedUndo);
        const finalApplication = await repositories.applications.findById(IDS.application);
        assertContract(
          staleToken?.consumedAt === null && finalApplication?.currentStatusId === IDS.rejected,
          "Rejected stale status undo did not roll back atomically.",
        );

        await expectFailure(
          () =>
            database.execute(
              sqlStatement("DELETE FROM mutation_undo_token WHERE id = ?", [IDS.appliedUndo]),
            ),
          () => true,
          "A durable undo audit record was deleted.",
        );
        // Exercise the concrete history projection in every shared SQLite adapter.
        await repositories.interactions.append({
          id: IDS.interaction,
          jobId: IDS.job,
          contactId: null,
          type: "note.local",
          occurredAt: APPLIED_AT,
          direction: "unknown",
          summary: "Synthetic history text <script> remains inert data.",
          nextActionAt: null,
          createdAt: APPLIED_AT,
          updatedAt: APPLIED_AT,
        });
        const timelinePort = createJobTimelineRepository(database);
        const timeline = createJobTimelineQuery(timelinePort);
        const historyContext = {
          operationId: entityId("application-operation", IDS.interaction),
          initiatedAt: REOPENED_AT,
        };
        const first = await timeline.execute({ jobId: IDS.job, limit: 1 }, historyContext);
        assertContract(
          first.ok && first.value.items[0]?.id === IDS.rejectedEvent && first.value.hasMore,
          "Timeline did not bound the snapshot or order the newest event first.",
        );
        if (!first.ok || first.value.nextCursor === null)
          throw new DatabaseContractViolation("Missing history cursor.");
        const second = await timeline.execute(
          { jobId: IDS.job, limit: 1, after: first.value.nextCursor },
          { ...historyContext, initiatedAt: FINAL_UNDO_AT },
        );
        assertContract(
          second.ok &&
            second.value.asOf === REOPENED_AT &&
            second.value.items[0]?.kind === "interaction" &&
            second.value.hasMore,
          "Timeline pagination lost its snapshot ceiling or deterministic mixed-kind tie.",
        );
        if (!second.ok || second.value.nextCursor === null)
          throw new DatabaseContractViolation("Missing second history cursor.");
        const third = await timeline.execute(
          { jobId: IDS.job, limit: 1, after: second.value.nextCursor },
          historyContext,
        );
        const oldest = third.ok ? third.value.items[0] : undefined;
        assertContract(
          third.ok &&
            !third.value.hasMore &&
            third.value.nextCursor === null &&
            oldest?.kind === "status" &&
            oldest.id === IDS.appliedEvent &&
            oldest.undoneAt === REJECTED_AT &&
            oldest.fromStatus?.id === IDS.saved &&
            oldest.toStatus.id === IDS.applied &&
            oldest.applicationId === IDS.application,
          "Timeline erased or misrepresented the original undone status event.",
        );
        const beforeUndo = await timeline.execute(
          { jobId: IDS.job },
          { ...historyContext, initiatedAt: APPLIED_AT },
        );
        assertContract(
          beforeUndo.ok &&
            beforeUndo.value.items.length === 2 &&
            beforeUndo.value.items.some((item) => item.kind === "status" && item.undoneAt === null),
          "Timeline exposed an undo recorded after its snapshot ceiling.",
        );
        const firstHistoryCursor = first.value.nextCursor;
        await expectFailure(
          () =>
            timelinePort.listPage({
              jobId: IDS.job,
              asOf: REOPENED_AT,
              includeArchived: false,
              limit: 1,
              after: { ...firstHistoryCursor, id: IDS.reminder },
            }),
          (error) => error instanceof JobTimelineError && error.code === "cursor_invalidated",
          "Timeline accepted a missing keyset anchor.",
        );
        assertContract(
          (await repositories.applications.findById(IDS.application))?.currentStatusId ===
            IDS.rejected && (await repositories.statusEvents.listForJob(IDS.job)).length === 3,
          "History queries changed current projections or append-only events.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
            [FINAL_UNDO_AT, FINAL_UNDO_AT, IDS.job],
          ),
        );
        const hidden = await timeline.execute({ jobId: IDS.job }, historyContext);
        const archived = await timeline.execute(
          { jobId: IDS.job, includeArchived: true },
          historyContext,
        );
        assertContract(
          !hidden.ok &&
            hidden.error.code === "not_found" &&
            archived.ok &&
            archived.value.items.length === 3,
          "Timeline ignored explicit archived-job scope.",
        );
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.pipeline.cases.undoNextAction,
      run: async (database) => {
        await setup.migrate(database);
        await createPipelineAggregate(database);
        const repositories = createPipelineRepositories(database);
        const viewed = await createTrackerRepositories(database).jobs.findById(IDS.job);
        if (viewed === undefined)
          throw new DatabaseContractViolation("Next-action guard fixture has no owned job.");
        const guardedAction = {
          id: IDS.nextAction,
          jobId: IDS.job,
          applicationId: null,
          interactionId: null,
          title: "Guarded next action",
          dueAt: ACTION_DUE_AT,
          timeZone: EASTERN,
          state: "pending" as const,
          completedAt: null,
          createdAt: APPLIED_AT,
          updatedAt: APPLIED_AT,
        };
        const writeState = async () =>
          JSON.stringify({
            jobs: await database.query(sqlStatement("SELECT * FROM job ORDER BY id")),
            actions: await database.query(sqlStatement("SELECT * FROM next_action ORDER BY id")),
            tokens: await database.query(
              sqlStatement("SELECT * FROM mutation_undo_token ORDER BY id"),
            ),
          });
        await database.execute(
          sqlStatement(
            "UPDATE job SET row_version = row_version + 1, updated_at = ? WHERE id = ?",
            [APPLIED_AT, IDS.job],
          ),
        );
        const beforeStale = await writeState();
        await expectFailure(
          () =>
            setNextAction(database, guardedAction, IDS.nextActionUndo, {
              jobRowVersion: viewed.rowVersion,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "pipeline_projection_conflict",
          "A viewed next-action draft overwrote a later job version.",
        );
        assertContract(
          (await writeState()) === beforeStale,
          "Stale next-action rejection left partial job/action/undo writes.",
        );
        await expectFailure(
          () =>
            createDatabaseJobActivityPort(database).setNextAction({
              ...guardedAction,
              undoTokenId: IDS.nextActionUndo,
              expected: { jobRowVersion: viewed.rowVersion },
            }),
          (error) => error instanceof JobActivityError && error.code === "scheduling_conflict",
          "Concrete next-action port dropped the viewed version or safe conflict mapping.",
        );
        assertContract(
          (await writeState()) === beforeStale,
          "Concrete next-action port left partial writes after rejection.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
            [APPLIED_AT, APPLIED_AT, IDS.job],
          ),
        );
        const archived = await createTrackerRepositories(database).jobs.findById(IDS.job);
        if (archived === undefined)
          throw new DatabaseContractViolation("Archived next-action fixture disappeared.");
        const beforeArchived = await writeState();
        await expectFailure(
          () =>
            setNextAction(database, guardedAction, IDS.nextActionUndo, {
              jobRowVersion: archived.rowVersion,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "pipeline_projection_conflict",
          "A current-version next action was written to an archived job.",
        );
        assertContract(
          (await writeState()) === beforeArchived,
          "Archived next-action rejection left partial job/action/undo writes.",
        );
        await database.execute(
          sqlStatement(
            "UPDATE job SET archived_at = NULL, row_version = row_version + 1 WHERE id = ?",
            [IDS.job],
          ),
        );
        const current = await createTrackerRepositories(database).jobs.findById(IDS.job);
        if (current === undefined)
          throw new DatabaseContractViolation("Current next-action fixture disappeared.");
        await setNextAction(
          database,
          {
            id: IDS.nextAction,
            jobId: IDS.job,
            applicationId: IDS.application,
            interactionId: null,
            title: "Preserved earlier action",
            dueAt: ACTION_DUE_AT,
            timeZone: EASTERN,
            state: "pending",
            completedAt: null,
            createdAt: APPLIED_AT,
            updatedAt: APPLIED_AT,
          },
          IDS.nextActionUndo,
          { jobRowVersion: current.rowVersion },
        );
        for (const [suffix, dueAt, zone] of [
          ["0100", null, null],
          ["0101", REMINDER_AT, EASTERN],
          ["0102", APPLIED_AT, EASTERN],
        ] as const) {
          const actionId = entityId("next-action", `0198e103-0000-7000-8000-00000000${suffix}`);
          const tokenId = entityId(
            "mutation-undo-token",
            `0198e103-0000-7000-8000-00000001${suffix}`,
          );
          const before = await createTrackerRepositories(database).jobs.findById(IDS.job);
          if (before === undefined)
            throw new DatabaseContractViolation("Pending projection fixture disappeared.");
          const added = await createDatabaseJobActivityPort(database).setNextAction({
            ...guardedAction,
            id: actionId,
            undoTokenId: tokenId,
            dueAt,
            timeZone: zone,
            expected: { jobRowVersion: before.rowVersion },
          });
          const expectedDue = suffix === "0102" ? APPLIED_AT : ACTION_DUE_AT;
          assertContract(
            added.nextAction.dueAt === dueAt &&
              added.nextAction.timeZone === zone &&
              (await createTrackerRepositories(database).jobs.findById(IDS.job))?.nextActionAt ===
                expectedDue &&
              (await repositories.nextActions.findById(IDS.nextAction))?.state === "pending",
            "Adding an unscheduled/later/earlier action lost a task or corrupted earliest due.",
          );
          await consumeMutationUndoToken(database, { id: tokenId, consumedAt: REJECTED_AT });
          assertContract(
            (await createTrackerRepositories(database).jobs.findById(IDS.job))?.nextActionAt ===
              ACTION_DUE_AT &&
              (await repositories.nextActions.findById(actionId))?.state === "dismissed",
            "Additional-action undo did not restore the earliest pending projection.",
          );
        }
        const replacement = await setNextAction(
          database,
          {
            id: IDS.replacementAction,
            jobId: IDS.job,
            applicationId: IDS.application,
            interactionId: null,
            title: "Reversible additional action",
            dueAt: INTERVIEW_AT,
            timeZone: EASTERN,
            state: "pending",
            completedAt: null,
            createdAt: REJECTED_AT,
            updatedAt: REJECTED_AT,
          },
          IDS.replacementActionUndo,
        );
        assertContract(
          replacement.undoToken.previousNextActionAt === ACTION_DUE_AT &&
            replacement.undoToken.expectedNextActionAt === ACTION_DUE_AT &&
            (await createTrackerRepositories(database).jobs.findById(IDS.job))?.nextActionAt ===
              ACTION_DUE_AT &&
            (await repositories.nextActions.findById(IDS.nextAction))?.state === "pending",
          "Next-action undo token did not retain both projection values.",
        );
        await repositories.reminders.create({
          id: IDS.replacementReminder,
          jobId: IDS.job,
          nextActionId: IDS.replacementAction,
          interviewId: null,
          remindAt: REMINDER_AT,
          timeZone: EASTERN,
          state: "pending",
          note: null,
          firedAt: null,
          createdAt: REJECTED_AT,
          updatedAt: REJECTED_AT,
        });

        await consumeMutationUndoToken(database, {
          id: IDS.replacementActionUndo,
          consumedAt: REOPENED_AT,
        });
        const restoredJob = await createTrackerRepositories(database).jobs.findById(IDS.job);
        const dismissedAction = await repositories.nextActions.findById(IDS.replacementAction);
        const dismissedReminder = await repositories.reminders.findById(IDS.replacementReminder);
        assertContract(
          restoredJob?.nextActionAt === ACTION_DUE_AT && dismissedAction?.state === "dismissed",
          "Next-action undo did not restore the prior projection and dismiss its record.",
        );
        assertContract(
          dismissedReminder?.state === "dismissed",
          "Next-action undo left a live linked reminder.",
        );
        await expectFailure(
          () =>
            consumeMutationUndoToken(database, {
              id: IDS.replacementActionUndo,
              consumedAt: FINAL_UNDO_AT,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "undo_token_already_consumed",
          "A consumed next-action undo token was replayed.",
        );

        await setNextAction(
          database,
          {
            id: IDS.staleAction,
            jobId: IDS.job,
            applicationId: null,
            interactionId: null,
            title: "Action changed after token creation",
            dueAt: INTERVIEW_AT,
            timeZone: EASTERN,
            state: "pending",
            completedAt: null,
            createdAt: REOPENED_AT,
            updatedAt: REOPENED_AT,
          },
          IDS.staleActionUndo,
        );
        await completeNextAction(database, IDS.staleAction, FINAL_UNDO_AT);
        await expectFailure(
          () =>
            consumeMutationUndoToken(database, {
              id: IDS.staleActionUndo,
              consumedAt: FINAL_UNDO_AT,
            }),
          (error) =>
            error instanceof PipelineRepositoryConflictError &&
            error.code === "undo_target_changed",
          "A stale next-action undo token overwrote a later edit.",
        );
        const staleToken = await repositories.undoTokens.findById(IDS.staleActionUndo);
        const completedAction = await repositories.nextActions.findById(IDS.staleAction);
        const finalJob = await createTrackerRepositories(database).jobs.findById(IDS.job);
        assertContract(
          staleToken?.consumedAt === null &&
            completedAction?.state === "completed" &&
            finalJob?.nextActionAt === ACTION_DUE_AT,
          "Rejected stale next-action undo did not roll back atomically.",
        );
      },
    },
  ]);
