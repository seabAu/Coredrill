import type { JsonValue } from "@coredrill/contracts";
import {
  confidence,
  dateOnly,
  entityId,
  instant,
  webUrl,
  type EntityId,
  type Instant,
} from "@coredrill/domain";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";
import type {
  AppSettingRecord,
  CompanyAliasRecord,
  CompanyRecord,
  ContactPointProvenanceRecord,
  ContactRecord,
  FieldConfirmationRecord,
  FieldValueRecord,
  JobRecord,
  JobSourceRecord,
  LocationPrecision,
  LocationRecord,
  ProvenanceExtractionMethod,
  ProvenanceRecord,
  SourceSnapshotRecord,
  VaultRecord,
} from "./tracker-records.js";

export type NewAppSetting = Omit<AppSettingRecord, "rowVersion">;
export type NewLocation = Omit<LocationRecord, "rowVersion">;
export type NewCompany = Omit<CompanyRecord, "rowVersion">;
export type NewContact = Omit<ContactRecord, "rowVersion">;
export type NewJob = Omit<JobRecord, "rowVersion">;
export type NewJobSource = Omit<JobSourceRecord, "rowVersion">;
export type NewSourceSnapshot = Omit<SourceSnapshotRecord, "rowVersion">;
export type NewProvenance = Omit<ProvenanceRecord, "rowVersion">;
export type NewFieldValue = Omit<FieldValueRecord, "rowVersion" | "supersededById">;
export type NewCompanyAlias = Omit<CompanyAliasRecord, "rowVersion">;
export type NewContactPointProvenance = Omit<ContactPointProvenanceRecord, "rowVersion">;

export type TrackerRepositoryConflictCode =
  "confirmed_field_value_requires_explicit_replacement" | "field_value_not_replaceable";

export class TrackerRepositoryConflictError extends Error {
  public override readonly name = "TrackerRepositoryConflictError";

  public constructor(public readonly code: TrackerRepositoryConflictCode) {
    super(
      code === "confirmed_field_value_requires_explicit_replacement"
        ? "A user-confirmed field value requires an explicit confirmed replacement."
        : "The field value cannot be replaced in its current state.",
    );
  }
}

interface VaultRow extends QueryRow {
  readonly id: string;
  readonly name: string;
  readonly schema_version: number;
  readonly created_at: string;
  readonly last_opened_at: string;
}

