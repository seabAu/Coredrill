import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import { sqlStatement, type DatabaseSession, type QueryRow } from "./database-port.js";
import type {
  AttachmentManifestRecord,
  DocumentKind,
  DocumentRecord,
  DocumentVersionAttachmentRecord,
  DocumentVersionRecord,
} from "./document-records.js";

export type NewDocument = Omit<DocumentRecord, "rowVersion">;
export type NewDocumentVersion = Omit<DocumentVersionRecord, "styleExample">;
export type NewAttachmentManifest = AttachmentManifestRecord;

export interface NewDocumentVersionAttachment {
  readonly documentVersionId: EntityId<"document-version">;
  readonly contentId: string;
  readonly purpose: string;
  readonly logicalName: string;
  readonly sortOrder: number;
  readonly linkedAt: Instant;
}

export type DocumentRepositoryConflictCode =
  | "attachment_manifest_conflict"
  | "document_lineage_conflict"
  | "record_not_found"
  | "relationship_conflict";

const CONFLICT_MESSAGES: Readonly<Record<DocumentRepositoryConflictCode, string>> = Object.freeze({
  attachment_manifest_conflict:
    "The content-addressed attachment already has different immutable metadata.",
  document_lineage_conflict: "The document version does not extend valid immutable history.",
  record_not_found: "A required document record does not exist.",
  relationship_conflict: "The requested document relationship conflicts with stored metadata.",
});

export class DocumentRepositoryConflictError extends Error {
  public override readonly name = "DocumentRepositoryConflictError";

  public constructor(public readonly code: DocumentRepositoryConflictCode) {
    super(CONFLICT_MESSAGES[code]);
  }
}

interface DocumentRow extends QueryRow {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly source: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface DocumentVersionRow extends QueryRow {
  readonly id: string;
  readonly document_id: string;
  readonly version_number: number;
  readonly content_ir_version: number;
  readonly content_ir_json: string;
  readonly content_plain: string;
  readonly template_id: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly parent_version_id: string | null;
  readonly content_hash: string;
  readonly label: string | null;
  readonly style_example: number;
}

interface AttachmentManifestRow extends QueryRow {
  readonly content_id: string;
  readonly media_type: string;
  readonly byte_length: number;
  readonly created_at: string;
}

interface DocumentVersionAttachmentRow extends AttachmentManifestRow {
  readonly document_version_id: string;
  readonly purpose: string;
  readonly logical_name: string;
  readonly sort_order: number;
  readonly linked_at: string;
}

interface LatestVersionRow extends QueryRow {
  readonly latest_version: number;
}

interface ParentVersionRow extends QueryRow {
  readonly document_id: string;
}

const DOCUMENT_KINDS = new Set<DocumentKind>([
  "application_answer",
  "cover_letter",
  "follow_up",
  "other",
  "resume",
]);
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MEDIA_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;

const boundedText = (
  value: string,
  label: string,
  maximum: number,
  requireContent = false,
): string => {
  if (
    value.length > maximum ||
    value.includes("\u0000") ||
    (requireContent && value.trim().length === 0)
  ) {
    throw new TypeError(`${label} must be bounded text without NUL characters.`);
  }
  return value;
};

const optionalText = (value: string | null, label: string, maximum: number): string | null =>
  value === null ? null : boundedText(value, label, maximum, true);

const safeIdentifier = (value: string, label: string): string => {
  if (value.length > 128 || !IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a bounded lowercase identifier.`);
  }
  return value;
};

const positiveInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
};

const nonnegativeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  }
  return value;
};

const sqliteBoolean = (value: number): boolean => {
  if (value !== 0 && value !== 1) throw new Error("Stored SQLite boolean is invalid.");
  return value === 1;
};

const documentKind = (value: string): DocumentKind => {
  const kind = value as DocumentKind;
  if (!DOCUMENT_KINDS.has(kind)) throw new Error("Stored document kind is unsupported.");
  return kind;
};

const sha256 = (value: string, label: string): string => {
  if (!SHA256_PATTERN.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256.`);
  return value;
};

const mediaType = (value: string): string => {
  if (!MEDIA_TYPE_PATTERN.test(value)) {
    throw new TypeError("Attachment media type must be a bounded lowercase MIME type.");
  }
  return value;
};

const logicalName = (value: string): string => {
  const checked = boundedText(value, "Attachment logical name", 512, true);
  if (checked.includes("/") || checked.includes("\\")) {
    throw new TypeError("Attachment logical name cannot contain path separators.");
  }
  return checked;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
};

const documentIrVersion = (value: JsonValue, expectedVersion: number): number => {
  const version = positiveInteger(expectedVersion, "Document IR version");
  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    value["specVersion"] !== version
  ) {
    throw new TypeError("Document IR JSON must carry the matching specVersion.");
  }
  return version;
};

