import type { JobTimelineItemDto } from "@coredrill/application";

export interface StoredJobTimelineProps {
  readonly items: readonly JobTimelineItemDto[];
  readonly asOf: string | null;
  readonly busy: boolean;
  readonly loadingMore: boolean;
  readonly loaded: boolean;
  readonly error: string | null;
  readonly failed: "refresh" | "more" | null;
  readonly hasMore: boolean;
  readonly onRefresh: () => void;
  readonly onMore: () => void;
}
const utcLabel = (value: string) => value.replace("T", " ").replace("Z", " UTC");

/** Validated stored facts, never reference catalog rows or inferred activity. */
export const StoredJobTimeline = (props: StoredJobTimelineProps) => (
  <section
    aria-label="Stored job timeline"
    className="cd-job-content-section cd-stored-job-timeline"
    data-stored-timeline="true"
    tabIndex={-1}
  >
    <div className="cd-job-content-section-heading">
      <div>
        <p className="cd-eyebrow">Local recorded history</p>
        <h3>Timeline</h3>
        <p>
          Recorded status changes and interactions only. History does not determine the current
          stage.
        </p>
      </div>
      <button
        className="cd-button cd-button-secondary"
        type="button"
        data-history-refresh="true"
        disabled={props.busy}
        onClick={props.onRefresh}
      >
        {props.failed === "refresh"
          ? props.loaded
            ? "Retry refreshing history"
            : "Retry loading history"
          : "Refresh history"}
      </button>
    </div>
    {props.busy || (!props.loaded && props.error === null) ? (
      <p role="status">
        {props.loadingMore ? "Loading older recorded history…" : "Loading local history…"}
      </p>
    ) : null}
    {props.error === null ? null : <p role="alert">{props.error}</p>}
    {props.loaded ? <p role="status">{String(props.items.length)} recorded items loaded.</p> : null}
    {props.asOf === null ? null : (
      <p className="cd-job-content-hint">
        History read through <time dateTime={props.asOf}>{utcLabel(props.asOf)}</time>. Refresh for
        newer recorded events. Stage names are current stored labels, not historical name snapshots.
      </p>
    )}
    {props.loaded && props.items.length === 0 ? (
      <div className="cd-job-empty-state">
        <h4>No recorded history yet</h4>
        <p>No status events or interactions have been recorded for this job.</p>
      </div>
    ) : null}
    {props.items.length === 0 ? null : (
      <ol aria-label="Recorded job history" className="cd-job-timeline-list">
        {props.items.map((item) => (
          <li
            key={`${item.kind}:${item.id}`}
            data-timeline-id={item.id}
            data-timeline-kind={item.kind}
          >
            <div className="cd-job-timeline-marker" aria-hidden="true" />
            <article>
              <div className="cd-job-timeline-item-heading">
                <div>
                  <span className="cd-job-timeline-kind">
                    {item.kind === "status" ? "Status change" : "Recorded interaction"}
                  </span>
                  <h4>
                    {item.kind === "status"
                      ? `${item.fromStatus?.name ?? "Unassigned"} → ${item.toStatus.name}`
                      : item.type}
                  </h4>
                </div>
                <time dateTime={item.occurredAt}>{utcLabel(item.occurredAt)}</time>
              </div>
              {item.kind === "status" ? (
                <>
                  {item.note === null ? null : <p>{item.note}</p>}
                  {item.undoneAt === null ? null : (
                    <p>
                      Reversed by a recorded undo at{" "}
                      <time dateTime={item.undoneAt}>{utcLabel(item.undoneAt)}</time>. The original
                      event remains in history.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p>Recorded direction: {item.direction}.</p>
                  <p>{item.summary}</p>
                </>
              )}
              <small>Append-only local record</small>
            </article>
          </li>
        ))}
      </ol>
    )}
    {props.hasMore ? (
      <button
        className="cd-button cd-button-secondary"
        type="button"
        disabled={props.busy || props.failed === "refresh"}
        onClick={props.onMore}
      >
        {props.failed === "more" ? "Retry older history" : "Load older history"}
      </button>
    ) : null}
  </section>
);
