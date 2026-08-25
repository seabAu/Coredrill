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
