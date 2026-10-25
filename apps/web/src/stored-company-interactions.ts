import {
  createCompanyInteractionsQuery,
  createCompanyInteractionSummaryQuery,
  type ApplicationOperationContext,
  type ListCompanyInteractionsInputV1,
  type ReadCompanyInteractionSummaryInputV1,
} from "@coredrill/application";
import { createCompanyInteractionsRepository, type DatabasePort } from "@coredrill/storage-core";

/** Validate and copy original viewed scope before opening selected storage. */
export const createStoredCompanyInteractionsApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const page = createCompanyInteractionsQuery({
    listPage: async (input) =>
      createCompanyInteractionsRepository(await database()).listPage(input),
  });
  const summary = createCompanyInteractionSummaryQuery({
    readSummaryPart: async (input) =>
      createCompanyInteractionsRepository(await database()).readSummaryPart(input),
  });
  return Object.freeze({
    page: (input: ListCompanyInteractionsInputV1) => page.execute(input, context()),
    summary: (input: ReadCompanyInteractionSummaryInputV1) => summary.execute(input, context()),
  });
};
export type StoredCompanyInteractionsApi = ReturnType<typeof createStoredCompanyInteractionsApi>;
