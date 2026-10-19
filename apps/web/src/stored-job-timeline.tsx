import { useEffect, useRef, useState } from "react";
import { StoredJobTimeline, restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredTimelineReader,
  type StoredTimelineState,
} from "./stored-job-timeline-reader.js";
import type { StoredPipelineApi } from "./stored-pipeline.js";

/** Root-owned reads survive responsive frame replacement; job changes dispose late work. */
export const useStoredJobTimeline = ({
  jobId,
  api,
}: {
  readonly jobId: string | null;
  readonly api: Pick<StoredPipelineApi, "timeline"> | null;
}) => {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<StoredTimelineState | null>(null);
  const reader = useRef<ReturnType<typeof createStoredTimelineReader> | null>(null);
  useEffect(() => {
    if (jobId === null || api === null) {
      setState(null);
      return;
    }
    const current = createStoredTimelineReader(jobId, api.timeline, setState);
    reader.current = current;
    void current.refresh();
    return () => {
      current.dispose();
      reader.current = null;
    };
  }, [jobId, api]);
  const request = async (mode: "refresh" | "more") => {
    const current = reader.current;
    if (current === null) return;
    const origin = document.activeElement;
    const completed = await current[mode]();
    if (!completed) return;
    restoreFocusAfterChange(origin, () => {
      if (origin instanceof HTMLElement && origin.isConnected && !origin.matches(":disabled"))
        return origin;
      const region = container.current?.querySelector<HTMLElement>("[data-stored-timeline]");
      const refresh =
        mode === "refresh"
          ? region?.querySelector<HTMLButtonElement>("[data-history-refresh]")
          : null;
      return refresh?.disabled === false ? refresh : (region ?? null);
    });
  };
  if (jobId === null || api === null) return null;
  const visibleState =
    state?.jobId === jobId
      ? state
      : createStoredTimelineReader(jobId, api.timeline, () => undefined).current();
  return (
    <div ref={container}>
      <StoredJobTimeline
        {...visibleState}
        hasMore={visibleState.nextCursor !== null}
        onRefresh={() => {
          void request("refresh");
        }}
        onMore={() => {
          void request("more");
        }}
      />
    </div>
  );
};
