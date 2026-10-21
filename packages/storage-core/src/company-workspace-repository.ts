import {
  CompanyWorkspaceError,
  parseCompanyWorkspaceV1,
  parseCreateViewedCompanyPortInputV1,
  parseReadCompanyWorkspaceRequestV1,
  parseUpdateCompanyNotesPortInputV1,
  validateCreatedCompanyWorkspaceV1,
  validateUpdatedCompanyNotesV1,
  type CompanyWorkspacePortV1,
  type CompanyWorkspaceV1,
} from "@coredrill/application";
import { sqlStatement, type DatabasePort, type DatabaseSession } from "./database-port.js";
import { CompanyRepository } from "./tracker-repositories.js";

const requireVault = async (session: DatabaseSession, expectedVaultId: string): Promise<void> => {
  const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
  if (roots.length > 1) throw new CompanyWorkspaceError("invalid_state");
  if (roots[0]?.["id"] !== expectedVaultId) throw new CompanyWorkspaceError("not_found");
};
const selected = async (
  session: DatabaseSession,
  expectedVaultId: CompanyWorkspaceV1["vaultId"],
  companyId: CompanyWorkspaceV1["company"]["id"],
  includeArchived: boolean,
): Promise<CompanyWorkspaceV1 | undefined> => {
  const company = await new CompanyRepository(session).findById(companyId);
  if (company === undefined || (!includeArchived && company.archivedAt !== null)) return undefined;
  return parseCompanyWorkspaceV1(
    { specVersion: 1, vaultId: expectedVaultId, company },
    { expectedVaultId, companyId, includeArchived },
  );
};

/** No cached owner: the sole root and selected version are checked in the operation's transaction. */
export const createCompanyWorkspaceRepository = (database: DatabasePort): CompanyWorkspacePortV1 =>
  Object.freeze<CompanyWorkspacePortV1>({
    read: async (input) => {
      const request = parseReadCompanyWorkspaceRequestV1(input);
      return database.transaction(async (session) => {
        await requireVault(session, request.expectedVaultId);
        return selected(
          session,
          request.expectedVaultId,
          request.companyId,
          request.includeArchived,
        );
      });
    },
    create: async (input) => {
      const request = parseCreateViewedCompanyPortInputV1(input);
      return database.transaction(async (session) => {
        await requireVault(session, request.expectedVaultId);
        const repository = new CompanyRepository(session);
        if (await repository.findById(request.company.id)) throw new CompanyWorkspaceError("stale");
        await repository.create(request.company);
        return validateCreatedCompanyWorkspaceV1(
          await selected(session, request.expectedVaultId, request.company.id, false),
          request,
        );
      });
    },
    updateNotes: async (input) => {
      const request = parseUpdateCompanyNotesPortInputV1(input);
      return database.transaction(async (session) => {
        await requireVault(session, request.expectedVaultId);
        const before = await selected(session, request.expectedVaultId, request.companyId, true);
        if (before === undefined) throw new CompanyWorkspaceError("not_found");
        if (
          before.company.archivedAt !== null ||
          before.company.rowVersion !== request.expectedRowVersion ||
          request.updatedAt < before.company.updatedAt
        )
          throw new CompanyWorkspaceError("stale");
        const changed = await session.execute(
          sqlStatement(
            `UPDATE company SET notes = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND row_version = ? AND archived_at IS NULL`,
            [request.notes, request.updatedAt, request.companyId, request.expectedRowVersion],
          ),
        );
        if (changed.rowsAffected !== 1) throw new CompanyWorkspaceError("stale");
        const after = validateUpdatedCompanyNotesV1(
          await selected(session, request.expectedVaultId, request.companyId, false),
          request,
        );
        // Even a faulty trigger/adapter cannot silently alter unrelated company facts.
        for (const key of [
          "id",
          "canonicalName",
          "websiteUrl",
          "domain",
          "locationId",
          "archivedAt",
          "createdAt",
        ] as const)
          if (before.company[key] !== after.company[key])
            throw new CompanyWorkspaceError("invalid_state");
        return after;
      });
    },
  });
