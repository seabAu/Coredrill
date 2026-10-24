import {
  applicationFailure,
  createContactFieldEvidenceQuery,
  type ApplicationOperationContext,
  type ApplicationResult,
  type ContactFieldEvidencePageV1,
  type ListContactFieldEvidenceInputV1,
} from "@coredrill/application";
import { createContactFieldEvidenceRepository, type DatabasePort } from "@coredrill/storage-core";

/** Read-only selected-runtime composition; no opening or hashing on construction. */
export const createStoredContactFieldEvidenceApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
  hashValue: (value: string) => Promise<string>,
) => {
  if ([database, context, hashValue].some((capability) => typeof capability !== "function"))
    throw new TypeError("Contact evidence needs selected-runtime read capabilities.");
  const query = createContactFieldEvidenceQuery({
    listPage: async (input) =>
      createContactFieldEvidenceRepository(await database(), hashValue).listPage(input),
  });
  return Object.freeze({
    page: async (
      input: ListContactFieldEvidenceInputV1,
    ): Promise<ApplicationResult<ContactFieldEvidencePageV1>> => {
      let operation: ApplicationOperationContext;
      try {
        operation = context();
      } catch {
        return applicationFailure({
          code: "unavailable",
          message: "Local contact evidence could not be read. Refresh the selected contact.",
          retryable: true,
        });
      }
      return query.execute(input, operation);
    },
  });
};
export type StoredContactFieldEvidenceApi = ReturnType<typeof createStoredContactFieldEvidenceApi>;
