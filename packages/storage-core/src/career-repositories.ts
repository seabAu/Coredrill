import type { JsonValue } from "@coredrill/contracts";
import {
  dateOnly,
  entityId,
  instant,
  webUrl,
  type DateOnly,
  type EntityId,
  type Instant,
} from "@coredrill/domain";

import {
  sqlStatement,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";
import type {
  AccomplishmentParentType,
  AccomplishmentRecord,
  CareerPreferenceRecord,
  CareerStoryRecord,
  CareerVerificationState,
  CertificationRecord,
  EducationRecord,
  EmploymentRecord,
  ProjectRecord,
  PublicationRecord,
  SkillRecord,
  VolunteerRecord,
} from "./career-records.js";

export type NewEmployment = Omit<EmploymentRecord, "rowVersion">;
export type NewEducation = Omit<EducationRecord, "rowVersion">;
export type NewProject = Omit<ProjectRecord, "rowVersion">;
export type NewSkill = Omit<SkillRecord, "rowVersion">;
export type NewAccomplishment = Omit<AccomplishmentRecord, "rowVersion">;
export type NewCertification = Omit<CertificationRecord, "rowVersion">;
export type NewPublication = Omit<PublicationRecord, "rowVersion">;
export type NewVolunteer = Omit<VolunteerRecord, "rowVersion">;
export type NewCareerStory = Omit<CareerStoryRecord, "rowVersion">;
export type NewCareerPreference = Omit<CareerPreferenceRecord, "rowVersion">;

interface AuditRow extends QueryRow {
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface EmploymentRow extends AuditRow {
  readonly id: string;
  readonly organization: string;
  readonly role: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly is_current: number;
  readonly description: string;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface EducationRow extends AuditRow {
  readonly id: string;
  readonly institution: string;
  readonly credential: string;
  readonly field: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly details: string;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface ProjectRow extends AuditRow {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly url: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface SkillRow extends AuditRow {
  readonly id: string;
  readonly canonical_name: string;
  readonly category: string | null;
  readonly aliases_json: string;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface AccomplishmentRow extends AuditRow {
  readonly id: string;
  readonly parent_type: string;
  readonly parent_id: string | null;
  readonly action: string;
  readonly result: string;
  readonly metrics_json: string;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface CertificationRow extends AuditRow {
  readonly id: string;
  readonly name: string;
  readonly issuer: string;
  readonly issued_date: string | null;
  readonly expires_date: string | null;
  readonly credential_url: string | null;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface PublicationRow extends AuditRow {
  readonly id: string;
  readonly title: string;
  readonly publisher: string | null;
  readonly published_date: string | null;
  readonly url: string | null;
  readonly summary: string;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface VolunteerRow extends AuditRow {
  readonly id: string;
  readonly organization: string;
  readonly role: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly is_current: number;
  readonly description: string;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface CareerStoryRow extends AuditRow {
  readonly id: string;
  readonly title: string;
  readonly situation: string;
  readonly action: string;
  readonly result: string;
  readonly tags_json: string;
  readonly privacy_tags_json: string;
  readonly source_document_id: string | null;
  readonly verification_state: string;
}

interface CareerPreferenceRow extends QueryRow {
  readonly id: string;
  readonly display_name: string;
  readonly summary: string;
  readonly target_roles_json: string;
  readonly location_id: string | null;
  readonly work_preferences_json: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

const VERIFICATION_STATES = new Set<CareerVerificationState>([
  "disputed",
  "imported",
  "source_backed",
  "stale",
  "user_confirmed",
]);
const CAREER_PRIVACY_TAG_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const ACCOMPLISHMENT_PARENT_TYPES = new Set<AccomplishmentParentType>([
  "education",
  "experience",
  "project",
  "standalone",
  "volunteer_experience",
]);

const requiredText = (value: string, label: string, maximum: number): string => {
  if (value.trim().length === 0 || value.length > maximum || value.includes("\u0000")) {
    throw new TypeError(`${label} must be non-empty bounded text without NUL characters.`);
  }
  return value;
};

const optionalText = (value: string | null, label: string, maximum: number): string | null =>
  value === null ? null : requiredText(value, label, maximum);

const boundedText = (value: string, label: string, maximum: number): string => {
  if (value.length > maximum || value.includes("\u0000")) {
    throw new TypeError(`${label} must be bounded text without NUL characters.`);
  }
  return value;
};

const rowVersion = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Stored row version is invalid.");
  return value;
};

const sqliteBoolean = (value: number): boolean => {
  if (value !== 0 && value !== 1) throw new Error("Stored SQLite boolean is invalid.");
  return value === 1;
};

const verificationState = (value: string): CareerVerificationState => {
  if (!VERIFICATION_STATES.has(value as CareerVerificationState)) {
    throw new Error("Stored career verification state is invalid.");
  }
  return value as CareerVerificationState;
};

const accomplishmentParentType = (value: string): AccomplishmentParentType => {
  if (!ACCOMPLISHMENT_PARENT_TYPES.has(value as AccomplishmentParentType)) {
    throw new Error("Stored accomplishment parent type is invalid.");
  }
  return value as AccomplishmentParentType;
};

const optionalDate = (value: string | null): DateOnly | null =>
  value === null ? null : dateOnly(value);
const optionalInstant = (value: string | null): Instant | null =>
  value === null ? null : instant(value);
const optionalEntityId = <Entity extends string>(
  kind: Entity,
  value: string | null,
): EntityId<Entity> | null => (value === null ? null : entityId(kind, value));

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Readonly<Record<string, unknown>>).every(isJsonValue);
};

const freezeJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson)) as unknown as JsonValue;
  if (value !== null && typeof value === "object") {
    const objectValue = value as Readonly<Record<string, JsonValue>>;
    return Object.freeze(
      Object.fromEntries(Object.entries(objectValue).map(([key, item]) => [key, freezeJson(item)])),
    );
  }
  return value;
};

const serializeJson = (value: JsonValue, label: string, maximum = 20_000): string => {
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
    throw new Error("Stored career JSON is invalid.", { cause: error });
  }
  if (!isJsonValue(parsed)) throw new Error("Stored career JSON is unsupported.");
  return freezeJson(parsed);
};

const serializeStringArray = (value: unknown, label: string): string => {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    value.some((item: unknown) => typeof item !== "string")
  ) {
    throw new TypeError(`${label} must be a bounded string array.`);
  }
  const stringValues = value as readonly string[];
  const normalized = stringValues.map((item) => requiredText(item, `${label} item`, 512));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} cannot contain duplicates.`);
  }
  return serializeJson(normalized, label);
};

const parseStringArray = (value: string, label: string): readonly string[] => {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`Stored ${label} must be a string array.`);
  }
  return Object.freeze([...parsed]) as readonly string[];
};

const serializePrivacyTags = (value: unknown): string => {
  if (
    !Array.isArray(value) ||
    value.length > 16 ||
    value.some(
      (item: unknown) =>
        typeof item !== "string" || item.length > 64 || !CAREER_PRIVACY_TAG_PATTERN.test(item),
    )
  ) {
    throw new TypeError(
      "Career story privacy tags must be at most 16 lowercase content-free identifiers.",
    );
  }
  const tags = value as readonly string[];
  if (new Set(tags).size !== tags.length) {
    throw new TypeError("Career story privacy tags cannot contain duplicates.");
  }
  return serializeJson([...tags].sort(), "Career story privacy tags");
};

const parsePrivacyTags = (value: string): readonly string[] => {
  const parsed = parseJson(value);
  if (
    !Array.isArray(parsed) ||
    parsed.length > 16 ||
    parsed.some(
      (item) =>
        typeof item !== "string" || item.length > 64 || !CAREER_PRIVACY_TAG_PATTERN.test(item),
    ) ||
    new Set(parsed).size !== parsed.length
  ) {
    throw new Error("Stored career story privacy tags are invalid.");
  }
  return Object.freeze([...parsed].sort()) as readonly string[];
};

const serializeObject = (value: unknown, label: string): string => {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError(`${label} must be a JSON object.`);
  }
  if (!isJsonValue(value)) throw new TypeError(`${label} must be a JSON object.`);
  return serializeJson(value, label);
};

const parseObject = (value: string, label: string): Readonly<Record<string, JsonValue>> => {
  const parsed = parseJson(value);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`Stored ${label} must be a JSON object.`);
  }
  return parsed;
};

const assertDateRange = (start: DateOnly | null, end: DateOnly | null, label: string): void => {
  if (start !== null) dateOnly(start);
  if (end !== null) dateOnly(end);
  if (start !== null && end !== null && start > end) {
    throw new TypeError(`${label} start date cannot be after its end date.`);
  }
};

const assertAudit = (createdAt: Instant, updatedAt: Instant, archivedAt: Instant | null): void => {
  instant(createdAt);
  instant(updatedAt);
  if (archivedAt !== null) instant(archivedAt);
  if (updatedAt < createdAt)
    throw new TypeError("Career record update time cannot precede creation.");
};

const auditFields = (row: AuditRow) => ({
  archivedAt: optionalInstant(row.archived_at),
  createdAt: instant(row.created_at),
  updatedAt: instant(row.updated_at),
  rowVersion: rowVersion(row.row_version),
});

interface ActiveRepository<RecordType, NewRecordType, Id extends EntityId> {
  insert(value: NewRecordType): Promise<RecordType>;
  findById(id: Id): Promise<RecordType | null>;
  listActive(): Promise<readonly RecordType[]>;
}

interface ActiveRepositoryDefinition<
  RecordType,
  NewRecordType,
  Row extends AuditRow,
  Id extends EntityId,
> {
  readonly table: string;
  readonly select: string;
  readonly insert: string;
  readonly id: (value: NewRecordType) => Id;
  readonly parameters: (value: NewRecordType) => readonly SqlValue[];
  readonly map: (row: Row) => RecordType;
}

const createActiveRepository = <
  RecordType,
  NewRecordType,
  Row extends AuditRow,
  Id extends EntityId,
>(
  session: DatabaseSession,
  definition: ActiveRepositoryDefinition<RecordType, NewRecordType, Row, Id>,
): ActiveRepository<RecordType, NewRecordType, Id> => {
  const findById = async (id: Id): Promise<RecordType | null> => {
    const rows = await session.query<Row>(sqlStatement(`${definition.select} WHERE id = ?`, [id]));
    return rows[0] === undefined ? null : definition.map(rows[0]);
  };

  return Object.freeze({
    insert: async (value: NewRecordType): Promise<RecordType> => {
      const id = definition.id(value);
      const result = await session.execute(
        sqlStatement(definition.insert, definition.parameters(value)),
      );
      if (result.rowsAffected !== 1) throw new Error(`Career ${definition.table} insert failed.`);
      const stored = await findById(id);
      if (stored === null)
        throw new Error(`Inserted career ${definition.table} record is missing.`);
      return stored;
    },
    findById,
    listActive: async (): Promise<readonly RecordType[]> => {
      const rows = await session.query<Row>(
        sqlStatement(`${definition.select} WHERE archived_at IS NULL ORDER BY updated_at DESC, id`),
      );
      return Object.freeze(rows.map(definition.map));
    },
  });
};

const employmentDefinition: ActiveRepositoryDefinition<
  EmploymentRecord,
  NewEmployment,
  EmploymentRow,
  EntityId<"experience">
> = {
  table: "experience",
  select:
    "SELECT id, organization, role, start_date, end_date, is_current, description, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM experience",
  insert:
    "INSERT INTO experience(id, organization, role, start_date, end_date, is_current, description, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("experience", value.id),
  parameters: (value) => {
    assertDateRange(value.startDate, value.endDate, "Employment");
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    if (value.current && value.endDate !== null) {
      throw new TypeError("Current employment cannot have an end date.");
    }
    return [
      entityId("experience", value.id),
      requiredText(value.organization, "Employment organization", 512),
      requiredText(value.role, "Employment role", 512),
      value.startDate,
      value.endDate,
      value.current ? 1 : 0,
      boundedText(value.description, "Employment description", 200_000),
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("experience", row.id),
      organization: requiredText(row.organization, "Stored employment organization", 512),
      role: requiredText(row.role, "Stored employment role", 512),
      startDate: optionalDate(row.start_date),
      endDate: optionalDate(row.end_date),
      current: sqliteBoolean(row.is_current),
      description: boundedText(row.description, "Stored employment description", 200_000),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

const educationDefinition: ActiveRepositoryDefinition<
  EducationRecord,
  NewEducation,
  EducationRow,
  EntityId<"education">
> = {
  table: "education",
  select:
    "SELECT id, institution, credential, field, start_date, end_date, details, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM education",
  insert:
    "INSERT INTO education(id, institution, credential, field, start_date, end_date, details, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("education", value.id),
  parameters: (value) => {
    assertDateRange(value.startDate, value.endDate, "Education");
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    return [
      entityId("education", value.id),
      requiredText(value.institution, "Education institution", 512),
      requiredText(value.credential, "Education credential", 512),
      optionalText(value.field, "Education field", 512),
      value.startDate,
      value.endDate,
      boundedText(value.details, "Education details", 200_000),
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("education", row.id),
      institution: requiredText(row.institution, "Stored education institution", 512),
      credential: requiredText(row.credential, "Stored education credential", 512),
      field: optionalText(row.field, "Stored education field", 512),
      startDate: optionalDate(row.start_date),
      endDate: optionalDate(row.end_date),
      details: boundedText(row.details, "Stored education details", 200_000),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

const projectDefinition: ActiveRepositoryDefinition<
  ProjectRecord,
  NewProject,
  ProjectRow,
  EntityId<"project">
> = {
  table: "project",
  select:
    "SELECT id, name, summary, url, start_date, end_date, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM project",
  insert:
    "INSERT INTO project(id, name, summary, url, start_date, end_date, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("project", value.id),
  parameters: (value) => {
    assertDateRange(value.startDate, value.endDate, "Project");
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    return [
      entityId("project", value.id),
      requiredText(value.name, "Project name", 512),
      boundedText(value.summary, "Project summary", 200_000),
      value.url === null ? null : webUrl(value.url),
      value.startDate,
      value.endDate,
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("project", row.id),
      name: requiredText(row.name, "Stored project name", 512),
      summary: boundedText(row.summary, "Stored project summary", 200_000),
      url: row.url === null ? null : webUrl(row.url),
      startDate: optionalDate(row.start_date),
      endDate: optionalDate(row.end_date),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

const skillDefinition: ActiveRepositoryDefinition<
  SkillRecord,
  NewSkill,
  SkillRow,
  EntityId<"skill">
> = {
  table: "skill",
  select:
    "SELECT id, canonical_name, category, aliases_json, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM skill",
  insert:
    "INSERT INTO skill(id, canonical_name, category, aliases_json, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("skill", value.id),
  parameters: (value) => {
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    return [
      entityId("skill", value.id),
      requiredText(value.canonicalName, "Skill name", 512),
      optionalText(value.category, "Skill category", 256),
      serializeStringArray(value.aliases, "Skill aliases"),
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("skill", row.id),
      canonicalName: requiredText(row.canonical_name, "Stored skill name", 512),
      category: optionalText(row.category, "Stored skill category", 256),
      aliases: parseStringArray(row.aliases_json, "skill aliases"),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

const accomplishmentDefinition: ActiveRepositoryDefinition<
  AccomplishmentRecord,
  NewAccomplishment,
  AccomplishmentRow,
  EntityId<"accomplishment">
> = {
  table: "accomplishment",
  select:
    "SELECT id, parent_type, parent_id, action, result, metrics_json, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM accomplishment",
  insert:
    "INSERT INTO accomplishment(id, parent_type, parent_id, action, result, metrics_json, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("accomplishment", value.id),
  parameters: (value) => {
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    const parentType = accomplishmentParentType(value.parentType);
    if ((parentType === "standalone") !== (value.parentId === null)) {
      throw new TypeError("Standalone accomplishments alone omit a parent identity.");
    }
    return [
      entityId("accomplishment", value.id),
      parentType,
      value.parentId,
      requiredText(value.action, "Accomplishment action", 10_000),
      requiredText(value.result, "Accomplishment result", 10_000),
      serializeObject(value.metrics, "Accomplishment metrics"),
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("accomplishment", row.id),
      parentType: accomplishmentParentType(row.parent_type),
      parentId: row.parent_id === null ? null : entityId("career-parent", row.parent_id),
      action: requiredText(row.action, "Stored accomplishment action", 10_000),
      result: requiredText(row.result, "Stored accomplishment result", 10_000),
      metrics: parseObject(row.metrics_json, "accomplishment metrics"),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

const certificationDefinition: ActiveRepositoryDefinition<
  CertificationRecord,
  NewCertification,
  CertificationRow,
  EntityId<"certification">
> = {
  table: "certification",
  select:
    "SELECT id, name, issuer, issued_date, expires_date, credential_url, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM certification",
  insert:
    "INSERT INTO certification(id, name, issuer, issued_date, expires_date, credential_url, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("certification", value.id),
  parameters: (value) => {
    assertDateRange(value.issuedDate, value.expiresDate, "Certification");
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    return [
      entityId("certification", value.id),
      requiredText(value.name, "Certification name", 512),
      requiredText(value.issuer, "Certification issuer", 512),
      value.issuedDate,
      value.expiresDate,
      value.credentialUrl === null ? null : webUrl(value.credentialUrl),
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("certification", row.id),
      name: requiredText(row.name, "Stored certification name", 512),
      issuer: requiredText(row.issuer, "Stored certification issuer", 512),
      issuedDate: optionalDate(row.issued_date),
      expiresDate: optionalDate(row.expires_date),
      credentialUrl: row.credential_url === null ? null : webUrl(row.credential_url),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

const publicationDefinition: ActiveRepositoryDefinition<
  PublicationRecord,
  NewPublication,
  PublicationRow,
  EntityId<"publication">
> = {
  table: "publication",
  select:
    "SELECT id, title, publisher, published_date, url, summary, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM publication",
  insert:
    "INSERT INTO publication(id, title, publisher, published_date, url, summary, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("publication", value.id),
  parameters: (value) => {
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    if (value.publishedDate !== null) dateOnly(value.publishedDate);
    return [
      entityId("publication", value.id),
      requiredText(value.title, "Publication title", 1024),
      optionalText(value.publisher, "Publication publisher", 512),
      value.publishedDate,
      value.url === null ? null : webUrl(value.url),
      boundedText(value.summary, "Publication summary", 200_000),
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("publication", row.id),
      title: requiredText(row.title, "Stored publication title", 1024),
      publisher: optionalText(row.publisher, "Stored publication publisher", 512),
      publishedDate: optionalDate(row.published_date),
      url: row.url === null ? null : webUrl(row.url),
      summary: boundedText(row.summary, "Stored publication summary", 200_000),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

const volunteerDefinition: ActiveRepositoryDefinition<
  VolunteerRecord,
  NewVolunteer,
  VolunteerRow,
  EntityId<"volunteer-experience">
> = {
  table: "volunteer_experience",
  select:
    "SELECT id, organization, role, start_date, end_date, is_current, description, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM volunteer_experience",
  insert:
    "INSERT INTO volunteer_experience(id, organization, role, start_date, end_date, is_current, description, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("volunteer-experience", value.id),
  parameters: (value) => {
    assertDateRange(value.startDate, value.endDate, "Volunteer experience");
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    if (value.current && value.endDate !== null) {
      throw new TypeError("Current volunteer experience cannot have an end date.");
    }
    return [
      entityId("volunteer-experience", value.id),
      requiredText(value.organization, "Volunteer organization", 512),
      requiredText(value.role, "Volunteer role", 512),
      value.startDate,
      value.endDate,
      value.current ? 1 : 0,
      boundedText(value.description, "Volunteer description", 200_000),
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("volunteer-experience", row.id),
      organization: requiredText(row.organization, "Stored volunteer organization", 512),
      role: requiredText(row.role, "Stored volunteer role", 512),
      startDate: optionalDate(row.start_date),
      endDate: optionalDate(row.end_date),
      current: sqliteBoolean(row.is_current),
      description: boundedText(row.description, "Stored volunteer description", 200_000),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

const careerStoryDefinition: ActiveRepositoryDefinition<
  CareerStoryRecord,
  NewCareerStory,
  CareerStoryRow,
  EntityId<"anecdote">
> = {
  table: "anecdote",
  select:
    "SELECT id, title, situation, action, result, tags_json, privacy_tags_json, source_document_id, verification_state, archived_at, created_at, updated_at, row_version FROM anecdote",
  insert:
    "INSERT INTO anecdote(id, title, situation, action, result, tags_json, privacy_tags_json, source_document_id, verification_state, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  id: (value) => entityId("anecdote", value.id),
  parameters: (value) => {
    assertAudit(value.createdAt, value.updatedAt, value.archivedAt);
    return [
      entityId("anecdote", value.id),
      requiredText(value.title, "Career story title", 512),
      requiredText(value.situation, "Career story situation", 20_000),
      requiredText(value.action, "Career story action", 20_000),
      requiredText(value.result, "Career story result", 20_000),
      serializeStringArray(value.tags, "Career story tags"),
      serializePrivacyTags(value.privacyTags),
      value.sourceDocumentId,
      verificationState(value.verificationState),
      value.archivedAt,
      value.createdAt,
      value.updatedAt,
    ];
  },
  map: (row) =>
    Object.freeze({
      id: entityId("anecdote", row.id),
      title: requiredText(row.title, "Stored career story title", 512),
      situation: requiredText(row.situation, "Stored career story situation", 20_000),
      action: requiredText(row.action, "Stored career story action", 20_000),
      result: requiredText(row.result, "Stored career story result", 20_000),
      tags: parseStringArray(row.tags_json, "career story tags"),
      privacyTags: parsePrivacyTags(row.privacy_tags_json),
      sourceDocumentId: optionalEntityId("document", row.source_document_id),
      verificationState: verificationState(row.verification_state),
      ...auditFields(row),
    }),
};

export type EmploymentRepository = ActiveRepository<
  EmploymentRecord,
  NewEmployment,
  EntityId<"experience">
>;
export type EducationRepository = ActiveRepository<
  EducationRecord,
  NewEducation,
  EntityId<"education">
>;
export type ProjectRepository = ActiveRepository<ProjectRecord, NewProject, EntityId<"project">>;
export type SkillRepository = ActiveRepository<SkillRecord, NewSkill, EntityId<"skill">>;
export type AccomplishmentRepository = ActiveRepository<
  AccomplishmentRecord,
  NewAccomplishment,
  EntityId<"accomplishment">
>;
export type CertificationRepository = ActiveRepository<
  CertificationRecord,
  NewCertification,
  EntityId<"certification">
>;
export type PublicationRepository = ActiveRepository<
  PublicationRecord,
  NewPublication,
  EntityId<"publication">
>;
export type VolunteerRepository = ActiveRepository<
  VolunteerRecord,
  NewVolunteer,
  EntityId<"volunteer-experience">
>;
export type CareerStoryRepository = ActiveRepository<
  CareerStoryRecord,
  NewCareerStory,
  EntityId<"anecdote">
>;

export interface CareerPreferenceRepository {
  insert(value: NewCareerPreference): Promise<CareerPreferenceRecord>;
  get(): Promise<CareerPreferenceRecord | null>;
}

export interface CareerRepositories {
  readonly employment: EmploymentRepository;
  readonly education: EducationRepository;
  readonly projects: ProjectRepository;
  readonly skills: SkillRepository;
  readonly accomplishments: AccomplishmentRepository;
  readonly certifications: CertificationRepository;
  readonly publications: PublicationRepository;
  readonly volunteer: VolunteerRepository;
  readonly stories: CareerStoryRepository;
  readonly preferences: CareerPreferenceRepository;
}

const mapCareerPreference = (row: CareerPreferenceRow): CareerPreferenceRecord =>
  Object.freeze({
    id: entityId("candidate-profile", row.id),
    displayName: requiredText(row.display_name, "Stored candidate display name", 512),
    summary: boundedText(row.summary, "Stored candidate summary", 200_000),
    targetRoles: parseStringArray(row.target_roles_json, "candidate target roles"),
    locationId: optionalEntityId("location", row.location_id),
    workPreferences: parseObject(row.work_preferences_json, "candidate work preferences"),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });

const createCareerPreferenceRepository = (session: DatabaseSession): CareerPreferenceRepository => {
  const get = async (): Promise<CareerPreferenceRecord | null> => {
    const rows = await session.query<CareerPreferenceRow>(
      sqlStatement(
        "SELECT id, display_name, summary, target_roles_json, location_id, work_preferences_json, created_at, updated_at, row_version FROM candidate_profile WHERE singleton_key = 1",
      ),
    );
    if (rows.length > 1) throw new Error("Stored candidate preference singleton is ambiguous.");
    return rows[0] === undefined ? null : mapCareerPreference(rows[0]);
  };

  return Object.freeze({
    insert: async (value: NewCareerPreference): Promise<CareerPreferenceRecord> => {
      assertAudit(value.createdAt, value.updatedAt, null);
      const result = await session.execute(
        sqlStatement(
          "INSERT INTO candidate_profile(id, singleton_key, display_name, summary, target_roles_json, location_id, work_preferences_json, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)",
          [
            entityId("candidate-profile", value.id),
            requiredText(value.displayName, "Candidate display name", 512),
            boundedText(value.summary, "Candidate summary", 200_000),
            serializeStringArray(value.targetRoles, "Candidate target roles"),
            value.locationId,
            serializeObject(value.workPreferences, "Candidate work preferences"),
            value.createdAt,
            value.updatedAt,
          ],
        ),
      );
      if (result.rowsAffected !== 1) throw new Error("Candidate preference insert failed.");
      const stored = await get();
      if (stored === null) throw new Error("Inserted candidate preference is missing.");
      return stored;
    },
    get,
  });
};

export const createCareerRepositories = (session: DatabaseSession): CareerRepositories =>
  Object.freeze({
    employment: createActiveRepository(session, employmentDefinition),
    education: createActiveRepository(session, educationDefinition),
    projects: createActiveRepository(session, projectDefinition),
    skills: createActiveRepository(session, skillDefinition),
    accomplishments: createActiveRepository(session, accomplishmentDefinition),
    certifications: createActiveRepository(session, certificationDefinition),
    publications: createActiveRepository(session, publicationDefinition),
    volunteer: createActiveRepository(session, volunteerDefinition),
    stories: createActiveRepository(session, careerStoryDefinition),
    preferences: createCareerPreferenceRepository(session),
  });
