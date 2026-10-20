import { useEffect, useMemo, useRef, useState } from "react";
import {
  restoreFocusAfterChange,
  type BoardMoveRequest,
  type PipelineTableEditRequest,
  type PipelineTableEditResult,
} from "@coredrill/ui";
import { createStoredStatusController, type ViewedStatusMove } from "./stored-status-controller.js";
import type { StoredPipelineSnapshot } from "./stored-pipeline-view.js";
import type { InteractiveNextActionInput } from "./stored-next-actions.js";

interface RequestedMove {
  readonly viewed: ViewedStatusMove;
  readonly title: string;
  readonly target: string;
}
interface UndoEntry {
  readonly kind: "status" | "next-action";
  readonly id: string;
  readonly jobId: string;
  readonly title: string;
  readonly target: string;
  readonly consumed: boolean;
  readonly unavailable: boolean;
}

const restoreBoardMoveFocus = (
  jobId: string,
  origin: Element | null,
  fallback: () => HTMLElement | null,
): void => {
  restoreFocusAfterChange(origin, () => {
    const card = Array.from(document.querySelectorAll<HTMLElement>("[data-board-job]")).find(
      (item) => item.dataset["boardJob"] === jobId,
    );
    const control = card?.querySelector<HTMLSelectElement>("select");
    return control?.disabled === false ? control : fallback();
  });
};

