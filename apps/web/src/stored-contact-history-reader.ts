import {
  parseContactInteractionsPageV1,
  parseContactInteractionsRequestV1,
  parseContactInteractionSummaryRequestV1,
  parseContactInteractionSummaryTextPartV1,
  type ContactInteractionPageV1,
  type ListContactInteractionsInputV1,
  type ListContactInteractionsPortInputV1,
  type ReadContactInteractionSummaryInputV1,
  type ReadContactInteractionSummaryRequestV1,
} from "@coredrill/application";
import type { StoredContactHistoryApi } from "./stored-contact-history.js";

export interface StoredContactHistoryState {
  readonly owner: ListContactInteractionsPortInputV1;
  readonly page: ContactInteractionPageV1 | null;
  readonly busy: boolean;
  readonly failed: "first" | "next" | null;
  readonly error: string | null;
  readonly refreshRequired: boolean;
}
/** A bounded live page, never a relationship total or a second canonical store. */
export const createStoredContactHistoryReader = (
  scope: Omit<ListContactInteractionsInputV1, "after">,
  read: StoredContactHistoryApi["page"],
  changed: (state: StoredContactHistoryState) => void,
  expectedContactRowVersion: number,
) => {
  const owner = parseContactInteractionsRequestV1(scope);
  if (
    owner.after !== null ||
    !Number.isSafeInteger(expectedContactRowVersion) ||
    expectedContactRowVersion < 1
  )
    throw new TypeError("Choose a confirmed first-page history owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredContactHistoryState = Object.freeze({
    owner,
    page: null,
    busy: false,
    failed: null,
    error: null,
    refreshRequired: false,
  });
  const publish = (next: StoredContactHistoryState) => {
    state = Object.freeze(next);
    changed(state);
  };
  const load = async (mode: "first" | "next", retry = false): Promise<boolean> => {
    if (
      !isActive() ||
      state.busy ||
      (mode === "next" &&
        (state.page?.nextCursor === undefined ||
          state.page.nextCursor === null ||
          state.refreshRequired ||
          (!retry && state.error !== null)))
    )
      return false;
    const prior = state;
    const input = parseContactInteractionsRequestV1({
      ...owner,
      after: mode === "next" ? prior.page?.nextCursor : null,
    });
    publish({ ...prior, busy: true, failed: null, error: null });
    if (!isActive()) return false;
    let refreshRequired = false;
    try {
      const result = await read(input);
      if (!isActive()) return false;
      if (!result.ok) {
        refreshRequired = result.error.code !== "unavailable" || !result.error.retryable;
        throw new Error();
      }
      refreshRequired = true;
      const page = parseContactInteractionsPageV1(result.value, input);
      if (page.contactRowVersion !== expectedContactRowVersion) throw new Error();
      const ids = new Set(mode === "next" ? prior.page?.items.map(({ id }) => id) : []);
      if (page.items.some(({ id }) => ids.has(id))) throw new Error();
      publish({ owner, page, busy: false, failed: null, error: null, refreshRequired: false });
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        failed: mode,
        refreshRequired,
        error: refreshRequired
          ? "Recorded history or its viewed contact changed or could not be validated. Refresh the selected contact, then load the first history page. Retained history may be stale."
          : "Recorded history could not be read. Retry this page; retained history may be stale.",
      });
    }
    return true;
  };
  return Object.freeze({
    current: () => state,
    first: () => load("first"),
    next: () => load("next"),
    retry: () =>
      state.failed === null || state.refreshRequired
        ? Promise.resolve(false)
        : load(state.failed, true),
    dispose: () => {
      active = false;
    },
  });
};

export interface StoredContactSummaryState {
  readonly owner: ReadContactInteractionSummaryRequestV1;
  readonly text: string;
  readonly bytesRead: number;
  readonly complete: boolean;
  readonly loaded: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly refreshRequired: boolean;
}
/** Explicitly inspected, bounded literal parts of one fixed viewed record. */
export const createStoredContactSummaryReader = (
  scope: ReadContactInteractionSummaryInputV1,
  read: StoredContactHistoryApi["summaryPart"],
  changed: (state: StoredContactSummaryState) => void,
) => {
  const owner = parseContactInteractionSummaryRequestV1(scope);
  if (owner.byteOffset !== 0) throw new TypeError("Start at the first summary byte.");
  let active = true;
  const isActive = () => active;
  let state: StoredContactSummaryState = Object.freeze({
    owner,
    text: "",
    bytesRead: 0,
    complete: false,
    loaded: false,
    busy: false,
    error: null,
    refreshRequired: false,
  });
  const publish = (next: StoredContactSummaryState) => {
    state = Object.freeze(next);
    changed(state);
  };
  const more = async (retry = false): Promise<boolean> => {
    if (
      !isActive() ||
      state.busy ||
      state.complete ||
      state.refreshRequired ||
      (!retry && state.error !== null)
    )
      return false;
    const prior = state;
    const input = parseContactInteractionSummaryRequestV1({
      ...owner,
      byteOffset: prior.bytesRead,
    });
    publish({ ...prior, busy: true, error: null });
    if (!isActive()) return false;
    let refreshRequired = false;
    try {
      const result = await read(input);
      if (!isActive()) return false;
      if (!result.ok) {
        refreshRequired = result.error.code !== "unavailable" || !result.error.retryable;
        throw new Error();
      }
      refreshRequired = true;
      const part = parseContactInteractionSummaryTextPartV1(result.value, input);
      publish({
        owner,
        text: prior.text + part.text,
        bytesRead: prior.bytesRead + part.bytesRead,
        complete: !part.hasMore,
        loaded: true,
        busy: false,
        error: null,
        refreshRequired: false,
      });
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        refreshRequired,
        error: refreshRequired
          ? "The recorded summary or its viewed owner changed or could not be validated. Close it and refresh history; retained text may be stale."
          : "This summary part could not be read. Retry reads the same byte range; retained text may be stale.",
      });
    }
    return true;
  };
  return Object.freeze({
    current: () => state,
    more: () => more(),
    retry: () =>
      state.error === null || state.refreshRequired ? Promise.resolve(false) : more(true),
    dispose: () => {
      active = false;
    },
  });
};
