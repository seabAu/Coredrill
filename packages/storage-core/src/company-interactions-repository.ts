import {
  CompanyInteractionsError,
  CONTACT_HISTORY_MAX_SUMMARY_BYTES,
  CONTACT_HISTORY_PREVIEW_BYTES,
  companyInteractionReferenceV1,
  compareContactInteractions,
  decodeLiteralUtf8Chunk,
  parseCompanyInteractionV1,
  parseCompanyInteractionsPageV1,
  parseCompanyInteractionsRequestV1,
  parseCompanyInteractionSummaryPartV1,
  parseCompanyInteractionSummaryRequestV1,
  type CompanyInteractionReferenceV1,
  type CompanyInteractionsPortV1,
  type CompanyInteractionsScopeV1,
} from "@coredrill/application";
import { instant, type Instant } from "@coredrill/domain";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";

type Reader = Pick<DatabaseSession, "query">;
const invalid = (): never => {
  throw new CompanyInteractionsError("invalid_state");
};
const stale = (): never => {
  throw new CompanyInteractionsError("stale");
};
const integer = (
  value: SqlValue | undefined,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : invalid();
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
      const archive = instant(text(archived));
      if (archive < start || archive > end) return invalid();
    }
  } catch {
    return invalid();
  }
};
const owner = async (session: Reader, scope: CompanyInteractionsScopeV1) => {
  const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
  if (roots.length > 1) return invalid();
  if (roots[0]?.["id"] !== scope.expectedVaultId) return false;
  const companies = await session.query(
    sqlStatement(
      "SELECT id,row_version,archived_at,created_at,updated_at FROM company WHERE id=? LIMIT 2",
      [scope.companyId],
    ),
  );
  if (companies.length > 1) return invalid();
  const company = companies[0];
  if (company === undefined) return false;
  if (company["id"] !== scope.companyId) return invalid();
  audit(company["created_at"], company["updated_at"], company["archived_at"]);
  if (integer(company["row_version"]) !== scope.expectedCompanyRowVersion) return stale();
  return scope.includeArchivedCompany || company["archived_at"] === null;
};
const projection = `i.id,i.job_id,i.contact_id,i.type,i.direction,i.occurred_at,i.created_at,i.updated_at,i.row_version,
  j.id AS current_job_id,j.company_id,CAST(j.title AS BLOB) AS job_title_bytes,
  j.archived_at AS job_archived_at,j.created_at AS job_created_at,j.updated_at AS job_updated_at,j.row_version AS job_row_version`;
