import {
  createStatusStage,
  entityId,
  evaluateStatusTransition,
  instant,
  timeZone,
  type EntityId,
  type Instant,
  type StatusDefinitionId,
} from "@coredrill/domain";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";
import { auditTimestamps } from "./audit-integrity.js";
import type {
  ApplicationRecord,
  InteractionDirection,
  InteractionRecord,
  InterviewRecord,
  NextActionRecord,
  NextActionState,
  ReminderRecord,
  ReminderState,
  StatusDefinitionRecord,
  StatusEventRecord,
} from "./pipeline-records.js";

export type NewStatusDefinition = Omit<StatusDefinitionRecord, "rowVersion">;
export type NewApplication = Omit<ApplicationRecord, "rowVersion">;
export type NewInteraction = Omit<InteractionRecord, "rowVersion">;
export type NewNextAction = Omit<NextActionRecord, "rowVersion">;
export type NewInterview = Omit<InterviewRecord, "rowVersion">;
export type NewReminder = Omit<ReminderRecord, "rowVersion">;

export type PipelineRepositoryConflictCode =
  | "additional_application_requires_explicit_authorization"
  | "next_action_not_pending"
  | "pipeline_projection_conflict"
  | "pipeline_record_not_found"
  | "reopen_requires_explicit_confirmation"
  | "same_status";

const CONFLICT_MESSAGES: Readonly<Record<PipelineRepositoryConflictCode, string>> = Object.freeze({
  additional_application_requires_explicit_authorization:
    "Creating another application for this job requires explicit authorization.",
  next_action_not_pending: "The next action is not pending.",
  pipeline_projection_conflict: "The pipeline projection changed during the transaction.",
  pipeline_record_not_found: "A required pipeline record was not found.",
  reopen_requires_explicit_confirmation:
    "Leaving a terminal stage requires explicit reopen confirmation.",
  same_status: "A status change must select a different stage.",
});

export class PipelineRepositoryConflictError extends Error {
  public override readonly name = "PipelineRepositoryConflictError";

  public constructor(public readonly code: PipelineRepositoryConflictCode) {
    super(CONFLICT_MESSAGES[code]);
  }
}

interface StatusDefinitionRow extends QueryRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly color: string | null;
  readonly is_system: number;
  readonly sort_order: number;
  readonly terminal: number;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface ApplicationRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly applied_at: string | null;
  readonly channel: string | null;
  readonly current_status_id: string;
  readonly selected_resume_version_id: string | null;
  readonly selected_cover_letter_version_id: string | null;
  readonly notes: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface StatusEventRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly application_id: string | null;
  readonly from_status_id: string | null;
  readonly to_status_id: string;
  readonly occurred_at: string;
  readonly note: string | null;
  readonly created_at: string;
  readonly row_version: number;
}

interface InteractionRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly contact_id: string | null;
  readonly type: string;
  readonly occurred_at: string;
  readonly direction: string;
  readonly summary: string;
  readonly next_action_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface NextActionRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly application_id: string | null;
  readonly interaction_id: string | null;
  readonly title: string;
  readonly due_at: string | null;
  readonly timezone: string | null;
  readonly state: string;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface InterviewRow extends QueryRow {
  readonly id: string;
  readonly application_id: string;
  readonly stage_name: string;
  readonly starts_at: string;
  readonly timezone: string;
  readonly duration_minutes: number;
  readonly location_or_url: string | null;
  readonly contact_ids_json: string;
  readonly preparation_notes: string;
  readonly outcome: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface ReminderRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly next_action_id: string | null;
  readonly interview_id: string | null;
  readonly remind_at: string;
  readonly timezone: string;
  readonly state: string;
  readonly note: string | null;
  readonly fired_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface JobProjectionRow extends QueryRow {
  readonly current_status_id: string | null;
  readonly next_action_at: string | null;
}

interface CountRow extends QueryRow {
  readonly total: number;
}

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const INTERACTION_DIRECTIONS = new Set<InteractionDirection>([
  "inbound",
  "mutual",
  "outbound",
  "unknown",
]);
const NEXT_ACTION_STATES = new Set<NextActionState>(["completed", "dismissed", "pending"]);
const REMINDER_STATES = new Set<ReminderState>(["dismissed", "fired", "pending"]);

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

const sqliteBoolean = (value: number): boolean => {
  if (value !== 0 && value !== 1) throw new Error("Stored SQLite boolean is invalid.");
  return value === 1;
};

const rowVersion = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Stored row version is invalid.");
  return value;
};