/** Ephemeral controls only. Every published projection is reread from SQLite after acknowledgement. */
export const useStoredStatusActions = (options: {
  readonly enabled: boolean;
  readonly snapshot: StoredPipelineSnapshot | null;
  readonly refresh: () => Promise<boolean>;
  readonly reviewApplied: (jobId: string) => void;
}) => {
  const live = useRef(options);
  live.current = options;
  const owner = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState<"status" | "next-action">("status");
  const [retry, setRetry] = useState<RequestedMove | null>(null);
  const [pendingReopen, setPendingReopen] = useState<RequestedMove | null>(null);
  const [appliedReview, setAppliedReview] = useState<string | null>(null);
  const [undos, setUndos] = useState<readonly UndoEntry[]>([]);
  const feedback = useRef<HTMLParagraphElement>(null);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const controller = useMemo(
    () => createStoredStatusController(() => globalThis.coredrillStorageSpike),
    [],
  );
  useEffect(() => {
    if (pendingReopen !== null) confirmation.current?.focus();
  }, [pendingReopen]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [busy]);

  const fail = (text: string): PipelineTableEditResult => {
    setMessage(text);
    setError(true);
    return { ok: false, error: text };
  };
  const restoreFailureFocus = (origin: Element | null): void => {
    restoreFocusAfterChange(origin, () =>
      origin instanceof HTMLElement && origin.isConnected && !origin.matches(":disabled")
        ? origin
        : feedback.current,
    );
  };
  const reread = async (savedMessage: string) => {
    try {
      const refreshed = await live.current.refresh();
      setMessage(
        refreshed
          ? savedMessage
          : `${savedMessage} View refresh was superseded; refresh the local Pipeline to see its current state.`,
      );
      setError(!refreshed);
    } catch {
      setMessage(
        `${savedMessage} The view could not refresh. The acknowledged change is saved; refresh the local Pipeline before relying on its displayed values.`,
      );
      setError(true);
    }
  };
  const perform = async (
    request: RequestedMove,
    focusOwner: "board" | "table" | "workspace" = "board",
  ): Promise<PipelineTableEditResult> => {
    if (!live.current.enabled || owner.current)
      return fail("A local status operation is already pending. Wait for it to finish.");
    const focusOrigin = document.activeElement;
    owner.current = true;
    setBusy(true);
    setError(false);
    setFeedbackKind("status");
    setAppliedReview(null);
    setMessage(`Saving the requested status for ${request.title} locally…`);
    try {
      const outcome = await controller.move(request.viewed);
      if (outcome.kind === "failed") {
        setRetry(outcome.retryable && focusOwner !== "workspace" ? request : null);
        if (focusOwner !== "workspace") restoreFailureFocus(focusOrigin);
        return fail(outcome.message);
      }
      if (outcome.kind === "review-applied") {
        setRetry(null);
        setAppliedReview(outcome.jobId);
        if (focusOwner !== "workspace") restoreFailureFocus(focusOrigin);
        return fail(
          "Applied requires a separate exact-document review. No status was changed by this request. Choose Review Mark Applied to continue.",
        );
      }
      const token = outcome.change.undoToken;
      setUndos((current) => [
        {
          kind: "status",
          id: token.id,
          jobId: token.jobId,
          title: request.title,
          target: request.target,
          consumed: false,
          unavailable: false,
        },
        ...current,
      ]);
      setRetry(null);
      const announcement = `Saved ${request.title} in ${request.target}. Timeline event retained; undo is available.`;
      await reread(announcement);
      // Table owns its successful editor teardown; two restorers would compete.
      if (focusOwner === "board")
        restoreBoardMoveFocus(request.viewed.jobId, focusOrigin, () => feedback.current);
      return { ok: true, announcement };
    } finally {
      owner.current = false;
      setBusy(false);
    }
  };
  const resolve = (
    jobId: string,
    rowVersion: number | undefined,
    fromStatusId: string | null,
    toStatusId: string,
    allowReopen: boolean,
  ): RequestedMove | null => {
    const snapshot = live.current.snapshot;
    const job = snapshot?.jobs.find(({ id }) => id === jobId);
    const target = snapshot?.groups.find(({ statusId }) => statusId === toStatusId);
    if (
      job === undefined ||
      rowVersion === undefined ||
      job.rowVersion !== rowVersion ||
      (job.status?.id ?? null) !== fromStatusId ||
      typeof target?.statusId !== "string"
    ) {
      fail(
        "This view changed or has no valid target stage. Your requested value was not saved; refresh and review before starting another edit.",
      );
      return null;
    }
    return {
      viewed: { jobId, rowVersion, fromStatusId, toStatusId, allowReopen },
      title: job.title,
      target: target.name,
    };
  };
  const moveBoard = (input: BoardMoveRequest): void => {
    if (owner.current || pendingReopen !== null) return;
    const request = resolve(
      input.jobId,
      input.expectedRowVersion,
      input.fromStageId === "unassigned" ? null : input.fromStageId,
      input.toStageId,
      false,
    );
    if (request === null) return;
    const snapshot = live.current.snapshot;
    const source = snapshot?.jobs.find(({ id }) => id === input.jobId)?.status;
    const target = snapshot?.groups.find(({ statusId }) => statusId === input.toStageId);
    if (source?.terminal === true && target?.terminal === false) {
      setPendingReopen(request);
      return;
    }
    void perform(request);
  };
  const editTable = async (input: PipelineTableEditRequest): Promise<PipelineTableEditResult> => {
    if (input.field !== "status") return fail("Only status editing is connected in this view.");
    if (pendingReopen !== null) return fail("Finish or cancel the pending reopen review first.");
    const source = live.current.snapshot?.jobs.find(({ id }) => id === input.jobId)?.status;
    const request = resolve(
      input.jobId,
      input.expectedRowVersion,
      source?.id ?? null,
      input.value,
      input.reopenConfirmed,
    );
    return request === null
      ? {
          ok: false,
          error:
            "This job changed since editing began. Cancel the draft and review the current value.",
        }
      : perform(request, "table");
  };
  const editWorkspace = async (input: ViewedStatusMove): Promise<PipelineTableEditResult> => {
    if (pendingReopen !== null) return fail("Finish or cancel the pending reopen review first.");
    const request = resolve(
      input.jobId,
      input.rowVersion,
      input.fromStatusId,
      input.toStatusId,
      input.allowReopen,
    );
    return request === null
      ? {
          ok: false,
          error:
            "This job changed since editing began. Cancel the draft and review the current value.",
        }
      : perform(request, "workspace");
  };
  const addNextAction = async (
    input: InteractiveNextActionInput,
  ): Promise<PipelineTableEditResult> => {
    if (!live.current.enabled || owner.current || pendingReopen !== null)
      return fail("Finish the pending local tracking operation before adding a task.");
    const job = live.current.snapshot?.jobs.find(({ id }) => id === input.jobId);
    if (job?.rowVersion !== input.expected.jobRowVersion)
      return fail(
        "This job changed since the task draft opened. Cancel and review its current value.",
      );
    owner.current = true;
    setBusy(true);
    setError(false);
    setFeedbackKind("next-action");
    setRetry(null);
    setAppliedReview(null);
    setMessage(`Saving a pending task for ${job.title} locally…`);
    try {
      const outcome = await controller.addNextAction(input);
      if (outcome.kind === "failed") return fail(outcome.message);
      const { nextAction, undoToken } = outcome.change;
      setUndos((current) => [
        {
          kind: "next-action",
          id: undoToken.id,
          jobId: undoToken.jobId,
          title: job.title,
          target: nextAction.title,
          consumed: false,
          unavailable: false,
        },
        ...current,
      ]);
      const announcement = `Saved a pending task for ${job.title}. Existing tasks are retained; undo is available. Nothing was sent or scheduled as a notification.`;
      await reread(announcement);
      return { ok: true, announcement };
    } finally {
      owner.current = false;
      setBusy(false);
    }
  };
  const undo = async (entry: UndoEntry) => {
    if (owner.current || pendingReopen !== null || entry.consumed || entry.unavailable) return;
    const focusOrigin = document.activeElement;
    owner.current = true;
    setBusy(true);
    setError(false);
    setFeedbackKind(entry.kind);
    setRetry(null);
    setMessage(
      `Undoing the ${entry.kind === "status" ? "status change" : "next-action creation"} for ${entry.title} locally…`,
    );
    try {
      const outcome = await controller.undo(entry.id, entry.kind);
      if (outcome.kind === "failed") {
        if (!outcome.retryable)
          setUndos((current) =>
            current.map((item) => (item.id === entry.id ? { ...item, unavailable: true } : item)),
          );
        fail(outcome.message);
        restoreFailureFocus(focusOrigin);
        return;
      }
      setUndos((current) =>
        current.map((item) => (item.id === entry.id ? { ...item, consumed: true } : item)),
      );
      await reread(
        entry.kind === "status"
          ? `Restored ${entry.title} to its prior status. The original timeline event remains and the undo token is consumed.`
          : `Undid next-action creation for ${entry.title}. Its task record and linked pending reminders are dismissed, not deleted; the prior due projection is restored.`,
      );
      restoreFocusAfterChange(focusOrigin, () => feedback.current);
    } finally {
      owner.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (owner.current) return;
    owner.current = true;
    setBusy(true);
    try {
      const refreshed = await live.current.refresh();
      setMessage(
        refreshed
          ? "Refreshed the local Pipeline. Retained editor drafts keep their original version; cancel a stale draft before editing again."
          : "Another view refresh superseded this request. Refresh again if the displayed state is not current.",
      );
      setError(!refreshed);
    } catch {
      fail(
        "The local Pipeline could not refresh. Retained drafts and last loaded values remain available; no edit was submitted by refresh.",
      );
    } finally {
      owner.current = false;
      setBusy(false);
    }
  };
  const showsTasks =
    feedbackKind === "next-action" || undos.some(({ kind }) => kind === "next-action");
  const panel =
    !options.enabled || (message === "" && undos.length === 0 && pendingReopen === null) ? null : (
      <section
        aria-label={showsTasks ? "Local status and task changes" : "Local status changes"}
        aria-busy={busy}
        className="cd-panel cd-local-tracking-panel"
      >
        <p role={error ? "alert" : "status"} tabIndex={-1} ref={feedback}>
          {message}
        </p>
        {pendingReopen === null ? null : (
          <section aria-label="Review reopening this job">
            <h3 ref={confirmation} tabIndex={-1}>
              Reopen {pendingReopen.title}?
            </h3>
            <p>
              This explicitly leaves a terminal stage for {pendingReopen.target}. Nothing is
              submitted externally.
            </p>
            <button
              type="button"
              className="cd-button"
              disabled={busy}
              onClick={() => {
                const request = pendingReopen;
                setPendingReopen(null);
                void perform({ ...request, viewed: { ...request.viewed, allowReopen: true } });
              }}
            >
              Confirm reopen and move
            </button>
            <button
              type="button"
              className="cd-button"
              disabled={busy}
              onClick={() => {
                restoreBoardMoveFocus(
                  pendingReopen.viewed.jobId,
                  document.activeElement,
                  () => feedback.current,
                );
                setPendingReopen(null);
                setMessage("Reopening cancelled. No move was requested.");
                setError(false);
              }}
            >
              Cancel reopening
            </button>
          </section>
        )}
        {retry === null ? null : (
          <button
            type="button"
            className="cd-button"
            disabled={busy || pendingReopen !== null}
            onClick={() => {
              void perform(retry);
            }}
          >
            Retry status move
          </button>
        )}
        {appliedReview === null ? null : (
          <button
            type="button"
            className="cd-button"
            disabled={busy}
            onClick={() => {
              live.current.reviewApplied(appliedReview);
            }}
          >
            Review Mark Applied
          </button>
        )}
        <button
          type="button"
          className="cd-button"
          disabled={busy}
          onClick={() => {
            void refresh();
          }}
        >
          Refresh local Pipeline
        </button>
        {undos.length === 0 ? null : (
          <section aria-label={showsTasks ? "Recent local undo" : "Recent status undo"}>
            <p>
              Undo stays available in this session until dismissed or used, subject to exact
              unchanged-state checks. It does not delete timeline history or submitted documents.
            </p>
            <ul className="cd-local-mutation-undo">
              {undos.map((entry) => (
                <li
                  key={entry.id}
                  data-status-undo-id={entry.kind === "status" ? entry.id : undefined}
                  data-task-undo-id={entry.kind === "next-action" ? entry.id : undefined}
                >
                  <span>
                    {entry.title} → {entry.target}.{" "}
                    {entry.consumed
                      ? "Undone."
                      : entry.unavailable
                        ? "Undo is no longer safe or available."
                        : ""}
                  </span>
                  {entry.consumed || entry.unavailable ? null : (
                    <button
                      type="button"
                      className="cd-button"
                      disabled={busy || pendingReopen !== null}
                      onClick={() => {
                        void undo(entry);
                      }}
                    >
                      Undo {entry.kind === "status" ? "status change" : "next action"} for{" "}
                      {entry.title}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cd-text-button"
                    disabled={busy}
                    onClick={() => {
                      setUndos((current) => current.filter(({ id }) => id !== entry.id));
                    }}
                  >
                    Dismiss undo for {entry.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    );
  return {
    busy: busy || pendingReopen !== null,
    moveBoard,
    editTable,
    editWorkspace,
    addNextAction,
    panel,
  };
};