const from = "FROM interaction i LEFT JOIN job j ON j.id=i.job_id";
const validateRow = (row: QueryRow, scope: CompanyInteractionsScopeV1) => {
  if (row["job_id"] !== row["current_job_id"]) return invalid();
  if (
    row["company_id"] !== scope.companyId ||
    (!scope.includeArchivedJobs && row["job_archived_at"] !== null)
  )
    return stale();
  audit(row["created_at"], row["updated_at"]);
  audit(row["job_created_at"], row["job_updated_at"], row["job_archived_at"]);
  integer(row["row_version"]);
  integer(row["job_row_version"]);
};
const referenceRow = async (session: Reader, reference: CompanyInteractionReferenceV1) => {
  const rows = await session.query(
    sqlStatement(`SELECT ${projection} ${from} WHERE i.id=? LIMIT 2`, [reference.id]),
  );
  if (rows.length > 1) return invalid();
  const row = rows[0];
  if (row === undefined) return stale();
  validateRow(row, reference);
  if (
    row["id"] !== reference.id ||
    row["occurred_at"] !== reference.occurredAt ||
    row["row_version"] !== reference.rowVersion ||
    row["job_id"] !== reference.jobId ||
    row["job_row_version"] !== reference.jobRowVersion ||
    row["contact_id"] !== reference.contactId
  )
    return stale();
  return row;
};
const summaryBytes = (row: QueryRow) => {
  const byteLength = integer(row["summary_byte_length"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES);
  const bytes =
    byteLength === 0 && row["summary_bytes"] === null ? new Uint8Array() : row["summary_bytes"];
  if (!(bytes instanceof Uint8Array)) return invalid();
  return { byteLength, bytes: new Uint8Array(bytes) };
};

/** Current linked-job relationship only. No contact lookup, canonical writes or inferred employer history. */
export const createCompanyInteractionsRepository = (
  database: DatabasePort,
): CompanyInteractionsPortV1 => {
  const snapshot = <T>(read: (session: Reader) => Promise<T>) =>
    database.withReadSnapshot === undefined
      ? database.transaction(read)
      : database.withReadSnapshot(read);
  return Object.freeze<CompanyInteractionsPortV1>({
    listPage: async (input) => {
      const request = parseCompanyInteractionsRequestV1(input);
      return snapshot(async (session) => {
        if (!(await owner(session, request))) return undefined;
        if (request.after !== null) await referenceRow(session, request.after);
        const parameters: SqlValue[] = [CONTACT_HISTORY_PREVIEW_BYTES, request.companyId];
        let continuation = "1=1";
        if (request.after !== null) {
          continuation = "(i.occurred_at < ? OR (i.occurred_at = ? AND i.id > ?))";
          parameters.push(request.after.occurredAt, request.after.occurredAt, request.after.id);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT ${projection},
          length(CAST(i.summary AS BLOB)) AS summary_byte_length,
          substr(CAST(i.summary AS BLOB),1,?) AS summary_bytes ${from}
          WHERE j.company_id=? AND ${request.includeArchivedJobs ? "1=1" : "j.archived_at IS NULL"} AND ${continuation}
          ORDER BY i.occurred_at DESC,i.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) return invalid();
        const items = rows.map((row) => {
          validateRow(row, request);
          const summary = summaryBytes(row);
          let preview: ReturnType<typeof decodeLiteralUtf8Chunk>;
          try {
            preview = decodeLiteralUtf8Chunk(
              summary.bytes,
              summary.byteLength,
              0,
              CONTACT_HISTORY_PREVIEW_BYTES,
            );
          } catch {
            return invalid();
          }
          try {
            return parseCompanyInteractionV1(
              {
                id: row["id"],
                contactId: row["contact_id"],
                currentJob: {
                  id: row["current_job_id"],
                  companyId: row["company_id"],
                  title: literal(row["job_title_bytes"]),
                  archivedAt: row["job_archived_at"],
                  rowVersion: row["job_row_version"],
                },
                type: row["type"],
                direction: row["direction"],
                occurredAt: row["occurred_at"],
                createdAt: row["created_at"],
                rowVersion: row["row_version"],
                summaryPreview: preview.text,
                summaryByteLength: summary.byteLength,
                summaryTruncated: preview.hasMore,
              },
              request,
            );
          } catch {
            return invalid();
          }
        });
        const seen = new Set<string>(),
          jobs = new Map<string, string>();
        let previous: { readonly occurredAt: Instant; readonly id: string } | null = request.after;
        for (const item of items) {
          const serialized = JSON.stringify(item.currentJob),
            priorJob = jobs.get(item.currentJob.id);
          if (
            seen.has(item.id) ||
            (previous !== null && compareContactInteractions(previous, item) >= 0) ||
            (priorJob !== undefined && priorJob !== serialized)
          )
            return invalid();
          seen.add(item.id);
          jobs.set(item.currentJob.id, serialized);
          previous = item;
        }
        const hasMore = items.length > request.limit,
          selected = items.slice(0, request.limit),
          last = selected.at(-1);
        return parseCompanyInteractionsPageV1(
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
              hasMore && last !== undefined ? companyInteractionReferenceV1(request, last) : null,
          },
          request,
        );
      });
    },
    readSummaryPart: async (input) => {
      const request = parseCompanyInteractionSummaryRequestV1(input);
      return snapshot(async (session) => {
        if (!(await owner(session, request.reference))) return undefined;
        await referenceRow(session, request.reference);
        const rows = await session.query(
          sqlStatement(
            `SELECT length(CAST(summary AS BLOB)) AS summary_byte_length,
          substr(CAST(summary AS BLOB),?,?) AS summary_bytes FROM interaction WHERE id=? LIMIT 2`,
            [request.byteOffset + 1, request.limitBytes, request.reference.id],
          ),
        );
        if (rows.length > 1) return invalid();
        const row = rows[0];
        if (row === undefined) return stale();
        const summary = summaryBytes(row);
        if (summary.byteLength !== request.summaryByteLength) return stale();
        const result = Object.freeze({
          specVersion: 1,
          reference: request.reference,
          summaryByteLength: summary.byteLength,
          byteOffset: request.byteOffset,
          bytes: summary.bytes,
        });
        try {
          parseCompanyInteractionSummaryPartV1(result, request);
        } catch {
          return invalid();
        }
        return result;
      });
    },
  });
};
