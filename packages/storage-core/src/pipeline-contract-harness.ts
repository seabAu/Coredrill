import { dateOnly, entityId, instant, timeZone } from "@coredrill/domain";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import type { DatabasePort } from "./database-port.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import {
  PipelineRepositoryConflictError,
  changePipelineStatus,
  completeNextAction,
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
});

const CREATED_AT = instant("2026-08-25T14:00:00.000Z");
const APPLIED_AT = instant("2026-08-25T14:05:00.000Z");
const REJECTED_AT = instant("2026-08-25T14:10:00.000Z");
const REOPENED_AT = instant("2026-08-25T14:15:00.000Z");
const ACTION_DUE_AT = instant("2026-08-27T13:00:00.000Z");
const INTERVIEW_AT = instant("2026-08-28T15:00:00.000Z");
const REMINDER_AT = instant("2026-08-28T13:00:00.000Z");
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
        await changePipelineStatus(database, {
          eventId: IDS.appliedEvent,
          jobId: IDS.job,
          applicationId: IDS.application,
          toStatusId: IDS.applied,
          occurredAt: APPLIED_AT,
          note: "Synthetic submission.",
        });
        await changePipelineStatus(database, {
          eventId: IDS.rejectedEvent,
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
        await setNextAction(database, {
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
        });
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
  ]);
