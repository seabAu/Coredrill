import {
  createCompanySourcesQuery,
  type ApplicationOperationContext,
  type ListCompanySourcesInputV1,
} from "@coredrill/application";
import { createCompanySourcesRepository, type DatabasePort } from "@coredrill/storage-core";

export const createStoredCompanySourcesApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const query = createCompanySourcesQuery({
    listPage: async (input) => createCompanySourcesRepository(await database()).listPage(input),
  });
  return Object.freeze({
    page: (input: ListCompanySourcesInputV1) => query.execute(input, context()),
  });
};
export type StoredCompanySourcesApi = ReturnType<typeof createStoredCompanySourcesApi>;
