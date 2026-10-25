import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StoredJobDetails, restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredJobDetailsReader,
  type StoredJobDetailsState,
} from "./stored-job-details-reader.js";
import type { StoredPipelineApi } from "./stored-pipeline.js";

/** Owned above the responsive workspace frame so reflow cannot reset a pending read. */
export const useStoredJobDetails = ({
  jobId,
  tab,
  api,
  rowVersion,
}: {
  readonly jobId: string | null;
  readonly tab: "overview" | "company";
  readonly api: Pick<StoredPipelineApi, "workspace"> | null;
  readonly rowVersion?: number | undefined;
}) => {
  const [state, setState] = useState<StoredJobDetailsState | null>(null);
  const reader = useRef<ReturnType<typeof createStoredJobDetailsReader> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const view = useRef({ jobId, tab });
  view.current = { jobId, tab };
  const [focus, setFocus] = useState<{
    readonly owner: ReturnType<typeof createStoredJobDetailsReader>;
    readonly origin: Element | null;
    readonly jobId: string;
    readonly tab: "overview" | "company";
  } | null>(null);
  useEffect(() => {
    if (jobId === null || api === null) {
      setState(null);
      return;
    }
    const current = createStoredJobDetailsReader(jobId, api.workspace, setState);
    reader.current = current;
    void current.refresh();
    return () => {
      current.dispose();
      reader.current = null;
    };
  }, [jobId, api, rowVersion]);
  useLayoutEffect(() => {
    if (focus === null || state?.busy) return;
    const request = focus;
    // The read promise can settle before React re-enables the refresh button.
    // Restore only after the completed render, and never into a replacement view.
    restoreFocusAfterChange(request.origin, () => {
      if (
        reader.current !== request.owner ||
        view.current.jobId !== request.jobId ||
        view.current.tab !== request.tab
      )
        return null;
      return (
        container.current?.querySelector<HTMLButtonElement>(
          "[data-details-refresh]:not([disabled])",
        ) ?? null
      );
    });
    setFocus(null);
  }, [focus, state]);
  if (jobId === null || api === null)
    return { content: null, value: null, busy: false, error: null };
  const visible = state?.jobId === jobId ? state : { value: null, busy: true, error: null };
  const content = (
    <div ref={container}>
      <StoredJobDetails
        {...visible}
        tab={tab}
        onRefresh={() => {
          const current = reader.current;
          if (current === null) return;
          const origin = document.activeElement;
          void current.refresh().then((completed) => {
            if (!completed) return;
            setFocus({ owner: current, origin, jobId, tab });
          });
        }}
      />
    </div>
  );
  return { content, value: visible.value, busy: visible.busy, error: visible.error };
};
