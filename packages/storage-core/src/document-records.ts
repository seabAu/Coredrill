import type { JsonValue } from "@coredrill/contracts";
import type { EntityId, Instant } from "@coredrill/domain";

export type DocumentKind = "application_answer" | "cover_letter" | "follow_up" | "other" | "resume";

export interface DocumentRecord {
  readonly id: EntityId<"document">;
  readonly kind: DocumentKind;
  readonly title: string;
  readonly source: string;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface DocumentVersionRecord {
  readonly id: EntityId<"document-version">;
  readonly documentId: EntityId<"document">;
  readonly versionNumber: number;
  readonly contentIrVersion: number;
  readonly contentIr: JsonValue;
  readonly contentPlain: string;
  readonly templateId: EntityId<"document-template"> | null;
  readonly createdBy: string;
  readonly createdAt: Instant;
  readonly parentVersionId: EntityId<"document-version"> | null;
  readonly contentHash: string;
  readonly label: string | null;
  readonly styleExample: boolean;
}

export interface AttachmentManifestRecord {
  /** Content ID and SHA-256 are intentionally the same lowercase digest. */
  readonly contentId: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly createdAt: Instant;
}

export interface DocumentVersionAttachmentRecord extends AttachmentManifestRecord {
  readonly documentVersionId: EntityId<"document-version">;
  readonly purpose: string;
  readonly logicalName: string;
  readonly sortOrder: number;
  readonly linkedAt: Instant;
}

export type DocumentLineageRole = "base" | "job_derivative" | "template";

export interface DocumentLineageRecord {
  readonly documentId: EntityId<"document">;
  readonly role: DocumentLineageRole;
  readonly baseDocumentId: EntityId<"document"> | null;
  readonly templateDocumentId: EntityId<"document"> | null;
  readonly jobId: EntityId<"job"> | null;
  readonly createdAt: Instant;
}

export type SubmittedSnapshotItemRole = "answer" | "cover_letter" | "other" | "resume";
export type SubmittedSnapshotFormat = "file" | "plain_text";

export interface SubmittedSnapshotItemRecord {
  readonly id: EntityId<"submitted-snapshot-item">;
  readonly submittedSnapshotId: EntityId<"submitted-snapshot">;
  readonly role: SubmittedSnapshotItemRole;
  readonly documentVersionId: EntityId<"document-version">;
  readonly submissionFormat: SubmittedSnapshotFormat;
  readonly contentId: string | null;
  readonly attachmentPurpose: string | null;
  readonly sortOrder: number;
  readonly createdAt: Instant;
}

export interface SubmittedSnapshotRecord {
  readonly id: EntityId<"submitted-snapshot">;
  readonly applicationId: EntityId<"application">;
  readonly submittedAt: Instant;
  readonly channel: string | null;
  readonly createdAt: Instant;
  readonly items: readonly SubmittedSnapshotItemRecord[];
}
