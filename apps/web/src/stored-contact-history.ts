import {
  createContactInteractionHistoryQuery,
  createContactInteractionSummaryQuery,
  type ApplicationOperationContext,
  type ListContactInteractionsInputV1,
  type ReadContactInteractionSummaryInputV1,
} from "@coredrill/application";
import {
  createContactInteractionHistoryRepository,
  type DatabasePort,
} from "@coredrill/storage-core";

/** Selected-runtime reads only; query validation/copying precedes lazy storage opening. */
export const createStoredContactHistoryApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const page = createContactInteractionHistoryQuery({
    listPage: async (input) =>
      createContactInteractionHistoryRepository(await database()).listPage(input),
  });
  const summary = createContactInteractionSummaryQuery({
    readSummaryPart: async (input) =>
      createContactInteractionHistoryRepository(await database()).readSummaryPart(input),
  });
  return Object.freeze({
    page: (input: ListContactInteractionsInputV1) => page.execute(input, context()),
    summaryPart: (input: ReadContactInteractionSummaryInputV1) => summary.execute(input, context()),
  });
};
export type StoredContactHistoryApi = ReturnType<typeof createStoredContactHistoryApi>;
