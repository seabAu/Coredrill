import {
  PipelineQueryError,
  type PipelineQueryPort,
  type PipelineJobSummaryDto,
  type PipelineStatusSummaryDto,
  type PipelineTagSummaryDto,
  type ListPipelineJobsPortInput,
} from "@coredrill/application";
import { createStatusStage, dateOnly, entityId, instant, timeZone } from "@coredrill/domain";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";
import { createPipelineRepositories } from "./pipeline-repositories.js";
import { createTrackerRepositories } from "./tracker-repositories.js";

const text = (value: SqlValue | undefined): string => {
  if (typeof value !== "string") throw new PipelineQueryError("invalid_state");
  return value;
};
const nullableText = (value: SqlValue | undefined): string | null =>
  value === null ? null : text(value);
const count = (value: SqlValue | undefined): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new PipelineQueryError("invalid_state");
  return value;
};
const nullableInstant = (value: SqlValue | undefined) =>
  value === null ? null : instant(text(value));
const status = (row: QueryRow): PipelineStatusSummaryDto | null => {
  if (row["status_id"] === null) return null;
  const stage = createStatusStage({
    id: text(row["status_id"]),
    name: text(row["status_name"]),
    category: text(row["status_category"]),
    sortOrder: count(row["status_order"]),
    terminal: row["status_terminal"] === 1,
  });
  return {
    id: stage.id,
    name: stage.name,
    category: stage.category,
    color: nullableText(row["status_color"]),
    terminal: stage.terminal,
  };
};
const summarySelect = `SELECT j.id, j.title, j.workplace_type, j.date_posted, j.valid_through,
  j.archived_at, j.created_at, j.updated_at, j.row_version,
  c.id AS company_identity, c.canonical_name AS company_name,
  s.id AS status_id, s.name AS status_name, s.category AS status_category,
  s.color AS status_color, s.sort_order AS status_order, s.terminal AS status_terminal,
  l.label AS location_label, n.id AS action_id, n.title AS action_title,
  n.due_at AS action_due, n.timezone AS action_timezone,
  (SELECT max(i.occurred_at) FROM interaction i WHERE i.job_id = j.id) AS last_interaction
  FROM job j LEFT JOIN company c ON c.id = j.company_id
  LEFT JOIN status_definition s ON s.id = j.current_status_id
  LEFT JOIN location l ON l.id = j.location_id
  LEFT JOIN next_action n ON n.id = (SELECT a.id FROM next_action a
    WHERE a.job_id = j.id AND a.state = 'pending'
    ORDER BY a.due_at IS NULL, a.due_at, a.created_at, a.id LIMIT 1)`;

const summaries = async (
  session: DatabaseSession,
  rows: readonly QueryRow[],
): Promise<readonly PipelineJobSummaryDto[]> => {
  const tags = new Map<string, PipelineTagSummaryDto[]>();
  if (rows.length > 0) {
    const tagged = await session.query(
      sqlStatement(
        `SELECT jt.job_id, t.id, t.name, t.color
      FROM job_tag jt JOIN tag t ON t.id = jt.tag_id
      WHERE t.archived_at IS NULL AND jt.job_id IN (${rows.map(() => "?").join(",")})
      ORDER BY jt.job_id, t.name COLLATE NOCASE, t.id`,
        rows.map((row) => text(row["id"])),
      ),
    );
    for (const row of tagged) {
      const jobId = text(row["job_id"]);
      const items = tags.get(jobId) ?? [];
      items.push({
        id: entityId("tag", text(row["id"])),
        name: text(row["name"]),
        color: nullableText(row["color"]),
      });
      tags.set(jobId, items);
    }
  }
  return rows.map((row) => ({
    id: entityId("job", text(row["id"])),
    title: text(row["title"]),
    company:
      row["company_identity"] === null
        ? null
        : {
            id: entityId("company", text(row["company_identity"])),
            name: text(row["company_name"]),
          },
    status: status(row),
    workplaceType: nullableText(row["workplace_type"]),
    locationLabel: nullableText(row["location_label"]),
    datePosted: row["date_posted"] === null ? null : dateOnly(text(row["date_posted"])),
    validThrough: row["valid_through"] === null ? null : dateOnly(text(row["valid_through"])),
    nextAction:
      row["action_id"] === null
        ? null
        : {
            id: entityId("next-action", text(row["action_id"])),
            title: text(row["action_title"]),
            dueAt: nullableInstant(row["action_due"]),
          },
    lastInteractionAt: nullableInstant(row["last_interaction"]),
    tags: tags.get(text(row["id"])) ?? [],
    archivedAt: nullableInstant(row["archived_at"]),
    createdAt: instant(text(row["created_at"])),
    updatedAt: instant(text(row["updated_at"])),
    rowVersion: count(row["row_version"]),
  }));
};
const pageScope = (input: ListPipelineJobsPortInput): { sql: string; parameters: SqlValue[] } => {
  const clauses = [input.includeArchived ? "1 = 1" : "j.archived_at IS NULL"];
  const parameters: SqlValue[] = [];
  if (input.statusFilter.kind === "unassigned") clauses.push("j.current_status_id IS NULL");
  else if (input.statusFilter.kind === "status") {
    clauses.push("j.current_status_id = ?");
    parameters.push(entityId("status_definition", input.statusFilter.statusId));
  }
  return { sql: clauses.join(" AND "), parameters };
};

