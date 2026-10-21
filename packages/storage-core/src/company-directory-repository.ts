import {
  CompanyDirectoryError,
  parseCompanyDirectoryRequestV1,
  type CompanyDirectoryPort,
  type ListCompanyDirectoryPortInputV1,
} from "@coredrill/application";
import { sqlStatement, type DatabasePort, type QueryRow, type SqlValue } from "./database-port.js";

const summary = (row: QueryRow) =>
  Object.freeze({
    id: row["id"],
    canonicalName: row["canonical_name"],
    websiteUrl: row["website_url"],
    domain: row["domain"],
    archivedAt: row["archived_at"],
    createdAt: row["created_at"],
    updatedAt: row["updated_at"],
    rowVersion: row["row_version"],
  });

/** Live keyset pages in one read transaction; no notes/contact preload or wall-clock ceiling. */
export const createCompanyDirectoryRepository = (database: DatabasePort): CompanyDirectoryPort =>
  Object.freeze({
    listPage: async (untrusted: ListCompanyDirectoryPortInputV1) => {
      let request: ListCompanyDirectoryPortInputV1;
      try {
        request = parseCompanyDirectoryRequestV1(untrusted);
      } catch {
        throw new CompanyDirectoryError("invalid_state");
      }
      return database.transaction(async (session) => {
        const vaults = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
        if (vaults.length > 1) throw new CompanyDirectoryError("invalid_state");
        if (vaults[0]?.["id"] !== request.expectedVaultId) return undefined;
        const after = request.after;
        if (after !== null) {
          const anchors = await session.query(
            sqlStatement(
              "SELECT created_at, row_version, archived_at FROM company WHERE id = ? LIMIT 2",
              [after.id],
            ),
          );
          const anchor = anchors[0];
          if (
            anchors.length !== 1 ||
            anchor?.["created_at"] !== after.createdAt ||
            anchor["row_version"] !== after.rowVersion ||
            (!request.includeArchived && anchor["archived_at"] !== null)
          )
            throw new CompanyDirectoryError("cursor_invalidated");
        }
        const parameters: SqlValue[] = [];
        const archived = request.includeArchived ? "1 = 1" : "c.archived_at IS NULL";
        let continuation = "1 = 1";
        if (after !== null) {
          continuation = "(c.created_at < ? OR (c.created_at = ? AND c.id > ?))";
          parameters.push(after.createdAt, after.createdAt, after.id);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT c.id, c.canonical_name, c.website_url, c.domain, c.archived_at,
          c.created_at, c.updated_at, c.row_version FROM company c
         WHERE ${archived} AND ${continuation}
         ORDER BY c.created_at DESC, c.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) throw new CompanyDirectoryError("invalid_state");
        const items = Object.freeze(rows.slice(0, request.limit).map(summary));
        const hasMore = rows.length > request.limit;
        const last = items.at(-1);
        return Object.freeze({
          specVersion: 1,
          vaultId: request.expectedVaultId,
          includeArchived: request.includeArchived,
          items,
          hasMore,
          nextCursor:
            hasMore && last !== undefined
              ? Object.freeze({
                  specVersion: 1,
                  vaultId: request.expectedVaultId,
                  includeArchived: request.includeArchived,
                  createdAt: last.createdAt,
                  id: last.id,
                  rowVersion: last.rowVersion,
                })
              : null,
        });
      });
    },
  });
