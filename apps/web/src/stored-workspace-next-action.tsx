import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { restoreFocusAfterChange, type PipelineTableEditResult } from "@coredrill/ui";
import type { InteractiveNextActionInput } from "./stored-next-actions.js";
import type { StoredPipelineSnapshot } from "./stored-pipeline-view.js";
import {
  createWorkspaceNextActionDraft,
  type WorkspaceNextActionDraft,
} from "./stored-workspace-next-action-draft.js";
import { createLocalScheduleLoader, type ScheduleLoaderState } from "./local-schedule-loader.js";

const occurrenceOffset = (dueAt: string, zone: string): string => {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
        .formatToParts(new Date(dueAt))
        .find(({ type }) => type === "timeZoneName")?.value ?? "Offset unavailable"
    );
  } catch {
    return "Offset unavailable; the UTC instant remains exact";
  }
};

/** Owns normal task intent and lazy civil-time resolution across routes/reflow. */
export const useStoredWorkspaceNextAction = (options: {
  readonly enabled: boolean;
  readonly jobId: string | null;
  readonly snapshot: StoredPipelineSnapshot | null;
  readonly busy: boolean;
  readonly save: (input: InteractiveNextActionInput) => Promise<PipelineTableEditResult>;
}) => {
  const live = useRef(options);
  live.current = options;
  const [draft, setDraft] = useState<WorkspaceNextActionDraft | null>(null);
  const [discardRequested, setDiscardRequested] = useState(false);
  const [scheduleLoad, setScheduleLoad] = useState<ScheduleLoaderState>("idle");
  const scheduleLoader = useRef<ReturnType<typeof createLocalScheduleLoader> | null>(null);
  const owner = useRef<ReturnType<typeof createWorkspaceNextActionDraft> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{
    readonly owner: NonNullable<typeof owner.current>;
    readonly jobId: string;
    readonly origin: Element | null;
    readonly target: "editor" | "error" | "header" | "discard";
  } | null>(null);
  useEffect(() => {
    if (!options.enabled) return;
    const loader = createLocalScheduleLoader(setScheduleLoad);
    scheduleLoader.current = loader;
    setScheduleLoad("idle");
    const current = createWorkspaceNextActionDraft(
      (input) => live.current.save(input),
      (local, zone) => {
        const resolver = loader.resolver();
        if (resolver === null) throw new Error("The local schedule resolver is not ready.");
        return resolver(local, zone);
      },
      setDraft,
    );
    owner.current = current;
    setDraft(null);
    setDiscardRequested(false);
    return () => {
      loader.dispose();
      scheduleLoader.current = null;
      current.dispose();
      owner.current = null;
    };
  }, [options.enabled]);
  useEffect(() => {
    if (!options.enabled || draft === null) return;
    const warn = (event: BeforeUnloadEvent) => {
      const current = owner.current?.current();
      if (current !== null && current !== undefined) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [options.enabled, draft !== null]);
  useLayoutEffect(() => {
    if (focus === null || draft?.busy === true) return;
    const request = focus;
    restoreFocusAfterChange(request.origin, () => {
      if (owner.current !== request.owner || live.current.jobId !== request.jobId) return null;
      if (request.target !== "header")
        return (
          container.current?.querySelector<HTMLElement>(
            request.target === "editor"
              ? "[data-task-title]"
              : request.target === "discard"
                ? "[data-task-discard]"
                : "[data-task-error]",
          ) ?? null
        );
      const workspace = Array.from(
        document.querySelectorAll<HTMLElement>("[data-job-workspace]"),
      ).find((node) => node.dataset["jobWorkspace"] === request.jobId);
      return (
        workspace?.querySelector<HTMLElement>("[data-workspace-action='set-next-action']") ?? null
      );
    });
    setFocus(null);
  }, [focus, draft?.busy]);
  const job = options.snapshot?.jobs.find(({ id }) => id === options.jobId);
  const available = options.enabled && job !== undefined && !options.busy;
  const open = () => {
    const current = owner.current;
    if (!available || current === null) return;
    if (current.current() === null) {
      current.open({ jobId: job.id, title: job.title, rowVersion: job.rowVersion });
      setDiscardRequested(false);
    }
    if (current.current()?.context.jobId === job.id)
      setFocus({ owner: current, jobId: job.id, origin: document.activeElement, target: "editor" });
  };
  const stale = draft !== null && job?.rowVersion !== draft.context.rowVersion;
  const resolution = draft?.resolution ?? null;
  const requestDiscard = () => {
    const current = owner.current;
    if (current === null || draft === null || draft.busy || options.jobId === null) return;
    setDiscardRequested(true);
    setFocus({
      owner: current,
      jobId: options.jobId,
      origin: document.activeElement,
      target: "discard",
    });
  };
  const discard = () => {
    const current = owner.current;
    const jobId = options.jobId;
    if (current === null || draft === null || jobId === null) return;
    const origin = document.activeElement;
    if (current.discard(draft.context.jobId)) {
      setDiscardRequested(false);
      setFocus({ owner: current, jobId, origin, target: "header" });
    }
  };
  const content =
    !options.enabled || options.jobId === null || draft === null ? null : (
      <div ref={container} className="cd-panel cd-workspace-task-panel">
        {draft.context.jobId !== options.jobId ? (
          <section aria-label="Task draft for another job">
            <p>
              A task draft belongs to {draft.context.title}. Return to that job to continue, or
              explicitly discard its draft. No task is requested for this job.
            </p>
            <button
              className="cd-button"
              type="button"
              disabled={draft.busy}
              onClick={requestDiscard}
            >
              Review discarding other job task draft
            </button>
          </section>
        ) : (
          <form
            aria-label="Add local next action"
            aria-busy={draft.busy}
            className="cd-workspace-task-editor"
            onSubmit={(event) => {
              event.preventDefault();
              const current = owner.current;
              const jobId = options.jobId;
              if (
                current === null ||
                jobId === null ||
                options.busy ||
                stale ||
                draft.busy ||
                (draft.scheduled && scheduleLoad !== "ready")
              )
                return;
              const origin = document.activeElement;
              void current.save(jobId).then((saved) => {
                if (owner.current !== current || live.current.jobId !== jobId) return;
                const error = current.current()?.error;
                if (saved || (error !== null && error !== undefined))
                  setFocus({ owner: current, jobId, origin, target: saved ? "header" : "error" });
              });
            }}
          >
            <h3>Add a local next action</h3>
            <p>
              This adds a pending task, optionally with an exact due time. Existing tasks are
              retained; nothing is sent and no notification is scheduled.
            </p>
            <p>Unsaved input stays in this session. Save before closing or reloading the app.</p>
            {stale ? (
              <p role="alert">
                This job changed since the draft opened. Cancel and reopen to review its current
                value; this draft is not silently rebased.
              </p>
            ) : null}
            {draft.error === null ? null : (
              <p role="alert" tabIndex={-1} data-task-error>
                {draft.error}
              </p>
            )}
            <label>
              Task title
              <input
                aria-label="Task title"
                data-task-title
                maxLength={512}
                value={draft.title}
                disabled={draft.busy || options.busy || stale}
                onChange={(event) => {
                  owner.current?.editTitle(draft.context.jobId, event.target.value);
                }}
              />
            </label>
            <p>
              {draft.title.length} of 512 characters. Board and header show the earliest scheduled
              pending task first, then unscheduled tasks.
            </p>
            <label>
              <input
                type="checkbox"
                checked={draft.scheduled}
                disabled={draft.busy || options.busy || stale}
                onChange={(event) => {
                  const scheduled = event.target.checked;
                  if (owner.current?.setScheduled(draft.context.jobId, scheduled) && scheduled)
                    void scheduleLoader.current?.request();
                }}
              />
              Add a due date/time
            </label>
            {draft.scheduled ? (
              <fieldset disabled={draft.busy || options.busy || stale}>
                <legend>Local due time</legend>
                <label>
                  Local due date and time
                  <input
                    type="datetime-local"
                    aria-label="Local due date and time"
                    step="0.001"
                    value={draft.localDateTime}
                    onChange={(event) => {
                      owner.current?.editSchedule(
                        draft.context.jobId,
                        event.target.value,
                        draft.timeZone,
                      );
                    }}
                  />
                </label>
                <label>
                  IANA time zone
                  <input
                    aria-label="IANA time zone"
                    maxLength={128}
                    value={draft.timeZone}
                    placeholder="America/New_York or UTC"
                    onChange={(event) => {
                      owner.current?.editSchedule(
                        draft.context.jobId,
                        draft.localDateTime,
                        event.target.value,
                      );
                    }}
                  />
                </label>
                <p>
                  Enter the intended local clock and zone explicitly. Skipped times are rejected;
                  repeated times require your choice. Stored due times remain exact UTC instants.
                </p>
                {scheduleLoad === "loading" ? (
                  <p role="status">Loading the bundled local-time helper… Nothing was saved.</p>
                ) : null}
                {scheduleLoad === "error" ? (
                  <div>
                    <p role="alert">
                      The local-time helper could not load. Your input remains here; nothing was
                      saved. Browsers may retain a failed module until reload. Copy your unsaved
                      title, clock and zone before reloading, or turn off the due time to explicitly
                      save an unscheduled task. Reloading discards this unsaved draft.
                    </p>
                    <button
                      type="button"
                      className="cd-button"
                      onClick={() => {
                        window.location.reload();
                      }}
                    >
                      Reload workspace after preserving input
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="cd-button"
                  disabled={scheduleLoad !== "ready"}
                  onClick={() => {
                    const current = owner.current;
                    if (current === null || options.jobId !== draft.context.jobId) return;
                    const origin = document.activeElement;
                    if (!current.resolveSchedule(draft.context.jobId))
                      setFocus({
                        owner: current,
                        jobId: draft.context.jobId,
                        origin,
                        target: "error",
                      });
                  }}
                >
                  Review exact due time
                </button>
                {resolution === null ? null : (
                  <fieldset>
                    <legend>Reviewed exact due time</legend>
                    <p>
                      {draft.localDateTime} in {resolution.timeZone}.
                      {resolution.candidates.length > 1
                        ? " This clock occurs twice. Choose one occurrence before saving."
                        : " This clock has one exact occurrence."}
                    </p>
                    {resolution.candidates.map((dueAt, index) => (
                      <label key={dueAt}>
                        <input
                          type="radio"
                          name="local-next-action-occurrence"
                          checked={draft.selectedDueAt === dueAt}
                          onChange={() => {
                            owner.current?.selectOccurrence(draft.context.jobId, dueAt);
                          }}
                        />
                        {resolution.candidates.length > 1
                          ? index === 0
                            ? "First occurrence"
                            : "Second occurrence"
                          : "Only occurrence"}
                        {" — "}
                        {occurrenceOffset(dueAt, resolution.timeZone)}
                        {" — "}
                        {dueAt}
                      </label>
                    ))}
                  </fieldset>
                )}
              </fieldset>
            ) : (
              <p>No due instant or time zone will be stored for this unscheduled task.</p>
            )}
            <button
              type="submit"
              className="cd-button"
              disabled={
                draft.busy ||
                options.busy ||
                stale ||
                draft.title.trim().length === 0 ||
                (draft.scheduled && (scheduleLoad !== "ready" || draft.selectedDueAt === null))
              }
            >
              {draft.busy ? "Saving next action locally…" : "Save local next action"}
            </button>
            <button
              type="button"
              className="cd-button"
              disabled={draft.busy}
              onClick={requestDiscard}
            >
              Cancel task draft
            </button>
          </form>
        )}
        {discardRequested ? (
          <section aria-label="Confirm task draft discard">
            <h3 tabIndex={-1} data-task-discard>
              Discard the unsaved task draft for {draft.context.title}?
            </h3>
            <p>This only discards session input. It does not remove stored tasks.</p>
            <button type="button" className="cd-button" disabled={draft.busy} onClick={discard}>
              Discard task draft
            </button>
            <button
              type="button"
              className="cd-button"
              disabled={draft.busy}
              onClick={() => {
                setDiscardRequested(false);
                const current = owner.current;
                if (current !== null && options.jobId === draft.context.jobId)
                  setFocus({
                    owner: current,
                    jobId: draft.context.jobId,
                    origin: document.activeElement,
                    target: "editor",
                  });
              }}
            >
              Keep task draft
            </button>
          </section>
        ) : null}
      </div>
    );
  return { open, available, content };
};
