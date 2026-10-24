import {
  ContactFieldEvidenceError,
  contactFieldEvidenceCursorV1,
  parseContactFieldEvidencePageV1,
  parseContactFieldEvidenceRequestV1,
  type ContactFieldEvidenceItemV1,
  type ContactFieldEvidencePortV1,
  type ListContactFieldEvidenceInputV1,
} from "@coredrill/application";
import { instant } from "@coredrill/domain";
import { sqlStatement, type DatabasePort, type QueryRow, type SqlValue } from "./database-port.js";

const invalid = (): never => {
  throw new ContactFieldEvidenceError("invalid_state");
};
const stale = (): never => {
  throw new ContactFieldEvidenceError("stale");
};
const validated = (value: unknown, scope: ListContactFieldEvidenceInputV1) => {
  try {
    return parseContactFieldEvidencePageV1(value, scope);
  } catch {
    return invalid();
  }
};
const number = (value: SqlValue | undefined) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return invalid();
  return value;
};
const hash = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) return invalid();
  return value;
};
const literal = (
  row: QueryRow,
  field: string,
  maximum: number,
  nullable = false,
): string | null => {
  const bytes = row[field];
  const byteLength = row[`${field}_length`];
  if (bytes === null && byteLength === null && nullable) return null;
  if (
    typeof byteLength !== "number" ||
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > maximum
  )
    return invalid();
  const complete = bytes === null && byteLength === 0 ? new Uint8Array() : bytes;
  if (!(complete instanceof Uint8Array) || complete.byteLength !== byteLength) return invalid();
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(complete);
  } catch {
    return invalid();
  }
};
const from = `FROM contact_point_provenance l
  LEFT JOIN provenance p ON p.id = l.provenance_id
  LEFT JOIN source_snapshot s ON s.id = p.source_snapshot_id
  LEFT JOIN job_source js ON js.id = s.job_source_id
  LEFT JOIN job j ON j.id = js.job_id`;
// Only fixed reviewed identifiers occur in SQL; scope, cursor and limits are bound values.
const projection = `l.id, l.contact_id, l.field_name, l.value_hash, l.created_at, l.row_version,
  p.id AS provenance_id, p.row_version AS provenance_version,
  s.id AS snapshot_id, s.row_version AS snapshot_version,
  js.id AS job_source_id, js.row_version AS source_version, j.id AS job_id,
  p.extraction_method, length(CAST(p.source_pointer AS BLOB)) AS pointer_bytes_length,
  substr(CAST(p.source_pointer AS BLOB),1,8193) AS pointer_bytes,
  length(CAST(p.source_excerpt AS BLOB)) AS excerpt_bytes_length,
  substr(CAST(p.source_excerpt AS BLOB),1,16385) AS excerpt_bytes,
  p.confidence, p.captured_at, length(CAST(p.license_note AS BLOB)) AS license_bytes_length,
  substr(CAST(p.license_note AS BLOB),1,4097) AS license_bytes,
  s.extractor_id, s.extractor_version, s.content_hash, js.canonical_url, js.connector_id`;
const mapped = (row: QueryRow, currentValueHash: string | null) => ({
  id: row["id"],
  contactId: row["contact_id"],
  fieldName: row["field_name"],
  valueHash: row["value_hash"],
  matchesCurrentValue: hash(row["value_hash"]) === currentValueHash,
  createdAt: row["created_at"],
  rowVersion: row["row_version"],
  provenanceId: row["provenance_id"],
  provenanceRowVersion: row["provenance_version"],
  snapshotId: row["snapshot_id"],
  snapshotRowVersion: row["snapshot_version"],
  jobSourceId: row["job_source_id"],
  sourceRowVersion: row["source_version"],
  jobId: row["job_id"],
  method: row["extraction_method"],
  pointer: literal(row, "pointer_bytes", 8192),
  excerpt: literal(row, "excerpt_bytes", 16384, true),
  confidence: row["confidence"],
  capturedAt: row["captured_at"],
  licenseNote: literal(row, "license_bytes", 4096, true),
  extractorId: row["extractor_id"],
  extractorVersion: row["extractor_version"],
  snapshotHash: row["content_hash"],
  sourceUrl: row["canonical_url"],
  connectorId: row["connector_id"],
});
const valueColumns = {
  name: "name",
  role: "role",
  email: "email",
  phone: "phone",
  public_profile_url: "public_profile_url",
} as const;

