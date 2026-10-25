import {
  CONTACT_HISTORY_MAX_SUMMARY_BYTES,
  CONTACT_HISTORY_PREVIEW_BYTES,
  NetworkInteractionHistoryError,
  decodeLiteralUtf8Chunk,
  networkInteractionReferenceV1,
  parseNetworkInteractionReferenceV1,
  parseNetworkInteractionV1,
  parseNetworkInteractionsPageV1,
  parseNetworkInteractionsRequestV1,
  parseNetworkInteractionSummaryPartV1,
  parseNetworkInteractionSummaryRequestV1,
  validateNetworkInteractionSequenceV1,
  type NetworkInteractionHistoryPortV1,
  type NetworkInteractionReferenceV1,
  type NetworkInteractionScopeV1,
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
  throw new NetworkInteractionHistoryError("invalid_state");
};
const stale = (): never => {
  throw new NetworkInteractionHistoryError("stale");
};
const integer = (value: SqlValue | undefined, min = 1, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : invalid();
const text = (value: SqlValue | undefined): string =>
  typeof value === "string" ? value : invalid();
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
const projection = `i.id,i.job_id,i.contact_id,i.direction,i.occurred_at,i.created_at,i.updated_at,i.row_version,${bounded("i.type", "interaction_type", 64)},
 j.id AS current_job_id,j.company_id,${bounded("j.title", "job_title", 1024)},j.archived_at AS job_archived_at,j.created_at AS job_created_at,j.updated_at AS job_updated_at,j.row_version AS job_row_version,
 c.id AS company_identity,${bounded("c.canonical_name", "company_name", 512)},c.archived_at AS company_archived_at,c.created_at AS company_created_at,c.updated_at AS company_updated_at,c.row_version AS company_row_version`;
const from =
  "FROM interaction i LEFT JOIN job j ON j.id=i.job_id LEFT JOIN company c ON c.id=j.company_id";
const metadata = (row: QueryRow, owner: NetworkInteractionScopeV1) => {
  if (row["job_id"] !== row["current_job_id"]) return invalid();
  if (!owner.includeArchivedJobs && row["job_archived_at"] !== null) return stale();
  audit(row["created_at"], row["updated_at"]);
  audit(row["job_created_at"], row["job_updated_at"], row["job_archived_at"]);
  if (row["company_id"] === null) {
    if (
      [
        "identity",
        "name_bytes",
        "name_length",
        "archived_at",
        "created_at",
        "updated_at",
        "row_version",
      ].some((key) => row[`company_${key}`] !== null)
    )
      return invalid();
  } else {
    if (row["company_identity"] !== row["company_id"]) return invalid();
    audit(row["company_created_at"], row["company_updated_at"], row["company_archived_at"]);
  }
  const direction = row["direction"],
    type = literal(row, "interaction_type", 64);
  if (
    type.length === 0 ||
    (direction !== "inbound" &&
      direction !== "outbound" &&
      direction !== "mutual" &&
      direction !== "unknown")
  )
    return invalid();
  try {
    const reference = parseNetworkInteractionReferenceV1({
      specVersion: owner.specVersion,
      expectedVaultId: owner.expectedVaultId,
      includeArchivedJobs: owner.includeArchivedJobs,
      id: row["id"],
      occurredAt: row["occurred_at"],
      rowVersion: row["row_version"],
      jobId: row["job_id"],
      jobRowVersion: row["job_row_version"],
      companyId: row["company_id"],
      companyRowVersion: row["company_row_version"],
      contactId: row["contact_id"],
    });
    return {
      reference,
      value: {
        id: reference.id,
        contactId: reference.contactId,
        occurredAt: reference.occurredAt,
        createdAt: instant(text(row["created_at"])),
        rowVersion: reference.rowVersion,
        type,
        direction,
        currentJob: {
          id: reference.jobId,
          title: literal(row, "job_title", 1024),
          archivedAt:
            row["job_archived_at"] === null ? null : instant(text(row["job_archived_at"])),
          rowVersion: reference.jobRowVersion,
          company:
            reference.companyId === null
              ? null
              : {
                  id: reference.companyId,
                  name: literal(row, "company_name", 512),
                  archivedAt:
                    row["company_archived_at"] === null
                      ? null
                      : instant(text(row["company_archived_at"])),
                  rowVersion: integer(row["company_row_version"]),
                },
        },
      },
    };
  } catch {
    return invalid();
  }
};
const hasOwner = async (session: Reader, owner: NetworkInteractionScopeV1) => {
  const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
  if (roots.length > 1) return invalid();
  return roots[0]?.["id"] === owner.expectedVaultId;
};
const referenceRow = async (session: Reader, reference: NetworkInteractionReferenceV1) => {
  const rows = await session.query(
    sqlStatement(`SELECT ${projection} ${from} WHERE i.id=? LIMIT 2`, [reference.id]),
  );
  if (rows.length > 1) return invalid();
  const row = rows[0];
  if (row === undefined) return stale();
  if (JSON.stringify(metadata(row, reference).reference) !== JSON.stringify(reference))
    return stale();
};
const summary = (row: QueryRow) => {
  const byteLength = integer(row["summary_byte_length"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES),
    raw = row["summary_bytes"],
    bytes = byteLength === 0 && raw === null ? new Uint8Array() : raw;
  if (!(bytes instanceof Uint8Array)) return invalid();
  return { byteLength, bytes: new Uint8Array(bytes) };
};
/** Vault-wide recorded interactions; read-only metadata plus deliberate bounded literal bodies. */
export const createNetworkInteractionHistoryRepository = (
  database: DatabasePort,
): NetworkInteractionHistoryPortV1 => {
  const snapshot = <T>(read: (session: Reader) => Promise<T>) =>
    database.withReadSnapshot === undefined
      ? database.transaction(read)
      : database.withReadSnapshot(read);
  return Object.freeze<NetworkInteractionHistoryPortV1>({
    listPage: async (input) => {
      const request = parseNetworkInteractionsRequestV1(input);
      return snapshot(async (session) => {
        if (!(await hasOwner(session, request))) return undefined;
        if (request.after !== null) await referenceRow(session, request.after);
        const parameters: SqlValue[] = [CONTACT_HISTORY_PREVIEW_BYTES];
        let continuation = "1=1";
        if (request.after !== null) {
          continuation = "(i.occurred_at < ? OR (i.occurred_at = ? AND i.id > ?))";
          parameters.push(request.after.occurredAt, request.after.occurredAt, request.after.id);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT ${projection},length(CAST(i.summary AS BLOB)) AS summary_byte_length,substr(CAST(i.summary AS BLOB),1,?) AS summary_bytes ${from}
          WHERE ${request.includeArchivedJobs ? "1=1" : "j.archived_at IS NULL"} AND ${continuation} ORDER BY i.occurred_at DESC,i.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) return invalid();
        const items = rows.map((row) => {
          const base = metadata(row, request).value,
            part = summary(row);
          try {
            const preview = decodeLiteralUtf8Chunk(
              part.bytes,
              part.byteLength,
              0,
              CONTACT_HISTORY_PREVIEW_BYTES,
            );
            return parseNetworkInteractionV1(
              {
                ...base,
                summaryPreview: preview.text,
                summaryByteLength: part.byteLength,
                summaryTruncated: preview.hasMore,
              },
              request,
            );
          } catch {
            return invalid();
          }
        });
        try {
          validateNetworkInteractionSequenceV1(items, request.after);
        } catch {
          return invalid();
        }
        const selected = items.slice(0, request.limit),
          hasMore = items.length > request.limit,
          last = selected.at(-1);
        return parseNetworkInteractionsPageV1(
          {
            specVersion: request.specVersion,
            expectedVaultId: request.expectedVaultId,
            includeArchivedJobs: request.includeArchivedJobs,
            items: selected,
            hasMore,
            nextCursor:
              hasMore && last !== undefined ? networkInteractionReferenceV1(request, last) : null,
          },
          request,
        );
      });
    },
    readSummaryPart: async (input) => {
      const request = parseNetworkInteractionSummaryRequestV1(input);
      return snapshot(async (session) => {
        if (!(await hasOwner(session, request.reference))) return undefined;
        await referenceRow(session, request.reference);
        const rows = await session.query(
          sqlStatement(
            "SELECT length(CAST(summary AS BLOB)) AS summary_byte_length,substr(CAST(summary AS BLOB),?,?) AS summary_bytes FROM interaction WHERE id=? LIMIT 2",
            [request.byteOffset + 1, request.limitBytes, request.reference.id],
          ),
        );
        if (rows.length > 1) return invalid();
        const row = rows[0];
        if (row === undefined) return stale();
        const part = summary(row);
        if (part.byteLength !== request.summaryByteLength) return stale();
        const result = Object.freeze({
          specVersion: 1,
          reference: request.reference,
          summaryByteLength: part.byteLength,
          byteOffset: request.byteOffset,
          bytes: part.bytes,
        });
        try {
          parseNetworkInteractionSummaryPartV1(result, request);
        } catch {
          return invalid();
        }
        return result;
      });
    },
  });
};
