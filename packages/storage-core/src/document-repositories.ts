import type { JsonValue } from "@coredrill/contracts";
import type { DocumentWorkspaceItemDto } from "@coredrill/application";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import { auditTimestamps } from "./audit-integrity.js";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";
import type {
  AttachmentManifestRecord,
  DocumentKind,
  DocumentLineageRecord,
  DocumentLineageRole,
  DocumentRecord,
  DocumentVersionAttachmentRecord,
  DocumentVersionRecord,
  SubmittedSnapshotFormat,
  SubmittedSnapshotItemRecord,
  SubmittedSnapshotItemRole,
  SubmittedSnapshotRecord,
} from "./document-records.js";

export type NewDocument = Omit<DocumentRecord, "rowVersion">;
export type NewDocumentVersion = Omit<DocumentVersionRecord, "styleExample">;
export type NewAttachmentManifest = AttachmentManifestRecord;
export type NewDocumentLineage = DocumentLineageRecord;

export type NewSubmittedSnapshotItem = Omit<SubmittedSnapshotItemRecord, "submittedSnapshotId">;
export type NewSubmittedSnapshot = Omit<SubmittedSnapshotRecord, "items"> & {
  readonly items: readonly NewSubmittedSnapshotItem[];
};

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
  | "document_classification_conflict"
  | "document_lineage_conflict"
  | "record_not_found"
  | "relationship_conflict"
  | "submitted_snapshot_conflict";

