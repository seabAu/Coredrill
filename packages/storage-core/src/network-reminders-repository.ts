import {
  NetworkRemindersError,
  networkReminderReferenceV1,
  parseNetworkReminderV1,
  parseNetworkRemindersPageV1,
  parseNetworkRemindersRequestV1,
  validateNetworkReminderSequenceV1,
  type NetworkReminderReferenceV1,
  type NetworkReminderScopeV1,
  type NetworkRemindersPortV1,
} from "@coredrill/application";
import { instant } from "@coredrill/domain";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";
type Reader = Pick<DatabaseSession, "query">;
const invalid = (): never => {
  throw new NetworkRemindersError("invalid_state");
};
const stale = (): never => {
  throw new NetworkRemindersError("stale");
};
const text = (value: SqlValue | undefined) => (typeof value === "string" ? value : invalid());
const time = (value: SqlValue | undefined) => {
  try {
    return instant(text(value));
  } catch {
    return invalid();
  }
};
const integer = (value: SqlValue | undefined, min = 1, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : invalid();
const audit = (row: QueryRow, prefix: string, archived = false) => {
  const start = time(row[`${prefix}created_at`]),
    end = time(row[`${prefix}updated_at`]);
  if (start > end) return invalid();
  if (archived && row[`${prefix}archived_at`] !== null) {
    const at = time(row[`${prefix}archived_at`]);
    if (at < start || at > end) return invalid();
  }
};
const bounded = (column: string, alias: string, max: number) =>
  `substr(CAST(${column} AS BLOB),1,${String(max * 4 + 1)}) AS ${alias}_bytes,length(CAST(${column} AS BLOB)) AS ${alias}_length`;
const literal = (row: QueryRow, alias: string, max: number) => {
  const size = integer(row[`${alias}_length`], 0, max * 4),
    raw = row[`${alias}_bytes`],
    bytes = size === 0 && raw === null ? new Uint8Array() : raw;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== size) return invalid();
  try {
    const result = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return result.length <= max ? result : invalid();
  } catch {
    return invalid();
  }
};
const projection = `r.id,r.job_id,r.next_action_id,r.interview_id,r.remind_at,${bounded("r.timezone", "reminder_timezone", 128)},r.state,r.fired_at,r.created_at,r.updated_at,r.row_version,
j.id AS job_identity,j.company_id,${bounded("j.title", "job_title", 1024)},j.archived_at AS job_archived_at,j.created_at AS job_created_at,j.updated_at AS job_updated_at,j.row_version AS job_row_version,
c.id AS company_identity,${bounded("c.canonical_name", "company_name", 512)},c.archived_at AS company_archived_at,c.created_at AS company_created_at,c.updated_at AS company_updated_at,c.row_version AS company_row_version,
n.id AS task_identity,n.job_id AS task_job_id,n.application_id AS task_application_id,ta.id AS task_application_identity,ta.job_id AS task_application_job_id,${bounded("n.title", "task_title", 512)},n.state AS task_state,n.due_at AS task_due_at,${bounded("n.timezone", "task_timezone", 128)},n.completed_at AS task_completed_at,n.created_at AS task_created_at,n.updated_at AS task_updated_at,n.row_version AS task_row_version,
i.id AS interview_identity,i.application_id AS interview_application_id,${bounded("i.stage_name", "interview_stage", 256)},i.starts_at AS interview_starts_at,${bounded("i.timezone", "interview_timezone", 128)},i.duration_minutes AS interview_duration_minutes,i.created_at AS interview_created_at,i.updated_at AS interview_updated_at,i.row_version AS interview_row_version,
a.id AS application_identity,a.job_id AS application_job_id,a.archived_at AS application_archived_at,a.created_at AS application_created_at,a.updated_at AS application_updated_at,a.row_version AS application_row_version`;
const from =
  "FROM reminder r LEFT JOIN job j ON j.id=r.job_id LEFT JOIN company c ON c.id=j.company_id LEFT JOIN next_action n ON n.id=r.next_action_id LEFT JOIN application ta ON ta.id=n.application_id LEFT JOIN interview i ON i.id=r.interview_id LEFT JOIN application a ON a.id=i.application_id";
