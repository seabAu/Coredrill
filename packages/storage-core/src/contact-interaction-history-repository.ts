import {
  CONTACT_HISTORY_MAX_SUMMARY_BYTES,
  CONTACT_HISTORY_PREVIEW_BYTES,
  ContactInteractionHistoryError,
  decodeLiteralUtf8Chunk,
  parseContactInteractionsPageV1,
  parseContactInteractionsRequestV1,
  parseContactInteractionSummaryPartV1,
  parseContactInteractionSummaryRequestV1,
  type ContactInteractionCursorV1,
  type ContactInteractionHistoryPortV1,
  type ContactInteractionSummaryPortV1,
  type ListContactInteractionsPortInputV1,
  type ReadContactInteractionSummaryRequestV1,
} from "@coredrill/application";
import { instant } from "@coredrill/domain";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";

const invalid = (): never => {
  throw new ContactInteractionHistoryError("invalid_state");
};
const stale = (): never => {
  throw new ContactInteractionHistoryError("cursor_invalidated");
};
const integer = (
  value: SqlValue | undefined,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    return invalid();
  return value;
};
const text = (value: SqlValue | undefined): string =>
  typeof value === "string" ? value : invalid();
const bytesFrom = (row: QueryRow): { readonly byteLength: number; readonly bytes: Uint8Array } => {
  const byteLength = integer(row["summary_byte_length"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES);
  const bytes =
    byteLength === 0 && row["summary_bytes"] === null ? new Uint8Array() : row["summary_bytes"];
  if (!(bytes instanceof Uint8Array)) return invalid();
  return { byteLength, bytes: new Uint8Array(bytes) };
};
interface OwnerScope {
  readonly expectedVaultId: string;
  readonly contactId: string;
  readonly includeArchived: boolean;
}
const owner = async (session: DatabaseSession, scope: OwnerScope, expectedVersion?: number) => {
  const vaults = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
  if (vaults.length > 1) return invalid();
  if (vaults[0]?.["id"] !== scope.expectedVaultId) return undefined;
  const contacts = await session.query(
    sqlStatement("SELECT row_version, archived_at FROM contact WHERE id = ? LIMIT 2", [
      scope.contactId,
    ]),
  );
  if (contacts.length > 1) return invalid();
  const contact = contacts[0];
  if (contact === undefined) return undefined;
  const rowVersion = integer(contact["row_version"]);
  if (expectedVersion !== undefined && rowVersion !== expectedVersion) return stale();
  if (contact["archived_at"] !== null) {
    try {
      instant(text(contact["archived_at"]));
    } catch {
      return invalid();
    }
    if (!scope.includeArchived) return undefined;
  }
  return Object.freeze({ rowVersion });
};

// The LEFT JOIN preserves a corrupt dangling job as an invalid row, never false empty history.
const projection = `i.id, i.contact_id, i.job_id, i.type, i.direction, i.occurred_at,
  i.created_at, i.row_version, j.id AS current_job_id, j.title AS current_job_title,
  j.archived_at AS job_archived_at, j.row_version AS job_row_version`;
const from = "FROM interaction i LEFT JOIN job j ON j.id = i.job_id";
const validateReference = (row: QueryRow, reference: ContactInteractionCursorV1): void => {
  if (row["current_job_id"] !== row["job_id"]) return invalid();
  if (
    row["contact_id"] !== reference.contactId ||
    row["id"] !== reference.id ||
    row["occurred_at"] !== reference.occurredAt ||
    row["row_version"] !== reference.rowVersion ||
    row["job_id"] !== reference.jobId ||
    row["job_row_version"] !== reference.jobRowVersion ||
    (!reference.includeArchived && row["job_archived_at"] !== null)
  )
    return stale();
};
const referenceRow = async (session: DatabaseSession, reference: ContactInteractionCursorV1) => {
  const rows = await session.query(
    sqlStatement(`SELECT ${projection} ${from} WHERE i.id = ? AND i.contact_id = ? LIMIT 2`, [
      reference.id,
      reference.contactId,
    ]),
  );
  if (rows.length > 1) return invalid();
  const row = rows[0];
  if (row !== undefined) validateReference(row, reference);
  return row;
};

/** No writes or complete summary bodies; all identity, paging and byte values are bound. */
export const createContactInteractionHistoryRepository = (
  database: DatabasePort,
): ContactInteractionHistoryPortV1 & ContactInteractionSummaryPortV1 =>
  Object.freeze({
    listPage: async (untrusted: ListContactInteractionsPortInputV1) => {
      let request: ListContactInteractionsPortInputV1;
      try {
        request = parseContactInteractionsRequestV1(untrusted);
      } catch {
        return invalid();
      }
      return database.transaction(async (session) => {
        const contact = await owner(session, request, request.after?.contactRowVersion);
        if (contact === undefined) return undefined;
        const after = request.after;
        if (after !== null && (await referenceRow(session, after)) === undefined) return stale();
        const parameters: SqlValue[] = [CONTACT_HISTORY_PREVIEW_BYTES, request.contactId];
        let continuation = "1 = 1";
        if (after !== null) {
          continuation = "(i.occurred_at < ? OR (i.occurred_at = ? AND i.id > ?))";
          parameters.push(after.occurredAt, after.occurredAt, after.id);
        }
        const archive = request.includeArchived ? "1 = 1" : "j.archived_at IS NULL";
        const rows = await session.query(
          sqlStatement(
            `SELECT ${projection}, length(CAST(i.summary AS BLOB)) AS summary_byte_length,
          substr(CAST(i.summary AS BLOB), 1, ?) AS summary_bytes ${from}
          WHERE i.contact_id = ? AND ${archive} AND ${continuation}
          ORDER BY i.occurred_at DESC, i.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) return invalid();
        const items = rows.slice(0, request.limit).map((row) => {
          if (row["current_job_id"] !== row["job_id"]) return invalid();
          const summary = bytesFrom(row);
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
          return {
            id: row["id"],
            contactId: row["contact_id"],
            currentJob: {
              id: row["current_job_id"],
              title: row["current_job_title"],
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
          };
        });
        const last = items.at(-1);
        const hasMore = rows.length > request.limit;
        const result = {
          specVersion: 1,
          vaultId: request.expectedVaultId,
          contactId: request.contactId,
          contactRowVersion: contact.rowVersion,
          includeArchived: request.includeArchived,
          items,
          hasMore,
          nextCursor:
            hasMore && last !== undefined
              ? {
                  specVersion: 1,
                  vaultId: request.expectedVaultId,
                  contactId: request.contactId,
                  includeArchived: request.includeArchived,
                  contactRowVersion: contact.rowVersion,
                  occurredAt: last.occurredAt,
                  id: last.id,
                  rowVersion: last.rowVersion,
                  jobId: last.currentJob.id,
                  jobRowVersion: last.currentJob.rowVersion,
                }
              : null,
        };
        try {
          return parseContactInteractionsPageV1(result, request);
        } catch {
          return invalid();
        }
      });
    },
    readSummaryPart: async (untrusted: ReadContactInteractionSummaryRequestV1) => {
      let request: ReadContactInteractionSummaryRequestV1;
      try {
        request = parseContactInteractionSummaryRequestV1(untrusted);
      } catch {
        return invalid();
      }
      return database.transaction(async (session) => {
        const reference = request.reference;
        const contact = await owner(
          session,
          {
            expectedVaultId: reference.vaultId,
            contactId: reference.contactId,
            includeArchived: reference.includeArchived,
          },
          reference.contactRowVersion,
        );
        if (contact === undefined) return undefined;
        const rows = await session.query(
          sqlStatement(
            `SELECT ${projection}, length(CAST(i.summary AS BLOB)) AS summary_byte_length,
          substr(CAST(i.summary AS BLOB), ?, ?) AS summary_bytes ${from}
          WHERE i.id = ? AND i.contact_id = ? LIMIT 2`,
            [request.byteOffset + 1, request.limitBytes, reference.id, reference.contactId],
          ),
        );
        if (rows.length > 1) return invalid();
        const row = rows[0];
        if (row === undefined) return undefined;
        validateReference(row, reference);
        const summary = bytesFrom(row);
        if (summary.byteLength !== request.summaryByteLength) return stale();
        const first = summary.bytes[0];
        if (request.byteOffset > 0 && first !== undefined && (first & 0xc0) === 0x80)
          return stale();
        const result = Object.freeze({
          specVersion: 1,
          reference,
          summaryByteLength: summary.byteLength,
          byteOffset: request.byteOffset,
          bytes: summary.bytes,
        });
        try {
          parseContactInteractionSummaryPartV1(result, request);
        } catch {
          return invalid();
        }
        return result;
      });
    },
  });