const CONFLICT_MESSAGES: Readonly<Record<DocumentRepositoryConflictCode, string>> = Object.freeze({
  attachment_manifest_conflict:
    "The content-addressed attachment already has different immutable metadata.",
  document_classification_conflict:
    "The document does not have a valid immutable base, template, or job-derivative lineage.",
  document_lineage_conflict: "The document version does not extend valid immutable history.",
  record_not_found: "A required document record does not exist.",
  relationship_conflict: "The requested document relationship conflicts with stored metadata.",
  submitted_snapshot_conflict:
    "The submitted snapshot does not match the immutable applied application state.",
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

interface DocumentLineageRow extends QueryRow {
  readonly document_id: string;
  readonly role: string;
  readonly base_document_id: string | null;
  readonly template_document_id: string | null;
  readonly job_id: string | null;
  readonly created_at: string;
}

interface SubmittedSnapshotRow extends QueryRow {
  readonly id: string;
  readonly application_id: string;
  readonly submitted_at: string;
  readonly channel: string | null;
  readonly created_at: string;
}

interface SubmittedSnapshotItemRow extends QueryRow {
  readonly id: string;
  readonly submitted_snapshot_id: string;
  readonly role: string;
  readonly document_version_id: string;
  readonly submission_format: string;
  readonly content_id: string | null;
  readonly attachment_purpose: string | null;
  readonly sort_order: number;
  readonly created_at: string;
}

interface DocumentWorkspaceRow extends QueryRow {
  readonly document_id: string;
  readonly document_kind: string;
  readonly document_title: string;
  readonly document_updated_at: string;
  readonly latest_version_id: string | null;
  readonly latest_version_number: number | null;
  readonly latest_version_label: string | null;
  readonly latest_version_created_at: string | null;
  readonly latest_content_plain: string | null;
  readonly linked_evidence_text: string;
  readonly lineage_role: string | null;
  readonly base_document_id: string | null;
  readonly base_document_title: string | null;
  readonly template_document_id: string | null;
  readonly template_document_title: string | null;
  readonly related_job_id: string | null;
  readonly related_job_title: string | null;
  readonly related_company_name: string | null;
  readonly export_attachment_count: number;
  readonly submitted_application_id: string | null;
  readonly submitted_version_id: string | null;
  readonly submitted_version_number: number | null;
  readonly submitted_at: string | null;
  readonly submitted_channel: string | null;
  readonly submitted_role: string | null;
  readonly submitted_format: string | null;
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
const DOCUMENT_LINEAGE_ROLES = new Set<DocumentLineageRole>(["base", "job_derivative", "template"]);
const SUBMITTED_SNAPSHOT_ITEM_ROLES = new Set<SubmittedSnapshotItemRole>([
  "answer",
  "cover_letter",
  "other",
  "resume",
]);
const SUBMITTED_SNAPSHOT_FORMATS = new Set<SubmittedSnapshotFormat>(["file", "plain_text"]);
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}(?:;charset=utf-8)?$/u;

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

const documentLineageRole = (value: string): DocumentLineageRole => {
  const role = value as DocumentLineageRole;
  if (!DOCUMENT_LINEAGE_ROLES.has(role)) throw new TypeError("Document lineage role is invalid.");
  return role;
};

const submittedSnapshotItemRole = (value: string): SubmittedSnapshotItemRole => {
  const role = value as SubmittedSnapshotItemRole;
  if (!SUBMITTED_SNAPSHOT_ITEM_ROLES.has(role)) {
    throw new TypeError("Submitted snapshot item role is invalid.");
  }
  return role;
};

const submittedSnapshotFormat = (value: string): SubmittedSnapshotFormat => {
  const format = value as SubmittedSnapshotFormat;
  if (!SUBMITTED_SNAPSHOT_FORMATS.has(format)) {
    throw new TypeError("Submitted snapshot format is invalid.");
  }
  return format;
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

const mapDocumentLineage = (row: DocumentLineageRow): DocumentLineageRecord =>
  Object.freeze({
    documentId: entityId("document", row.document_id),
    role: documentLineageRole(row.role),
    baseDocumentId:
      row.base_document_id === null ? null : entityId("document", row.base_document_id),
    templateDocumentId:
      row.template_document_id === null ? null : entityId("document", row.template_document_id),
    jobId: row.job_id === null ? null : entityId("job", row.job_id),
    createdAt: instant(row.created_at),
  });

const mapSubmittedSnapshotItem = (row: SubmittedSnapshotItemRow): SubmittedSnapshotItemRecord =>
  Object.freeze({
    id: entityId("submitted-snapshot-item", row.id),
    submittedSnapshotId: entityId("submitted-snapshot", row.submitted_snapshot_id),
    role: submittedSnapshotItemRole(row.role),
    documentVersionId: entityId("document-version", row.document_version_id),
    submissionFormat: submittedSnapshotFormat(row.submission_format),
    contentId: row.content_id === null ? null : sha256(row.content_id, "Stored content ID"),
    attachmentPurpose:
      row.attachment_purpose === null
        ? null
        : safeIdentifier(row.attachment_purpose, "Stored attachment purpose"),
    sortOrder: nonnegativeInteger(row.sort_order, "Stored snapshot item sort order"),
    createdAt: instant(row.created_at),
  });

const mapDocumentWorkspaceItem = (row: DocumentWorkspaceRow): DocumentWorkspaceItemDto => {
  const hasLatestVersion = row.latest_version_id !== null;
  if (
    hasLatestVersion !== (row.latest_version_number !== null) ||
    hasLatestVersion !== (row.latest_version_created_at !== null)
  ) {
    throw new Error("Stored latest document version is incomplete.");
  }
  const hasRelatedJob = row.related_job_id !== null;
  if (
    hasRelatedJob !== (row.related_job_title !== null) ||
    (!hasRelatedJob && row.related_company_name !== null)
  ) {
    throw new Error("Stored related document job is incomplete.");
  }
  const hasSubmission = row.submitted_application_id !== null;
  if (
    hasSubmission !== (row.submitted_version_id !== null) ||
    hasSubmission !== (row.submitted_version_number !== null) ||
    hasSubmission !== (row.submitted_at !== null) ||
    hasSubmission !== (row.submitted_role !== null) ||
    hasSubmission !== (row.submitted_format !== null)
  ) {
    throw new Error("Stored document submission is incomplete.");
  }
  const relatedJob =
    row.related_job_id === null || row.related_job_title === null
      ? null
      : Object.freeze({
          id: entityId("job", row.related_job_id),
          title: boundedText(row.related_job_title, "Stored related job title", 1_024, true),
          companyName: optionalText(row.related_company_name, "Stored related company name", 512),
        });
  const latestVersion =
    row.latest_version_id === null || row.latest_version_number === null
      ? null
      : Object.freeze({
          id: entityId("document-version", row.latest_version_id),
          versionNumber: positiveInteger(
            row.latest_version_number,
            "Stored latest document version number",
          ),
          label: optionalText(
            row.latest_version_label,
            "Stored latest document version label",
            256,
          ),
        });
  const submission =
    row.submitted_application_id === null ||
    row.submitted_version_id === null ||
    row.submitted_version_number === null ||
    row.submitted_at === null ||
    row.submitted_role === null ||
    row.submitted_format === null
      ? null
      : Object.freeze({
          applicationId: entityId("application", row.submitted_application_id),
          versionId: entityId("document-version", row.submitted_version_id),
          versionNumber: positiveInteger(
            row.submitted_version_number,
            "Stored submitted document version number",
          ),
          submittedAt: instant(row.submitted_at),
          channel: optionalText(row.submitted_channel, "Stored submission channel", 128),
          role: submittedSnapshotItemRole(row.submitted_role),
          format: submittedSnapshotFormat(row.submitted_format),
        });
  return Object.freeze({
    id: entityId("document", row.document_id),
    kind: documentKind(row.document_kind),
    title: boundedText(row.document_title, "Stored document title", 512, true),
    lineageRole: row.lineage_role === null ? null : documentLineageRole(row.lineage_role),
    baseDocumentId:
      row.base_document_id === null ? null : entityId("document", row.base_document_id),
    baseDocumentTitle: optionalText(row.base_document_title, "Stored base document title", 512),
    templateDocumentId:
      row.template_document_id === null ? null : entityId("document", row.template_document_id),
    templateDocumentTitle: optionalText(
      row.template_document_title,
      "Stored template document title",
      512,
    ),
    relatedJob,
    lastEditedAt: instant(row.latest_version_created_at ?? row.document_updated_at),
    searchText: boundedText(
      [row.latest_content_plain ?? "", row.linked_evidence_text]
        .filter((value) => value.length > 0)
        .join("\n"),
      "Stored document search text",
      2_200_001,
    ),
    latestVersion,
    exportStatus:
      nonnegativeInteger(row.export_attachment_count, "Stored export attachment count") > 0
        ? "exported"
        : "not_exported",
    claimStatus: "not_evaluated",
    submission,
  });
};

export class DocumentRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewDocument): Promise<void> {
    const audit = auditTimestamps(record.createdAt, record.updatedAt, record.archivedAt);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO document(id, kind, title, source, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("document", record.id),
          documentKind(record.kind),
          boundedText(record.title, "Document title", 512, true),
          safeIdentifier(record.source, "Document source"),
          audit.archivedAt,
          audit.createdAt,
          audit.updatedAt,
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

export class DocumentLineageRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewDocumentLineage): Promise<void> {
    const role = documentLineageRole(record.role);
    const documentId = entityId("document", record.documentId);
    const baseDocumentId =
      record.baseDocumentId === null ? null : entityId("document", record.baseDocumentId);
    const templateDocumentId =
      record.templateDocumentId === null ? null : entityId("document", record.templateDocumentId);
    const jobId = record.jobId === null ? null : entityId("job", record.jobId);
    const isReusable = role === "base" || role === "template";
    if (
      (isReusable && (baseDocumentId !== null || templateDocumentId !== null || jobId !== null)) ||
      (role === "job_derivative" && (baseDocumentId === null || jobId === null)) ||
      documentId === baseDocumentId ||
      documentId === templateDocumentId
    ) {
      throw new DocumentRepositoryConflictError("document_classification_conflict");
    }
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO document_lineage(
           document_id, role, base_document_id, template_document_id, job_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [documentId, role, baseDocumentId, templateDocumentId, jobId, instant(record.createdAt)],
      ),
    );
    if (result.rowsAffected !== 1) {
      throw new DocumentRepositoryConflictError("document_classification_conflict");
    }
  }

  public async findForDocument(
    documentId: EntityId<"document">,
  ): Promise<DocumentLineageRecord | undefined> {
    const rows = await this.session.query<DocumentLineageRow>(
      sqlStatement(
        `SELECT document_id, role, base_document_id, template_document_id, job_id, created_at
         FROM document_lineage WHERE document_id = ?`,
        [entityId("document", documentId)],
      ),
    );
    return rows[0] === undefined ? undefined : mapDocumentLineage(rows[0]);
  }
}

export class SubmittedSnapshotRepository {
  public constructor(private readonly database: DatabasePort) {}

  public async create(record: NewSubmittedSnapshot): Promise<SubmittedSnapshotRecord> {
    const snapshotId = entityId("submitted-snapshot", record.id);
    const applicationId = entityId("application", record.applicationId);
    const submittedAt = instant(record.submittedAt);
    const channel = optionalText(record.channel, "Submission channel", 128);
    const createdAt = instant(record.createdAt);
    await this.database.transaction(async (transaction) => {
      const snapshot = await transaction.execute(
        sqlStatement(
          `INSERT INTO submitted_snapshot(id, application_id, submitted_at, channel, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [snapshotId, applicationId, submittedAt, channel, createdAt],
        ),
      );
      if (snapshot.rowsAffected !== 1) {
        throw new DocumentRepositoryConflictError("submitted_snapshot_conflict");
      }
      for (const item of record.items) {
        const role = submittedSnapshotItemRole(item.role);
        const format = submittedSnapshotFormat(item.submissionFormat);
        const contentId =
          item.contentId === null ? null : sha256(item.contentId, "Submitted content ID");
        const attachmentPurpose =
          item.attachmentPurpose === null
            ? null
            : safeIdentifier(item.attachmentPurpose, "Submitted attachment purpose");
        if (
          (format === "plain_text" && (contentId !== null || attachmentPurpose !== null)) ||
          (format === "file" && (contentId === null || attachmentPurpose === null))
        ) {
          throw new DocumentRepositoryConflictError("submitted_snapshot_conflict");
        }
        const inserted = await transaction.execute(
          sqlStatement(
            `INSERT INTO submitted_snapshot_item(
               id, submitted_snapshot_id, role, document_version_id, submission_format,
               content_id, attachment_purpose, sort_order, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entityId("submitted-snapshot-item", item.id),
              snapshotId,
              role,
              entityId("document-version", item.documentVersionId),
              format,
              contentId,
              attachmentPurpose,
              nonnegativeInteger(item.sortOrder, "Submitted snapshot item sort order"),
              instant(item.createdAt),
            ],
          ),
        );
        if (inserted.rowsAffected !== 1) {
          throw new DocumentRepositoryConflictError("submitted_snapshot_conflict");
        }
      }
    });
    const stored = await this.findByApplication(applicationId);
    if (stored === undefined) throw new DocumentRepositoryConflictError("record_not_found");
    return stored;
  }

  public async findByApplication(
    applicationId: EntityId<"application">,
  ): Promise<SubmittedSnapshotRecord | undefined> {
    const snapshots = await this.database.query<SubmittedSnapshotRow>(
      sqlStatement(
        `SELECT id, application_id, submitted_at, channel, created_at
         FROM submitted_snapshot WHERE application_id = ?`,
        [entityId("application", applicationId)],
      ),
    );
    const snapshot = snapshots[0];
    if (snapshot === undefined) return undefined;
    const items = await this.database.query<SubmittedSnapshotItemRow>(
      sqlStatement(
        `SELECT id, submitted_snapshot_id, role, document_version_id, submission_format,
                content_id, attachment_purpose, sort_order, created_at
         FROM submitted_snapshot_item WHERE submitted_snapshot_id = ?
         ORDER BY sort_order, role, id`,
        [snapshot.id],
      ),
    );
    return Object.freeze({
      id: entityId("submitted-snapshot", snapshot.id),
      applicationId: entityId("application", snapshot.application_id),
      submittedAt: instant(snapshot.submitted_at),
      channel: optionalText(snapshot.channel, "Stored submission channel", 128),
      createdAt: instant(snapshot.created_at),
      items: Object.freeze(items.map(mapSubmittedSnapshotItem)),
    });
  }
}

