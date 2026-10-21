import {
  createCompanyDirectoryQuery,
  type ApplicationOperationContext,
  type ListCompanyDirectoryInputV1,
} from "@coredrill/application";
import { createCompanyDirectoryRepository, type DatabasePort } from "@coredrill/storage-core";

/** Selected-runtime composition only; application validation precedes database opening. */
export const createStoredCompanyDirectoryApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const query = createCompanyDirectoryQuery({
    listPage: async (input) => createCompanyDirectoryRepository(await database()).listPage(input),
  });
  return Object.freeze({
    page: (input: ListCompanyDirectoryInputV1) => query.execute(input, context()),
  });
};
export type StoredCompanyDirectoryApi = ReturnType<typeof createStoredCompanyDirectoryApi>;