interface AppSettingRow extends QueryRow {
  readonly key: string;
  readonly json_value: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface LocationRow extends QueryRow {
  readonly id: string;
  readonly label: string;
  readonly address_locality: string | null;
  readonly region: string | null;
  readonly postal_code: string | null;
  readonly country_code: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly precision: string | null;
  readonly source: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface CompanyRow extends QueryRow {
  readonly id: string;
  readonly canonical_name: string;
  readonly website_url: string | null;
  readonly domain: string | null;
  readonly location_id: string | null;
  readonly notes: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface ContactRow extends QueryRow {
  readonly id: string;
  readonly company_id: string | null;
  readonly name: string;
  readonly role: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly public_profile_url: string | null;
  readonly confidence: number | null;
  readonly user_confirmed: number;
  readonly notes: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface JobRow extends QueryRow {
  readonly id: string;
  readonly company_id: string | null;
  readonly title: string;
  readonly normalized_title: string | null;
  readonly description_text: string;
  readonly employment_type: string | null;
  readonly workplace_type: string | null;
  readonly seniority: string | null;
  readonly location_id: string | null;
  readonly remote_region_json: string | null;
  readonly date_posted: string | null;
  readonly valid_through: string | null;
  readonly current_status_id: string | null;
  readonly next_action_at: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface JobSourceRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly connector_id: string | null;
  readonly external_id: string | null;
  readonly canonical_url: string | null;
  readonly apply_url: string | null;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
  readonly content_hash: string | null;
  readonly is_primary: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface SourceSnapshotRow extends QueryRow {
  readonly id: string;
  readonly job_source_id: string;
  readonly captured_at: string;
  readonly extractor_id: string;
  readonly extractor_version: string;
  readonly raw_text: string | null;
  readonly sanitized_html: string | null;
  readonly structured_json: string | null;
  readonly content_hash: string;
  readonly retention_class: string;
  readonly created_at: string;
  readonly row_version: number;
}

interface ProvenanceRow extends QueryRow {
  readonly id: string;
  readonly source_snapshot_id: string;
  readonly extraction_method: string;
  readonly source_pointer: string;
  readonly source_excerpt: string | null;
  readonly confidence: number;
  readonly captured_at: string;
  readonly license_note: string | null;
  readonly created_at: string;
  readonly row_version: number;
}

interface FieldValueRow extends QueryRow {
  readonly id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly field_name: string;
  readonly normalized_json: string;
  readonly raw_json: string | null;
  readonly provenance_id: string;
  readonly is_user_confirmed: number;
  readonly user_confirmation_id: string | null;
  readonly confirmed_at: string | null;
  readonly confirmed_value_hash: string | null;
  readonly superseded_by_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const LOCATION_PRECISIONS = new Set<LocationPrecision>([
  "country",
  "exact",
  "locality",
  "postal_code",
  "region",
  "unknown",
]);
const EXTRACTION_METHODS = new Set<ProvenanceExtractionMethod>([
  "api",
  "heuristic",
  "jsonld",
  "llm",
  "readability",
  "selector",
  "user",
]);

const requiredText = (value: string, label: string, maximum: number): string => {
  if (value.trim().length === 0 || value.length > maximum || value.includes("\u0000")) {
    throw new TypeError(`${label} must be non-empty, bounded text without NUL characters.`);
  }
  return value;
};

const optionalText = (value: string | null, label: string, maximum: number): string | null =>
  value === null ? null : requiredText(value, label, maximum);

const safeIdentifier = (value: string, label: string, maximum = 128): string => {
  if (value.length > maximum || !IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a bounded lowercase identifier.`);
  }
  return value;
};

const sha256 = (value: string, label: string): string => {
  if (!SHA256_PATTERN.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256.`);
  return value;
};

const rowVersion = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Stored row version is invalid.");
  }
  return value;
};

const sqliteBoolean = (value: number): boolean => {
  if (value !== 0 && value !== 1) throw new Error("Stored SQLite boolean is invalid.");
  return value === 1;
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

const serializeJson = (value: JsonValue, label: string, maximum: number): string => {
  if (!isJsonValue(value)) throw new TypeError(`${label} must be a JSON value.`);
  const serialized = JSON.stringify(value);
  if (serialized.length > maximum) throw new TypeError(`${label} exceeds its storage limit.`);
  return serialized;
};

const parseJson = (value: string): JsonValue => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Stored JSON is invalid.", { cause: error });
  }
  if (!isJsonValue(parsed)) throw new Error("Stored JSON is not a supported value.");
  return parsed;
};

const optionalEntityId = <Entity extends string>(
  entityType: Entity,
  value: string | null,
): EntityId<Entity> | null => (value === null ? null : entityId(entityType, value));

const optionalInstant = (value: string | null): Instant | null =>
  value === null ? null : instant(value);

const optionalUrl = (value: string | null) => (value === null ? null : webUrl(value));

const assertOneRow = (rowsAffected: number, operation: string): void => {
  if (rowsAffected !== 1) throw new Error(`${operation} did not affect exactly one record.`);
};

const mapVault = (row: VaultRow): VaultRecord =>
  Object.freeze({
    id: entityId("vault", row.id),
    name: requiredText(row.name, "Stored vault name", 512),
    schemaVersion: row.schema_version,
    createdAt: instant(row.created_at),
    lastOpenedAt: instant(row.last_opened_at),
  });

const mapSetting = (row: AppSettingRow): AppSettingRecord =>
  Object.freeze({
    key: safeIdentifier(row.key, "Stored setting key"),
    value: parseJson(row.json_value),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });

const mapLocation = (row: LocationRow): LocationRecord => {
  const precision = row.precision as LocationPrecision | null;
  if (precision !== null && !LOCATION_PRECISIONS.has(precision)) {
    throw new Error("Stored location precision is invalid.");
  }
  return Object.freeze({
    id: entityId("location", row.id),
    label: requiredText(row.label, "Stored location label", 512),
    addressLocality: row.address_locality,
    region: row.region,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    precision,
    source: row.source,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });
};

const mapCompany = (row: CompanyRow): CompanyRecord =>
  Object.freeze({
    id: entityId("company", row.id),
    canonicalName: requiredText(row.canonical_name, "Stored company name", 512),
    websiteUrl: optionalUrl(row.website_url),
    domain: row.domain,
    locationId: optionalEntityId("location", row.location_id),
    notes: row.notes,
    archivedAt: optionalInstant(row.archived_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });

const mapContact = (row: ContactRow): ContactRecord =>
  Object.freeze({
    id: entityId("contact", row.id),
    companyId: optionalEntityId("company", row.company_id),
    name: requiredText(row.name, "Stored contact name", 512),
    role: row.role,
    email: row.email,
    phone: row.phone,
    publicProfileUrl: optionalUrl(row.public_profile_url),
    confidence: row.confidence === null ? null : confidence(row.confidence),
    userConfirmed: sqliteBoolean(row.user_confirmed),
    notes: row.notes,
    archivedAt: optionalInstant(row.archived_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });

const mapJob = (row: JobRow): JobRecord =>
  Object.freeze({
    id: entityId("job", row.id),
    companyId: optionalEntityId("company", row.company_id),
    title: requiredText(row.title, "Stored job title", 1024),
    normalizedTitle: row.normalized_title,
    descriptionText: row.description_text,
    employmentType: row.employment_type,
    workplaceType: row.workplace_type,
    seniority: row.seniority,
    locationId: optionalEntityId("location", row.location_id),
    remoteRegion: row.remote_region_json === null ? null : parseJson(row.remote_region_json),
    datePosted: row.date_posted === null ? null : dateOnly(row.date_posted),
    validThrough: row.valid_through === null ? null : dateOnly(row.valid_through),
    currentStatusId: optionalEntityId("status_definition", row.current_status_id),
    nextActionAt: optionalInstant(row.next_action_at),
    archivedAt: optionalInstant(row.archived_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });

const mapJobSource = (row: JobSourceRow): JobSourceRecord =>
  Object.freeze({
    id: entityId("job-source", row.id),
    jobId: entityId("job", row.job_id),
    connectorId: row.connector_id,
    externalId: row.external_id,
    canonicalUrl: optionalUrl(row.canonical_url),
    applyUrl: optionalUrl(row.apply_url),
    firstSeenAt: instant(row.first_seen_at),
    lastSeenAt: instant(row.last_seen_at),
    contentHash: row.content_hash,
    primary: sqliteBoolean(row.is_primary),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });

const mapSourceSnapshot = (row: SourceSnapshotRow): SourceSnapshotRecord =>
  Object.freeze({
    id: entityId("source-snapshot", row.id),
    jobSourceId: entityId("job-source", row.job_source_id),
    capturedAt: instant(row.captured_at),
    extractorId: safeIdentifier(row.extractor_id, "Stored extractor ID"),
    extractorVersion: requiredText(row.extractor_version, "Stored extractor version", 64),
    rawText: row.raw_text,
    sanitizedHtml: row.sanitized_html,
    structuredData: row.structured_json === null ? null : parseJson(row.structured_json),
    contentHash: sha256(row.content_hash, "Stored source snapshot hash"),
    retentionClass: safeIdentifier(row.retention_class, "Stored retention class", 64),
    createdAt: instant(row.created_at),
    rowVersion: rowVersion(row.row_version),
  });

const mapProvenance = (row: ProvenanceRow): ProvenanceRecord => {
  const extractionMethod = row.extraction_method as ProvenanceExtractionMethod;
  if (!EXTRACTION_METHODS.has(extractionMethod)) {
    throw new Error("Stored provenance extraction method is invalid.");
  }
  return Object.freeze({
    id: entityId("provenance", row.id),
    sourceSnapshotId: entityId("source-snapshot", row.source_snapshot_id),
    extractionMethod,
    sourcePointer: requiredText(row.source_pointer, "Stored source pointer", 2048),
    sourceExcerpt: row.source_excerpt,
    confidence: confidence(row.confidence),
    capturedAt: instant(row.captured_at),
    licenseNote: row.license_note,
    createdAt: instant(row.created_at),
    rowVersion: rowVersion(row.row_version),
  });
};

const mapFieldValue = (row: FieldValueRow): FieldValueRecord => {
  const confirmed = sqliteBoolean(row.is_user_confirmed);
  let userConfirmation: FieldConfirmationRecord | null = null;
  if (confirmed) {
    if (
      row.user_confirmation_id === null ||
      row.confirmed_at === null ||
      row.confirmed_value_hash === null
    ) {
      throw new Error("Stored user confirmation is incomplete.");
    }
    userConfirmation = Object.freeze({
      id: entityId("field-confirmation", row.user_confirmation_id),
      confirmedAt: instant(row.confirmed_at),
      confirmedValueHash: sha256(row.confirmed_value_hash, "Stored confirmed value hash"),
    });
  }
  return Object.freeze({
    id: entityId("field-value", row.id),
    entityType: safeIdentifier(row.entity_type, "Stored field entity type", 64),
    entityId: entityId(row.entity_type, row.entity_id),
    fieldName: safeIdentifier(row.field_name, "Stored field name"),
    normalizedValue: parseJson(row.normalized_json),
    rawValue: row.raw_json === null ? null : parseJson(row.raw_json),
    provenanceId: entityId("provenance", row.provenance_id),
    userConfirmation,
    supersededById: optionalEntityId("field-value", row.superseded_by_id),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });
};

const selectOne = async <Row extends QueryRow, Result>(
  session: DatabaseSession,
  sql: string,
  id: EntityId,
  map: (row: Row) => Result,
): Promise<readonly [Row, Result] | undefined> => {
  const rows = await session.query<Row>(sqlStatement(sql, [id]));
  const row = rows[0];
  return row === undefined ? undefined : Object.freeze([row, map(row)] as const);
};

export class VaultRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: VaultRecord): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        "INSERT INTO vault(id, name, schema_version, created_at, last_opened_at) VALUES (?, ?, ?, ?, ?)",
        [
          entityId("vault", record.id),
          requiredText(record.name, "Vault name", 512),
          record.schemaVersion,
          instant(record.createdAt),
          instant(record.lastOpenedAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Vault creation");
  }

  public async findById(id: EntityId<"vault">): Promise<VaultRecord | undefined> {
    const selected = await selectOne<VaultRow, VaultRecord>(
      this.session,
      "SELECT id, name, schema_version, created_at, last_opened_at FROM vault WHERE id = ?",
      entityId("vault", id),
      mapVault,
    );
    return selected?.[1];
  }

  public async touch(id: EntityId<"vault">, lastOpenedAt: Instant): Promise<void> {
    const result = await this.session.execute(
      sqlStatement("UPDATE vault SET last_opened_at = ? WHERE id = ?", [
        instant(lastOpenedAt),
        entityId("vault", id),
      ]),
    );
    assertOneRow(result.rowsAffected, "Vault touch");
  }
}

export class AppSettingRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async put(record: NewAppSetting): Promise<AppSettingRecord> {
    const key = safeIdentifier(record.key, "Setting key");
    await this.session.execute(
      sqlStatement(
        `INSERT INTO app_setting(key, json_value, updated_at, row_version)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET
           json_value = excluded.json_value,
           updated_at = excluded.updated_at,
           row_version = app_setting.row_version + 1`,
        [key, serializeJson(record.value, "Setting value", 262_144), instant(record.updatedAt)],
      ),
    );
    const stored = await this.get(key);
    if (stored === undefined) throw new Error("Setting write did not persist a record.");
    return stored;
  }

  public async get(key: string): Promise<AppSettingRecord | undefined> {
    const rows = await this.session.query<AppSettingRow>(
      sqlStatement(
        "SELECT key, json_value, updated_at, row_version FROM app_setting WHERE key = ?",
        [safeIdentifier(key, "Setting key")],
      ),
    );
    return rows[0] === undefined ? undefined : mapSetting(rows[0]);
  }

  public async list(): Promise<readonly AppSettingRecord[]> {
    const rows = await this.session.query<AppSettingRow>(
      sqlStatement("SELECT key, json_value, updated_at, row_version FROM app_setting ORDER BY key"),
    );
    return Object.freeze(rows.map(mapSetting));
  }
}

export class LocationRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewLocation): Promise<void> {
    if (record.precision !== null && !LOCATION_PRECISIONS.has(record.precision)) {
      throw new TypeError("Location precision is invalid.");
    }
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO location(
           id, label, address_locality, region, postal_code, country_code, latitude, longitude,
           precision, source, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("location", record.id),
          requiredText(record.label, "Location label", 512),
          optionalText(record.addressLocality, "Address locality", 256),
          optionalText(record.region, "Region", 256),
          optionalText(record.postalCode, "Postal code", 64),
          record.countryCode,
          record.latitude,
          record.longitude,
          record.precision,
          record.source,
          instant(record.createdAt),
          instant(record.updatedAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Location creation");
  }

  public async findById(id: EntityId<"location">): Promise<LocationRecord | undefined> {
    const selected = await selectOne<LocationRow, LocationRecord>(
      this.session,
      `SELECT id, label, address_locality, region, postal_code, country_code, latitude, longitude,
              precision, source, created_at, updated_at, row_version
       FROM location WHERE id = ?`,
      entityId("location", id),
      mapLocation,
    );
    return selected?.[1];
  }
}

export class CompanyRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewCompany): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO company(
           id, canonical_name, website_url, domain, location_id, notes, archived_at, created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("company", record.id),
          requiredText(record.canonicalName, "Company name", 512),
          record.websiteUrl === null ? null : webUrl(record.websiteUrl),
          optionalText(record.domain, "Company domain", 253),
          record.locationId === null ? null : entityId("location", record.locationId),
          record.notes,
          record.archivedAt === null ? null : instant(record.archivedAt),
          instant(record.createdAt),
          instant(record.updatedAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Company creation");
  }

  public async findById(id: EntityId<"company">): Promise<CompanyRecord | undefined> {
    const selected = await selectOne<CompanyRow, CompanyRecord>(
      this.session,
      `SELECT id, canonical_name, website_url, domain, location_id, notes, archived_at,
              created_at, updated_at, row_version
       FROM company WHERE id = ?`,
      entityId("company", id),
      mapCompany,
    );
    return selected?.[1];
  }

  public async addAlias(record: NewCompanyAlias): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO company_alias(id, company_id, alias, source_provenance_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          entityId("company-alias", record.id),
          entityId("company", record.companyId),
          requiredText(record.alias, "Company alias", 512),
          entityId("provenance", record.sourceProvenanceId),
          instant(record.createdAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Company alias creation");
  }
}

export class ContactRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewContact): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO contact(
           id, company_id, name, role, email, phone, public_profile_url, confidence,
           user_confirmed, notes, archived_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("contact", record.id),
          record.companyId === null ? null : entityId("company", record.companyId),
          requiredText(record.name, "Contact name", 512),
          optionalText(record.role, "Contact role", 512),
          optionalText(record.email, "Contact email", 320),
          optionalText(record.phone, "Contact phone", 128),
          record.publicProfileUrl === null ? null : webUrl(record.publicProfileUrl),
          record.confidence === null ? null : confidence(record.confidence),
          record.userConfirmed ? 1 : 0,
          record.notes,
          record.archivedAt === null ? null : instant(record.archivedAt),
          instant(record.createdAt),
          instant(record.updatedAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Contact creation");
  }

  public async findById(id: EntityId<"contact">): Promise<ContactRecord | undefined> {
    const selected = await selectOne<ContactRow, ContactRecord>(
      this.session,
      `SELECT id, company_id, name, role, email, phone, public_profile_url, confidence,
              user_confirmed, notes, archived_at, created_at, updated_at, row_version
       FROM contact WHERE id = ?`,
      entityId("contact", id),
      mapContact,
    );
    return selected?.[1];
  }

  public async linkProvenance(record: NewContactPointProvenance): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO contact_point_provenance(
           id, contact_id, field_name, value_hash, provenance_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          entityId("contact-point-provenance", record.id),
          entityId("contact", record.contactId),
          safeIdentifier(record.fieldName, "Contact field name"),
          sha256(record.valueHash, "Contact value hash"),
          entityId("provenance", record.provenanceId),
          instant(record.createdAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Contact provenance creation");
  }
}

export class JobRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewJob): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO job(
           id, company_id, title, normalized_title, description_text, employment_type,
           workplace_type, seniority, location_id, remote_region_json, date_posted,
           valid_through, current_status_id, next_action_at, archived_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("job", record.id),
          record.companyId === null ? null : entityId("company", record.companyId),
          requiredText(record.title, "Job title", 1024),
          optionalText(record.normalizedTitle, "Normalized job title", 1024),
          record.descriptionText,
          record.employmentType,
          record.workplaceType,
          record.seniority,
          record.locationId === null ? null : entityId("location", record.locationId),
          record.remoteRegion === null
            ? null
            : serializeJson(record.remoteRegion, "Remote region", 262_144),
          record.datePosted === null ? null : dateOnly(record.datePosted),
          record.validThrough === null ? null : dateOnly(record.validThrough),
          record.currentStatusId === null
            ? null
            : entityId("status_definition", record.currentStatusId),
          record.nextActionAt === null ? null : instant(record.nextActionAt),
          record.archivedAt === null ? null : instant(record.archivedAt),
          instant(record.createdAt),
          instant(record.updatedAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Job creation");
  }

  public async findById(id: EntityId<"job">): Promise<JobRecord | undefined> {
    const selected = await selectOne<JobRow, JobRecord>(
      this.session,
      `SELECT id, company_id, title, normalized_title, description_text, employment_type,
              workplace_type, seniority, location_id, remote_region_json, date_posted,
              valid_through, current_status_id, next_action_at, archived_at, created_at,
              updated_at, row_version
       FROM job WHERE id = ?`,
      entityId("job", id),
      mapJob,
    );
    return selected?.[1];
  }
}

export class JobSourceRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewJobSource): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO job_source(
           id, job_id, connector_id, external_id, canonical_url, apply_url, first_seen_at,
           last_seen_at, content_hash, is_primary, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("job-source", record.id),
          entityId("job", record.jobId),
          record.connectorId === null ? null : safeIdentifier(record.connectorId, "Connector ID"),
          optionalText(record.externalId, "External source ID", 1024),
          record.canonicalUrl === null ? null : webUrl(record.canonicalUrl),
          record.applyUrl === null ? null : webUrl(record.applyUrl),
          instant(record.firstSeenAt),
          instant(record.lastSeenAt),
          record.contentHash === null ? null : sha256(record.contentHash, "Source content hash"),
          record.primary ? 1 : 0,
          instant(record.createdAt),
          instant(record.updatedAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Job source creation");
  }

  public async findById(id: EntityId<"job-source">): Promise<JobSourceRecord | undefined> {
    const selected = await selectOne<JobSourceRow, JobSourceRecord>(
      this.session,
      `SELECT id, job_id, connector_id, external_id, canonical_url, apply_url, first_seen_at,
              last_seen_at, content_hash, is_primary, created_at, updated_at, row_version
       FROM job_source WHERE id = ?`,
      entityId("job-source", id),
      mapJobSource,
    );
    return selected?.[1];
  }
}

export class ProvenanceRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async appendSnapshot(record: NewSourceSnapshot): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO source_snapshot(
           id, job_source_id, captured_at, extractor_id, extractor_version, raw_text,
           sanitized_html, structured_json, content_hash, retention_class, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("source-snapshot", record.id),
          entityId("job-source", record.jobSourceId),
          instant(record.capturedAt),
          safeIdentifier(record.extractorId, "Extractor ID"),
          requiredText(record.extractorVersion, "Extractor version", 64),
          optionalText(record.rawText, "Raw source text", 2_000_000),
          optionalText(record.sanitizedHtml, "Sanitized source HTML", 2_000_000),
          record.structuredData === null
            ? null
            : serializeJson(record.structuredData, "Structured source data", 2_000_000),
          sha256(record.contentHash, "Snapshot content hash"),
          safeIdentifier(record.retentionClass, "Retention class", 64),
          instant(record.createdAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Source snapshot creation");
  }

  public async findSnapshotById(
    id: EntityId<"source-snapshot">,
  ): Promise<SourceSnapshotRecord | undefined> {
    const selected = await selectOne<SourceSnapshotRow, SourceSnapshotRecord>(
      this.session,
      `SELECT id, job_source_id, captured_at, extractor_id, extractor_version, raw_text,
              sanitized_html, structured_json, content_hash, retention_class, created_at,
              row_version
       FROM source_snapshot WHERE id = ?`,
      entityId("source-snapshot", id),
      mapSourceSnapshot,
    );
    return selected?.[1];
  }

  public async append(record: NewProvenance): Promise<void> {
    if (!EXTRACTION_METHODS.has(record.extractionMethod)) {
      throw new TypeError("Provenance extraction method is invalid.");
    }
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO provenance(
           id, source_snapshot_id, extraction_method, source_pointer, source_excerpt,
           confidence, captured_at, license_note, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("provenance", record.id),
          entityId("source-snapshot", record.sourceSnapshotId),
          record.extractionMethod,
          requiredText(record.sourcePointer, "Source pointer", 2048),
          optionalText(record.sourceExcerpt, "Source excerpt", 4096),
          confidence(record.confidence),
          instant(record.capturedAt),
          optionalText(record.licenseNote, "License note", 1024),
          instant(record.createdAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Provenance creation");
  }

  public async findById(id: EntityId<"provenance">): Promise<ProvenanceRecord | undefined> {
    const selected = await selectOne<ProvenanceRow, ProvenanceRecord>(
      this.session,
      `SELECT id, source_snapshot_id, extraction_method, source_pointer, source_excerpt,
              confidence, captured_at, license_note, created_at, row_version
       FROM provenance WHERE id = ?`,
      entityId("provenance", id),
      mapProvenance,
    );
    return selected?.[1];
  }
}

const confirmationColumns = (
  confirmation: FieldConfirmationRecord | null,
): readonly [number, string | null, string | null, string | null] =>
  confirmation === null
    ? [0, null, null, null]
    : [
        1,
        entityId("field-confirmation", confirmation.id),
        instant(confirmation.confirmedAt),
        sha256(confirmation.confirmedValueHash, "Confirmed field value hash"),
      ];

export class FieldValueRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async append(record: NewFieldValue): Promise<void> {
    const confirmation = confirmationColumns(record.userConfirmation);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO field_value(
           id, entity_type, entity_id, field_name, normalized_json, raw_json, provenance_id,
           is_user_confirmed, user_confirmation_id, confirmed_at, confirmed_value_hash,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("field-value", record.id),
          safeIdentifier(record.entityType, "Field entity type", 64),
          entityId(record.entityType, record.entityId),
          safeIdentifier(record.fieldName, "Field name"),
          serializeJson(record.normalizedValue, "Normalized field value", 1_000_000),
          record.rawValue === null
            ? null
            : serializeJson(record.rawValue, "Raw field value", 1_000_000),
          entityId("provenance", record.provenanceId),
          ...confirmation,
          instant(record.createdAt),
          instant(record.updatedAt),
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "Field value creation");
  }

  public async findById(id: EntityId<"field-value">): Promise<FieldValueRecord | undefined> {
    const selected = await selectOne<FieldValueRow, FieldValueRecord>(
      this.session,
      `SELECT id, entity_type, entity_id, field_name, normalized_json, raw_json, provenance_id,
              is_user_confirmed, user_confirmation_id, confirmed_at, confirmed_value_hash,
              superseded_by_id, created_at, updated_at, row_version
       FROM field_value WHERE id = ?`,
      entityId("field-value", id),
      mapFieldValue,
    );
    return selected?.[1];
  }

  public async listForField(
    entityType: string,
    targetEntityId: EntityId,
    fieldName: string,
  ): Promise<readonly FieldValueRecord[]> {
    const normalizedEntityType = safeIdentifier(entityType, "Field entity type", 64);
    const rows = await this.session.query<FieldValueRow>(
      sqlStatement(
        `SELECT id, entity_type, entity_id, field_name, normalized_json, raw_json, provenance_id,
                is_user_confirmed, user_confirmation_id, confirmed_at, confirmed_value_hash,
                superseded_by_id, created_at, updated_at, row_version
         FROM field_value
         WHERE entity_type = ? AND entity_id = ? AND field_name = ?
         ORDER BY created_at, id`,
        [
          normalizedEntityType,
          entityId(normalizedEntityType, targetEntityId),
          safeIdentifier(fieldName, "Field name"),
        ],
      ),
    );
    return Object.freeze(rows.map(mapFieldValue));
  }

  public async confirm(
    id: EntityId<"field-value">,
    confirmation: FieldConfirmationRecord,
    updatedAt: Instant,
  ): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `UPDATE field_value
         SET is_user_confirmed = 1,
             user_confirmation_id = ?,
             confirmed_at = ?,
             confirmed_value_hash = ?,
             updated_at = ?,
             row_version = row_version + 1
         WHERE id = ? AND is_user_confirmed = 0 AND superseded_by_id IS NULL`,
        [
          entityId("field-confirmation", confirmation.id),
          instant(confirmation.confirmedAt),
          sha256(confirmation.confirmedValueHash, "Confirmed field value hash"),
          instant(updatedAt),
          entityId("field-value", id),
        ],
      ),
    );
    if (result.rowsAffected !== 1) {
      throw new TrackerRepositoryConflictError("field_value_not_replaceable");
    }
  }