const absent = (row: QueryRow, names: readonly string[]) => {
  if (names.some((name) => row[name] !== null)) return invalid();
};
const metadata = (row: QueryRow, owner: NetworkReminderScopeV1) => {
  if (row["state"] !== "pending") return stale();
  if (row["fired_at"] !== null || row["job_id"] !== row["job_identity"]) return invalid();
  audit(row, "");
  audit(row, "job_", true);
  if (!owner.includeArchivedJobs && row["job_archived_at"] !== null) return stale();
  if (row["company_id"] === null)
    absent(row, [
      "company_identity",
      "company_name_bytes",
      "company_name_length",
      "company_archived_at",
      "company_created_at",
      "company_updated_at",
      "company_row_version",
    ]);
  else {
    if (row["company_id"] !== row["company_identity"]) return invalid();
    audit(row, "company_", true);
  }
  if (row["next_action_id"] === null)
    absent(row, [
      "task_identity",
      "task_job_id",
      "task_application_id",
      "task_application_identity",
      "task_application_job_id",
      "task_title_bytes",
      "task_title_length",
      "task_state",
      "task_due_at",
      "task_timezone_bytes",
      "task_timezone_length",
      "task_completed_at",
      "task_created_at",
      "task_updated_at",
      "task_row_version",
    ]);
  else {
    if (row["next_action_id"] !== row["task_identity"] || row["task_job_id"] !== row["job_id"])
      return invalid();
    audit(row, "task_");
    if ((row["task_state"] === "completed") !== (row["task_completed_at"] !== null))
      return invalid();
    if (
      row["task_completed_at"] !== null &&
      (time(row["task_completed_at"]) < time(row["task_created_at"]) ||
        time(row["task_completed_at"]) > time(row["task_updated_at"]))
    )
      return invalid();
    if (row["task_application_id"] === null)
      absent(row, ["task_application_identity", "task_application_job_id"]);
    else if (
      row["task_application_id"] !== row["task_application_identity"] ||
      row["task_application_job_id"] !== row["job_id"]
    )
      return invalid();
  }
  if (row["interview_id"] === null)
    absent(row, [
      "interview_identity",
      "interview_application_id",
      "interview_stage_bytes",
      "interview_stage_length",
      "interview_starts_at",
      "interview_timezone_bytes",
      "interview_timezone_length",
      "interview_duration_minutes",
      "interview_created_at",
      "interview_updated_at",
      "interview_row_version",
      "application_identity",
      "application_job_id",
      "application_archived_at",
      "application_created_at",
      "application_updated_at",
      "application_row_version",
    ]);
  else {
    if (
      row["interview_id"] !== row["interview_identity"] ||
      row["interview_application_id"] !== row["application_identity"] ||
      row["application_job_id"] !== row["job_id"]
    )
      return invalid();
    audit(row, "interview_");
    audit(row, "application_", true);
  }
  try {
    return parseNetworkReminderV1(
      {
        id: row["id"],
        state: row["state"],
        remindAt: row["remind_at"],
        timeZone: literal(row, "reminder_timezone", 128),
        createdAt: row["created_at"],
        updatedAt: row["updated_at"],
        rowVersion: row["row_version"],
        currentJob: {
          id: row["job_id"],
          title: literal(row, "job_title", 1024),
          archivedAt: row["job_archived_at"],
          rowVersion: row["job_row_version"],
          company:
            row["company_id"] === null
              ? null
              : {
                  id: row["company_id"],
                  name: literal(row, "company_name", 512),
                  archivedAt: row["company_archived_at"],
                  rowVersion: row["company_row_version"],
                },
        },
        nextAction:
          row["next_action_id"] === null
            ? null
            : {
                id: row["next_action_id"],
                jobId: row["task_job_id"],
                title: literal(row, "task_title", 512),
                state: row["task_state"],
                dueAt: row["task_due_at"],
                timeZone:
                  row["task_due_at"] === null && row["task_timezone_length"] === null
                    ? null
                    : literal(row, "task_timezone", 128),
                rowVersion: row["task_row_version"],
              },
        interview:
          row["interview_id"] === null
            ? null
            : {
                id: row["interview_id"],
                stageName: literal(row, "interview_stage", 256),
                startsAt: row["interview_starts_at"],
                timeZone: literal(row, "interview_timezone", 128),
                durationMinutes: row["interview_duration_minutes"],
                rowVersion: row["interview_row_version"],
                application: {
                  id: row["interview_application_id"],
                  jobId: row["application_job_id"],
                  archivedAt: row["application_archived_at"],
                  rowVersion: row["application_row_version"],
                },
              },
      },
      owner,
    );
  } catch {
    return invalid();
  }
};
/** Actual pending rows; no contact inference, private bodies, totals or canonical writes. */
export const createNetworkRemindersRepository = (database: DatabasePort): NetworkRemindersPortV1 =>
  Object.freeze<NetworkRemindersPortV1>({
    listPage: async (input) => {
      const request = parseNetworkRemindersRequestV1(input);
      const read = async (session: Reader) => {
        const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
        if (roots.length > 1) return invalid();
        if (roots[0]?.["id"] !== request.expectedVaultId) return undefined;
        if (request.after !== null) {
          const rows = await session.query(
            sqlStatement(`SELECT ${projection} ${from} WHERE r.id=? LIMIT 2`, [request.after.id]),
          );
          if (rows.length > 1) return invalid();
          const row = rows[0];
          if (row === undefined) return stale();
          if (
            JSON.stringify(networkReminderReferenceV1(request, metadata(row, request))) !==
            JSON.stringify(request.after)
          )
            return stale();
        }
        const parameters: SqlValue[] = [],
          after: NetworkReminderReferenceV1 | null = request.after;
        const continuation =
          after === null ? "1=1" : "(r.remind_at > ? OR (r.remind_at = ? AND r.id > ?))";
        if (after !== null) parameters.push(after.remindAt, after.remindAt, after.id);
        const rows = await session.query(
          sqlStatement(
            `SELECT ${projection} ${from} WHERE r.state='pending' AND ${request.includeArchivedJobs ? "1=1" : "j.archived_at IS NULL"} AND ${continuation} ORDER BY r.remind_at ASC,r.id ASC LIMIT ?`,
            [...parameters, request.limit + 1],
          ),
        );
        if (rows.length > request.limit + 1) return invalid();
        const items = rows.map((row) => metadata(row, request));
        try {
          validateNetworkReminderSequenceV1(items, request.after);
        } catch {
          return invalid();
        }
        const selected = items.slice(0, request.limit),
          last = selected.at(-1),
          hasMore = items.length > request.limit;
        return parseNetworkRemindersPageV1(
          {
            specVersion: request.specVersion,
            expectedVaultId: request.expectedVaultId,
            includeArchivedJobs: request.includeArchivedJobs,
            items: selected,
            hasMore,
            nextCursor:
              hasMore && last !== undefined ? networkReminderReferenceV1(request, last) : null,
          },
          request,
        );
      };
      return database.withReadSnapshot === undefined
        ? database.transaction(read)
        : database.withReadSnapshot(read);
    },
  });
