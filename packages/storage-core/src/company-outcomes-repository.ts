import {
  CompanyOutcomesError,
  companyOutcomeCursorV1,
  compareCompanyOutcomeKeysV1,
  parseCompanyOutcomeEventV1,
  parseCompanyOutcomesPageV1,
  parseCompanyOutcomesRequestV1,
  type CompanyOutcomeEventV1,
  type CompanyOutcomesPortV1,
  type CompanyOutcomesScopeV1,
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
  throw new CompanyOutcomesError("invalid_state");
};
const stale = (): never => {
  throw new CompanyOutcomesError("stale");
};
const integer = (v: SqlValue | undefined, min = 1, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : invalid();
const text = (v: SqlValue | undefined): string => (typeof v === "string" ? v : invalid());
const flag = (v: SqlValue | undefined): boolean => (v === 0 ? false : v === 1 ? true : invalid());
const audit = (
  created: SqlValue | undefined,
  updated: SqlValue | undefined,
  archived?: SqlValue,
) => {
  try {
    const start = instant(text(created)),
      end = instant(text(updated));
    if (start > end) return invalid();
    if (archived !== undefined && archived !== null) {
      const at = instant(text(archived));
      if (at < start || at > end) return invalid();
    }
  } catch {
    return invalid();
  }
};
// Hardcoded metadata only; bound BLOB bytes before crossing the adapter boundary.
const bounded = (column: string, alias: string, max: number) =>
  `substr(CAST(${column} AS BLOB),1,${String(max * 4 + 1)}) AS ${alias}_bytes,length(CAST(${column} AS BLOB)) AS ${alias}_length`;
const literal = (row: QueryRow, alias: string, max: number): string => {
  const size = integer(row[`${alias}_length`], 0, max * 4),
    value = row[`${alias}_bytes`],
    bytes = size === 0 && value === null ? new Uint8Array() : value;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== size) return invalid();
  try {
    const result = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return result.length <= max ? result : invalid();
  } catch {
    return invalid();
  }
};
const stageColumns = (s: "f" | "t") =>
  `${s}.id AS ${s}_id,${bounded(`${s}.name`, `${s}_name`, 80)},${s}.category AS ${s}_category,${s}.terminal AS ${s}_terminal,${s}.archived_at AS ${s}_archived_at,${s}.created_at AS ${s}_created_at,${s}.updated_at AS ${s}_updated_at,${s}.row_version AS ${s}_row_version`;
const projection = `e.id,e.job_id,e.application_id,e.from_status_id,e.to_status_id,e.occurred_at,e.created_at,e.row_version,
 j.id AS current_job_id,j.company_id,${bounded("j.title", "job_title", 1024)},j.archived_at AS job_archived_at,j.created_at AS job_created_at,j.updated_at AS job_updated_at,j.row_version AS job_row_version,
 a.id AS application_identity,a.job_id AS application_job_id,a.archived_at AS application_archived_at,a.created_at AS application_created_at,a.updated_at AS application_updated_at,a.row_version AS application_row_version,
 ${stageColumns("f")},${stageColumns("t")},u.id AS undo_id,u.kind AS undo_kind,u.job_id AS undo_job_id,u.status_application_id AS undo_application_id,u.status_event_id AS undo_event_id,u.previous_status_id AS undo_from_id,u.expected_status_id AS undo_to_id,u.created_at AS undo_created_at,u.consumed_at AS undo_consumed_at,u.row_version AS undo_row_version`;
const from = `FROM status_event e LEFT JOIN job j ON j.id=e.job_id LEFT JOIN application a ON a.id=e.application_id
 LEFT JOIN status_definition f ON f.id=e.from_status_id LEFT JOIN status_definition t ON t.id=e.to_status_id LEFT JOIN mutation_undo_token u ON u.status_event_id=e.id`;