  public async supersedeUnconfirmed(
    id: EntityId<"field-value">,
    replacementId: EntityId<"field-value">,
    updatedAt: Instant,
  ): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `UPDATE field_value
         SET superseded_by_id = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ?
           AND is_user_confirmed = 0
           AND superseded_by_id IS NULL
           AND EXISTS (
             SELECT 1 FROM field_value AS replacement
             WHERE replacement.id = ?
               AND replacement.entity_type = field_value.entity_type
               AND replacement.entity_id = field_value.entity_id
               AND replacement.field_name = field_value.field_name
               AND replacement.superseded_by_id IS NULL
           )`,
        [
          entityId("field-value", replacementId),
          instant(updatedAt),
          entityId("field-value", id),
          entityId("field-value", replacementId),
        ],
      ),
    );
    if (result.rowsAffected !== 1) {
      const current = await this.findById(id);
      throw new TrackerRepositoryConflictError(
        current !== undefined && current.userConfirmation !== null
          ? "confirmed_field_value_requires_explicit_replacement"
          : "field_value_not_replaceable",
      );
    }
  }
}

export interface ConfirmedFieldValueReplacement {
  readonly currentId: EntityId<"field-value">;
  readonly replacementId: EntityId<"field-value">;
  readonly confirmation: FieldConfirmationRecord;
  readonly updatedAt: Instant;
}

