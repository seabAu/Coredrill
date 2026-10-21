import type { NextActionDto } from "@coredrill/application";
export type TaskResolutionKind = "complete" | "dismiss";

export interface StoredJobTasksProps {
  readonly items: readonly NextActionDto[];
  readonly loaded: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly mutating: boolean;
  readonly hasMore: boolean;
  readonly foreignReview: boolean;
  readonly reviewKind: TaskResolutionKind;
  readonly notice: string | null;
  readonly review: {
    readonly title: string;
    readonly busy: boolean;
    readonly stale: boolean;
    readonly error: string | null;
  } | null;
  readonly onRefresh: () => void;
  readonly onMore: () => void;
  readonly onReview: (task: NextActionDto, kind: TaskResolutionKind) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
const utc = (value: string) => value.replace("T", " ").replace("Z", " UTC");

/** Stored task facts and explicit gestures only; no SQL, scheduling or inferred completion. */
export const StoredJobTasks = (props: StoredJobTasksProps) => (
  <section
    aria-label="Stored job tasks"
    data-stored-tasks="true"
    tabIndex={-1}
    className="cd-job-content-section cd-stored-job-tasks"
  >
    <h3>Tasks and retained history</h3>
    <p>
      One page of up to 25 tasks, newest created first. Completed and dismissed tasks are retained.
      This is a current view, not an immutable history snapshot.
    </p>
    <button
      type="button"
      className="cd-button"
      data-task-refresh="true"
      disabled={props.busy || props.mutating}
      onClick={props.onRefresh}
    >
      Refresh job and tasks / first page
    </button>
    {props.busy || (!props.loaded && props.error === null) ? (
      <p role="status">Loading local tasks…</p>
    ) : null}
    {props.error === null ? null : <p role="alert">{props.error}</p>}
    {props.stale && props.loaded ? (
      <p>
        These task values may be stale. Refresh and review the current job before resolving a task.
      </p>
    ) : null}
    {props.notice === null ? null : <p role="status">{props.notice}</p>}
    {props.foreignReview ? (
      <section aria-label="Task review belongs to another job">
        <p>
          A task review belongs to another job. Its task text is hidden here. Return to its job or
          cancel that review before starting another.
        </p>
        <button
          type="button"
          className="cd-button"
          disabled={props.mutating}
          onClick={props.onCancel}
        >
          Cancel other job's {props.reviewKind === "complete" ? "completion" : "dismissal"} review
        </button>
      </section>
    ) : null}
    {props.review === null ? null : (
      <section
        aria-label={
          props.reviewKind === "complete" ? "Review task completion" : "Review task dismissal"
        }
        className="cd-panel"
      >
        <h4 tabIndex={-1} data-task-resolution-review="true">
          {props.reviewKind === "complete" ? "Mark this task complete?" : "Dismiss this task?"}
        </h4>
        <p>{props.review.title}</p>
        <p>
          {props.reviewKind === "complete"
            ? "This records completion locally and retains the task."
            : "This dismisses the task locally without marking it completed or deleting its history."}{" "}
          It does not send a message, apply for a job, or create an undo action.
        </p>
        <p>Pending linked reminders will be dismissed; fired reminder history is retained.</p>
        {props.review.error === null ? null : <p role="alert">{props.review.error}</p>}
        {props.review.stale ? (
          <p>
            The viewed context changed. Cancel this review, refresh tasks and review again; the
            action will not be rebound to newer versions.
          </p>
        ) : null}
        <button
          type="button"
          className="cd-button"
          disabled={props.mutating || props.review.busy || props.review.stale}
          onClick={props.onConfirm}
        >
          {props.reviewKind === "complete"
            ? props.review.busy
              ? "Recording completion…"
              : "Confirm completion"
            : props.review.busy
              ? "Recording dismissal…"
              : "Confirm dismissal"}
        </button>
        <button
          type="button"
          className="cd-button"
          disabled={props.mutating || props.review.busy}
          onClick={props.onCancel}
        >
          Cancel {props.reviewKind === "complete" ? "completion" : "dismissal"} review
        </button>
      </section>
    )}
    {props.loaded && props.items.length === 0 ? <p>No retained tasks for this job.</p> : null}
    <ol aria-label="Local job tasks">
      {props.items.map((task) => (
        <li key={task.id} data-stored-task-id={task.id}>
          <article>
            <h4>{task.title}</h4>
            <p>State: {task.state}.</p>
            <p>
              {task.dueAt === null
                ? "Unscheduled"
                : `Due ${utc(task.dueAt)} (${task.timeZone ?? "zone unavailable"})`}
            </p>
            {task.completedAt === null ? null : (
              <p>
                Completed <time dateTime={task.completedAt}>{utc(task.completedAt)}</time>.
              </p>
            )}
            {task.state !== "pending" ? null : (
              <button
                type="button"
                className="cd-button"
                disabled={
                  props.busy ||
                  props.mutating ||
                  props.stale ||
                  props.review !== null ||
                  props.foreignReview
                }
                onClick={() => {
                  props.onReview(task, "complete");
                }}
              >
                Mark complete
              </button>
            )}
            {task.state !== "pending" ? null : (
              <button
                type="button"
                className="cd-button"
                disabled={
                  props.busy ||
                  props.mutating ||
                  props.stale ||
                  props.review !== null ||
                  props.foreignReview
                }
                onClick={() => {
                  props.onReview(task, "dismiss");
                }}
              >
                Dismiss task
              </button>
            )}
          </article>
        </li>
      ))}
    </ol>
    {props.hasMore ? (
      <button
        type="button"
        className="cd-button"
        disabled={props.busy || props.mutating || props.stale || props.review !== null}
        onClick={props.onMore}
      >
        Older tasks
      </button>
    ) : null}
  </section>
);