/** Selected evidence only. No source body, method value, legal classification or canonical write. */
export const createContactFieldEvidenceRepository = (
  database: DatabasePort,
  hashValue: (value: string) => Promise<string>,
): ContactFieldEvidencePortV1 => {
  if (typeof hashValue !== "function")
    throw new TypeError("Contact evidence needs a local hasher.");
  return Object.freeze<ContactFieldEvidencePortV1>({
    listPage: async (untrusted) => {
      const request = parseContactFieldEvidenceRequestV1(untrusted);
      return database.transaction(async (session) => {
        const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
        if (roots.length > 1) return invalid();
        if (roots[0]?.["id"] !== request.expectedVaultId) return undefined;
        const selectedContact = sqlStatement(
          `SELECT row_version, archived_at,
           length(CAST(${valueColumns[request.fieldName]} AS BLOB)) AS current_bytes_length,
           substr(CAST(${valueColumns[request.fieldName]} AS BLOB),1,32769) AS current_bytes
           FROM contact WHERE id = ? LIMIT 2`,
          [request.contactId],
        );
        const contacts = await session.query(selectedContact);
        if (contacts.length > 1) return invalid();
        const contact = contacts[0];
        if (contact === undefined) return undefined;
        if (number(contact["row_version"]) !== request.expectedContactRowVersion) return stale();
        if (contact["archived_at"] !== null) {
          if (typeof contact["archived_at"] !== "string") return invalid();
          instant(contact["archived_at"]);
          if (!request.includeArchived) return undefined;
        }
        const currentValue = literal(contact, "current_bytes", 32768, true);
        const currentValueHash = currentValue === null ? null : hash(await hashValue(currentValue));
        const after = request.after;
        if (after !== null) {
          const anchors = await session.query(
            sqlStatement(
              `SELECT ${projection} ${from}
            WHERE l.id = ? AND l.contact_id = ? AND l.field_name = ? LIMIT 2`,
              [after.id, request.contactId, request.fieldName],
            ),
          );
          if (anchors.length > 1) return invalid();
          const row = anchors[0];
          if (row === undefined) return stale();
          // Parse a complete single-row projection before trusting its anchor facts.
          const page = validated(
            {
              specVersion: 1,
              vaultId: request.expectedVaultId,
              contactId: request.contactId,
              contactRowVersion: request.expectedContactRowVersion,
              fieldName: request.fieldName,
              includeArchived: request.includeArchived,
              currentValueHash,
              publicOrLicensedEligibility: "not_established",
              items: [mapped(row, currentValueHash)],
              hasMore: false,
              nextCursor: null,
            },
            { ...request, after: null },
          );
          const item = page.items[0];
          if (item === undefined) return invalid();
          const expected = contactFieldEvidenceCursorV1(request, item);
          if (
            Object.keys(expected).some(
              (k) => expected[k as keyof typeof expected] !== after[k as keyof typeof after],
            )
          )
            return stale();
        }
        const params: SqlValue[] = [request.contactId, request.fieldName];
        let continuation = "1 = 1";
        if (after !== null) {
          continuation = "(l.created_at < ? OR (l.created_at = ? AND l.id > ?))";
          params.push(after.createdAt, after.createdAt, after.id);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT ${projection} ${from}
          WHERE l.contact_id = ? AND l.field_name = ? AND ${continuation}
          ORDER BY l.created_at DESC, l.id ASC LIMIT ?`,
            [...params, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) return invalid();
        const hasMore = rows.length > request.limit;
        // Validate every fetched row, including the look-ahead, so corrupt chains cannot imply a valid continuation.
        const items: ContactFieldEvidenceItemV1[] = [];
        for (const row of rows) {
          const parsed = validated(
            {
              specVersion: 1,
              vaultId: request.expectedVaultId,
              contactId: request.contactId,
              contactRowVersion: request.expectedContactRowVersion,
              fieldName: request.fieldName,
              includeArchived: request.includeArchived,
              currentValueHash,
              publicOrLicensedEligibility: "not_established",
              items: [mapped(row, currentValueHash)],
              hasMore: false,
              nextCursor: null,
            },
            request,
          );
          const item = parsed.items[0];
          if (item === undefined) return invalid();
          items.push(item);
        }
        const visible = items.slice(0, request.limit);
        const last = visible.at(-1);
        // Recheck owner after the awaited hasher, within the same transaction.
        const finalRoots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
        if (finalRoots.length !== 1 || finalRoots[0]?.["id"] !== request.expectedVaultId)
          return invalid();
        const finalContacts = await session.query(selectedContact);
        const finalContact = finalContacts[0];
        if (
          finalContacts.length !== 1 ||
          finalContact?.["row_version"] !== request.expectedContactRowVersion ||
          finalContact["archived_at"] !== contact["archived_at"] ||
          literal(finalContact, "current_bytes", 32768, true) !== currentValue
        )
          return stale();
        return validated(
          {
            specVersion: 1,
            vaultId: request.expectedVaultId,
            contactId: request.contactId,
            contactRowVersion: request.expectedContactRowVersion,
            fieldName: request.fieldName,
            includeArchived: request.includeArchived,
            currentValueHash,
            publicOrLicensedEligibility: "not_established",
            items: visible,
            hasMore,
            nextCursor:
              hasMore && last !== undefined ? contactFieldEvidenceCursorV1(request, last) : null,
          },
          request,
        );
      });
    },
  });
};
