import { useEffect, useRef, useState } from "react";
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
  if (jobId === null || api === null) return null;
  const visible = state?.jobId === jobId ? state : { value: null, busy: true, error: null };
  return (
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
            restoreFocusAfterChange(
              origin,
              () =>
                container.current?.querySelector<HTMLButtonElement>("[data-details-refresh]") ??
                null,
            );
          });
        }}
      />
    </div>
  );
};
