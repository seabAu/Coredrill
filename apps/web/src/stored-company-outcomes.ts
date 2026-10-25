import {
  createCompanyOutcomesQueryV1,
  type ApplicationOperationContext,
  type ListCompanyOutcomesInputV1,
} from "@coredrill/application";
import { createCompanyOutcomesRepository, type DatabasePort } from "@coredrill/storage-core";
/** Validate/copy viewed ownership before lazily opening the selected runtime. */
export const createStoredCompanyOutcomesApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const query = createCompanyOutcomesQueryV1({
    listPage: async (input) => createCompanyOutcomesRepository(await database()).listPage(input),
  });
  return Object.freeze({
    page: (input: ListCompanyOutcomesInputV1) => query.execute(input, context()),
  });
};
export type StoredCompanyOutcomesApi = ReturnType<typeof createStoredCompanyOutcomesApi>;
