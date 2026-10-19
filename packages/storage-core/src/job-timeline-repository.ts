import {
  JobTimelineError,
  type JobTimelineItemDto,
  type JobTimelinePort,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { sqlStatement, type DatabasePort, type QueryRow, type SqlValue } from "./database-port.js";

const text = (value: SqlValue | undefined): string => {
  if (typeof value !== "string") throw new JobTimelineError("invalid_state");
  return value;
};
const nullableText = (value: SqlValue | undefined): string | null =>
  value === null ? null : text(value);
// Both arms bind the same job and snapshot ceiling. No display value enters SQL text.
const history = `WITH history AS (
  SELECT e.id, 'status' AS kind, e.job_id, e.occurred_at, e.created_at,
    e.application_id, e.from_status_id, f.name AS from_status_name,
    e.to_status_id, t.name AS to_status_name, e.note,
    CASE WHEN u.consumed_at <= ? THEN u.consumed_at ELSE NULL END AS undone_at,
    NULL AS contact_id, NULL AS type, NULL AS direction, NULL AS summary,
    a.job_id AS application_job_id, u.job_id AS undo_job_id,
    u.status_application_id AS undo_application_id
  FROM status_event e
    LEFT JOIN status_definition f ON f.id = e.from_status_id
    LEFT JOIN status_definition t ON t.id = e.to_status_id
    LEFT JOIN application a ON a.id = e.application_id
    LEFT JOIN mutation_undo_token u ON u.status_event_id = e.id AND u.kind = 'status_change'
  WHERE e.job_id = ? AND e.occurred_at <= ? AND e.created_at <= ?
  UNION ALL
  SELECT i.id, 'interaction', i.job_id, i.occurred_at, i.created_at,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    i.contact_id, i.type, i.direction, i.summary, NULL, NULL, NULL
  FROM interaction i WHERE i.job_id = ? AND i.occurred_at <= ? AND i.created_at <= ?
)`;
const itemFrom = (row: QueryRow): JobTimelineItemDto => {
  const jobId = entityId("job", text(row["job_id"]));
  const base = {
    id: text(row["id"]),
    jobId,
    occurredAt: instant(text(row["occurred_at"])),
    createdAt: instant(text(row["created_at"])),
  };
  if (row["kind"] === "status") {
    const applicationId =
      row["application_id"] === null ? null : entityId("application", text(row["application_id"]));
    if (
      (applicationId !== null && row["application_job_id"] !== jobId) ||
      (row["undo_job_id"] !== null &&
        (row["undo_job_id"] !== jobId || row["undo_application_id"] !== applicationId))
    )
      throw new JobTimelineError("invalid_state");
    return {
      ...base,
      kind: "status",
      applicationId,
      fromStatus:
        row["from_status_id"] === null
          ? null
          : {
              id: entityId("status_definition", text(row["from_status_id"])),
              name: text(row["from_status_name"]),
            },
      toStatus: {
        id: entityId("status_definition", text(row["to_status_id"])),
        name: text(row["to_status_name"]),
      },
      note: nullableText(row["note"]),
      undoneAt: row["undone_at"] === null ? null : instant(text(row["undone_at"])),
    };
  }
  if (row["kind"] !== "interaction") throw new JobTimelineError("invalid_state");
  const direction = row["direction"];
  if (
    direction !== "inbound" &&
    direction !== "outbound" &&
    direction !== "mutual" &&
    direction !== "unknown"
  )
    throw new JobTimelineError("invalid_state");
  return {
    ...base,
    kind: "interaction",
    contactId: row["contact_id"] === null ? null : entityId("contact", text(row["contact_id"])),
    type: text(row["type"]),
    direction,
    summary: text(row["summary"]),
  };
};

export const createJobTimelineRepository = (database: DatabasePort): JobTimelinePort => ({
  listPage: (input) =>
    database.transaction(async (session) => {
      const jobId = entityId("job", input.jobId);
      const asOf = instant(input.asOf);
      if (
        typeof input.includeArchived !== "boolean" ||
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 100
      )
        throw new JobTimelineError("invalid_state");
      const jobs = await session.query(
        sqlStatement("SELECT archived_at FROM job WHERE id = ?", [jobId]),
      );
      if (jobs.length === 0 || (!input.includeArchived && jobs[0]?.["archived_at"] !== null))
        return undefined;
      const parameters: SqlValue[] = [asOf, jobId, asOf, asOf, jobId, asOf, asOf];
      const after = input.after;
      let predicate = "1 = 1";
      if (after !== null) {
        if (
          after.jobId !== jobId ||
          after.asOf !== asOf ||
          after.includeArchived !== input.includeArchived ||
          !new Set<string>(["status", "interaction"]).has(after.kind) ||
          instant(after.occurredAt) > asOf
        )
          throw new JobTimelineError("cursor_invalidated");
        entityId(after.kind === "status" ? "status-event" : "interaction", after.id);
        const anchor = await session.query(
          sqlStatement(
            `${history} SELECT id FROM history WHERE kind = ? AND id = ? AND occurred_at = ?`,
            [...parameters, after.kind, after.id, after.occurredAt],
          ),
        );
        if (anchor.length !== 1) throw new JobTimelineError("cursor_invalidated");
        predicate =
          "(occurred_at < ? OR (occurred_at = ? AND (kind > ? OR (kind = ? AND id > ?))))";
        parameters.push(after.occurredAt, after.occurredAt, after.kind, after.kind, after.id);
      }
      const rows = await session.query(
        sqlStatement(
          `${history} SELECT * FROM history WHERE ${predicate}
      ORDER BY occurred_at DESC, kind ASC, id ASC LIMIT ?`,
          [...parameters, input.limit + 1],
        ),
      );
      const items = rows.slice(0, input.limit).map(itemFrom);
      const hasMore = rows.length > input.limit;
      const last = items.at(-1);
      return {
        jobId,
        asOf,
        includeArchived: input.includeArchived,
        items,
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? {
                jobId,
                asOf,
                includeArchived: input.includeArchived,
                occurredAt: last.occurredAt,
                kind: last.kind,
                id: last.id,
              }
            : null,
      };
    }),
});
