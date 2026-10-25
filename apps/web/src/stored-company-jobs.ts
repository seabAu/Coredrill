import {
  createCompanyJobsQuery,
  type ApplicationOperationContext,
  type ListCompanyJobsInputV1,
} from "@coredrill/application";
import { createCompanyJobsRepository, type DatabasePort } from "@coredrill/storage-core";

/** Original viewed scope is validated and copied before selected storage is opened. */
export const createStoredCompanyJobsApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const query = createCompanyJobsQuery({
    listPage: async (input) => createCompanyJobsRepository(await database()).listPage(input),
  });
  return Object.freeze({
    page: (input: ListCompanyJobsInputV1) => query.execute(input, context()),
  });
};
export type StoredCompanyJobsApi = ReturnType<typeof createStoredCompanyJobsApi>;
