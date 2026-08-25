import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import type { DatabasePort } from "./database-port.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import { createTrackerRepositories } from "./tracker-repositories.js";
import { ViewRepositoryConflictError, createViewRepositories } from "./view-repositories.js";

export interface ViewRepositoryContractSetup {
  readonly migrate: (database: DatabasePort) => Promise<void>;
}

const IDS = Object.freeze({
  job: entityId("job", "0198e104-0000-7000-8000-000000000001"),
  tag: entityId("tag", "0198e104-0000-7000-8000-000000000002"),
  archivedTag: entityId("tag", "0198e104-0000-7000-8000-000000000003"),
  view: entityId("saved-view", "0198e104-0000-7000-8000-000000000004"),
  missingJob: entityId("job", "0198e104-0000-7000-8000-000000000005"),
});

const CREATED_AT = instant("2026-08-25T16:00:00.000Z");
const UPDATED_AT = instant("2026-08-25T16:05:00.000Z");

const INITIAL_FILTER: JsonValue = {
  specVersion: 1,
  root: {
    type: "predicate",
    field: "status_category",
    operator: "one_of",
    value: ["saved", "preparing"],
  },
};

const UPDATED_FILTER: JsonValue = {
  specVersion: 1,
  root: {
    type: "group",
    op: "and",
    negated: false,
    children: [
      {
        type: "predicate",
        field: "workplace_type",
        operator: "equals",
        value: "remote",
      },
      {
        type: "predicate",
        field: "tag_id",
        operator: "equals",
        value: IDS.tag,
      },
    ],
  },
};

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

const createJob = async (database: DatabasePort): Promise<void> => {
  await createTrackerRepositories(database).jobs.create({
    id: IDS.job,
    companyId: null,
    title: "Synthetic filterable role",
    normalizedTitle: "filterable role",
    descriptionText: "Synthetic role used only for DB-004 repository proof.",
    employmentType: "full_time",
    workplaceType: "remote",
    seniority: "mid",
    locationId: null,
    remoteRegion: null,
    datePosted: null,
    validThrough: null,
    currentStatusId: null,
    nextActionAt: null,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
};

export const createViewRepositoryContractSuite = (
  setup: ViewRepositoryContractSetup,
): DatabaseContractSuite =>
  defineDatabaseContractSuite(PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.view.suiteName, [
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.view.cases.assignTags,
      run: async (database) => {
        await setup.migrate(database);
        await createJob(database);
        const tags = createViewRepositories(database).tags;
        await tags.create({
          id: IDS.tag,
          name: "Synthetic priority'); DROP TABLE job; --",
          color: "amber",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        await tags.create({
          id: IDS.archivedTag,
          name: "Synthetic archived tag",
          color: null,
          archivedAt: CREATED_AT,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });

        await tags.assignToJob(IDS.job, IDS.tag, CREATED_AT);
        await tags.assignToJob(IDS.job, IDS.tag, CREATED_AT);
        const assigned = await tags.listForJob(IDS.job);
        assertContract(
          assigned.length === 1 && assigned[0]?.name.includes("DROP TABLE job") === true,
          "The bound tag value or idempotent assignment did not persist.",
        );
        assertContract(
          (await createTrackerRepositories(database).jobs.findById(IDS.job)) !== undefined,
          "A tag name was interpreted as SQL instead of a bound value.",
        );

        await expectFailure(
          () => tags.assignToJob(IDS.job, IDS.archivedTag, CREATED_AT),
          (error) =>
            error instanceof ViewRepositoryConflictError && error.code === "tag_unavailable",
          "An archived tag was assigned to a job.",
        );
        await expectFailure(
          () => tags.assignToJob(IDS.missingJob, IDS.tag, CREATED_AT),
          (error) =>
            error instanceof ViewRepositoryConflictError && error.code === "tag_unavailable",
          "A tag assignment accepted a missing job.",
        );

        assertContract(await tags.unassignFromJob(IDS.job, IDS.tag), "Tag removal did not commit.");
        assertContract(
          !(await tags.unassignFromJob(IDS.job, IDS.tag)),
          "Repeated tag removal was not idempotent.",
        );
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.view.cases.roundTripSavedViews,
      run: async (database) => {
        await setup.migrate(database);
        const savedViews = createViewRepositories(database).savedViews;
        await savedViews.create({
          id: IDS.view,
          scope: "jobs",
          name: "Synthetic actionable roles",
          filterAstVersion: 1,
          filterAst: INITIAL_FILTER,
          uiSettings: { presentation: "table", pinnedColumns: ["title", "company"] },
          isSystem: false,
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });

        const stored = await savedViews.findById(IDS.view);
        assertContract(
          stored?.filterAstVersion === 1 && stored.rowVersion === 1 && !stored.isSystem,
          "Versioned saved-view JSON did not round-trip.",
        );
        const updated = await savedViews.update(
          {
            id: IDS.view,
            name: "Synthetic remote priorities",
            filterAstVersion: 1,
            filterAst: UPDATED_FILTER,
            uiSettings: { presentation: "board", density: "compact" },
            archivedAt: null,
            updatedAt: UPDATED_AT,
          },
          1,
        );
        assertContract(
          updated.rowVersion === 2 && updated.name === "Synthetic remote priorities",
          "Saved-view optimistic update did not advance its row version.",
        );

        await expectFailure(
          () =>
            savedViews.update(
              {
                id: IDS.view,
                name: "Stale update",
                filterAstVersion: 1,
                filterAst: INITIAL_FILTER,
                uiSettings: {},
                archivedAt: null,
                updatedAt: UPDATED_AT,
              },
              1,
            ),
          (error) =>
            error instanceof ViewRepositoryConflictError && error.code === "row_version_conflict",
          "A stale saved-view write overwrote newer state.",
        );

        await expectFailure(
          () =>
            savedViews.create({
              id: entityId("saved-view", "0198e104-0000-7000-8000-000000000006"),
              scope: "jobs",
              name: "Mismatched version",
              filterAstVersion: 2,
              filterAst: INITIAL_FILTER,
              uiSettings: {},
              isSystem: false,
              archivedAt: null,
              createdAt: CREATED_AT,
              updatedAt: CREATED_AT,
            }),
          (error) => error instanceof TypeError,
          "Saved-view storage accepted mismatched AST versions.",
        );
      },
    },
  ]);