export class DocumentWorkspaceRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async listActive(): Promise<readonly DocumentWorkspaceItemDto[]> {
    const rows = await this.session.query<DocumentWorkspaceRow>(
      sqlStatement(
        `WITH ranked_version AS (
           SELECT document_version.*,
                  row_number() OVER (
                    PARTITION BY document_version.document_id
                    ORDER BY document_version.version_number DESC, document_version.id
                  ) AS version_rank
           FROM document_version
         ),
         ranked_submission AS (
           SELECT submitted_snapshot.application_id,
                  submitted_snapshot.submitted_at,
                  submitted_snapshot.channel,
                  application.job_id,
                  submitted_snapshot_item.document_version_id,
                  document_version.document_id,
                  document_version.version_number,
                  submitted_snapshot_item.role,
                  submitted_snapshot_item.submission_format,
                  row_number() OVER (
                    PARTITION BY document_version.document_id
                    ORDER BY submitted_snapshot.submitted_at DESC,
                             submitted_snapshot.id,
                             submitted_snapshot_item.sort_order
                  ) AS submission_rank
           FROM submitted_snapshot_item
           INNER JOIN submitted_snapshot
             ON submitted_snapshot.id = submitted_snapshot_item.submitted_snapshot_id
           INNER JOIN application ON application.id = submitted_snapshot.application_id
           INNER JOIN document_version
             ON document_version.id = submitted_snapshot_item.document_version_id
         ),
         linked_evidence AS (
           SELECT source_document_id AS document_id,
                  substr(group_concat(search_text, ' '), 1, 200000) AS search_text
           FROM (
             SELECT source_document_id,
                    organization || ' ' || role || ' ' || description AS search_text
             FROM experience
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
             UNION ALL
             SELECT source_document_id,
                    institution || ' ' || credential || ' ' || coalesce(field, '') || ' ' || details
             FROM education
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
             UNION ALL
             SELECT source_document_id, name || ' ' || summary
             FROM project
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
             UNION ALL
             SELECT source_document_id,
                    canonical_name || ' ' || coalesce(category, '') || ' ' || aliases_json
             FROM skill
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
             UNION ALL
             SELECT source_document_id, action || ' ' || result
             FROM accomplishment
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
             UNION ALL
             SELECT source_document_id, name || ' ' || issuer
             FROM certification
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
             UNION ALL
             SELECT source_document_id, title || ' ' || coalesce(publisher, '') || ' ' || summary
             FROM publication
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
             UNION ALL
             SELECT source_document_id, organization || ' ' || role || ' ' || description
             FROM volunteer_experience
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
             UNION ALL
             SELECT source_document_id, title || ' ' || situation || ' ' || action || ' ' || result
             FROM anecdote
             WHERE source_document_id IS NOT NULL AND archived_at IS NULL
           ) AS evidence_search
           GROUP BY source_document_id
         )
         SELECT document.id AS document_id,
                document.kind AS document_kind,
                document.title AS document_title,
                document.updated_at AS document_updated_at,
                latest.id AS latest_version_id,
                latest.version_number AS latest_version_number,
                latest.label AS latest_version_label,
                latest.created_at AS latest_version_created_at,
                latest.content_plain AS latest_content_plain,
                coalesce(linked_evidence.search_text, '') AS linked_evidence_text,
                document_lineage.role AS lineage_role,
                document_lineage.base_document_id,
                base_document.title AS base_document_title,
                document_lineage.template_document_id,
                template_document.title AS template_document_title,
                job.id AS related_job_id,
                job.title AS related_job_title,
                company.canonical_name AS related_company_name,
                (
                  SELECT count(*)
                  FROM document_version_attachment
                  WHERE document_version_attachment.document_version_id = latest.id
                    AND document_version_attachment.purpose GLOB 'export.*'
                ) AS export_attachment_count,
                submitted.application_id AS submitted_application_id,
                submitted.document_version_id AS submitted_version_id,
                submitted.version_number AS submitted_version_number,
                submitted.submitted_at,
                submitted.channel AS submitted_channel,
                submitted.role AS submitted_role,
                submitted.submission_format AS submitted_format
         FROM document
         LEFT JOIN ranked_version AS latest
           ON latest.document_id = document.id AND latest.version_rank = 1
         LEFT JOIN linked_evidence ON linked_evidence.document_id = document.id
         LEFT JOIN document_lineage ON document_lineage.document_id = document.id
         LEFT JOIN document AS base_document
           ON base_document.id = document_lineage.base_document_id
         LEFT JOIN document AS template_document
           ON template_document.id = document_lineage.template_document_id
         LEFT JOIN ranked_submission AS submitted
           ON submitted.document_id = document.id AND submitted.submission_rank = 1
         LEFT JOIN job ON job.id = coalesce(
           document_lineage.job_id,
           (
             SELECT document_job_link.job_id
             FROM document_job_link
             WHERE document_job_link.document_id = document.id
             ORDER BY document_job_link.created_at DESC,
                      document_job_link.job_id
             LIMIT 1
           ),
           submitted.job_id
         )
         LEFT JOIN company ON company.id = job.company_id
         WHERE document.archived_at IS NULL
         ORDER BY coalesce(latest.created_at, document.updated_at) DESC, document.id`,
      ),
    );
    return Object.freeze(rows.map(mapDocumentWorkspaceItem));
  }
}

export interface DocumentRepositories {
  readonly attachments: AttachmentManifestRepository;
  readonly documents: DocumentRepository;
  readonly lineages: DocumentLineageRepository;
  readonly versions: DocumentVersionRepository;
}

export const createDocumentRepositories = (session: DatabaseSession): DocumentRepositories =>
  Object.freeze({
    attachments: new AttachmentManifestRepository(session),
    documents: new DocumentRepository(session),
    lineages: new DocumentLineageRepository(session),
    versions: new DocumentVersionRepository(session),
  });

export const createSubmittedSnapshotRepository = (
  database: DatabasePort,
): SubmittedSnapshotRepository => new SubmittedSnapshotRepository(database);

export const createDocumentWorkspaceRepository = (
  session: DatabaseSession,
): DocumentWorkspaceRepository => new DocumentWorkspaceRepository(session);
