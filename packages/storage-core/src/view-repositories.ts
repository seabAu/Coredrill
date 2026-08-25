import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import { advancingAuditTimestamp, auditTimestamps } from "./audit-integrity.js";
import { sqlStatement, type DatabaseSession, type QueryRow } from "./database-port.js";
import type { SavedViewRecord, SavedViewScope, TagRecord } from "./view-records.js";

export type NewTag = Omit<TagRecord, "rowVersion">;
export type NewSavedView = Omit<SavedViewRecord, "rowVersion">;

export interface SavedViewUpdate {
  readonly id: EntityId<"saved-view">;
  readonly name: string;
  readonly filterAstVersion: number;
  readonly filterAst: JsonValue;
  readonly uiSettings: JsonValue;
  readonly archivedAt: Instant | null;
  readonly updatedAt: Instant;
}

export type ViewRepositoryConflictCode =
  "record_not_found" | "row_version_conflict" | "tag_unavailable";

const CONFLICT_MESSAGES: Readonly<Record<ViewRepositoryConflictCode, string>> = Object.freeze({
  record_not_found: "The requested view record does not exist.",
  row_version_conflict: "The saved view changed before this update committed.",
  tag_unavailable: "The job or active tag required for this assignment is unavailable.",
});

export class ViewRepositoryConflictError extends Error {
  public override readonly name = "ViewRepositoryConflictError";

  public constructor(public readonly code: ViewRepositoryConflictCode) {
    super(CONFLICT_MESSAGES[code]);
  }
}

interface TagRow extends QueryRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface SavedViewRow extends QueryRow {
  readonly id: string;
  readonly scope: string;
  readonly name: string;
  readonly filter_ast_version: number;
  readonly filter_ast_json: string;
  readonly ui_settings_json: string;
  readonly is_system: number;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface CountRow extends QueryRow {
  readonly total: number;
}

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

const positiveInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
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

const serializeJson = (value: JsonValue, label: string): string => {
  if (!isJsonValue(value)) throw new TypeError(`${label} must be a JSON value.`);
  const serialized = JSON.stringify(value);
  if (serialized.length > 262_144) throw new TypeError(`${label} exceeds its storage limit.`);
  return serialized;
};

const parseJson = (value: string): JsonValue => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Stored saved-view JSON is invalid.", { cause: error });
  }
  if (!isJsonValue(parsed)) throw new Error("Stored saved-view JSON is unsupported.");
  return parsed;
};

const filterAstVersion = (value: JsonValue, expectedVersion: number): number => {
  const version = positiveInteger(expectedVersion, "Filter AST version");
  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    value["specVersion"] !== version
  ) {
    throw new TypeError("Filter AST JSON must carry the matching specVersion.");
  }
  return version;
};

const savedViewScope = (value: string): SavedViewScope => {
  if (value !== "jobs") throw new Error("Stored saved-view scope is unsupported.");
  return value;
};