/** Concrete read-only APP-005 adapter. Each multi-query projection is one SQLite snapshot. */
export const createPipelineQueryRepository = (database: DatabasePort): PipelineQueryPort => ({
  getCounts: (input) =>
    database.transaction(async (session) => {
      const asOf = instant(input.asOf);
      const rows = await session.query(
        sqlStatement(
          `SELECT count(*) AS all_jobs,
      coalesce(sum(EXISTS(SELECT 1 FROM next_action a WHERE a.job_id = j.id AND a.state = 'pending')), 0) AS needs_action,
      coalesce(sum(EXISTS(SELECT 1 FROM next_action a WHERE a.job_id = j.id AND a.state = 'pending' AND a.due_at < ?)), 0) AS overdue,
      coalesce(sum(EXISTS(SELECT 1 FROM interview i JOIN application a ON a.id = i.application_id WHERE a.job_id = j.id AND a.archived_at IS NULL AND i.starts_at >= ? AND i.outcome IS NULL)), 0) AS upcoming_interviews,
      coalesce(sum(s.category = 'applied' AND s.terminal = 0), 0) AS waiting,
      coalesce(sum(s.terminal = 1), 0) AS closed
      FROM job j LEFT JOIN status_definition s ON s.id = j.current_status_id
      WHERE ${input.includeArchived ? "1 = 1" : "j.archived_at IS NULL"}`,
          [asOf, asOf],
        ),
      );
      const row = rows[0];
      if (row === undefined) throw new PipelineQueryError("invalid_state");
      return {
        asOf,
        includeArchived: input.includeArchived,
        all: count(row["all_jobs"]),
        needsAction: count(row["needs_action"]),
        overdue: count(row["overdue"]),
        upcomingInterviews: count(row["upcoming_interviews"]),
        waiting: count(row["waiting"]),
        closed: count(row["closed"]),
      };
    }),
  listBoardGroups: (input) =>
    database.transaction(async (session) => {
      const rows = await session.query(
        sqlStatement(`SELECT s.id AS status_id, s.name AS status_name, s.category AS status_category,
      s.color AS status_color, s.sort_order AS status_order, s.terminal AS status_terminal, count(j.id) AS jobs
      FROM status_definition s LEFT JOIN job j ON j.current_status_id = s.id ${input.includeArchived ? "" : "AND j.archived_at IS NULL"}
      WHERE s.archived_at IS NULL OR j.id IS NOT NULL GROUP BY s.id ORDER BY s.sort_order, s.id`),
      );
      const unassigned = await session.query(
        sqlStatement(
          `SELECT count(*) AS jobs FROM job WHERE current_status_id IS NULL ${input.includeArchived ? "" : "AND archived_at IS NULL"}`,
        ),
      );
      const groups = rows.map((row) => {
        const stage = status(row);
        if (stage === null) throw new PipelineQueryError("invalid_state");
        return {
          statusId: stage.id,
          name: stage.name,
          category: stage.category,
          color: stage.color,
          sortOrder: count(row["status_order"]),
          terminal: stage.terminal,
          jobCount: count(row["jobs"]),
        };
      });
      return [
        {
          statusId: null,
          name: "Unassigned",
          category: null,
          color: null,
          sortOrder: 0,
          terminal: false,
          jobCount: count(unassigned[0]?.["jobs"]),
        },
        ...groups,
      ];
    }),
  listJobsPage: (input) =>
    database.transaction(async (session) => {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100)
        throw new PipelineQueryError("invalid_state");
      const scope = pageScope(input);
      if (input.after !== null) {
        const anchor = await session.query(
          sqlStatement(
            `SELECT j.id FROM job j WHERE ${scope.sql} AND j.id = ? AND j.updated_at = ?`,
            [
              ...scope.parameters,
              entityId("job", input.after.jobId),
              instant(input.after.updatedAt),
            ],
          ),
        );
        if (anchor.length !== 1) throw new PipelineQueryError("cursor_invalidated");
        scope.sql += " AND (j.updated_at < ? OR (j.updated_at = ? AND j.id > ?))";
        scope.parameters.push(input.after.updatedAt, input.after.updatedAt, input.after.jobId);
      }
      const rows = await session.query(
        sqlStatement(
          `${summarySelect} WHERE ${scope.sql} ORDER BY j.updated_at DESC, j.id ASC LIMIT ?`,
          [...scope.parameters, input.limit + 1],
        ),
      );
      const hasMore = rows.length > input.limit;
      const items = await summaries(session, rows.slice(0, input.limit));
      const last = items.at(-1);
      return {
        items,
        hasMore,
        nextCursor:
          hasMore && last !== undefined ? { updatedAt: last.updatedAt, jobId: last.id } : null,
      };
    }),
  getJobWorkspace: (input) =>
    database.transaction(async (session) => {
      const jobId = entityId("job", input.jobId);
      const asOf = instant(input.asOf);
      const rows = await session.query(sqlStatement(`${summarySelect} WHERE j.id = ?`, [jobId]));
      const row = rows[0];
      if (row === undefined) return undefined;
      const job = (await summaries(session, rows))[0];
      if (job === undefined) throw new PipelineQueryError("invalid_state");
      const contentRows = await session.query(
        sqlStatement("SELECT description_text, employment_type, seniority FROM job WHERE id = ?", [
          jobId,
        ]),
      );
      const content = contentRows[0];
      if (content === undefined) throw new PipelineQueryError("invalid_state");
      const tracker = createTrackerRepositories(session);
      const pipeline = createPipelineRepositories(session);
      const company =
        job.company === null ? undefined : await tracker.companies.findById(job.company.id);
      const identities = await session.query(
        sqlStatement(
          `SELECT
      (SELECT id FROM application WHERE job_id = ? AND archived_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1) AS application_id,
      (SELECT id FROM job_source WHERE job_id = ? AND is_primary = 1 ORDER BY last_seen_at DESC, id LIMIT 1) AS source_id,
      (SELECT count(*) FROM contact WHERE company_id = ? AND archived_at IS NULL) AS contacts,
      (SELECT count(*) FROM job WHERE company_id = ? AND id <> ? AND archived_at IS NULL) AS other_jobs,
      (SELECT count(*) FROM status_event WHERE job_id = ?) + (SELECT count(*) FROM interaction WHERE job_id = ?) AS timeline,
      (SELECT count(*) FROM interview i JOIN application a ON a.id = i.application_id WHERE a.job_id = ? AND a.archived_at IS NULL AND i.starts_at >= ? AND i.outcome IS NULL) AS interviews,
      (SELECT count(*) FROM reminder WHERE job_id = ? AND state = 'pending') AS reminders`,
          [
            jobId,
            jobId,
            company?.id ?? null,
            company?.id ?? null,
            jobId,
            jobId,
            jobId,
            jobId,
            asOf,
            jobId,
          ],
        ),
      );
      const details = identities[0];
      if (details === undefined) throw new PipelineQueryError("invalid_state");
      const application =
        details["application_id"] === null
          ? undefined
          : await pipeline.applications.findById(
              entityId("application", text(details["application_id"])),
            );
      const currentStatus =
        application === undefined
          ? undefined
          : await pipeline.statusDefinitions.findById(application.currentStatusId);
      if (application !== undefined && currentStatus === undefined)
        throw new PipelineQueryError("invalid_state");
      const source =
        details["source_id"] === null
          ? undefined
          : await tracker.jobSources.findById(entityId("job-source", text(details["source_id"])));
      return {
        job,
        descriptionText: text(content["description_text"]),
        employmentType: nullableText(content["employment_type"]),
        seniority: nullableText(content["seniority"]),
        application:
          application === undefined || currentStatus === undefined
            ? null
            : { ...application, currentStatus },
        company:
          company === undefined
            ? null
            : {
                ...company,
                contactCount: count(details["contacts"]),
                otherActiveJobCount: count(details["other_jobs"]),
              },
        primarySource: source ?? null,
        attention: {
          nextAction:
            job.nextAction === null
              ? null
              : {
                  ...job.nextAction,
                  jobId,
                  timeZone:
                    row["action_timezone"] === null ? null : timeZone(text(row["action_timezone"])),
                },
          lastInteractionAt: job.lastInteractionAt,
          upcomingInterviewCount: count(details["interviews"]),
          pendingReminderCount: count(details["reminders"]),
        },
        timelineItemCount: count(details["timeline"]),
      };
    }),
});