const serializeDocumentIr = (value: JsonValue, expectedVersion: number): string => {
  if (!isJsonValue(value)) throw new TypeError("Document IR must be a JSON value.");
  documentIrVersion(value, expectedVersion);
  const serialized = JSON.stringify(value);
  if (serialized.length > 8_388_608) throw new TypeError("Document IR exceeds its storage limit.");
  return serialized;
};

const parseDocumentIr = (value: string, expectedVersion: number): JsonValue => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Stored document IR is invalid JSON.", { cause: error });
  }
  if (!isJsonValue(parsed)) throw new Error("Stored document IR is unsupported.");
  documentIrVersion(parsed, expectedVersion);
  return parsed;
};

const mapDocument = (row: DocumentRow): DocumentRecord =>
  Object.freeze({
    id: entityId("document", row.id),
    kind: documentKind(row.kind),
    title: boundedText(row.title, "Stored document title", 512, true),
    source: safeIdentifier(row.source, "Stored document source"),
    archivedAt: row.archived_at === null ? null : instant(row.archived_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: positiveInteger(row.row_version, "Stored document row version"),
  });

const mapDocumentVersion = (row: DocumentVersionRow): DocumentVersionRecord => ({
  id: entityId("document-version", row.id),
  documentId: entityId("document", row.document_id),
  versionNumber: positiveInteger(row.version_number, "Stored document version number"),
  contentIrVersion: positiveInteger(row.content_ir_version, "Stored document IR version"),
  contentIr: parseDocumentIr(row.content_ir_json, row.content_ir_version),
  contentPlain: boundedText(row.content_plain, "Stored document plain text", 2_000_000),
  templateId: row.template_id === null ? null : entityId("document-template", row.template_id),
  createdBy: safeIdentifier(row.created_by, "Stored document version creator"),
  createdAt: instant(row.created_at),
  parentVersionId:
    row.parent_version_id === null ? null : entityId("document-version", row.parent_version_id),
  contentHash: sha256(row.content_hash, "Stored document content hash"),
  label: optionalText(row.label, "Stored document version label", 256),
  styleExample: sqliteBoolean(row.style_example),
});

const mapAttachmentManifest = (row: AttachmentManifestRow): AttachmentManifestRecord => {
  const contentId = sha256(row.content_id, "Stored attachment content ID");
  return Object.freeze({
    contentId,
    sha256: contentId,
    mediaType: mediaType(row.media_type),
    byteLength: nonnegativeInteger(row.byte_length, "Stored attachment byte length"),
    createdAt: instant(row.created_at),
  });
};

const mapDocumentVersionAttachment = (
  row: DocumentVersionAttachmentRow,
): DocumentVersionAttachmentRecord =>
  Object.freeze({
    ...mapAttachmentManifest(row),
    documentVersionId: entityId("document-version", row.document_version_id),
    purpose: safeIdentifier(row.purpose, "Stored attachment purpose"),
    logicalName: logicalName(row.logical_name),
    sortOrder: nonnegativeInteger(row.sort_order, "Stored attachment sort order"),
    linkedAt: instant(row.linked_at),
  });

export class DocumentRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewDocument): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO document(id, kind, title, source, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("document", record.id),
          documentKind(record.kind),
          boundedText(record.title, "Document title", 512, true),
          safeIdentifier(record.source, "Document source"),
          record.archivedAt === null ? null : instant(record.archivedAt),
          instant(record.createdAt),
          instant(record.updatedAt),
        ],
      ),
    );
    if (result.rowsAffected !== 1)
      throw new DocumentRepositoryConflictError("relationship_conflict");
  }

  public async findById(id: EntityId<"document">): Promise<DocumentRecord | undefined> {
    const rows = await this.session.query<DocumentRow>(
      sqlStatement(
        `SELECT id, kind, title, source, archived_at, created_at, updated_at, row_version
         FROM document WHERE id = ?`,
        [entityId("document", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapDocument(rows[0]);
  }

  public async listActive(): Promise<readonly DocumentRecord[]> {
    const rows = await this.session.query<DocumentRow>(
      sqlStatement(
        `SELECT id, kind, title, source, archived_at, created_at, updated_at, row_version
         FROM document WHERE archived_at IS NULL ORDER BY updated_at DESC, id`,
      ),
    );
    return Object.freeze(rows.map(mapDocument));
  }

  public async linkToJob(
    documentId: EntityId<"document">,
    jobId: EntityId<"job">,
    purpose: string,
    createdAt: Instant,
  ): Promise<void> {
    await this.session.execute(
      sqlStatement(
        `INSERT INTO document_job_link(document_id, job_id, purpose, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(document_id, job_id, purpose) DO NOTHING`,
        [
          entityId("document", documentId),
          entityId("job", jobId),
          safeIdentifier(purpose, "Document-job purpose"),
          instant(createdAt),
        ],
      ),
    );
  }
}

export class DocumentVersionRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewDocumentVersion): Promise<void> {
    const documentId = entityId("document", record.documentId);
    const versionNumber = positiveInteger(record.versionNumber, "Document version number");
    const parentVersionId =
      record.parentVersionId === null ? null : entityId("document-version", record.parentVersionId);
    const latest = await this.session.query<LatestVersionRow>(
      sqlStatement(
        `SELECT coalesce(max(version_number), 0) AS latest_version
         FROM document_version WHERE document_id = ?`,
        [documentId],
      ),
    );
    if ((latest[0]?.latest_version ?? 0) + 1 !== versionNumber) {
      throw new DocumentRepositoryConflictError("document_lineage_conflict");
    }
    if ((versionNumber === 1) !== (parentVersionId === null)) {
      throw new DocumentRepositoryConflictError("document_lineage_conflict");
    }
    if (parentVersionId !== null) {
      const parent = await this.session.query<ParentVersionRow>(
        sqlStatement("SELECT document_id FROM document_version WHERE id = ?", [parentVersionId]),
      );
      if (parent[0]?.document_id !== documentId) {
        throw new DocumentRepositoryConflictError("document_lineage_conflict");
      }
    }

    const contentIrVersion = documentIrVersion(record.contentIr, record.contentIrVersion);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO document_version(
           id, document_id, version_number, content_ir_version, content_ir_json, content_plain,
           template_id, created_by, created_at, parent_version_id, content_hash, label
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("document-version", record.id),
          documentId,
          versionNumber,
          contentIrVersion,
          serializeDocumentIr(record.contentIr, contentIrVersion),
          boundedText(record.contentPlain, "Document plain text", 2_000_000),
          record.templateId === null ? null : entityId("document-template", record.templateId),
          safeIdentifier(record.createdBy, "Document version creator"),
          instant(record.createdAt),
          parentVersionId,
          sha256(record.contentHash, "Document content hash"),
          optionalText(record.label, "Document version label", 256),
        ],
      ),
    );
    if (result.rowsAffected !== 1) {
      throw new DocumentRepositoryConflictError("document_lineage_conflict");
    }
  }

  public async findById(
    id: EntityId<"document-version">,
  ): Promise<DocumentVersionRecord | undefined> {
    const rows = await this.session.query<DocumentVersionRow>(
      sqlStatement(
        `SELECT document_version.id, document_version.document_id,
                document_version.version_number, document_version.content_ir_version,
                document_version.content_ir_json, document_version.content_plain,
                document_version.template_id, document_version.created_by,
                document_version.created_at, document_version.parent_version_id,
                document_version.content_hash, document_version.label,
                EXISTS(
                  SELECT 1 FROM document_style_example
                  WHERE document_style_example.document_version_id = document_version.id
                ) AS style_example
         FROM document_version WHERE document_version.id = ?`,
        [entityId("document-version", id)],
      ),
    );
    return rows[0] === undefined ? undefined : Object.freeze(mapDocumentVersion(rows[0]));
  }

  public async listForDocument(
    documentId: EntityId<"document">,
  ): Promise<readonly DocumentVersionRecord[]> {
    const rows = await this.session.query<DocumentVersionRow>(
      sqlStatement(
        `SELECT document_version.id, document_version.document_id,
                document_version.version_number, document_version.content_ir_version,
                document_version.content_ir_json, document_version.content_plain,
                document_version.template_id, document_version.created_by,
                document_version.created_at, document_version.parent_version_id,
                document_version.content_hash, document_version.label,
                EXISTS(
                  SELECT 1 FROM document_style_example
                  WHERE document_style_example.document_version_id = document_version.id
                ) AS style_example
         FROM document_version WHERE document_version.document_id = ?
         ORDER BY document_version.version_number, document_version.id`,
        [entityId("document", documentId)],
      ),
    );
    return Object.freeze(rows.map((row) => Object.freeze(mapDocumentVersion(row))));
  }

  public async markStyleExample(
    id: EntityId<"document-version">,
    createdAt: Instant,
  ): Promise<void> {
    await this.session.execute(
      sqlStatement(
        `INSERT INTO document_style_example(document_version_id, created_at)
         VALUES (?, ?) ON CONFLICT(document_version_id) DO NOTHING`,
        [entityId("document-version", id), instant(createdAt)],
      ),
    );
  }

  public async unmarkStyleExample(id: EntityId<"document-version">): Promise<boolean> {
    const result = await this.session.execute(
      sqlStatement("DELETE FROM document_style_example WHERE document_version_id = ?", [
        entityId("document-version", id),
      ]),
    );
    return result.rowsAffected === 1;
  }
}

