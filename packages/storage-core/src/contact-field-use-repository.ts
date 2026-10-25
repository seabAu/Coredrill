import {
  ContactFieldUseStorageError,
  assessContactFieldUseV1,
  parseContactUseRecordRequestV1,
  parseContactUseControlRequestV1,
  parseReadContactFieldUseRequestV1,
  parseContactUseRecordReceiptV1,
  parseContactUseControlReceiptV1,
  parseContactFieldUseStateV1,
  parseContactUseInspectionV1,
  contactUseRecordIdV1,
  type ContactFieldUsePortV1,
  type ContactUseRecordRequestV1,
} from "@coredrill/application";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";
import { PORTABLE_DATA_EXPORT_SOURCE_SCHEMA_VERSION } from "./portable-data-export.js";

type Reader = Pick<DatabaseSession, "query">;
type Request = ContactUseRecordRequestV1;
type Table = "contact_source_snapshot" | "contact_source_use_policy" | "contact_field_use_review";
const tables = {
  source: "contact_source_snapshot",
  policy: "contact_source_use_policy",
  review: "contact_field_use_review",
} as const;
const columns = {
  contact_source_snapshot:
    "id vault_id operation_id acquisition source_class source_url captured_at raw_text content_hash created_at row_version",
  contact_source_use_policy:
    "id vault_id operation_id revision status source_snapshot_id source_snapshot_hash source_url source_class field_name rights_basis purpose usage terms_snapshot_id terms_snapshot_hash terms_start_byte terms_end_byte terms_excerpt permission_kind acknowledgement reviewed_at review_due_at disabled_at row_version",
  contact_field_use_review:
    "id vault_id contact_id operation_id field_name field_revision contact_row_version value_hash source_snapshot_id source_snapshot_hash source_start_byte source_end_byte source_excerpt policy_id policy_revision purpose purpose_note acknowledgement reviewed_at review_due_at expires_at revoked_at row_version",
} as const;
const literalLimits: Readonly<Record<string, number>> = {
  raw_text: 4194304,
  terms_excerpt: 16384,
  source_excerpt: 16384,
  purpose_note: 2000,
};
const invalid = (): never => {
  throw new ContactFieldUseStorageError("invalid_state");
};
const stale = (): never => {
  throw new ContactFieldUseStorageError("stale");
};
const missing = (): never => {
  throw new ContactFieldUseStorageError("not_found");
};
const same = (a: object, b: object) => {
  const left = Object.entries(a),
    right = Object.entries(b);
  return (
    left.length === right.length &&
    left.every(
      ([key, value]) => Object.hasOwn(b, key) && (b as Record<string, unknown>)[key] === value,
    )
  );
};
const decode = (value: SqlValue | undefined, length: SqlValue | undefined, max: number): string => {
  if (!(value instanceof Uint8Array) || value.length !== length || value.length > max)
    return invalid();
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
  } catch {
    return invalid();
  }
};
const rowAt = async (s: Reader, table: Table, id: string): Promise<QueryRow | undefined> => {
  const names = columns[table].split(" ");
  const selection = names
    .map((c) =>
      literalLimits[c] === undefined
        ? c
        : `CAST(${c} AS BLOB) AS ${c}_bytes,length(CAST(${c} AS BLOB)) AS ${c}_length`,
    )
    .join(",");
  const rows = await s.query(
    sqlStatement(`SELECT ${selection} FROM ${table} WHERE id=? LIMIT 2`, [id]),
  );
  if (rows.length > 1) return invalid();
  const row = rows[0];
  if (!row) return undefined;
  return Object.freeze(
    Object.fromEntries(
      names.map((c) => {
        const limit = literalLimits[c];
        const value =
          limit === undefined ? row[c] : decode(row[`${c}_bytes`], row[`${c}_length`], limit);
        if (value === undefined) return invalid();
        return [c, value];
      }),
    ),
  );
};
const vault = async (s: Reader, expected: string, at?: string) => {
  const version = await s.query(sqlStatement("PRAGMA user_version"));
  if (version[0]?.["user_version"] !== PORTABLE_DATA_EXPORT_SOURCE_SCHEMA_VERSION) return invalid();
  const roots = await s.query(sqlStatement("SELECT id,created_at FROM vault LIMIT 2"));
  if (roots.length > 1) return invalid();
  if (roots[0]?.["id"] !== expected) return missing();
  if (
    at !== undefined &&
    (typeof roots[0]["created_at"] !== "string" || roots[0]["created_at"] > at)
  )
    return stale();
};
const exactSpan = (body: string, start: number, end: number, excerpt: string) => {
  const bytes = new TextEncoder().encode(body);
  if (end > bytes.length) return false;
  try {
    return (
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.slice(start, end)) ===
      excerpt
    );
  } catch {
    return false;
  }
};
const sourceRow = (r: Extract<Request, { kind: "source" }>): QueryRow => ({
  id: r.sourceSnapshotId,
  vault_id: r.expectedVaultId,
  operation_id: r.operationId,
  acquisition: "user_supplied",
  source_class: r.sourceClass,
  source_url: r.sourceUrl,
  captured_at: r.capturedAt,
  raw_text: r.literalText,
  content_hash: r.sourceHash,
  created_at: r.recordedAt,
  row_version: 1,
});
const rights = (source: Extract<Request, { kind: "source" }>) =>
  source.sourceClass === "licensed_material" ? "licensed" : "public";
