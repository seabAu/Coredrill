import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { restoreFocusAfterChange, type PipelineTableEditResult } from "@coredrill/ui";
import type { ViewedStatusMove } from "./stored-status-controller.js";
import type { StoredPipelineSnapshot } from "./stored-pipeline-view.js";
import {
  createWorkspaceStatusDraft,
  type WorkspaceStatusDraft,
} from "./stored-workspace-status-draft.js";

/** Session draft survives responsive frame replacement; only acknowledged runtime reads are truth. */
export const useStoredWorkspaceStatus = (options: {
  readonly enabled: boolean;
  readonly jobId: string | null;
  readonly snapshot: StoredPipelineSnapshot | null;
  readonly busy: boolean;
  readonly move: (input: ViewedStatusMove) => Promise<PipelineTableEditResult>;
}) => {
  const live = useRef(options);
  live.current = options;
  const [draft, setDraft] = useState<WorkspaceStatusDraft | null>(null);
  const owner = useRef<ReturnType<typeof createWorkspaceStatusDraft> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{
    readonly jobId: string;
    readonly origin: Element | null;
    readonly owner: NonNullable<typeof owner.current>;
    readonly target: "editor" | "error" | "header";
  } | null>(null);
  useEffect(() => {
    if (!options.enabled) return;
    const current = createWorkspaceStatusDraft((input) => live.current.move(input), setDraft);
    owner.current = current;
    setDraft(null);
    return () => {
      current.dispose();
      owner.current = null;
    };
  }, [options.enabled]);
  useEffect(() => {
    if (!options.enabled || draft === null) return;
    const warn = (event: BeforeUnloadEvent) => {
      const current = owner.current?.current();
      if (current !== undefined && current !== null) event.preventDefault();
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
              ? "[data-workspace-status-target]"
              : "[data-workspace-status-error]",
          ) ?? null
        );
      const workspace = Array.from(
        document.querySelectorAll<HTMLElement>("[data-job-workspace]"),
      ).find((node) => node.dataset["jobWorkspace"] === request.jobId);
      return (
        workspace?.querySelector<HTMLElement>("[data-workspace-action='change-status']") ?? null
      );
    });
    setFocus(null);
  }, [focus, draft?.busy]);
  const job = options.snapshot?.jobs.find(({ id }) => id === options.jobId);
  const available = options.enabled && job !== undefined && !options.busy;
  const open = () => {
    const current = owner.current;
    if (!available || current === null) return;
    const targets =
      options.snapshot?.groups.flatMap((group) =>
        typeof group.statusId === "string"
          ? [{ id: group.statusId, name: group.name, terminal: group.terminal }]
          : [],
      ) ?? [];
    if (current.current() === null)
      current.open(
        {
          jobId: job.id,
          title: job.title,
          rowVersion: job.rowVersion,
          fromStatusId: job.status?.id ?? null,
          terminal: job.status?.terminal ?? false,
        },
        targets,
      );
    if (current.current()?.context.jobId === job.id)
      setFocus({ jobId: job.id, origin: document.activeElement, owner: current, target: "editor" });
  };
  const stale =
    draft !== null &&
    (job?.rowVersion !== draft.context.rowVersion ||
      (job.status?.id ?? null) !== draft.context.fromStatusId);
  const selected = draft?.targets.find(({ id }) => id === draft.targetId);
  const reopening = draft?.context.terminal === true && selected?.terminal === false;
  const content =
    !options.enabled || options.jobId === null || draft === null ? null : (
      <div ref={container} className="cd-panel">
        {draft.context.jobId !== options.jobId ? (
          <section aria-label="Status draft for another job">
            <p>
              A status draft belongs to {draft.context.title}. Return to that job to continue, or
              explicitly discard its draft. No change is requested for this job.
            </p>
            <button
              type="button"
              className="cd-button"
              disabled={draft.busy}
              onClick={() => {
                const current = owner.current;
                const jobId = options.jobId;
                const origin = document.activeElement;
                if (jobId !== null && current?.discard(draft.context.jobId) === true)
                  setFocus({ jobId, origin, owner: current, target: "header" });
              }}
            >
              Discard other job status draft
            </button>
          </section>
        ) : (
          <form
            className="cd-workspace-status-editor"
            aria-label="Change local job status"
            aria-busy={draft.busy}
            onSubmit={(event) => {
              event.preventDefault();
              const current = owner.current;
              const jobId = options.jobId;
              if (current === null || jobId === null || options.busy || stale || draft.busy) return;
              const origin = document.activeElement;
              void current.save(jobId).then((saved) => {
                if (owner.current !== current || live.current.jobId !== jobId) return;
                const error = current.current()?.error;
                if (saved || (error !== undefined && error !== null))
                  setFocus({ jobId, origin, owner: current, target: saved ? "header" : "error" });
              });
            }}
          >
            <h3>Change local job status</h3>
            <p>
              This records local tracking only. Applied may require a separate exact-document
              review; nothing is submitted externally.
            </p>
            {stale ? (
              <p role="alert">
                This job changed since this draft opened. Cancel and reopen to review the current
                value; this draft will not be silently rebased.
              </p>
            ) : null}
            {draft.error === null ? null : (
              <p role="alert" tabIndex={-1} data-workspace-status-error>
                {draft.error}
              </p>
            )}
            <label>
              New local stage{" "}
              <select
                aria-label="New local stage"
                data-workspace-status-target
                value={draft.targetId}
                disabled={draft.busy || options.busy || stale}
                onChange={(event) => {
                  owner.current?.select(draft.context.jobId, event.target.value);
                }}
              >
                <option value="">Choose an existing stage</option>
                {draft.targets.map((target) => (
                  <option
                    key={target.id}
                    value={target.id}
                    disabled={target.id === draft.context.fromStatusId}
                  >
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
            {selected === undefined ? null : <p>Requested stage: {selected.name}</p>}
            {draft.targets.length === 0 ? (
              <p>
                No configured stage exists. Start local preparation in Documents to name a stage; no
                default stages are invented.
              </p>
            ) : null}
            {reopening ? (
              <label>
                <input
                  type="checkbox"
                  checked={draft.reopenConfirmed}
                  disabled={draft.busy || options.busy || stale}
                  onChange={(event) => {
                    owner.current?.confirmReopen(draft.context.jobId, event.target.checked);
                  }}
                />
                I explicitly confirm reopening this job from its terminal stage.
              </label>
            ) : null}
            <button
              className="cd-button"
              type="submit"
              disabled={
                draft.busy ||
                options.busy ||
                stale ||
                selected === undefined ||
                selected.id === draft.context.fromStatusId ||
                (reopening && !draft.reopenConfirmed)
              }
            >
              {draft.busy ? "Saving status locally…" : "Save local status"}
            </button>
            <button
              className="cd-button"
              type="button"
              disabled={draft.busy}
              onClick={() => {
                const current = owner.current;
                const origin = document.activeElement;
                if (current?.discard(draft.context.jobId) === true)
                  setFocus({
                    jobId: draft.context.jobId,
                    origin,
                    owner: current,
                    target: "header",
                  });
              }}
            >
              Cancel status draft
            </button>
          </form>
        )}
      </div>
    );
  return { open, available, content };
};
