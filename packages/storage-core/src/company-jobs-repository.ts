import {
  CompanyJobsError,
  companyJobsCursorV1,
  compareCompanyJobKeysV1,
  parseCompanyJobsPageV1,
  parseCompanyJobsRequestV1,
  parseCompanyJobSummaryV1,
  type CompanyJobsPortV1,
} from "@coredrill/application";
import { instant } from "@coredrill/domain";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";

type Reader = Pick<DatabaseSession, "query">;
const invalid = (): never => {
  throw new CompanyJobsError("invalid_state");
};
const stale = (): never => {
  throw new CompanyJobsError("stale");
};
const version = (value: SqlValue | undefined): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : invalid();
const text = (value: SqlValue | undefined): string =>
  typeof value === "string" ? value : invalid();
const literal = (value: SqlValue | undefined): string => {
  if (!(value instanceof Uint8Array)) return invalid();
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
  } catch {
    return invalid();
  }
};
const bool = (value: SqlValue | undefined): boolean =>
  value === 0 ? false : value === 1 ? true : invalid();

/** Current linked jobs only; no notes, descriptions, bodies, contact methods or totals. */
export const createCompanyJobsRepository = (database: DatabasePort): CompanyJobsPortV1 =>
  Object.freeze<CompanyJobsPortV1>({
    listPage: async (input) => {
      const request = parseCompanyJobsRequestV1(input);
      const read = async (session: Reader) => {
        const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
        if (roots.length > 1) return invalid();
        if (roots[0]?.["id"] !== request.expectedVaultId) return undefined;
        const companies = await session.query(
          sqlStatement(
            "SELECT id,row_version,archived_at,created_at,updated_at FROM company WHERE id=? LIMIT 2",
            [request.companyId],
          ),
        );
        if (companies.length > 1) return invalid();
        const company = companies[0];
        if (company === undefined) return undefined;
        const created = instant(text(company["created_at"])),
          updated = instant(text(company["updated_at"]));
        const archived =
          company["archived_at"] === null ? null : instant(text(company["archived_at"]));
        if (
          company["id"] !== request.companyId ||
          created > updated ||
          (archived !== null && (archived < created || archived > updated))
        )
          return invalid();
        if (version(company["row_version"]) !== request.expectedCompanyRowVersion) return stale();
        if (archived !== null && !request.includeArchivedCompany) return undefined;
        const after = request.after;
        if (after !== null) {
          const anchors = await session.query(
            sqlStatement(
              "SELECT id,company_id,updated_at,row_version,archived_at FROM job WHERE id=? LIMIT 2",
              [after.jobId],
            ),
          );
          if (anchors.length > 1) return invalid();
          const anchor = anchors[0];
          if (
            anchor?.["id"] !== after.jobId ||
            anchor["company_id"] !== request.companyId ||
            anchor["updated_at"] !== after.jobUpdatedAt ||
            version(anchor["row_version"]) !== after.jobRowVersion ||
            (!request.includeArchivedJobs && anchor["archived_at"] !== null)
          )
            return stale();
        }
        const parameters: SqlValue[] = [request.companyId];
        let continuation = "1=1";
        if (after !== null) {
          continuation = "(j.updated_at < ? OR (j.updated_at = ? AND j.id > ?))";
          parameters.push(after.jobUpdatedAt, after.jobUpdatedAt, after.jobId);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT j.id,j.company_id,CAST(j.title AS BLOB) AS title_bytes,
        j.archived_at,j.created_at,j.updated_at,j.row_version,j.current_status_id,
        s.id AS status_id,CAST(s.name AS BLOB) AS status_name_bytes,s.category AS status_category,
        s.terminal AS status_terminal,s.row_version AS status_row_version
        FROM job j LEFT JOIN status_definition s ON s.id=j.current_status_id
        WHERE j.company_id=? AND ${request.includeArchivedJobs ? "1=1" : "j.archived_at IS NULL"} AND ${continuation}
        ORDER BY j.updated_at DESC,j.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) return invalid();
        const items = rows.map((row: QueryRow) => {
          if (row["current_status_id"] !== row["status_id"]) return invalid();
          if (
            row["status_id"] === null &&
            ["status_name_bytes", "status_category", "status_terminal", "status_row_version"].some(
              (key) => row[key] !== null,
            )
          )
            return invalid();
          return parseCompanyJobSummaryV1(
            {
              id: row["id"],
              companyId: row["company_id"],
              title: literal(row["title_bytes"]),
              status:
                row["status_id"] === null
                  ? null
                  : {
                      id: row["status_id"],
                      name: literal(row["status_name_bytes"]),
                      category: row["status_category"],
                      terminal: bool(row["status_terminal"]),
                      rowVersion: row["status_row_version"],
                    },
              archivedAt: row["archived_at"],
              createdAt: row["created_at"],
              updatedAt: row["updated_at"],
              rowVersion: row["row_version"],
            },
            request,
          );
        });
        // Validate the lookahead too; a corrupt overflow row is not merely "has more".
        let previous = after === null ? null : { id: after.jobId, updatedAt: after.jobUpdatedAt };
        const seen = new Set<string>();
        for (const item of items) {
          if (
            seen.has(item.id) ||
            (previous !== null && compareCompanyJobKeysV1(previous, item) >= 0)
          )
            return invalid();
          seen.add(item.id);
          previous = item;
        }
        const hasMore = items.length > request.limit,
          selected = items.slice(0, request.limit),
          last = selected.at(-1);
        const scope = {
          specVersion: request.specVersion,
          expectedVaultId: request.expectedVaultId,
          companyId: request.companyId,
          expectedCompanyRowVersion: request.expectedCompanyRowVersion,
          includeArchivedCompany: request.includeArchivedCompany,
          includeArchivedJobs: request.includeArchivedJobs,
        };
        return parseCompanyJobsPageV1(
          {
            ...scope,
            items: selected,
            hasMore,
            nextCursor: hasMore && last !== undefined ? companyJobsCursorV1(request, last) : null,
          },
          request,
        );
      };
      return database.withReadSnapshot === undefined
        ? database.transaction(read)
        : database.withReadSnapshot(read);
    },
  });
