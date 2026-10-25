import {
  createNetworkInteractionsQuery,
  createNetworkInteractionSummaryQuery,
  type ApplicationOperationContext,
  type ListNetworkInteractionsInputV1,
  type ReadNetworkInteractionSummaryInputV1,
} from "@coredrill/application";
import {
  createNetworkInteractionHistoryRepository,
  type DatabasePort,
} from "@coredrill/storage-core";
/** Strict original ownership is copied before selected storage is opened. */
export const createStoredNetworkInteractionsApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const page = createNetworkInteractionsQuery({
    listPage: async (input) =>
      createNetworkInteractionHistoryRepository(await database()).listPage(input),
  });
  const summary = createNetworkInteractionSummaryQuery({
    readSummaryPart: async (input) =>
      createNetworkInteractionHistoryRepository(await database()).readSummaryPart(input),
  });
  return Object.freeze({
    page: (input: ListNetworkInteractionsInputV1) => page.execute(input, context()),
    summary: (input: ReadNetworkInteractionSummaryInputV1) => summary.execute(input, context()),
  });
};
export type StoredNetworkInteractionsApi = ReturnType<typeof createStoredNetworkInteractionsApi>;
