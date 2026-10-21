import {
  ContactDirectoryError,
  parseContactDirectoryRequestV1,
  type ContactDirectoryPort,
  type ListContactDirectoryPortInputV1,
} from "@coredrill/application";
import { sqlStatement, type DatabasePort, type QueryRow, type SqlValue } from "./database-port.js";

const summary = (row: QueryRow) =>
  Object.freeze({
    id: row["id"],
    name: row["name"],
    role: row["role"],
    companyId: row["company_id"],
    archivedAt: row["archived_at"],
    createdAt: row["created_at"],
    updatedAt: row["updated_at"],
    rowVersion: row["row_version"],
  });

/** One bounded read transaction; no private contact-method or notes projection. */
export const createContactDirectoryRepository = (database: DatabasePort): ContactDirectoryPort =>
  Object.freeze({
    listPage: async (untrusted: ListContactDirectoryPortInputV1) => {
      let request: ListContactDirectoryPortInputV1;
      try {
        request = parseContactDirectoryRequestV1(untrusted);
      } catch {
        throw new ContactDirectoryError("invalid_state");
      }
      return database.transaction(async (session) => {
        const vaults = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
        if (vaults.length > 1) throw new ContactDirectoryError("invalid_state");
        if (vaults[0]?.["id"] !== request.expectedVaultId) return undefined;
        if (request.companyId !== null) {
          const companies = await session.query(
            sqlStatement("SELECT id FROM company WHERE id = ? LIMIT 2", [request.companyId]),
          );
          if (companies.length > 1) throw new ContactDirectoryError("invalid_state");
          if (companies.length === 0) return undefined;
        }
        const after = request.after;
        if (after !== null) {
          const anchors = await session.query(
            sqlStatement(
              "SELECT created_at, row_version, archived_at, company_id FROM contact WHERE id = ? LIMIT 2",
              [after.id],
            ),
          );
          const anchor = anchors[0];
          if (
            anchors.length !== 1 ||
            anchor?.["created_at"] !== after.createdAt ||
            anchor["row_version"] !== after.rowVersion ||
            (!request.includeArchived && anchor["archived_at"] !== null) ||
            (request.companyId !== null && anchor["company_id"] !== request.companyId)
          )
            throw new ContactDirectoryError("cursor_invalidated");
        }
        const parameters: SqlValue[] = [];
        const archive = request.includeArchived ? "1 = 1" : "c.archived_at IS NULL";
        const company = request.companyId === null ? "1 = 1" : "c.company_id = ?";
        if (request.companyId !== null) parameters.push(request.companyId);
        let continuation = "1 = 1";
        if (after !== null) {
          continuation = "(c.created_at < ? OR (c.created_at = ? AND c.id > ?))";
          parameters.push(after.createdAt, after.createdAt, after.id);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT c.id, c.name, c.role, c.company_id, c.archived_at, c.created_at, c.updated_at, c.row_version FROM contact c WHERE ${archive} AND ${company} AND ${continuation} ORDER BY c.created_at DESC, c.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) throw new ContactDirectoryError("invalid_state");
        const items = Object.freeze(rows.slice(0, request.limit).map(summary));
        const hasMore = rows.length > request.limit;
        const last = items.at(-1);
        return Object.freeze({
          specVersion: 1,
          vaultId: request.expectedVaultId,
          includeArchived: request.includeArchived,
          companyId: request.companyId,
          items,
          hasMore,
          nextCursor:
            hasMore && last !== undefined
              ? Object.freeze({
                  specVersion: 1,
                  vaultId: request.expectedVaultId,
                  includeArchived: request.includeArchived,
                  companyId: request.companyId,
                  createdAt: last.createdAt,
                  id: last.id,
                  rowVersion: last.rowVersion,
                })
              : null,
        });
      });
    },
  });
