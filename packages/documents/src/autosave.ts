export type DocumentAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "failed";

export interface DocumentAutosaveCoordinator<Value> {
  readonly queue: (value: Value) => void;
  readonly flush: () => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly cancelTimer: () => void;
  readonly status: () => DocumentAutosaveStatus;
}

export interface DocumentAutosaveCoordinatorOptions<Value> {
  readonly delayMilliseconds?: number;
  readonly save: (value: Value) => Promise<void>;
  readonly onStatusChange?: (status: DocumentAutosaveStatus) => void;
  readonly schedule?: (
    callback: () => void,
    delayMilliseconds: number,
  ) => ReturnType<typeof setTimeout>;
  readonly cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

export const createDocumentAutosaveCoordinator = <Value>(
  options: DocumentAutosaveCoordinatorOptions<Value>,
): DocumentAutosaveCoordinator<Value> => {
  const delayMilliseconds = options.delayMilliseconds ?? 600;
  if (
    !Number.isSafeInteger(delayMilliseconds) ||
    delayMilliseconds < 50 ||
    delayMilliseconds > 60_000 ||
    typeof options.save !== "function"
  ) {
    throw new TypeError("Document autosave options are invalid.");
  }
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let currentStatus: DocumentAutosaveStatus = "idle";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestValue: Value | undefined;
  let latestRevision = 0;
  let savedRevision = 0;
  let inFlight: Promise<void> | null = null;

  const setStatus = (status: DocumentAutosaveStatus): void => {
    if (currentStatus === status) return;
    currentStatus = status;
    options.onStatusChange?.(status);
  };

  const cancelTimer = (): void => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };

  const flush = async (): Promise<void> => {
    cancelTimer();
    if (inFlight !== null) await inFlight;
    if (latestValue === undefined || savedRevision === latestRevision) {
      setStatus(savedRevision === 0 ? "idle" : "saved");
      return;
    }
    const value = latestValue;
    const revision = latestRevision;
    setStatus("saving");
    const saving = options.save(value);
    inFlight = saving;
    try {
      await saving;
      savedRevision = revision;
      setStatus(savedRevision === latestRevision ? "saved" : "pending");
    } catch (error) {
      setStatus("failed");
      throw error;
    } finally {
      if (inFlight === saving) inFlight = null;
    }
    if (savedRevision !== latestRevision) await flush();
  };

  const startTimer = (): void => {
    cancelTimer();
    timer = schedule(() => {
      timer = null;
      void flush().catch(() => undefined);
    }, delayMilliseconds);
  };

  return Object.freeze({
    queue: (value: Value) => {
      latestValue = value;
      latestRevision += 1;
      setStatus("pending");
      startTimer();
    },
    flush,
    retry: flush,
    cancelTimer,
    status: () => currentStatus,
  });
};
