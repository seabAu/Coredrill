import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { restoreFocusAfterChange, type PipelineTableEditResult } from "@coredrill/ui";
import type { InteractiveNextActionInput } from "./stored-next-actions.js";
import type { StoredPipelineSnapshot } from "./stored-pipeline-view.js";
import {
  createWorkspaceNextActionDraft,
  type WorkspaceNextActionDraft,
} from "./stored-workspace-next-action-draft.js";

/** Owns normal task intent across routes/reflow. Scheduled entry awaits an approved resolver. */
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
    const current = createWorkspaceNextActionDraft(
      (input) => live.current.save(input),
      () => {
        throw new Error("No schedule resolver is connected.");
      },
      setDraft,
    );
    owner.current = current;
    setDraft(null);
    setDiscardRequested(false);
    return () => {
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
                draft.scheduled
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
              This adds an unscheduled pending task. Existing tasks are retained; nothing is sent
              and no notification is scheduled.
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
              <input type="checkbox" disabled checked={false} readOnly />
              Add a due date/time — not connected yet
            </label>
            <p>
              Scheduled task entry is not yet connected. Existing scheduled tasks retain their saved
              times and time zones.
            </p>
            <button
              type="submit"
              className="cd-button"
              disabled={draft.busy || options.busy || stale || draft.title.trim().length === 0}
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
