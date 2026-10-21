import {
  compareJobNextActions,
  type ApplicationResult,
  type JobNextActionsPageDto,
  type ListJobNextActionsInput,
} from "@coredrill/application";

export interface StoredTaskState {
  readonly jobId: string;
  readonly jobRowVersion: number | null;
  readonly items: JobNextActionsPageDto["items"];
  readonly nextCursor: JobNextActionsPageDto["nextCursor"];
  readonly busy: boolean;
  readonly loaded: boolean;
  readonly error: string | null;
}
export const emptyTaskState = (jobId: string): StoredTaskState =>
  Object.freeze({
    jobId,
    jobRowVersion: null,
    items: Object.freeze([]),
    nextCursor: null,
    busy: false,
    loaded: false,
    error: null,
  });

/** One bounded ephemeral page; SQLite remains canonical and disposal revokes publication. */
export const createStoredTaskReader = (
  jobId: string,
  read: (input: ListJobNextActionsInput) => Promise<ApplicationResult<JobNextActionsPageDto>>,
  changed: (state: StoredTaskState) => void,
) => {
  let active = true;
  const isActive = () => active;
  let state = emptyTaskState(jobId);
  const publish = (next: StoredTaskState) => {
    state = Object.freeze(next);
    changed(state);
  };
  const load = async (older: boolean): Promise<boolean> => {
    if (!isActive() || state.busy || (older && (state.nextCursor === null || state.error !== null)))
      return false;
    const prior = state;
    publish({ ...prior, busy: true, error: null });
    try {
      const result = await read({
        jobId,
        limit: 25,
        ...(older ? { after: prior.nextCursor } : {}),
      });
      if (!isActive()) return false;
      if (!result.ok) throw new Error("Task read failed.");
      const page = result.value;
      const last = prior.items.at(-1);
      const first = page.items[0];
      if (
        page.jobId !== jobId ||
        page.includeArchived ||
        page.items.length > 25 ||
        page.items.some((task) => task.jobId !== jobId) ||
        (older &&
          (page.jobRowVersion !== prior.jobRowVersion ||
            (last !== undefined && first !== undefined && compareJobNextActions(last, first) >= 0)))
      )
        throw new Error("Task page scope changed.");
      publish({
        jobId,
        jobRowVersion: page.jobRowVersion,
        items: Object.freeze([...page.items]),
        nextCursor: page.nextCursor,
        busy: false,
        loaded: true,
        error: null,
      });
      return true;
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        error:
          "Local tasks could not be loaded. Retained values may be stale; refresh tasks before completing one.",
      });
      return true;
    }
  };
  return Object.freeze({
    current: () => state,
    refresh: () => load(false),
    more: () => load(true),
    dispose: () => {
      active = false;
    },
  });
};
