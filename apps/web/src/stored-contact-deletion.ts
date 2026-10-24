import {
  applicationFailure,
  ContactWorkspaceError,
  createContactDeletionOperations,
  createContactDeletionTargetV1,
  type ApplicationOperationContext,
  type ContactDeletionPortV1,
  type ContactWorkspaceV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { createContactDeletionRepository, type DatabasePort } from "@coredrill/storage-core";

const invalid = () =>
  applicationFailure({
    code: "validation",
    message: "Review the original contact and exact deletion confirmation.",
    retryable: false,
  });
const copiedContext = (value: unknown): ApplicationOperationContext => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    Object.keys(value).some((key) => key !== "operationId" && key !== "initiatedAt")
  )
    throw new TypeError("Invalid local operation context.");
  const raw = value as Readonly<Record<string, unknown>>;
  return Object.freeze({
    operationId: entityId("application-operation", raw["operationId"] as string),
    initiatedAt: instant(raw["initiatedAt"] as string),
  });
};
/** Original-view action construction is local only: no database open, clock allocation or canonical state. */
export const createStoredContactDeletionApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const selectedPort = async (): Promise<ContactDeletionPortV1> => {
    let selected: DatabasePort;
    try {
      selected = await database();
    } catch {
      throw new ContactWorkspaceError("unavailable");
    }
    return createContactDeletionRepository(selected);
  };
  const operations = createContactDeletionOperations({
    remove: async (target) => (await selectedPort()).remove(target),
    inspect: async (target) => (await selectedPort()).inspect(target),
  });
  return Object.freeze({
    begin: (viewed: ContactWorkspaceV1) => {
      const target = createContactDeletionTargetV1(viewed);
      let firstContext: ApplicationOperationContext | null = null;
      return Object.freeze({
        target,
        attemptContext: () => firstContext,
        remove: async (confirmation: string) => {
          if (confirmation !== "DELETE CONTACT") return invalid();
          try {
            firstContext ??= copiedContext(context());
          } catch {
            return invalid();
          }
          return operations.remove.execute({ ...target, confirmation }, firstContext);
        },
        inspect: async () => {
          let queryContext: ApplicationOperationContext;
          try {
            queryContext = copiedContext(context());
          } catch {
            return invalid();
          }
          return operations.inspect.execute(target, queryContext);
        },
      });
    },
  });
};
export type StoredContactDeletionApi = ReturnType<typeof createStoredContactDeletionApi>;
export type StoredContactDeletionAction = ReturnType<StoredContactDeletionApi["begin"]>;
