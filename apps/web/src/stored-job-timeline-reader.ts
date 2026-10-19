import {
  compareJobTimelineItems,
  type ApplicationResult,
  type JobTimelineCursor,
  type JobTimelineItemDto,
  type JobTimelinePageDto,
  type ListJobTimelineInput,
} from "@coredrill/application";

export interface StoredTimelineState {
  readonly jobId: string;
  readonly asOf: JobTimelinePageDto["asOf"] | null;
  readonly items: readonly JobTimelineItemDto[];
  readonly nextCursor: JobTimelineCursor | null;
  readonly busy: boolean;
  readonly loadingMore: boolean;
  readonly loaded: boolean;
  readonly error: string | null;
  readonly failed: "refresh" | "more" | null;
}
const initialState = (jobId: string): StoredTimelineState =>
  Object.freeze({
    jobId,
    asOf: null,
    items: Object.freeze([]),
    nextCursor: null,
    busy: false,
    loadingMore: false,
    loaded: false,
    error: null,
    failed: null,
  });

/** Ephemeral read coordination only; never a canonical history store. */
export const createStoredTimelineReader = (
  jobId: string,
  read: (input: ListJobTimelineInput) => Promise<ApplicationResult<JobTimelinePageDto>>,
  changed: (state: StoredTimelineState) => void,
) => {
  let active = true;
  const isActive = (): boolean => active;
  let state = initialState(jobId);
  const publish = (next: StoredTimelineState) => {
    state = Object.freeze(next);
    changed(state);
  };
  const load = async (mode: "refresh" | "more"): Promise<boolean> => {
    if (
      !isActive() ||
      state.busy ||
      (mode === "more" && (state.nextCursor === null || state.failed === "refresh"))
    )
      return false;
    const prior = state;
    publish({ ...state, busy: true, loadingMore: mode === "more", error: null, failed: null });
    try {
      const result = await read(mode === "more" ? { jobId, after: prior.nextCursor } : { jobId });
      if (!isActive()) return false;
      if (!result.ok) {
        publish({
          ...prior,
          busy: false,
          loadingMore: false,
          error: result.error.message,
          failed: mode,
        });
        return true;
      }
      const page = result.value;
      if (
        page.jobId !== jobId ||
        page.includeArchived ||
        (mode === "more" && page.asOf !== prior.asOf)
      )
        throw new Error("Invalid history page scope.");
      const previousItems = mode === "more" ? prior.items : [];
      const last = previousItems.at(-1);
      const first = page.items[0];
      const identities = new Set(previousItems.map((item) => `${item.kind}:${item.id}`));
      if (
        (last !== undefined && first !== undefined && compareJobTimelineItems(last, first) >= 0) ||
        page.items.some((item) => identities.has(`${item.kind}:${item.id}`))
      )
        throw new Error("Invalid history page continuation.");
      publish({
        jobId,
        asOf: page.asOf,
        items: Object.freeze([...previousItems, ...page.items]),
        nextCursor: page.nextCursor,
        busy: false,
        loadingMore: false,
        loaded: true,
        error: null,
        failed: null,
      });
      return true;
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        loadingMore: false,
        failed: mode,
        error:
          "Local job history could not be loaded. Try again; retained history has not been changed.",
      });
      return true;
    }
  };
  return Object.freeze({
    current: () => state,
    refresh: () => load("refresh"),
    more: () => load("more"),
    dispose: () => {
      active = false;
    },
  });
};
