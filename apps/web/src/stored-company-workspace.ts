import {
  CompanyWorkspaceError,
  createCompanyWorkspaceOperations,
  type ApplicationOperationContext,
  type CompanyWorkspacePortV1,
  type CreateCompanyInput,
  type ReadCompanyWorkspaceInputV1,
  type UpdateCompanyNotesInputV1,
} from "@coredrill/application";
import { entityId, instant, type Instant } from "@coredrill/domain";
import { createCompanyWorkspaceRepository, type DatabasePort } from "@coredrill/storage-core";

/** Runtime composition only; validation precedes lazy selected-storage opening. */
export const createStoredCompanyWorkspaceApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
  createCompanyId: () => string,
) => {
  const selectedPort = async (): Promise<CompanyWorkspacePortV1> => {
    let selected: DatabasePort;
    try {
      selected = await database();
    } catch {
      throw new CompanyWorkspaceError("unavailable");
    }
    return createCompanyWorkspaceRepository(selected);
  };
  const port: CompanyWorkspacePortV1 = {
    read: async (input) => (await selectedPort()).read(input),
    create: async (input) => (await selectedPort()).create(input),
    updateNotes: async (input) => (await selectedPort()).updateNotes(input),
  };
  const operations = createCompanyWorkspaceOperations(port, () =>
    entityId("company", createCompanyId()),
  );
  return Object.freeze({
    read: (input: ReadCompanyWorkspaceInputV1) => operations.read.execute(input, context()),
    updateNotes: (input: UpdateCompanyNotesInputV1) =>
      operations.updateNotes.execute(input, context()),
    /** Explicit draft capability: no database opening or persistent record yet. */
    beginCreation: (viewedVaultId: string) => {
      const vaultId = entityId("vault", viewedVaultId);
      const companyId = entityId("company", createCompanyId());
      const creation = createCompanyWorkspaceOperations(port, () => companyId);
      let firstContext: ApplicationOperationContext | null = null;
      return Object.freeze({
        vaultId,
        companyId,
        createdAt: (): Instant | null => {
          if (firstContext === null) return null;
          try {
            return instant(firstContext.initiatedAt);
          } catch {
            return null;
          }
        },
        save: (company: CreateCompanyInput) => {
          // A retry cannot allocate another identity or silently change its audit time.
          firstContext ??= Object.freeze({ ...context() });
          return creation.create.execute(
            { specVersion: 1, expectedVaultId: vaultId, company },
            firstContext,
          );
        },
      });
    },
  });
};
export type StoredCompanyWorkspaceApi = ReturnType<typeof createStoredCompanyWorkspaceApi>;
export type StoredCompanyCreation = ReturnType<StoredCompanyWorkspaceApi["beginCreation"]>;
