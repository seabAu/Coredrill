import {
  createContactDirectoryQuery,
  type ApplicationOperationContext,
  type ListContactDirectoryInputV1,
} from "@coredrill/application";
import { createContactDirectoryRepository, type DatabasePort } from "@coredrill/storage-core";

/** Identity-only selected-runtime composition; validation precedes lazy storage opening. */
export const createStoredContactDirectoryApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const query = createContactDirectoryQuery({
    listPage: async (input) => createContactDirectoryRepository(await database()).listPage(input),
  });
  return Object.freeze({
    page: (input: ListContactDirectoryInputV1) => query.execute(input, context()),
  });
};
export type StoredContactDirectoryApi = ReturnType<typeof createStoredContactDirectoryApi>;
