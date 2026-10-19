import { dateOnly, entityId, instant, timeZone } from "@coredrill/domain";
import {
  AppliedStageError,
  MutationUndoError,
  createPipelineQueryOperations,
  createJobTimelineQuery,
  JobTimelineError,
} from "@coredrill/application";
import { createDatabaseMutationUndoPort } from "./application-ports.js";
import { createAppliedStageRepository } from "./applied-stage-repository.js";
import { createPipelineQueryRepository } from "./pipeline-query-repository.js";
import { createJobTimelineRepository } from "./job-timeline-repository.js";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import { sqlStatement, type DatabasePort } from "./database-port.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import {
  PipelineRepositoryConflictError,
  changePipelineStatus,
  completeNextAction,
  consumeMutationUndoToken,
  createPipelineRepositories,
  setNextAction,
} from "./pipeline-repositories.js";
import { createTrackerRepositories } from "./tracker-repositories.js";

export interface PipelineRepositoryContractSetup {
  readonly migrate: (database: DatabasePort) => Promise<void>;
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
        await setup.migrate(database);
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

        await completeNextAction(database, IDS.nextAction, REOPENED_AT);
        const completed = await repositories.nextActions.findById(IDS.nextAction);
        const jobAfterCompletion = await createTrackerRepositories(database).jobs.findById(IDS.job);
        assertContract(
          completed?.state === "completed" && jobAfterCompletion?.nextActionAt === null,
          "Completing the action did not refresh the job projection.",
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
        );
        const replacement = await setNextAction(
          database,
          {
            id: IDS.replacementAction,
            jobId: IDS.job,
            applicationId: IDS.application,
            interactionId: null,
            title: "Reversible replacement action",
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
            replacement.undoToken.expectedNextActionAt === INTERVIEW_AT,
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
