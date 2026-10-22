import {
  parseContactDirectoryPageV1,
  parseContactDirectoryRequestV1,
  type ContactDirectoryPageV1,
  type ListContactDirectoryInputV1,
  type ListContactDirectoryPortInputV1,
} from "@coredrill/application";
import type { StoredContactDirectoryApi } from "./stored-contact-directory.js";

export interface StoredContactDirectoryState {
  readonly owner: ListContactDirectoryPortInputV1;
  readonly page: ContactDirectoryPageV1 | null;
  readonly busy: boolean;
  readonly failed: "first" | "next" | null;
  readonly error: string | null;
  readonly refreshRequired: boolean;
}

/** One ephemeral live identity page, not canonical storage or a relationship total. */
export const createStoredContactDirectoryReader = (
  scope: Omit<ListContactDirectoryInputV1, "after">,
  read: StoredContactDirectoryApi["page"],
  changed: (state: StoredContactDirectoryState) => void,
) => {
  const owner = parseContactDirectoryRequestV1(scope);
  if (owner.after !== null) throw new TypeError("Choose a first-page contact owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredContactDirectoryState = Object.freeze({
    owner,
    page: null,
    busy: false,
    failed: null,
    error: null,
    refreshRequired: false,
  });
  const publish = (next: StoredContactDirectoryState) => {
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
    const input = parseContactDirectoryRequestV1({
      ...owner,
      after: mode === "next" ? (prior.page?.nextCursor ?? null) : null,
    });
    publish({ ...prior, busy: true, failed: null, error: null });
    if (!isActive()) return false;
    let refreshRequired = false;
    try {
      const result = await read(input);
      if (!isActive()) return false;
      if (!result.ok) {
        refreshRequired = result.error.code !== "unavailable" || !result.error.retryable;
        throw new Error("Contact directory unavailable.");
      }
      refreshRequired = true;
      const page = parseContactDirectoryPageV1(result.value, input);
      const priorIds = new Set(mode === "next" ? prior.page?.items.map(({ id }) => id) : []);
      if (page.items.some(({ id }) => priorIds.has(id)))
        throw new Error("Contact continuation changed.");
      publish({ owner, page, busy: false, failed: null, error: null, refreshRequired: false });
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        failed: mode,
        refreshRequired,
        error: refreshRequired
          ? "The local contact directory changed or could not be validated. Load the first page again; retained identities may be stale."
          : "Local contacts could not be read. Retry this page; retained identities may be stale.",
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
