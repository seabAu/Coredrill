import {
  applicationFailure,
  ContactWorkspaceError,
  createContactWorkspaceOperations,
  resolveContactManualFieldsV1,
  type ApplicationOperationContext,
  type ContactWorkspacePortV1,
  type ContactWorkspaceV1,
  type CreateUserEnteredContactInput,
  type ReadContactWorkspaceInputV1,
  type UpdateContactNotesInputV1,
} from "@coredrill/application";
import { entityId, instant, type EntityId } from "@coredrill/domain";
import { createContactWorkspaceRepository, type DatabasePort } from "@coredrill/storage-core";

export interface ContactCreationCompany {
  readonly id: string;
  readonly rowVersion: number;
}
const failure = () =>
  applicationFailure({
    code: "validation",
    message: "Review the contact fields and original creation context.",
    retryable: false,
  });
const manualKeys = ["origin", "name", "role", "email", "phone", "publicProfileUrl", "notes"];

/** Normal selected-runtime composition; API and draft construction never open storage. */
export const createStoredContactWorkspaceApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
  createContactId: () => string,
  hashValue: (value: string) => Promise<string>,
) => {
  const selectedPort = async (): Promise<ContactWorkspacePortV1> => {
    let selected: DatabasePort;
    try {
      selected = await database();
    } catch {
      throw new ContactWorkspaceError("unavailable");
    }
    return createContactWorkspaceRepository(selected, hashValue);
  };
  const operations = createContactWorkspaceOperations(
    {
      read: async (input) => (await selectedPort()).read(input),
      create: async (input) => (await selectedPort()).create(input),
      updateNotes: async (input) => (await selectedPort()).updateNotes(input),
    },
    hashValue,
  );
  return Object.freeze({
    read: (input: ReadContactWorkspaceInputV1) => operations.read.execute(input, context()),
    updateNotes: (input: UpdateContactNotesInputV1) =>
      operations.updateNotes.execute(input, context()),
    resolveManualFields: async (workspace: ContactWorkspaceV1) => {
      try {
        return await resolveContactManualFieldsV1(workspace, hashValue);
      } catch {
        throw new ContactWorkspaceError("invalid_state");
      }
    },
    beginCreation: (viewedVaultId: string, company: ContactCreationCompany | null = null) => {
      const vaultId = entityId("vault", viewedVaultId);
      let companyId: EntityId<"company"> | null = null;
      let expectedCompanyRowVersion: number | null = null;
      if (company !== null) {
        if (
          typeof company !== "object" ||
          Array.isArray(company) ||
          Object.keys(company).some((key) => key !== "id" && key !== "rowVersion") ||
          !Number.isSafeInteger(company.rowVersion) ||
          company.rowVersion < 1 ||
          company.rowVersion >= Number.MAX_SAFE_INTEGER
        )
          throw new TypeError("Choose a valid viewed company for this contact draft.");
        companyId = entityId("company", company.id);
        expectedCompanyRowVersion = company.rowVersion;
      }
      const contactId = entityId("contact", createContactId());
      let firstContext: ApplicationOperationContext | null = null;
      return Object.freeze({
        vaultId,
        contactId,
        companyId,
        expectedCompanyRowVersion,
        attemptContext: () => firstContext,
        save: (contact: Omit<CreateUserEnteredContactInput, "companyId">) => {
          let fields: CreateUserEnteredContactInput;
          try {
            const untrustedContact: unknown = contact;
            if (
              typeof untrustedContact !== "object" ||
              untrustedContact === null ||
              Array.isArray(untrustedContact) ||
              Object.keys(untrustedContact).some((key) => !manualKeys.includes(key))
            )
              return Promise.resolve(failure());
            // This draft owns company selection; a caller cannot rebind it during retry.
            fields = { ...contact, companyId };
            if (firstContext === null) {
              const current = context();
              if (
                Object.keys(current).some((key) => key !== "operationId" && key !== "initiatedAt")
              )
                return Promise.resolve(failure());
              firstContext = Object.freeze({
                operationId: entityId("application-operation", current.operationId),
                initiatedAt: instant(current.initiatedAt),
              });
            }
          } catch {
            return Promise.resolve(failure());
          }
          return operations.create.execute(
            {
              specVersion: 1,
              expectedVaultId: vaultId,
              contactId,
              contact: fields,
              expectedCompanyRowVersion,
            },
            firstContext,
          );
        },
      });
    },
  });
};
export type StoredContactWorkspaceApi = ReturnType<typeof createStoredContactWorkspaceApi>;
export type StoredContactCreation = ReturnType<StoredContactWorkspaceApi["beginCreation"]>;