const optionalEntityId = <Entity extends string>(
  type: Entity,
  value: string | null,
): EntityId<Entity> | null => (value === null ? null : entityId(type, value));

const optionalInstant = (value: string | null): Instant | null =>
  value === null ? null : instant(value);

const assertOneRow = (rowsAffected: number, operation: string): void => {
  if (rowsAffected !== 1) {
    throw new PipelineRepositoryConflictError(
      operation === "missing" ? "pipeline_record_not_found" : "pipeline_projection_conflict",
    );
  }
};

const mapStatusDefinition = (row: StatusDefinitionRow): StatusDefinitionRecord => {
  const stage = createStatusStage({
    id: row.id,
    name: row.name,
    category: row.category,
    sortOrder: row.sort_order,
    terminal: sqliteBoolean(row.terminal),
    isSystem: sqliteBoolean(row.is_system),
  });
  return Object.freeze({
    id: stage.id,
    name: stage.name,
    category: stage.category,
    color: row.color,
    isSystem: stage.isSystem,
    sortOrder: stage.sortOrder,
    terminal: stage.terminal,
    archivedAt: optionalInstant(row.archived_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });
};

const mapApplication = (row: ApplicationRow): ApplicationRecord =>
  Object.freeze({
    id: entityId("application", row.id),
    jobId: entityId("job", row.job_id),
    appliedAt: optionalInstant(row.applied_at),
    channel: row.channel,
    currentStatusId: entityId("status_definition", row.current_status_id),
    selectedResumeVersionId: optionalEntityId("document-version", row.selected_resume_version_id),
    selectedCoverLetterVersionId: optionalEntityId(
      "document-version",
      row.selected_cover_letter_version_id,
    ),
    notes: row.notes,
    archivedAt: optionalInstant(row.archived_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });

const mapStatusEvent = (row: StatusEventRow): StatusEventRecord =>
  Object.freeze({
    id: entityId("status-event", row.id),
    jobId: entityId("job", row.job_id),
    applicationId: optionalEntityId("application", row.application_id),
    fromStatusId: optionalEntityId("status_definition", row.from_status_id),
    toStatusId: entityId("status_definition", row.to_status_id),
    occurredAt: instant(row.occurred_at),
    note: row.note,
    createdAt: instant(row.created_at),
    rowVersion: rowVersion(row.row_version),
  });

const mapInteraction = (row: InteractionRow): InteractionRecord => {
  const direction = row.direction as InteractionDirection;
  if (!INTERACTION_DIRECTIONS.has(direction))
    throw new Error("Stored interaction direction is invalid.");
  return Object.freeze({
    id: entityId("interaction", row.id),
    jobId: entityId("job", row.job_id),
    contactId: optionalEntityId("contact", row.contact_id),
    type: safeIdentifier(row.type, "Stored interaction type"),
    occurredAt: instant(row.occurred_at),
    direction,
    summary: row.summary,
    nextActionAt: optionalInstant(row.next_action_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });
};

const mapNextAction = (row: NextActionRow): NextActionRecord => {
  const state = row.state as NextActionState;
  if (!NEXT_ACTION_STATES.has(state)) throw new Error("Stored next-action state is invalid.");
  return Object.freeze({
    id: entityId("next-action", row.id),
    jobId: entityId("job", row.job_id),
    applicationId: optionalEntityId("application", row.application_id),
    interactionId: optionalEntityId("interaction", row.interaction_id),
    title: boundedText(row.title, "Stored next-action title", 512, true),
    dueAt: optionalInstant(row.due_at),
    timeZone: row.timezone === null ? null : timeZone(row.timezone),
    state,
    completedAt: optionalInstant(row.completed_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });
};

const parseContactIds = (value: string): readonly EntityId<"contact">[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Stored interview contact IDs are invalid JSON.", { cause: error });
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Stored interview contact IDs are invalid.");
  }
  return Object.freeze(parsed.map((item) => entityId("contact", item)));
};

const serializeContactIds = (ids: readonly EntityId<"contact">[]): string => {
  if (ids.length > 256) throw new TypeError("Interview contact IDs exceed the storage limit.");
  return JSON.stringify(ids.map((id) => entityId("contact", id)));
};

const mapInterview = (row: InterviewRow): InterviewRecord => {
  if (!Number.isSafeInteger(row.duration_minutes) || row.duration_minutes < 1) {
    throw new Error("Stored interview duration is invalid.");
  }
  return Object.freeze({
    id: entityId("interview", row.id),
    applicationId: entityId("application", row.application_id),
    stageName: boundedText(row.stage_name, "Stored interview stage", 256, true),
    startsAt: instant(row.starts_at),
    timeZone: timeZone(row.timezone),
    durationMinutes: row.duration_minutes,
    locationOrUrl: row.location_or_url,
    contactIds: parseContactIds(row.contact_ids_json),
    preparationNotes: row.preparation_notes,
    outcome: row.outcome,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });
};

const mapReminder = (row: ReminderRow): ReminderRecord => {
  const state = row.state as ReminderState;
  if (!REMINDER_STATES.has(state)) throw new Error("Stored reminder state is invalid.");
  return Object.freeze({
    id: entityId("reminder", row.id),
    jobId: entityId("job", row.job_id),
    nextActionId: optionalEntityId("next-action", row.next_action_id),
    interviewId: optionalEntityId("interview", row.interview_id),
    remindAt: instant(row.remind_at),
    timeZone: timeZone(row.timezone),
    state,
    note: row.note,
    firedAt: optionalInstant(row.fired_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: rowVersion(row.row_version),
  });
};

export class StatusDefinitionRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewStatusDefinition): Promise<void> {
    const stage = createStatusStage({
      id: record.id,
      name: record.name,
      category: record.category,
      sortOrder: record.sortOrder,
      terminal: record.terminal,
      isSystem: record.isSystem,
    });
    const audit = auditTimestamps(record.createdAt, record.updatedAt, record.archivedAt);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO status_definition(
           id, name, category, color, is_system, sort_order, terminal, archived_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stage.id,
          stage.name,
          stage.category,
          optionalText(record.color, "Status color", 64),
          stage.isSystem ? 1 : 0,
          stage.sortOrder,
          stage.terminal ? 1 : 0,
          audit.archivedAt,
          audit.createdAt,
          audit.updatedAt,
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "create");
  }

  public async findById(id: StatusDefinitionId): Promise<StatusDefinitionRecord | undefined> {
    const rows = await this.session.query<StatusDefinitionRow>(
      sqlStatement(
        `SELECT id, name, category, color, is_system, sort_order, terminal, archived_at,
                created_at, updated_at, row_version
         FROM status_definition WHERE id = ?`,
        [entityId("status_definition", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapStatusDefinition(rows[0]);
  }
}

export interface CreateApplicationOptions {
  readonly allowAdditionalAttempt?: boolean;
}

export class ApplicationRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(
    record: NewApplication,
    options: CreateApplicationOptions = {},
  ): Promise<void> {
    const jobId = entityId("job", record.jobId);
    const audit = auditTimestamps(record.createdAt, record.updatedAt, record.archivedAt);
    const existing = await this.session.query<CountRow>(
      sqlStatement(
        "SELECT count(*) AS total FROM application WHERE job_id = ? AND archived_at IS NULL",
        [jobId],
      ),
    );
    if ((existing[0]?.total ?? 0) > 0 && options.allowAdditionalAttempt !== true) {
      throw new PipelineRepositoryConflictError(
        "additional_application_requires_explicit_authorization",
      );
    }
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO application(
           id, job_id, applied_at, channel, current_status_id, selected_resume_version_id,
           selected_cover_letter_version_id, notes, archived_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("application", record.id),
          jobId,
          record.appliedAt === null ? null : instant(record.appliedAt),
          optionalText(record.channel, "Application channel", 128),
          entityId("status_definition", record.currentStatusId),
          record.selectedResumeVersionId === null
            ? null
            : entityId("document-version", record.selectedResumeVersionId),
          record.selectedCoverLetterVersionId === null
            ? null
            : entityId("document-version", record.selectedCoverLetterVersionId),
          boundedText(record.notes, "Application notes", 200_000),
          audit.archivedAt,
          audit.createdAt,
          audit.updatedAt,
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "create");
  }

  public async findById(id: EntityId<"application">): Promise<ApplicationRecord | undefined> {
    const rows = await this.session.query<ApplicationRow>(
      sqlStatement(
        `SELECT id, job_id, applied_at, channel, current_status_id,
                selected_resume_version_id, selected_cover_letter_version_id, notes, archived_at,
                created_at, updated_at, row_version
         FROM application WHERE id = ?`,
        [entityId("application", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapApplication(rows[0]);
  }
}

export class StatusEventRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async listForJob(jobId: EntityId<"job">): Promise<readonly StatusEventRecord[]> {
    const rows = await this.session.query<StatusEventRow>(
      sqlStatement(
        `SELECT id, job_id, application_id, from_status_id, to_status_id, occurred_at, note,
                created_at, row_version
         FROM status_event WHERE job_id = ? ORDER BY occurred_at, id`,
        [entityId("job", jobId)],
      ),
    );
    return Object.freeze(rows.map(mapStatusEvent));
  }
}

export class InteractionRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async append(record: NewInteraction): Promise<void> {
    if (!INTERACTION_DIRECTIONS.has(record.direction)) {
      throw new TypeError("Interaction direction is invalid.");
    }
    const audit = auditTimestamps(record.createdAt, record.updatedAt);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO interaction(
           id, job_id, contact_id, type, occurred_at, direction, summary, next_action_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("interaction", record.id),
          entityId("job", record.jobId),
          record.contactId === null ? null : entityId("contact", record.contactId),
          safeIdentifier(record.type, "Interaction type"),
          instant(record.occurredAt),
          record.direction,
          boundedText(record.summary, "Interaction summary", 200_000),
          record.nextActionAt === null ? null : instant(record.nextActionAt),
          audit.createdAt,
          audit.updatedAt,
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "create");
  }

  public async findById(id: EntityId<"interaction">): Promise<InteractionRecord | undefined> {
    const rows = await this.session.query<InteractionRow>(
      sqlStatement(
        `SELECT id, job_id, contact_id, type, occurred_at, direction, summary, next_action_at,
                created_at, updated_at, row_version
         FROM interaction WHERE id = ?`,
        [entityId("interaction", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapInteraction(rows[0]);
  }
}

export class NextActionRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async findById(id: EntityId<"next-action">): Promise<NextActionRecord | undefined> {
    const rows = await this.session.query<NextActionRow>(
      sqlStatement(
        `SELECT id, job_id, application_id, interaction_id, title, due_at, timezone, state,
                completed_at, created_at, updated_at, row_version
         FROM next_action WHERE id = ?`,
        [entityId("next-action", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapNextAction(rows[0]);
  }
}

export class InterviewRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewInterview): Promise<void> {
    if (!Number.isSafeInteger(record.durationMinutes) || record.durationMinutes < 1) {
      throw new TypeError("Interview duration must be a positive whole number of minutes.");
    }
    const audit = auditTimestamps(record.createdAt, record.updatedAt);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO interview(
           id, application_id, stage_name, starts_at, timezone, duration_minutes,
           location_or_url, contact_ids_json, preparation_notes, outcome, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("interview", record.id),
          entityId("application", record.applicationId),
          boundedText(record.stageName, "Interview stage", 256, true),
          instant(record.startsAt),
          timeZone(record.timeZone),
          record.durationMinutes,
          optionalText(record.locationOrUrl, "Interview location", 8192),
          serializeContactIds(record.contactIds),
          boundedText(record.preparationNotes, "Interview preparation notes", 200_000),
          optionalText(record.outcome, "Interview outcome", 200_000),
          audit.createdAt,
          audit.updatedAt,
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "create");
  }

  public async findById(id: EntityId<"interview">): Promise<InterviewRecord | undefined> {
    const rows = await this.session.query<InterviewRow>(
      sqlStatement(
        `SELECT id, application_id, stage_name, starts_at, timezone, duration_minutes,
                location_or_url, contact_ids_json, preparation_notes, outcome, created_at,
                updated_at, row_version
         FROM interview WHERE id = ?`,
        [entityId("interview", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapInterview(rows[0]);
  }
}

export class ReminderRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async create(record: NewReminder): Promise<void> {
    if (!REMINDER_STATES.has(record.state)) throw new TypeError("Reminder state is invalid.");
    const audit = auditTimestamps(record.createdAt, record.updatedAt);
    const firedAt = record.firedAt === null ? null : instant(record.firedAt);
    if ((record.state === "fired") !== (firedAt !== null)) {
      throw new TypeError("A fired reminder requires exactly one fired timestamp.");
    }
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO reminder(
           id, job_id, next_action_id, interview_id, remind_at, timezone, state, note, fired_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId("reminder", record.id),
          entityId("job", record.jobId),
          record.nextActionId === null ? null : entityId("next-action", record.nextActionId),
          record.interviewId === null ? null : entityId("interview", record.interviewId),
          instant(record.remindAt),
          timeZone(record.timeZone),
          record.state,
          optionalText(record.note, "Reminder note", 200_000),
          firedAt,
          audit.createdAt,
          audit.updatedAt,
        ],
      ),
    );
    assertOneRow(result.rowsAffected, "create");
  }

  public async findById(id: EntityId<"reminder">): Promise<ReminderRecord | undefined> {
    const rows = await this.session.query<ReminderRow>(
      sqlStatement(
        `SELECT id, job_id, next_action_id, interview_id, remind_at, timezone, state, note,
                fired_at, created_at, updated_at, row_version
         FROM reminder WHERE id = ?`,
        [entityId("reminder", id)],
      ),
    );
    return rows[0] === undefined ? undefined : mapReminder(rows[0]);
  }

  public async markFired(id: EntityId<"reminder">, firedAt: Instant): Promise<void> {
    const result = await this.session.execute(
      sqlStatement(
        `UPDATE reminder
         SET state = 'fired', fired_at = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND state = 'pending'`,
        [instant(firedAt), instant(firedAt), entityId("reminder", id)],
      ),
    );
    if (result.rowsAffected !== 1) {
      throw new PipelineRepositoryConflictError("pipeline_projection_conflict");
    }
  }
}

export interface PipelineRepositories {
  readonly applications: ApplicationRepository;
  readonly interactions: InteractionRepository;
  readonly interviews: InterviewRepository;
  readonly nextActions: NextActionRepository;
  readonly reminders: ReminderRepository;
  readonly statusDefinitions: StatusDefinitionRepository;
  readonly statusEvents: StatusEventRepository;
}

export const createPipelineRepositories = (session: DatabaseSession): PipelineRepositories =>
  Object.freeze({
    applications: new ApplicationRepository(session),
    interactions: new InteractionRepository(session),
    interviews: new InterviewRepository(session),
    nextActions: new NextActionRepository(session),
    reminders: new ReminderRepository(session),
    statusDefinitions: new StatusDefinitionRepository(session),
    statusEvents: new StatusEventRepository(session),
  });

export interface ChangePipelineStatusInput {
  readonly eventId: EntityId<"status-event">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly toStatusId: StatusDefinitionId;
  readonly occurredAt: Instant;
  readonly note: string | null;
  readonly allowReopen?: boolean;
}

export const changePipelineStatus = async (
  database: DatabasePort,
  input: ChangePipelineStatusInput,
): Promise<StatusEventRecord> =>
  database.transaction(async (transaction) => {
    const jobId = entityId("job", input.jobId);
    const jobRows = await transaction.query<JobProjectionRow>(
      sqlStatement("SELECT current_status_id, next_action_at FROM job WHERE id = ?", [jobId]),
    );
    const job = jobRows[0];
    if (job === undefined) {
      throw new PipelineRepositoryConflictError("pipeline_record_not_found");
    }

    let fromStatusId = optionalEntityId("status_definition", job.current_status_id);
    if (input.applicationId !== null) {
      const applicationRows = await transaction.query<ApplicationRow>(
        sqlStatement(
          `SELECT id, job_id, applied_at, channel, current_status_id,
                  selected_resume_version_id, selected_cover_letter_version_id, notes,
                  archived_at, created_at, updated_at, row_version
           FROM application WHERE id = ?`,
          [entityId("application", input.applicationId)],
        ),
      );
      const application = applicationRows[0];
      if (application?.job_id !== jobId) {
        throw new PipelineRepositoryConflictError("pipeline_record_not_found");
      }
      const applicationStatusId = entityId("status_definition", application.current_status_id);
      if (fromStatusId !== applicationStatusId) {
        throw new PipelineRepositoryConflictError("pipeline_projection_conflict");
      }
      fromStatusId = applicationStatusId;
    }

    const repositories = createPipelineRepositories(transaction);
    const target = await repositories.statusDefinitions.findById(input.toStatusId);
    if (target?.archivedAt !== null) {
      throw new PipelineRepositoryConflictError("pipeline_record_not_found");
    }
    if (fromStatusId !== null) {
      const current = await repositories.statusDefinitions.findById(fromStatusId);
      if (current === undefined) {
        throw new PipelineRepositoryConflictError("pipeline_record_not_found");
      }
      const decision = evaluateStatusTransition(
        current,
        target,
        input.allowReopen === undefined ? {} : { allowReopen: input.allowReopen },
      );
      if (!decision.allowed) {
        throw new PipelineRepositoryConflictError(
          decision.reason === "same_stage"
            ? "same_status"
            : "reopen_requires_explicit_confirmation",
        );
      }
    }

    const occurredAt = instant(input.occurredAt);
    const updatedJob = await transaction.execute(
      sqlStatement(
        `UPDATE job
         SET current_status_id = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND current_status_id IS ?`,
        [target.id, occurredAt, jobId, fromStatusId],
      ),
    );
    assertOneRow(updatedJob.rowsAffected, "projection");

    if (input.applicationId !== null) {
      const updatedApplication = await transaction.execute(
        sqlStatement(
          `UPDATE application
           SET current_status_id = ?, updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND job_id = ? AND current_status_id IS ?`,
          [
            target.id,
            occurredAt,
            entityId("application", input.applicationId),
            jobId,
            fromStatusId,
          ],
        ),
      );
      assertOneRow(updatedApplication.rowsAffected, "projection");
    }

    const eventId = entityId("status-event", input.eventId);
    const note = optionalText(input.note, "Status event note", 200_000);
    const inserted = await transaction.execute(
      sqlStatement(
        `INSERT INTO status_event(
           id, job_id, application_id, from_status_id, to_status_id, occurred_at, note,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          jobId,
          input.applicationId === null ? null : entityId("application", input.applicationId),
          fromStatusId,
          target.id,
          occurredAt,
          note,
          occurredAt,
        ],
      ),
    );
    assertOneRow(inserted.rowsAffected, "create");
    return Object.freeze({
      id: eventId,
      jobId,
      applicationId: input.applicationId,
      fromStatusId,
      toStatusId: target.id,
      occurredAt,
      note,
      createdAt: occurredAt,
      rowVersion: 1,
    });
  });

export const setNextAction = async (
  database: DatabasePort,
  record: NewNextAction,
): Promise<void> => {
  if (record.state !== "pending" || record.completedAt !== null) {
    throw new TypeError("A new next action must be pending and incomplete.");
  }
  const audit = auditTimestamps(record.createdAt, record.updatedAt);
  await database.transaction(async (transaction) => {
    const jobId = entityId("job", record.jobId);
    const jobRows = await transaction.query<JobProjectionRow>(
      sqlStatement("SELECT current_status_id, next_action_at FROM job WHERE id = ?", [jobId]),
    );
    if (jobRows[0] === undefined) {
      throw new PipelineRepositoryConflictError("pipeline_record_not_found");
    }
    if (record.applicationId !== null) {
      const rows = await transaction.query<CountRow>(
        sqlStatement("SELECT count(*) AS total FROM application WHERE id = ? AND job_id = ?", [
          entityId("application", record.applicationId),
          jobId,
        ]),
      );
      if (rows[0]?.total !== 1) {
        throw new PipelineRepositoryConflictError("pipeline_record_not_found");
      }
    }
    if (record.interactionId !== null) {
      const rows = await transaction.query<CountRow>(
        sqlStatement("SELECT count(*) AS total FROM interaction WHERE id = ? AND job_id = ?", [
          entityId("interaction", record.interactionId),
          jobId,
        ]),
      );
      if (rows[0]?.total !== 1) {
        throw new PipelineRepositoryConflictError("pipeline_record_not_found");
      }
    }
    const dueAt = record.dueAt === null ? null : instant(record.dueAt);
    const inserted = await transaction.execute(
      sqlStatement(
        `INSERT INTO next_action(
           id, job_id, application_id, interaction_id, title, due_at, timezone, state,
           completed_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`,
        [
          entityId("next-action", record.id),
          jobId,
          record.applicationId === null ? null : entityId("application", record.applicationId),
          record.interactionId === null ? null : entityId("interaction", record.interactionId),
          boundedText(record.title, "Next-action title", 512, true),
          dueAt,
          record.timeZone === null ? null : timeZone(record.timeZone),
          audit.createdAt,
          audit.updatedAt,
        ],
      ),
    );
    assertOneRow(inserted.rowsAffected, "create");
    const updated = await transaction.execute(
      sqlStatement(
        `UPDATE job
         SET next_action_at = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ?`,
        [dueAt, audit.updatedAt, jobId],
      ),
    );
    assertOneRow(updated.rowsAffected, "projection");
  });
};

export const completeNextAction = async (
  database: DatabasePort,
  id: EntityId<"next-action">,
  completedAt: Instant,
): Promise<void> => {
  await database.transaction(async (transaction) => {
    const repositories = createPipelineRepositories(transaction);
    const current = await repositories.nextActions.findById(id);
    if (current === undefined) {
      throw new PipelineRepositoryConflictError("pipeline_record_not_found");
    }
    if (current.state !== "pending") {
      throw new PipelineRepositoryConflictError("next_action_not_pending");
    }
    const timestamp = instant(completedAt);
    const completed = await transaction.execute(
      sqlStatement(
        `UPDATE next_action
         SET state = 'completed', completed_at = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND state = 'pending'`,
        [timestamp, timestamp, entityId("next-action", id)],
      ),
    );
    assertOneRow(completed.rowsAffected, "projection");
    interface DueRow extends QueryRow {
      readonly due_at: string | null;
    }
    const dueRows = await transaction.query<DueRow>(
      sqlStatement(
        `SELECT min(due_at) AS due_at
         FROM next_action
         WHERE job_id = ? AND state = 'pending' AND due_at IS NOT NULL`,
        [current.jobId],
      ),
    );
    const nextDue = dueRows[0]?.due_at ?? null;
    const updated = await transaction.execute(
      sqlStatement(
        `UPDATE job
         SET next_action_at = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ?`,
        [nextDue, timestamp, current.jobId],
      ),
    );
    assertOneRow(updated.rowsAffected, "projection");
  });
};