const stage = (row: QueryRow, s: "f" | "t", expected: SqlValue | undefined) => {
  if (expected === null) {
    if (
      [
        "id",
        "name_bytes",
        "name_length",
        "category",
        "terminal",
        "archived_at",
        "created_at",
        "updated_at",
        "row_version",
      ].some((key) => row[`${s}_${key}`] !== null)
    )
      return invalid();
    return null;
  }
  if (row[`${s}_id`] !== expected) return invalid();
  audit(row[`${s}_created_at`], row[`${s}_updated_at`], row[`${s}_archived_at`]);
  return {
    id: row[`${s}_id`],
    name: literal(row, `${s}_name`, 80),
    category: row[`${s}_category`],
    terminal: flag(row[`${s}_terminal`]),
    archivedAt: row[`${s}_archived_at`],
    rowVersion: integer(row[`${s}_row_version`]),
  };
};
const itemFrom = (row: QueryRow, scope: CompanyOutcomesScopeV1): CompanyOutcomeEventV1 => {
  if (row["job_id"] !== row["current_job_id"]) return invalid();
  if (
    row["company_id"] !== scope.companyId ||
    (!scope.includeArchivedJobs && row["job_archived_at"] !== null)
  )
    return stale();
  audit(row["job_created_at"], row["job_updated_at"], row["job_archived_at"]);
  if (row["application_id"] === null) {
    if (
      ["identity", "job_id", "archived_at", "created_at", "updated_at", "row_version"].some(
        (key) => row[`application_${key}`] !== null,
      )
    )
      return invalid();
  } else {
    if (
      row["application_identity"] !== row["application_id"] ||
      row["application_job_id"] !== row["job_id"]
    )
      return invalid();
    audit(
      row["application_created_at"],
      row["application_updated_at"],
      row["application_archived_at"],
    );
  }
  if (row["undo_id"] === null) {
    if (
      [
        "kind",
        "job_id",
        "application_id",
        "event_id",
        "from_id",
        "to_id",
        "created_at",
        "consumed_at",
        "row_version",
      ].some((key) => row[`undo_${key}`] !== null)
    )
      return invalid();
  } else if (
    row["undo_kind"] !== "status_change" ||
    row["undo_job_id"] !== row["job_id"] ||
    row["undo_application_id"] !== row["application_id"] ||
    row["undo_event_id"] !== row["id"] ||
    row["undo_from_id"] !== row["from_status_id"] ||
    row["undo_to_id"] !== row["to_status_id"]
  )
    return invalid();
  try {
    return parseCompanyOutcomeEventV1(
      {
        id: row["id"],
        occurredAt: row["occurred_at"],
        createdAt: row["created_at"],
        rowVersion: row["row_version"],
        currentJob: {
          id: row["current_job_id"],
          companyId: row["company_id"],
          title: literal(row, "job_title", 1024),
          archivedAt: row["job_archived_at"],
          rowVersion: row["job_row_version"],
        },
        application:
          row["application_id"] === null
            ? null
            : {
                id: row["application_identity"],
                archivedAt: row["application_archived_at"],
                rowVersion: row["application_row_version"],
              },
        fromStatus: stage(row, "f", row["from_status_id"]),
        toStatus: stage(row, "t", row["to_status_id"]),
        undo:
          row["undo_id"] === null
            ? null
            : {
                id: row["undo_id"],
                createdAt: row["undo_created_at"],
                consumedAt: row["undo_consumed_at"],
                rowVersion: row["undo_row_version"],
              },
      },
      scope,
    );
  } catch {
    return invalid();
  }
};
/** Local recorded transitions; no inferred employer decision or canonical mutation. */
export const createCompanyOutcomesRepository = (database: DatabasePort): CompanyOutcomesPortV1 =>
  Object.freeze<CompanyOutcomesPortV1>({
    listPage: async (input) => {
      const request = parseCompanyOutcomesRequestV1(input);
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
        if (company["id"] !== request.companyId) return invalid();
        audit(company["created_at"], company["updated_at"], company["archived_at"]);
        if (integer(company["row_version"]) !== request.expectedCompanyRowVersion) return stale();
        if (!request.includeArchivedCompany && company["archived_at"] !== null) return undefined;
        const after = request.after;
        if (after !== null) {
          const anchors = await session.query(
            sqlStatement(`SELECT ${projection} ${from} WHERE e.id=? LIMIT 2`, [after.id]),
          );
          if (anchors.length > 1) return invalid();
          const anchor = anchors[0];
          if (anchor === undefined) return stale();
          if (
            JSON.stringify(companyOutcomeCursorV1(request, itemFrom(anchor, request))) !==
            JSON.stringify(after)
          )
            return stale();
        }
        const parameters: SqlValue[] = [request.companyId];
        let continuation = "1=1";
        if (after !== null) {
          continuation = "(e.occurred_at < ? OR (e.occurred_at = ? AND e.id > ?))";
          parameters.push(after.occurredAt, after.occurredAt, after.id);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT ${projection} ${from} WHERE j.company_id=? AND ${request.includeArchivedJobs ? "1=1" : "j.archived_at IS NULL"} AND ${continuation} ORDER BY e.occurred_at DESC,e.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) return invalid();
        const items = rows.map((row) => itemFrom(row, request));
        let previous: {
          readonly id: string;
          readonly occurredAt: CompanyOutcomeEventV1["occurredAt"];
        } | null = after;
        const seen = new Set<string>(),
          undoIds = new Set<string>(),
          facts = new Map<string, string>();
        for (const item of items) {
          if (
            seen.has(item.id) ||
            (previous !== null && compareCompanyOutcomeKeysV1(previous, item) >= 0)
          )
            return invalid();
          seen.add(item.id);
          if (item.undo !== null) {
            if (undoIds.has(item.undo.id)) return invalid();
            undoIds.add(item.undo.id);
          }
          previous = item;
          for (const [kind, fact] of [
            ["job", item.currentJob],
            ["application", item.application],
            ["stage", item.fromStatus],
            ["stage", item.toStatus],
            ["undo", item.undo],
          ] as const) {
            if (fact === null) continue;
            const key = `${kind}:${fact.id}`,
              encoded = JSON.stringify(fact),
              prior = facts.get(key);
            if (prior !== undefined && prior !== encoded) return invalid();
            facts.set(key, encoded);
          }
        }
        const selected = items.slice(0, request.limit),
          hasMore = items.length > request.limit,
          last = selected.at(-1);
        return parseCompanyOutcomesPageV1(
          {
            specVersion: request.specVersion,
            expectedVaultId: request.expectedVaultId,
            companyId: request.companyId,
            expectedCompanyRowVersion: request.expectedCompanyRowVersion,
            includeArchivedCompany: request.includeArchivedCompany,
            includeArchivedJobs: request.includeArchivedJobs,
            items: selected,
            hasMore,
            nextCursor:
              hasMore && last !== undefined ? companyOutcomeCursorV1(request, last) : null,
          },
          request,
        );
      };
      return database.withReadSnapshot === undefined
        ? database.transaction(read)
        : database.withReadSnapshot(read);
    },
  });
