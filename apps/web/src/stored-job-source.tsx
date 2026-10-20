import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StoredJobSource, restoreFocusAfterChange, type StoredJobSourceModel } from "@coredrill/ui";
import { createStoredJobSourceReader, emptyStoredSource } from "./stored-job-source-reader.js";

/** Own the reader above responsive frame replacement; SQLite stays canonical. */
export const useStoredJobSource = (jobId: string | null) => {
  const [state, setState] = useState<StoredJobSourceModel | null>(null);
  const reader = useRef<ReturnType<typeof createStoredJobSourceReader> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    readonly owner: ReturnType<typeof createStoredJobSourceReader>;
    readonly origin: Element | null;
  } | null>(null);
  useLayoutEffect(() => {
    if (focusRequest?.owner !== reader.current || state?.busy !== false) return;
    const { owner, origin } = focusRequest;
    restoreFocusAfterChange(origin, () => {
      if (reader.current !== owner) return null;
      return origin instanceof HTMLElement && origin.isConnected
        ? origin
        : (container.current?.querySelector<HTMLButtonElement>("[data-source-reload]") ?? null);
    });
    setFocusRequest(null);
  }, [focusRequest, state?.busy]);
  useEffect(() => {
    if (jobId === null) {
      setState(null);
      return;
    }
    const current = createStoredJobSourceReader(
      jobId,
      () => globalThis.coredrillStorageSpike.pipeline,
      setState,
    );
    reader.current = current;
    void current.reload();
    return () => {
      current.dispose();
      reader.current = null;
    };
  }, [jobId]);
  if (jobId === null) return null;
  const act = (
    action: (current: ReturnType<typeof createStoredJobSourceReader>) => Promise<boolean>,
  ) => {
    const current = reader.current;
    if (current === null) return;
    const origin = document.activeElement;
    void action(current).then((completed) => {
      if (completed && reader.current === current) setFocusRequest({ owner: current, origin });
    });
  };
  return (
    <div className="cd-stored-source-root" ref={container}>
      <StoredJobSource
        model={state?.jobId === jobId ? state : emptyStoredSource(jobId)}
        onReload={() => {
          act((current) => current.reload());
        }}
        onRetry={() => {
          act((current) => current.retry());
        }}
        onHistoryMore={() => {
          act((current) => current.historyMore());
        }}
        onSelect={(slot, id) => {
          act((current) => current.select(slot, id));
        }}
        onContent={(slot, kind, more) => {
          act((current) => current.content(slot, kind, more));
        }}
        onEvidencePage={(slot, more) => {
          act((current) => current.evidencePage(slot, more));
        }}
        onValue={(slot, item, part, more) => {
          act((current) => current.value(slot, item, part, more));
        }}
      />
    </div>
  );
};
