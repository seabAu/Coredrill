import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CompleteNextActionInput, NextActionDto } from "@coredrill/application";
import {
  StoredJobTasks,
  restoreFocusAfterChange,
  type PipelineTableEditResult,
} from "@coredrill/ui";
import {
  createStoredTaskReader,
  emptyTaskState,
  type StoredTaskState,
} from "./stored-task-reader.js";

interface Review extends CompleteNextActionInput {
  readonly title: string;
}
/** Root session owns read/review state. Responsive frames only render shared controls. */
export const useStoredJobTasks = (options: {
  readonly enabled: boolean;
  readonly jobId: string | null;
  readonly rowVersion: number | undefined;
  readonly busy: boolean;
  readonly complete: (input: CompleteNextActionInput) => Promise<PipelineTableEditResult>;
  readonly refreshWorkspace: () => Promise<void>;
}) => {
  const live = useRef(options);
  live.current = options;
  const container = useRef<HTMLDivElement>(null);
  const reader = useRef<ReturnType<typeof createStoredTaskReader> | null>(null);
  const [state, setState] = useState<StoredTaskState | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [completing, setCompleting] = useState(false);
  const pending = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ readonly jobId: string; readonly text: string } | null>(
    null,
  );
  const [focus, setFocus] = useState<{
    readonly jobId: string;
    readonly origin: Element | null;
    readonly target: "review" | "list";
  } | null>(null);
  useEffect(() => {
    if (!options.enabled || options.jobId === null) {
      setState(null);
      return;
    }
    const current = createStoredTaskReader(
      options.jobId,
      globalThis.coredrillStorageSpike.nextActions.listPage,
      setState,
    );
    reader.current = current;
    void current.refresh();
    return () => {
      current.dispose();
      reader.current = null;
    };
  }, [options.enabled, options.jobId, options.rowVersion]);
  useLayoutEffect(() => {
    if (focus === null || completing) return;
    const request = focus;
    restoreFocusAfterChange(request.origin, () => {
      if (!live.current.enabled || live.current.jobId !== request.jobId) return null;
      return (
        container.current?.querySelector<HTMLElement>(
          request.target === "review" ? "[data-task-completion-review]" : "[data-stored-tasks]",
        ) ?? null
      );
    });
    setFocus(null);
  }, [focus, completing]);
  const jobId = options.jobId;
  if (!options.enabled || jobId === null) return null;
  const visible = state?.jobId === jobId ? state : emptyTaskState(jobId);
  const stale = visible.error !== null || visible.jobRowVersion !== options.rowVersion;
  const requestRead = async (older: boolean) => {
    const current = reader.current;
    if (current === null || pending.current || live.current.busy) return;
    const origin = document.activeElement;
    if (!older) {
      await live.current.refreshWorkspace();
      if (reader.current !== current || live.current.jobId !== jobId) return;
    }
    await (older ? current.more() : current.refresh());
    if (reader.current === current && live.current.jobId === jobId)
      setFocus({ jobId, origin, target: "list" });
  };
  const choose = (task: NextActionDto) => {
    if (
      review !== null ||
      stale ||
      visible.busy ||
      options.busy ||
      pending.current ||
      task.state !== "pending" ||
      task.jobId !== jobId
    )
      return;
    setReview(
      Object.freeze({
        jobId,
        nextActionId: task.id,
        title: task.title,
        expected: Object.freeze({
          jobRowVersion: visible.jobRowVersion,
          nextActionRowVersion: task.rowVersion,
        }),
      }),
    );
    setFailure(null);
    setFocus({ jobId, origin: document.activeElement, target: "review" });
  };
  const reviewStale = review?.expected.jobRowVersion !== options.rowVersion || stale;
  const confirm = async () => {
    if (review?.jobId !== jobId || reviewStale || pending.current || options.busy) return;
    const request = review;
    const origin = document.activeElement;
    pending.current = true;
    setCompleting(true);
    setFailure(null);
    try {
      const result = await live.current.complete({
        jobId: request.jobId,
        nextActionId: request.nextActionId,
        expected: request.expected,
      });
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      // Acknowledgement clears intent even if the following read fails; never repeat this write.
      setReview((current) => (current === request ? null : current));
      setNotice({
        jobId: request.jobId,
        text: "Task marked complete locally. History is retained. Refreshing tasks never repeats completion.",
      });
      const current = reader.current;
      if (live.current.jobId === request.jobId && current?.current().jobId === request.jobId)
        await current.refresh();
    } catch {
      setFailure(
        "Task completion could not be confirmed. Refresh and review the stored state before trying again.",
      );
    } finally {
      pending.current = false;
      setCompleting(false);
      if (live.current.jobId === request.jobId)
        setFocus({ jobId: request.jobId, origin, target: "list" });
    }
  };
  return (
    <div ref={container}>
      <StoredJobTasks
        items={visible.items}
        loaded={visible.loaded}
        busy={visible.busy}
        error={visible.error}
        stale={stale}
        mutating={options.busy || completing}
        hasMore={visible.nextCursor !== null}
        foreignReview={review !== null && review.jobId !== jobId}
        notice={notice?.jobId === jobId ? notice.text : null}
        review={
          review?.jobId === jobId
            ? { title: review.title, busy: completing, stale: reviewStale, error: failure }
            : null
        }
        onRefresh={() => {
          void requestRead(false);
        }}
        onMore={() => {
          void requestRead(true);
        }}
        onReview={choose}
        onConfirm={() => {
          void confirm();
        }}
        onCancel={() => {
          if (pending.current || live.current.busy) return;
          setReview(null);
          setFailure(null);
          setFocus({ jobId, origin: document.activeElement, target: "list" });
        }}
      />
    </div>
  );
};
