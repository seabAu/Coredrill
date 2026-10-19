import {
  PipelineQueryError,
  createPipelineQueryOperations,
  type ApplicationOperationContext,
  type GetJobWorkspaceInput,
  type ListPipelineJobsInput,
  type PipelineQueryPort,
  type PipelineScopeInput,
} from "@coredrill/application";
import { createPipelineQueryRepository, type DatabasePort } from "@coredrill/storage-core";

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
  return Object.freeze({
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
