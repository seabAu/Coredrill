import type { LocalScheduleResolution } from "./stored-workspace-next-action-draft.js";

export type LocalScheduleResolver = (local: string, zone: string) => LocalScheduleResolution;
export type ScheduleLoaderState = "idle" | "loading" | "ready" | "error";
const importResolver = async (): Promise<LocalScheduleResolver> =>
  (await import("./local-schedule.js")).resolveLocalSchedule;

/** Own module loading, not task data. Disposal ignores late results and errors. */
export const createLocalScheduleLoader = (
  changed: (state: ScheduleLoaderState) => void,
  load: () => Promise<LocalScheduleResolver> = importResolver,
) => {
  let disposed = false;
  const isDisposed = () => disposed;
  let state: ScheduleLoaderState = "idle";
  let resolver: LocalScheduleResolver | null = null;
  const publish = (next: ScheduleLoaderState) => {
    if (disposed) return;
    state = next;
    changed(state);
  };
  return Object.freeze({
    current: () => state,
    resolver: () => (disposed ? null : resolver),
    request: async (): Promise<boolean> => {
      if (disposed || state === "loading") return false;
      if (state === "ready") return true;
      publish("loading");
      try {
        const loaded = await load();
        if (isDisposed()) return false;
        if (typeof loaded !== "function") throw new TypeError("Invalid local resolver.");
        resolver = loaded;
        publish("ready");
        return true;
      } catch {
        publish("error");
        return false;
      }
    },
    dispose: () => {
      disposed = true;
      resolver = null;
    },
  });
};
