import {
  PipelineQueryError,
  createPipelineQueryOperations,
  createJobTimelineQuery,
  JobTimelineError,
  createJobSourceSnapshotQuery,
  createJobSourceContentQuery,
  createJobSourceEvidenceQuery,
  createJobSourceEvidenceValueQuery,
  type ListJobSourceSnapshotsInput,
  type GetJobSourceContentInput,
  type ListJobSourceEvidenceInput,
  type GetJobSourceEvidenceValueInput,
  type ListJobTimelineInput,
  type ApplicationOperationContext,
  type GetJobWorkspaceInput,
  type ListPipelineJobsInput,
  type PipelineQueryPort,
  type PipelineScopeInput,
} from "@coredrill/application";
import {
  createPipelineQueryRepository,
  createJobTimelineRepository,
  createJobSourceSnapshotRepository,
  createJobSourceContentRepository,
  createJobSourceEvidenceRepository,
  createJobSourceEvidenceValueRepository,
  type DatabasePort,
} from "@coredrill/storage-core";

/** Runtime composition: UI receives only the existing validated application DTOs. */
export const createStoredPipelineApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const read = async <Value>(operation: (repository: PipelineQueryPort) => Promise<Value>) => {
    try {
      return await operation(createPipelineQueryRepository(await database()));
    } catch (error) {
      if (error instanceof PipelineQueryError) throw error;
      // Opening/storage errors are retryable, but paths and adapter text stay private.
      throw new PipelineQueryError("unavailable");
    }
  };
  const operations = createPipelineQueryOperations({
    pipelineQueries: {
      getCounts: (input) => read((repository) => repository.getCounts(input)),
      listBoardGroups: (input) => read((repository) => repository.listBoardGroups(input)),
      listJobsPage: (input) => read((repository) => repository.listJobsPage(input)),
      getJobWorkspace: (input) => read((repository) => repository.getJobWorkspace(input)),
    },
  });
  const history = createJobTimelineQuery({
    listPage: async (input) => {
      try {
        return await createJobTimelineRepository(await database()).listPage(input);
      } catch (error) {
        if (error instanceof JobTimelineError) throw error;
        throw new JobTimelineError("unavailable");
      }
    },
  });
  const snapshots = createJobSourceSnapshotQuery({
    listPage: async (input) => createJobSourceSnapshotRepository(await database()).listPage(input),
  });
  const sourceContent = createJobSourceContentQuery({
    readChunk: async (input) => createJobSourceContentRepository(await database()).readChunk(input),
  });
  const sourceEvidence = createJobSourceEvidenceQuery({
    listPage: async (input) => createJobSourceEvidenceRepository(await database()).listPage(input),
  });
  const sourceValue = createJobSourceEvidenceValueQuery({
    readChunk: async (input) =>
      createJobSourceEvidenceValueRepository(await database()).readChunk(input),
  });
  return Object.freeze({
    sourceSnapshots: (input: ListJobSourceSnapshotsInput) => snapshots.execute(input, context()),
    sourceContent: (input: GetJobSourceContentInput) => sourceContent.execute(input, context()),
    sourceEvidence: (input: ListJobSourceEvidenceInput) => sourceEvidence.execute(input, context()),
    sourceValue: (input: GetJobSourceEvidenceValueInput) => sourceValue.execute(input, context()),
    timeline: (input: ListJobTimelineInput) => history.execute(input, context()),
    counts: (input: PipelineScopeInput = {}) =>
      operations.getPipelineCountsQuery.execute(input, context()),
    groups: (input: PipelineScopeInput = {}) =>
      operations.getPipelineBoardGroupsQuery.execute(input, context()),
    page: (input: ListPipelineJobsInput = {}) =>
      operations.listPipelineJobsQuery.execute(input, context()),
    workspace: (input: GetJobWorkspaceInput) =>
      operations.getJobWorkspaceQuery.execute(input, context()),
  });
};
export type StoredPipelineApi = ReturnType<typeof createStoredPipelineApi>;
