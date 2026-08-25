import type { JsonValue } from "@coredrill/contracts";
import type { Confidence, DateOnly, EntityId, Instant, WebUrl } from "@coredrill/domain";

export interface VaultRecord {
  readonly id: EntityId<"vault">;
  readonly name: string;
  readonly schemaVersion: number;
  readonly createdAt: Instant;
  readonly lastOpenedAt: Instant;
}

export interface AppSettingRecord {
  readonly key: string;
  readonly value: JsonValue;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export type LocationPrecision =
  "country" | "exact" | "locality" | "postal_code" | "region" | "unknown";

export interface LocationRecord {
  readonly id: EntityId<"location">;
  readonly label: string;
  readonly addressLocality: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly precision: LocationPrecision | null;
  readonly source: string | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface CompanyRecord {
  readonly id: EntityId<"company">;
  readonly canonicalName: string;
  readonly websiteUrl: WebUrl | null;
  readonly domain: string | null;
  readonly locationId: EntityId<"location"> | null;
  readonly notes: string;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface ContactRecord {
  readonly id: EntityId<"contact">;
  readonly companyId: EntityId<"company"> | null;
  readonly name: string;
  readonly role: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly publicProfileUrl: WebUrl | null;
  readonly confidence: Confidence | null;
  readonly userConfirmed: boolean;
  readonly notes: string;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface JobRecord {
  readonly id: EntityId<"job">;
  readonly companyId: EntityId<"company"> | null;
  readonly title: string;
  readonly normalizedTitle: string | null;
  readonly descriptionText: string;
  readonly employmentType: string | null;
  readonly workplaceType: string | null;
  readonly seniority: string | null;
  readonly locationId: EntityId<"location"> | null;
  readonly remoteRegion: JsonValue | null;
  readonly datePosted: DateOnly | null;
  readonly validThrough: DateOnly | null;
  readonly currentStatusId: EntityId<"status_definition"> | null;
  readonly nextActionAt: Instant | null;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface JobSourceRecord {
  readonly id: EntityId<"job-source">;
  readonly jobId: EntityId<"job">;
  readonly connectorId: string | null;
  readonly externalId: string | null;
  readonly canonicalUrl: WebUrl | null;
  readonly applyUrl: WebUrl | null;
  readonly firstSeenAt: Instant;
  readonly lastSeenAt: Instant;
  readonly contentHash: string | null;
  readonly primary: boolean;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface SourceSnapshotRecord {
  readonly id: EntityId<"source-snapshot">;
  readonly jobSourceId: EntityId<"job-source">;
  readonly capturedAt: Instant;
  readonly extractorId: string;
  readonly extractorVersion: string;
  readonly rawText: string | null;
  readonly sanitizedHtml: string | null;
  readonly structuredData: JsonValue | null;
  readonly contentHash: string;
  readonly retentionClass: string;
  readonly createdAt: Instant;
  readonly rowVersion: number;
}

export type ProvenanceExtractionMethod =
  "api" | "heuristic" | "jsonld" | "llm" | "readability" | "selector" | "user";

export interface ProvenanceRecord {
  readonly id: EntityId<"provenance">;
  readonly sourceSnapshotId: EntityId<"source-snapshot">;
  readonly extractionMethod: ProvenanceExtractionMethod;
  readonly sourcePointer: string;
  readonly sourceExcerpt: string | null;
  readonly confidence: Confidence;
  readonly capturedAt: Instant;
  readonly licenseNote: string | null;
  readonly createdAt: Instant;
  readonly rowVersion: number;
}

export interface FieldConfirmationRecord {
  readonly id: EntityId<"field-confirmation">;
  readonly confirmedAt: Instant;
  readonly confirmedValueHash: string;
}

export interface FieldValueRecord {
  readonly id: EntityId<"field-value">;
  readonly entityType: string;
  readonly entityId: EntityId;
  readonly fieldName: string;
  readonly normalizedValue: JsonValue;
  readonly rawValue: JsonValue | null;
  readonly provenanceId: EntityId<"provenance">;
  readonly userConfirmation: FieldConfirmationRecord | null;
  readonly supersededById: EntityId<"field-value"> | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface CompanyAliasRecord {
  readonly id: EntityId<"company-alias">;
  readonly companyId: EntityId<"company">;
  readonly alias: string;
  readonly sourceProvenanceId: EntityId<"provenance">;
  readonly createdAt: Instant;
  readonly rowVersion: number;
}

export interface ContactPointProvenanceRecord {
  readonly id: EntityId<"contact-point-provenance">;
  readonly contactId: EntityId<"contact">;
  readonly fieldName: string;
  readonly valueHash: string;
  readonly provenanceId: EntityId<"provenance">;
  readonly createdAt: Instant;
  readonly rowVersion: number;
}