const permission = (source: Extract<Request, { kind: "source" }>) =>
  source.sourceClass === "licensed_material"
    ? "documented_license_grant"
    : source.sourceClass === "public_dataset"
      ? "compatible_public_reuse"
      : "explicit_public_job_search_contact";
const policyRow = (
  r: Extract<Request, { kind: "policy" }>,
  source: Extract<Request, { kind: "source" }>,
  changed: string | null = null,
): QueryRow => ({
  id: r.policyId,
  vault_id: r.expectedVaultId,
  operation_id: r.operationId,
  revision: 1,
  status: changed === null ? "enabled" : "disabled",
  source_snapshot_id: r.sourceSnapshotId,
  source_snapshot_hash: r.expectedSourceHash,
  source_url: source.sourceUrl,
  source_class: source.sourceClass,
  field_name: r.fieldName,
  rights_basis: rights(source),
  purpose: r.purpose,
  usage: "display_and_manual_use",
  terms_snapshot_id: r.termsSnapshotId,
  terms_snapshot_hash: r.expectedTermsHash,
  terms_start_byte: r.termsStartByte,
  terms_end_byte: r.termsEndByte,
  terms_excerpt: r.termsExcerpt,
  permission_kind: r.permissionKind,
  acknowledgement: r.acknowledgement,
  reviewed_at: r.recordedAt,
  review_due_at: r.reviewDueAt,
  disabled_at: changed,
  row_version: changed === null ? 1 : 2,
});
const reviewRow = (
  r: Extract<Request, { kind: "review" }>,
  revision: number,
  changed: string | null = null,
): QueryRow => ({
  id: r.reviewId,
  vault_id: r.expectedVaultId,
  contact_id: r.contactId,
  operation_id: r.operationId,
  field_name: r.fieldName,
  field_revision: revision,
  contact_row_version: r.expectedContactRowVersion,
  value_hash: r.expectedValueHash,
  source_snapshot_id: r.sourceSnapshotId,
  source_snapshot_hash: r.expectedSourceHash,
  source_start_byte: r.sourceStartByte,
  source_end_byte: r.sourceEndByte,
  source_excerpt: r.sourceExcerpt,
  policy_id: r.policyId,
  policy_revision: r.policyRevision,
  purpose: r.purpose,
  purpose_note: r.purposeNote,
  acknowledgement: r.acknowledgement,
  reviewed_at: r.recordedAt,
  review_due_at: r.reviewDueAt,
  expires_at: r.expiresAt,
  revoked_at: changed,
  row_version: changed === null ? 1 : 2,
});
const changeTime = (row: QueryRow, key: string): string | null => {
  const value = row[key];
  if (value !== null && typeof value !== "string") return invalid();
  if (
    row["row_version"] !== (value === null ? 1 : 2) ||
    (value !== null && (typeof row["reviewed_at"] !== "string" || value < row["reviewed_at"]))
  )
    return invalid();
  return value;
};
const latest = async (s: Reader, contact: string, field: string) =>
  (
    await s.query(
      sqlStatement(
        "SELECT id,field_revision,reviewed_at,revoked_at FROM contact_field_use_review WHERE contact_id=? AND field_name=? ORDER BY field_revision DESC LIMIT 1",
        [contact, field],
      ),
    )
  )[0];
