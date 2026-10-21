import {
  JobNextActionsError,
  type JobNextActionsPort,
  type ListJobNextActionsPortInput,
} from "@coredrill/application";
import { entityId, instant, timeZone } from "@coredrill/domain";
import { sqlStatement, type DatabasePort, type QueryRow, type SqlValue } from "./database-port.js";

const text = (value: SqlValue | undefined): string => {
  if (typeof value !== "string") throw new JobNextActionsError("invalid_state");
  return value;
};
const version = (value: SqlValue | undefined): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new JobNextActionsError("invalid_state");
  return value;
};
const fromRow = (row: QueryRow, jobId: string) => {
  if (
    row["job_id"] !== jobId ||
    (row["application_id"] !== null && row["application_job_id"] !== jobId) ||
    (row["interaction_id"] !== null && row["interaction_job_id"] !== jobId)
  )
    throw new JobNextActionsError("invalid_state");
  const state = row["state"];
  if (state !== "pending" && state !== "completed" && state !== "dismissed")
    throw new JobNextActionsError("invalid_state");
  return Object.freeze({
    id: entityId("next-action", text(row["id"])),
    jobId: entityId("job", jobId),
    applicationId:
      row["application_id"] === null ? null : entityId("application", text(row["application_id"])),
    interactionId:
      row["interaction_id"] === null ? null : entityId("interaction", text(row["interaction_id"])),
    title: text(row["title"]),
    state,
    dueAt: row["due_at"] === null ? null : instant(text(row["due_at"])),
    timeZone: row["timezone"] === null ? null : timeZone(text(row["timezone"])),
    completedAt: row["completed_at"] === null ? null : instant(text(row["completed_at"])),
    createdAt: instant(text(row["created_at"])),
    updatedAt: instant(text(row["updated_at"])),
    rowVersion: version(row["row_version"]),
  });
};

/** One bounded read transaction; mutable pages invalidate on canonical job revision changes. */
export const createJobNextActionsRepository = (database: DatabasePort): JobNextActionsPort =>
  Object.freeze({
    listPage: (input: ListJobNextActionsPortInput) => {
      const request = Object.freeze({
        ...input,
        after: input.after === null ? null : Object.freeze({ ...input.after }),
      });
      return database.transaction(async (session) => {
        const jobId = entityId("job", request.jobId);
        if (
          typeof request.includeArchived !== "boolean" ||
          !Number.isSafeInteger(request.limit) ||
          request.limit < 1 ||
          request.limit > 100
        )
          throw new JobNextActionsError("invalid_state");
        const jobs = await session.query(
          sqlStatement("SELECT row_version, archived_at FROM job WHERE id = ?", [jobId]),
        );
        const job = jobs[0];
        if (job === undefined || (!request.includeArchived && job["archived_at"] !== null))
          return undefined;
        const jobRowVersion = version(job["row_version"]);
        const after = request.after;
        const parameters: SqlValue[] = [jobId];
        let predicate = "1 = 1";
        if (after !== null) {
          if (
            after.jobId !== jobId ||
            after.includeArchived !== request.includeArchived ||
            after.jobRowVersion !== jobRowVersion
          )
            throw new JobNextActionsError("cursor_invalidated");
          const anchorId = entityId("next-action", after.id);
          const anchorAt = instant(after.createdAt);
          const anchorVersion = version(after.rowVersion);
          const anchor = await session.query(
            sqlStatement(
              "SELECT id FROM next_action WHERE job_id = ? AND id = ? AND created_at = ? AND row_version = ?",
              [jobId, anchorId, anchorAt, anchorVersion],
            ),
          );
          if (anchor.length !== 1) throw new JobNextActionsError("cursor_invalidated");
          predicate = "(n.created_at <= ? AND (n.created_at < ? OR n.id > ?))";
          parameters.push(anchorAt, anchorAt, anchorId);
        }
        const rows = await session.query(
          sqlStatement(
            `SELECT n.id, n.job_id, n.application_id, n.interaction_id, n.title, n.due_at, n.timezone,
           n.state, n.completed_at, n.created_at, n.updated_at, n.row_version,
           a.job_id AS application_job_id, i.job_id AS interaction_job_id
         FROM next_action n LEFT JOIN application a ON a.id = n.application_id
           LEFT JOIN interaction i ON i.id = n.interaction_id
         WHERE n.job_id = ? AND ${predicate}
         ORDER BY n.created_at DESC, n.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        const items = Object.freeze(rows.slice(0, request.limit).map((row) => fromRow(row, jobId)));
        const hasMore = rows.length > request.limit;
        const last = items.at(-1);
        return Object.freeze({
          jobId,
          jobRowVersion,
          includeArchived: request.includeArchived,
          items,
          hasMore,
          nextCursor:
            hasMore && last !== undefined
              ? Object.freeze({
                  jobId,
                  jobRowVersion,
                  includeArchived: request.includeArchived,
                  id: last.id,
                  createdAt: last.createdAt,
                  rowVersion: last.rowVersion,
                })
              : null,
        });
      });
    },
  });