/**
 * The only repository operation allowed to supersede a confirmed candidate. It
 * confirms the replacement and links the prior value in one database transaction.
 */
export const replaceConfirmedFieldValue = async (
  database: DatabasePort,
  replacement: ConfirmedFieldValueReplacement,
): Promise<void> => {
  await database.transaction(async (transaction) => {
    const confirmed = await transaction.execute(
      sqlStatement(
        `UPDATE field_value
         SET is_user_confirmed = 1,
             user_confirmation_id = ?,
             confirmed_at = ?,
             confirmed_value_hash = ?,
             updated_at = ?,
             row_version = row_version + 1
         WHERE id = ?
           AND is_user_confirmed = 0
           AND superseded_by_id IS NULL
           AND EXISTS (
             SELECT 1 FROM field_value AS current
             WHERE current.id = ?
               AND current.is_user_confirmed = 1
               AND current.superseded_by_id IS NULL
               AND current.entity_type = field_value.entity_type
               AND current.entity_id = field_value.entity_id
               AND current.field_name = field_value.field_name
           )`,
        [
          entityId("field-confirmation", replacement.confirmation.id),
          instant(replacement.confirmation.confirmedAt),
          sha256(replacement.confirmation.confirmedValueHash, "Confirmed replacement value hash"),
          instant(replacement.updatedAt),
          entityId("field-value", replacement.replacementId),
          entityId("field-value", replacement.currentId),
        ],
      ),
    );
    if (confirmed.rowsAffected !== 1) {
      throw new TrackerRepositoryConflictError("field_value_not_replaceable");
    }

    const superseded = await transaction.execute(
      sqlStatement(
        `UPDATE field_value
         SET superseded_by_id = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND is_user_confirmed = 1 AND superseded_by_id IS NULL`,
        [
          entityId("field-value", replacement.replacementId),
          instant(replacement.updatedAt),
          entityId("field-value", replacement.currentId),
        ],
      ),
    );
    if (superseded.rowsAffected !== 1) {
      throw new TrackerRepositoryConflictError("field_value_not_replaceable");
    }
  });
};

export interface TrackerRepositories {
  readonly vaults: VaultRepository;
  readonly settings: AppSettingRepository;
  readonly locations: LocationRepository;
  readonly companies: CompanyRepository;
  readonly contacts: ContactRepository;
  readonly jobs: JobRepository;
  readonly jobSources: JobSourceRepository;
  readonly provenance: ProvenanceRepository;
  readonly fieldValues: FieldValueRepository;
}

export const createTrackerRepositories = (session: DatabaseSession): TrackerRepositories =>
  Object.freeze({
    vaults: new VaultRepository(session),
    settings: new AppSettingRepository(session),
    locations: new LocationRepository(session),
    companies: new CompanyRepository(session),
    contacts: new ContactRepository(session),
    jobs: new JobRepository(session),
    jobSources: new JobSourceRepository(session),
    provenance: new ProvenanceRepository(session),
    fieldValues: new FieldValueRepository(session),
  });