export class AttachmentManifestRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async register(record: NewAttachmentManifest): Promise<AttachmentManifestRecord> {
    const contentId = sha256(record.contentId, "Attachment content ID");
    if (sha256(record.sha256, "Attachment SHA-256") !== contentId) {
      throw new TypeError("Attachment content ID must equal its SHA-256.");
    }
    const checkedMediaType = mediaType(record.mediaType);
    const byteLength = nonnegativeInteger(record.byteLength, "Attachment byte length");
    await this.session.execute(
      sqlStatement(
        `INSERT INTO attachment_manifest(content_id, media_type, byte_length, created_at)
         VALUES (?, ?, ?, ?) ON CONFLICT(content_id) DO NOTHING`,
        [contentId, checkedMediaType, byteLength, instant(record.createdAt)],
      ),
    );
    const stored = await this.findByContentId(contentId);
    if (stored === undefined) throw new DocumentRepositoryConflictError("record_not_found");
    if (stored.mediaType !== checkedMediaType || stored.byteLength !== byteLength) {
      throw new DocumentRepositoryConflictError("attachment_manifest_conflict");
    }
    return stored;
  }

  public async findByContentId(contentId: string): Promise<AttachmentManifestRecord | undefined> {
    const rows = await this.session.query<AttachmentManifestRow>(
      sqlStatement(
        "SELECT content_id, media_type, byte_length, created_at FROM attachment_manifest WHERE content_id = ?",
        [sha256(contentId, "Attachment content ID")],
      ),
    );
    return rows[0] === undefined ? undefined : mapAttachmentManifest(rows[0]);
  }

  public async linkToVersion(record: NewDocumentVersionAttachment): Promise<void> {
    const documentVersionId = entityId("document-version", record.documentVersionId);
    const contentId = sha256(record.contentId, "Attachment content ID");
    const purpose = safeIdentifier(record.purpose, "Attachment purpose");
    const checkedLogicalName = logicalName(record.logicalName);
    const sortOrder = nonnegativeInteger(record.sortOrder, "Attachment sort order");
    const linkedAt = instant(record.linkedAt);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO document_version_attachment(
           document_version_id, content_id, purpose, logical_name, sort_order, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(document_version_id, content_id, purpose) DO NOTHING`,
        [documentVersionId, contentId, purpose, checkedLogicalName, sortOrder, linkedAt],
      ),
    );
    if (result.rowsAffected === 1) return;
    const rows = await this.session.query<DocumentVersionAttachmentRow>(
      sqlStatement(
        `SELECT document_version_attachment.document_version_id,
                document_version_attachment.content_id,
                document_version_attachment.purpose,
                document_version_attachment.logical_name,
                document_version_attachment.sort_order,
                document_version_attachment.created_at AS linked_at,
                attachment_manifest.media_type, attachment_manifest.byte_length,
                attachment_manifest.created_at
         FROM document_version_attachment
         INNER JOIN attachment_manifest
           ON attachment_manifest.content_id = document_version_attachment.content_id
         WHERE document_version_attachment.document_version_id = ?
           AND document_version_attachment.content_id = ?
           AND document_version_attachment.purpose = ?`,
        [documentVersionId, contentId, purpose],
      ),
    );
    const stored = rows[0] === undefined ? undefined : mapDocumentVersionAttachment(rows[0]);
    if (
      stored?.logicalName !== checkedLogicalName ||
      stored.sortOrder !== sortOrder ||
      stored.linkedAt !== linkedAt
    ) {
      throw new DocumentRepositoryConflictError("relationship_conflict");
    }
  }

  public async listForVersion(
    documentVersionId: EntityId<"document-version">,
  ): Promise<readonly DocumentVersionAttachmentRecord[]> {
    const rows = await this.session.query<DocumentVersionAttachmentRow>(
      sqlStatement(
        `SELECT document_version_attachment.document_version_id,
                document_version_attachment.content_id,
                document_version_attachment.purpose,
                document_version_attachment.logical_name,
                document_version_attachment.sort_order,
                document_version_attachment.created_at AS linked_at,
                attachment_manifest.media_type, attachment_manifest.byte_length,
                attachment_manifest.created_at
         FROM document_version_attachment
         INNER JOIN attachment_manifest
           ON attachment_manifest.content_id = document_version_attachment.content_id
         WHERE document_version_attachment.document_version_id = ?
         ORDER BY document_version_attachment.sort_order,
                  document_version_attachment.logical_name,
                  document_version_attachment.content_id`,
        [entityId("document-version", documentVersionId)],
      ),
    );
    return Object.freeze(rows.map(mapDocumentVersionAttachment));
  }
}

export interface DocumentRepositories {
  readonly attachments: AttachmentManifestRepository;
  readonly documents: DocumentRepository;
  readonly versions: DocumentVersionRepository;
}

export const createDocumentRepositories = (session: DatabaseSession): DocumentRepositories =>
  Object.freeze({
    attachments: new AttachmentManifestRepository(session),
    documents: new DocumentRepository(session),
    versions: new DocumentVersionRepository(session),
  });