const current = async (
  s: Reader,
  id: string,
  version: number,
  includeArchived: boolean,
  field?: string,
) => {
  // Only fields which have already passed the strict request parser reach this identifier.
  if (
    field !== undefined &&
    !["name", "role", "email", "phone", "public_profile_url"].includes(field)
  )
    return invalid();
  const extra =
    field === undefined
      ? ""
      : `,CAST(${field} AS BLOB) AS value_bytes,length(CAST(${field} AS BLOB)) AS value_length`;
  const rows = await s.query(
    sqlStatement(
      `SELECT id,row_version,archived_at,updated_at${extra} FROM contact WHERE id=? LIMIT 2`,
      [id],
    ),
  );
  if (rows.length > 1) return invalid();
  const row = rows[0];
  if (!row || (!includeArchived && row["archived_at"] !== null)) return missing();
  if (row["row_version"] !== version) return stale();
  const value =
    field === undefined || row["value_bytes"] === null
      ? null
      : decode(row["value_bytes"], row["value_length"], 1048576);
  return { row, value };
};

/** Local-only evidence writes. Every acknowledgement is checked before the transaction commits. */
export const createContactFieldUseRepository = (
  database: DatabasePort,
  hashValue: (text: string) => Promise<string>,
): ContactFieldUsePortV1 => {
  const digest = async (value: string) => {
    const hash = await hashValue(value);
    if (!/^[a-f0-9]{64}$/u.test(hash)) return invalid();
    return hash;
  };
  const sourceAt = async (s: Reader, id: string, vaultId: string) => {
    const row = await rowAt(s, tables.source, id);
    if (!row) return missing();
    let parsed: Request;
    try {
      parsed = parseContactUseRecordRequestV1({
        specVersion: 1,
        kind: "source",
        expectedVaultId: row["vault_id"],
        sourceSnapshotId: row["id"],
        sourceClass: row["source_class"],
        sourceUrl: row["source_url"],
        capturedAt: row["captured_at"],
        literalText: row["raw_text"],
        sourceHash: row["content_hash"],
        operationId: row["operation_id"],
        recordedAt: row["created_at"],
      });
    } catch {
      return invalid();
    }
    if (
      parsed.kind !== "source" ||
      parsed.expectedVaultId !== vaultId ||
      !same(row, sourceRow(parsed)) ||
      (await digest(parsed.literalText)) !== parsed.sourceHash
    )
      return invalid();
    return parsed;
  };
  const policyAt = async (s: Reader, id: string, vaultId: string) => {
    const row = await rowAt(s, tables.policy, id);
    if (!row) return missing();
    let r: Request;
    try {
      r = parseContactUseRecordRequestV1({
        specVersion: 1,
        kind: "policy",
        expectedVaultId: row["vault_id"],
        policyId: row["id"],
        sourceSnapshotId: row["source_snapshot_id"],
        expectedSourceHash: row["source_snapshot_hash"],
        fieldName: row["field_name"],
        termsSnapshotId: row["terms_snapshot_id"],
        expectedTermsHash: row["terms_snapshot_hash"],
        termsStartByte: row["terms_start_byte"],
        termsEndByte: row["terms_end_byte"],
        termsExcerpt: row["terms_excerpt"],
        permissionKind: row["permission_kind"],
        purpose: row["purpose"],
        reviewDueAt: row["review_due_at"],
        acknowledgement: row["acknowledgement"],
        operationId: row["operation_id"],
        recordedAt: row["reviewed_at"],
      });
    } catch {
      return invalid();
    }
    if (r.kind !== "policy" || r.expectedVaultId !== vaultId) return invalid();
    const source = await sourceAt(s, r.sourceSnapshotId, vaultId),
      terms =
        r.termsSnapshotId === r.sourceSnapshotId
          ? source
          : await sourceAt(s, r.termsSnapshotId, vaultId);
    const changed = changeTime(row, "disabled_at");
    if (
      !same(row, policyRow(r, source, changed)) ||
      r.expectedSourceHash !== source.sourceHash ||
      r.expectedTermsHash !== terms.sourceHash ||
      permission(source) !== r.permissionKind ||
      source.recordedAt > r.recordedAt ||
      terms.recordedAt > r.recordedAt ||
      !exactSpan(terms.literalText, r.termsStartByte, r.termsEndByte, r.termsExcerpt)
    )
      return invalid();
    return { r, row, source, changed };
  };
  const reviewAt = async (s: Reader, id: string, vaultId: string) => {
    const row = await rowAt(s, tables.review, id);
    if (!row) return missing();
    const revision = row["field_revision"];
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1)
      return invalid();
    const previous =
      revision === 1
        ? null
        : (
            await s.query(
              sqlStatement(
                "SELECT id FROM contact_field_use_review WHERE contact_id=? AND field_name=? AND field_revision=? LIMIT 2",
                [row["contact_id"] ?? null, row["field_name"] ?? null, revision - 1],
              ),
            )
          )[0]?.["id"];
    let r: Request;
    try {
      r = parseContactUseRecordRequestV1({
        specVersion: 1,
        kind: "review",
        expectedVaultId: row["vault_id"],
        reviewId: row["id"],
        contactId: row["contact_id"],
        expectedContactRowVersion: row["contact_row_version"],
        expectedLatestReviewId: previous,
        fieldName: row["field_name"],
        expectedValueHash: row["value_hash"],
        sourceSnapshotId: row["source_snapshot_id"],
        expectedSourceHash: row["source_snapshot_hash"],
        sourceStartByte: row["source_start_byte"],
        sourceEndByte: row["source_end_byte"],
        sourceExcerpt: row["source_excerpt"],
        policyId: row["policy_id"],
        policyRevision: row["policy_revision"],
        purpose: row["purpose"],
        purposeNote: row["purpose_note"],
        reviewDueAt: row["review_due_at"],
        expiresAt: row["expires_at"],
        acknowledgement: row["acknowledgement"],
        operationId: row["operation_id"],
        recordedAt: row["reviewed_at"],
      });
    } catch {
      return invalid();
    }
    if (r.kind !== "review" || r.expectedVaultId !== vaultId) return invalid();
    const policy = await policyAt(s, r.policyId, vaultId),
      source = await sourceAt(s, r.sourceSnapshotId, vaultId),
      changed = changeTime(row, "revoked_at");
    if (
      !same(row, reviewRow(r, revision, changed)) ||
      policy.r.sourceSnapshotId !== r.sourceSnapshotId ||
      policy.r.expectedSourceHash !== r.expectedSourceHash ||
      policy.r.fieldName !== r.fieldName ||
      policy.r.recordedAt > r.recordedAt ||
      source.recordedAt > r.recordedAt ||
      source.sourceHash !== r.expectedSourceHash ||
      !exactSpan(source.literalText, r.sourceStartByte, r.sourceEndByte, r.sourceExcerpt) ||
      (await digest(r.sourceExcerpt)) !== r.expectedValueHash
    )
      return invalid();
    return { r, row, source, policy, revision, changed };
  };
  const insert = async (s: DatabaseSession, table: Table, row: QueryRow) => {
    const keys = columns[table].split(" ");
    if (
      (
        await s.execute(
          sqlStatement(
            `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
            keys.map((key) => row[key] ?? null),
          ),
        )
      ).rowsAffected !== 1
    )
      return invalid();
  };
  const readSnapshot = <T>(read: (session: Reader) => Promise<T>) =>
    database.withReadSnapshot === undefined
      ? database.transaction(read)
      : database.withReadSnapshot(read);
  return Object.freeze<ContactFieldUsePortV1>({
    record: async (input) => {
      const r = parseContactUseRecordRequestV1(input);
      return database.transaction(async (s) => {
        await vault(s, r.expectedVaultId, r.recordedAt);
        const table = tables[r.kind],
          id = contactUseRecordIdV1(r);
        if (
          (
            await s.query(
              sqlStatement(`SELECT id FROM ${table} WHERE id=? OR operation_id=? LIMIT 1`, [
                id,
                r.operationId,
              ]),
            )
          ).length
        )
          return stale();
        let fieldRevision: number | null = null;
        if (r.kind === "source") {
          if ((await digest(r.literalText)) !== r.sourceHash) return invalid();
          await insert(s, table, sourceRow(r));
          if (!same(await sourceAt(s, id, r.expectedVaultId), r)) return invalid();
        } else if (r.kind === "policy") {
          const source = await sourceAt(s, r.sourceSnapshotId, r.expectedVaultId),
            terms = await sourceAt(s, r.termsSnapshotId, r.expectedVaultId);
          if (
            source.sourceHash !== r.expectedSourceHash ||
            terms.sourceHash !== r.expectedTermsHash ||
            r.permissionKind !== permission(source) ||
            source.recordedAt > r.recordedAt ||
            terms.recordedAt > r.recordedAt ||
            !exactSpan(terms.literalText, r.termsStartByte, r.termsEndByte, r.termsExcerpt)
          )
            return stale();
          await insert(s, table, policyRow(r, source));
          const found = await policyAt(s, id, r.expectedVaultId);
          if (!same(found.r, r) || found.changed !== null) return invalid();
        } else {
          const contact = await current(
              s,
              r.contactId,
              r.expectedContactRowVersion,
              false,
              r.fieldName,
            ),
            last = await latest(s, r.contactId, r.fieldName);
          const policy = await policyAt(s, r.policyId, r.expectedVaultId),
            source = await sourceAt(s, r.sourceSnapshotId, r.expectedVaultId);
          if (
            (last?.["id"] ?? null) !== r.expectedLatestReviewId ||
            contact.value !== r.sourceExcerpt ||
            (await digest(contact.value)) !== r.expectedValueHash ||
            source.sourceHash !== r.expectedSourceHash ||
            !exactSpan(source.literalText, r.sourceStartByte, r.sourceEndByte, r.sourceExcerpt) ||
            policy.changed !== null ||
            policy.r.sourceSnapshotId !== r.sourceSnapshotId ||
            policy.r.expectedSourceHash !== r.expectedSourceHash ||
            policy.r.fieldName !== r.fieldName ||
            policy.r.recordedAt > r.recordedAt ||
            policy.r.reviewDueAt <= r.recordedAt ||
            source.recordedAt > r.recordedAt ||
            (typeof contact.row["updated_at"] === "string" &&
              contact.row["updated_at"] > r.recordedAt)
          )
            return stale();
          const priorRevision = last?.["field_revision"] ?? 0;
          if (
            typeof priorRevision !== "number" ||
            !Number.isSafeInteger(priorRevision) ||
            priorRevision >= Number.MAX_SAFE_INTEGER
          )
            return invalid();
          const priorTime = last?.["revoked_at"] ?? last?.["reviewed_at"];
          if (
            priorTime !== undefined &&
            (typeof priorTime !== "string" || priorTime > r.recordedAt)
          )
            return stale();
          fieldRevision = priorRevision + 1;
          await insert(s, table, reviewRow(r, fieldRevision));
          const found = await reviewAt(s, id, r.expectedVaultId);
          if (!same(found.r, r) || found.revision !== fieldRevision || found.changed !== null)
            return invalid();
          const confirmed = await current(
            s,
            r.contactId,
            r.expectedContactRowVersion,
            false,
            r.fieldName,
          );
          if (
            confirmed.value !== r.sourceExcerpt ||
            (await latest(s, r.contactId, r.fieldName))?.["id"] !== id
          )
            return stale();
        }
        await vault(s, r.expectedVaultId, r.recordedAt);
        return parseContactUseRecordReceiptV1(
          {
            specVersion: 1,
            kind: r.kind,
            vaultId: r.expectedVaultId,
            recordId: id,
            operationId: r.operationId,
            recordedAt: r.recordedAt,
            sourceSnapshotId: r.sourceSnapshotId,
            sourceHash: r.kind === "source" ? r.sourceHash : r.expectedSourceHash,
            valueHash: r.kind === "review" ? r.expectedValueHash : null,
            policyId: r.kind === "source" ? null : r.policyId,
            rowVersion: 1,
            fieldRevision,
          },
          r,
        );
      });
    },
    control: async (input) => {
      const r = parseContactUseControlRequestV1(input);
      return database.transaction(async (s) => {
        await vault(s, r.expectedVaultId, r.recordedAt);
        if (r.kind === "disable_policy") {
          const before = await policyAt(s, r.recordId, r.expectedVaultId);
          if (
            before.changed !== null ||
            before.r.sourceSnapshotId !== r.sourceSnapshotId ||
            before.r.expectedSourceHash !== r.expectedSourceHash ||
            before.r.recordedAt > r.recordedAt
          )
            return stale();
          if (
            (
              await s.execute(
                sqlStatement(
                  "UPDATE contact_source_use_policy SET status='disabled',disabled_at=?,row_version=2 WHERE id=? AND row_version=1 AND source_snapshot_id=? AND source_snapshot_hash=?",
                  [r.recordedAt, r.recordId, r.sourceSnapshotId, r.expectedSourceHash],
                ),
              )
            ).rowsAffected !== 1
          )
            return stale();
          const after = await policyAt(s, r.recordId, r.expectedVaultId);
          if (!same(before.r, after.r) || after.changed !== r.recordedAt) return invalid();
        } else {
          const before = await reviewAt(s, r.recordId, r.expectedVaultId);
          await current(s, r.contactId, r.expectedContactRowVersion, true);
          if (
            before.changed !== null ||
            before.r.contactId !== r.contactId ||
            before.r.fieldName !== r.fieldName ||
            before.r.recordedAt > r.recordedAt ||
            (await latest(s, r.contactId, r.fieldName))?.["id"] !== r.recordId
          )
            return stale();
          if (
            (
              await s.execute(
                sqlStatement(
                  "UPDATE contact_field_use_review SET revoked_at=?,row_version=2 WHERE id=? AND row_version=1 AND contact_id=? AND field_name=?",
                  [r.recordedAt, r.recordId, r.contactId, r.fieldName],
                ),
              )
            ).rowsAffected !== 1
          )
            return stale();
          const after = await reviewAt(s, r.recordId, r.expectedVaultId);
          if (!same(before.r, after.r) || after.changed !== r.recordedAt) return invalid();
          await current(s, r.contactId, r.expectedContactRowVersion, true);
          if ((await latest(s, r.contactId, r.fieldName))?.["id"] !== r.recordId) return stale();
        }
        await vault(s, r.expectedVaultId, r.recordedAt);
        return parseContactUseControlReceiptV1(
          {
            specVersion: 1,
            kind: r.kind,
            vaultId: r.expectedVaultId,
            recordId: r.recordId,
            recordedAt: r.recordedAt,
            rowVersion: 2,
          },
          r,
        );
      });
    },
    readField: async (input) => {
      const r = parseReadContactFieldUseRequestV1(input);
      return readSnapshot(async (s) => {
        await vault(s, r.expectedVaultId);
        const contact = await current(
            s,
            r.contactId,
            r.expectedContactRowVersion,
            r.includeArchived,
          ),
          last = await latest(s, r.contactId, r.fieldName);
        const base = {
          specVersion: 1,
          vaultId: r.expectedVaultId,
          contactId: r.contactId,
          contactRowVersion: r.expectedContactRowVersion,
          contactArchivedAt: contact.row["archived_at"],
          fieldName: r.fieldName,
          includeArchived: r.includeArchived,
        };
        if (!last)
          return parseContactFieldUseStateV1(
            { ...base, latestReview: null, policy: null, assessment: null },
            r,
          );
        if (typeof last["id"] !== "string") return invalid();
        const found = await reviewAt(s, last["id"], r.expectedVaultId),
          v = found.r,
          p = found.policy.r,
          source = found.source;
        const value = (
          await current(s, r.contactId, r.expectedContactRowVersion, r.includeArchived, r.fieldName)
        ).value;
        const policy = {
          specVersion: 1,
          id: p.policyId,
          vaultId: p.expectedVaultId,
          revision: 1,
          status: found.policy.changed === null ? "enabled" : "disabled",
          sourceSnapshotId: p.sourceSnapshotId,
          sourceSnapshotHash: p.expectedSourceHash,
          sourceUrl: source.sourceUrl,
          sourceClass: source.sourceClass,
          fieldName: p.fieldName,
          rightsBasis: rights(source),
          purpose: "job_search",
          usage: "display_and_manual_use",
          reviewedAt: p.recordedAt,
          reviewDueAt: p.reviewDueAt,
        };
        const assessment = assessContactFieldUseV1(
          {
            specVersion: 1,
            vaultId: r.expectedVaultId,
            contactId: r.contactId,
            fieldName: r.fieldName,
            currentValueHash: value === null ? null : await digest(value),
            now: r.observedAt,
            source: {
              specVersion: 1,
              id: source.sourceSnapshotId,
              vaultId: source.expectedVaultId,
              acquisition: "user_supplied",
              sourceClass: source.sourceClass,
              sourceUrl: source.sourceUrl,
              capturedAt: source.capturedAt,
              contentHash: source.sourceHash,
            },
            review: {
              specVersion: 1,
              id: v.reviewId,
              vaultId: v.expectedVaultId,
              contactId: v.contactId,
              fieldName: v.fieldName,
              valueHash: v.expectedValueHash,
              sourceSnapshotId: v.sourceSnapshotId,
              sourceSnapshotHash: v.expectedSourceHash,
              pointer: `utf8-bytes:${String(v.sourceStartByte)}-${String(v.sourceEndByte)}`,
              excerpt: v.sourceExcerpt,
              policyId: v.policyId,
              policyRevision: v.policyRevision,
              purpose: v.purpose,
              purposeNote: v.purposeNote,
              reviewedAt: v.recordedAt,
              reviewDueAt: v.reviewDueAt,
              expiresAt: v.expiresAt,
              revokedAt: found.changed,
            },
          },
          () => policy,
        );
        return parseContactFieldUseStateV1(
          {
            ...base,
            latestReview: {
              id: v.reviewId,
              operationId: v.operationId,
              fieldRevision: found.revision,
              rowVersion: found.row["row_version"],
              policyId: v.policyId,
              policyRevision: 1,
              reviewedAt: v.recordedAt,
              reviewDueAt: v.reviewDueAt,
              expiresAt: v.expiresAt,
              revokedAt: found.changed,
            },
            policy: {
              id: p.policyId,
              rowVersion: found.policy.row["row_version"],
              status: policy.status,
              rightsBasis: policy.rightsBasis,
              reviewedAt: p.recordedAt,
              reviewDueAt: p.reviewDueAt,
              disabledAt: found.policy.changed,
            },
            assessment,
          },
          r,
        );
      });
    },
    inspect: async (input) => {
      const r =
        input.kind === "disable_policy" || input.kind === "revoke_review"
          ? parseContactUseControlRequestV1(input)
          : parseContactUseRecordRequestV1(input);
      return readSnapshot(async (s) => {
        await vault(s, r.expectedVaultId);
        const control = r.kind === "disable_policy" || r.kind === "revoke_review",
          table =
            r.kind === "disable_policy"
              ? tables.policy
              : r.kind === "revoke_review"
                ? tables.review
                : tables[r.kind];
        const id = control ? r.recordId : contactUseRecordIdV1(r);
        const row = await rowAt(s, table, id);
        let state: "absent" | "matching" | "changed" | "original_present" = "absent",
          lifecycle: "retained" | "enabled" | "disabled" | "not_revoked" | "revoked" | null = null;
        if (row) {
          if (r.kind === "source") {
            state = same(await sourceAt(s, id, r.expectedVaultId), r) ? "matching" : "changed";
            lifecycle = "retained";
          } else if (r.kind === "policy" || r.kind === "disable_policy") {
            const found = await policyAt(s, id, r.expectedVaultId);
            lifecycle = found.changed === null ? "enabled" : "disabled";
            state =
              r.kind === "policy"
                ? same(found.r, r)
                  ? "matching"
                  : "changed"
                : found.r.sourceSnapshotId !== r.sourceSnapshotId ||
                    found.r.expectedSourceHash !== r.expectedSourceHash
                  ? "changed"
                  : found.changed === null
                    ? "original_present"
                    : found.changed === r.recordedAt
                      ? "matching"
                      : "changed";
          } else {
            const found = await reviewAt(s, id, r.expectedVaultId);
            lifecycle = found.changed === null ? "not_revoked" : "revoked";
            if (r.kind === "review") state = same(found.r, r) ? "matching" : "changed";
            else {
              const contact = await current(s, r.contactId, r.expectedContactRowVersion, true);
              state =
                contact.row["id"] !== found.r.contactId ||
                r.fieldName !== found.r.fieldName ||
                (await latest(s, r.contactId, r.fieldName))?.["id"] !== id
                  ? "changed"
                  : found.changed === null
                    ? "original_present"
                    : found.changed === r.recordedAt
                      ? "matching"
                      : "changed";
            }
          }
        }
        return parseContactUseInspectionV1(
          {
            specVersion: 1,
            kind: r.kind,
            vaultId: r.expectedVaultId,
            recordId: id,
            originalOperationId: r.operationId,
            state,
            rowVersion: row?.["row_version"] ?? null,
            lifecycle,
          },
          r,
        );
      });
    },
  });
};