const mapTag = (row: TagRow): TagRecord =>
  Object.freeze({
    id: entityId("tag", row.id),
    name: boundedText(row.name, "Stored tag name", 80, true),
    color: row.color,
    archivedAt: row.archived_at === null ? null : instant(row.archived_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: positiveInteger(row.row_version, "Stored tag row version"),
  });

const mapSavedView = (row: SavedViewRow): SavedViewRecord => {
  const filterAst = parseJson(row.filter_ast_json);
  return Object.freeze({
    id: entityId("saved-view", row.id),
    scope: savedViewScope(row.scope),
    name: boundedText(row.name, "Stored saved-view name", 120, true),
    filterAstVersion: filterAstVersion(filterAst, row.filter_ast_version),
    filterAst,
    uiSettings: parseJson(row.ui_settings_json),
    isSystem: sqliteBoolean(row.is_system),
    archivedAt: row.archived_at === null ? null : instant(row.archived_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: positiveInteger(row.row_version, "Stored saved-view row version"),
  });
};

export class TagRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewTag): Promise<void> {
    const audit = auditTimestamps(record.createdAt, record.updatedAt, record.archivedAt);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO tag(id, name, color, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          entityId("tag", record.id),
          boundedText(record.name, "Tag name", 80, true),
          optionalText(record.color, "Tag color", 64),
          audit.archivedAt,
          audit.createdAt,
          audit.updatedAt,
        ],
      ),
    );
    if (result.rowsAffected !== 1) {
      throw new ViewRepositoryConflictError("row_version_conflict");
    }
  }

  public async findById(id: EntityId<"tag">): Promise<TagRecord | undefined> {
    const rows = await this.session.query<TagRow>(
      sqlStatement(
        `SELECT id, name, color, archived_at, created_at, updated_at, row_version
         FROM tag WHERE id = ?`,
        [entityId("tag", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapTag(rows[0]);
  }

  public async listForJob(jobId: EntityId<"job">): Promise<readonly TagRecord[]> {
    const rows = await this.session.query<TagRow>(
      sqlStatement(
        `SELECT tag.id, tag.name, tag.color, tag.archived_at, tag.created_at,
                tag.updated_at, tag.row_version
         FROM tag
         INNER JOIN job_tag ON job_tag.tag_id = tag.id
         WHERE job_tag.job_id = ?
         ORDER BY tag.name, tag.id`,
        [entityId("job", jobId)],
      ),
    );
    return Object.freeze(rows.map(mapTag));
  }

  public async assignToJob(
    jobIdInput: EntityId<"job">,
    tagIdInput: EntityId<"tag">,
    createdAtInput: Instant,
  ): Promise<void> {
    const jobId = entityId("job", jobIdInput);
    const tagId = entityId("tag", tagIdInput);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO job_tag(job_id, tag_id, created_at)
         SELECT ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM job WHERE id = ?)
           AND EXISTS (SELECT 1 FROM tag WHERE id = ? AND archived_at IS NULL)
         ON CONFLICT(job_id, tag_id) DO NOTHING`,
        [jobId, tagId, instant(createdAtInput), jobId, tagId],
      ),
    );
    if (result.rowsAffected === 1) return;
    const existing = await this.session.query<CountRow>(
      sqlStatement("SELECT count(*) AS total FROM job_tag WHERE job_id = ? AND tag_id = ?", [
        jobId,
        tagId,
      ]),
    );
    if ((existing[0]?.total ?? 0) === 1) return;
    throw new ViewRepositoryConflictError("tag_unavailable");
  }

  public async unassignFromJob(jobId: EntityId<"job">, tagId: EntityId<"tag">): Promise<boolean> {
    const result = await this.session.execute(
      sqlStatement("DELETE FROM job_tag WHERE job_id = ? AND tag_id = ?", [
        entityId("job", jobId),
        entityId("tag", tagId),
      ]),
    );
    return result.rowsAffected === 1;
  }
}

export class SavedViewRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewSavedView): Promise<void> {
    const version = filterAstVersion(record.filterAst, record.filterAstVersion);
    const audit = auditTimestamps(record.createdAt, record.updatedAt, record.archivedAt);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO saved_view(
           id, scope, name, filter_ast_version, filter_ast_json, ui_settings_json, is_system,
           archived_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("saved-view", record.id),
          savedViewScope(record.scope),
          boundedText(record.name, "Saved-view name", 120, true),
          version,
          serializeJson(record.filterAst, "Filter AST"),
          serializeJson(record.uiSettings, "Saved-view UI settings"),
          record.isSystem ? 1 : 0,
          audit.archivedAt,
          audit.createdAt,
          audit.updatedAt,
        ],
      ),
    );
    if (result.rowsAffected !== 1) {
      throw new ViewRepositoryConflictError("row_version_conflict");
    }
  }

  public async findById(id: EntityId<"saved-view">): Promise<SavedViewRecord | undefined> {
    const rows = await this.session.query<SavedViewRow>(
      sqlStatement(
        `SELECT id, scope, name, filter_ast_version, filter_ast_json, ui_settings_json,
                is_system, archived_at, created_at, updated_at, row_version
         FROM saved_view WHERE id = ?`,
        [entityId("saved-view", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapSavedView(rows[0]);
  }

  public async listActive(scope: SavedViewScope = "jobs"): Promise<readonly SavedViewRecord[]> {
    const rows = await this.session.query<SavedViewRow>(
      sqlStatement(
        `SELECT id, scope, name, filter_ast_version, filter_ast_json, ui_settings_json,
                is_system, archived_at, created_at, updated_at, row_version
         FROM saved_view WHERE scope = ? AND archived_at IS NULL ORDER BY name, id`,
        [savedViewScope(scope)],
      ),
    );
    return Object.freeze(rows.map(mapSavedView));
  }

  public async update(
    record: SavedViewUpdate,
    expectedRowVersion: number,
  ): Promise<SavedViewRecord> {
    const id = entityId("saved-view", record.id);
    const version = filterAstVersion(record.filterAst, record.filterAstVersion);
    const existing = await this.findById(id);
    if (existing === undefined) throw new ViewRepositoryConflictError("record_not_found");
    if (existing.rowVersion !== positiveInteger(expectedRowVersion, "Expected row version")) {
      throw new ViewRepositoryConflictError("row_version_conflict");
    }
    const audit = auditTimestamps(existing.createdAt, record.updatedAt, record.archivedAt);
    advancingAuditTimestamp(existing.updatedAt, audit.updatedAt, "Saved-view updated timestamp");
    const result = await this.session.execute(
      sqlStatement(
        `UPDATE saved_view
         SET name = ?, filter_ast_version = ?, filter_ast_json = ?, ui_settings_json = ?,
             archived_at = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND row_version = ?`,
        [
          boundedText(record.name, "Saved-view name", 120, true),
          version,
          serializeJson(record.filterAst, "Filter AST"),
          serializeJson(record.uiSettings, "Saved-view UI settings"),
          audit.archivedAt,
          audit.updatedAt,
          id,
          expectedRowVersion,
        ],
      ),
    );
    if (result.rowsAffected !== 1) {
      const exists = await this.findById(id);
      throw new ViewRepositoryConflictError(
        exists === undefined ? "record_not_found" : "row_version_conflict",
      );
    }
    const stored = await this.findById(id);
    if (stored === undefined) throw new ViewRepositoryConflictError("record_not_found");
    return stored;
  }
}

export interface ViewRepositories {
  readonly savedViews: SavedViewRepository;
  readonly tags: TagRepository;
}

export const createViewRepositories = (session: DatabaseSession): ViewRepositories =>
  Object.freeze({
    savedViews: new SavedViewRepository(session),
    tags: new TagRepository(session),
  });
