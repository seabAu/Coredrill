import {
  compareCompanyDirectoryEntries,
  parseCompanyDirectoryRequestV1,
  type CompanyDirectoryPageV1,
  type ListCompanyDirectoryInputV1,
  type ListCompanyDirectoryPortInputV1,
} from "@coredrill/application";
import type { StoredCompanyDirectoryApi } from "./stored-company-directory.js";

export interface StoredCompanyDirectoryState {
  readonly owner: ListCompanyDirectoryPortInputV1;
  readonly page: CompanyDirectoryPageV1 | null;
  readonly busy: boolean;
  readonly failed: "first" | "next" | null;
  readonly error: string | null;
  readonly refreshRequired: boolean;
}

/** One bounded, ephemeral current page. It is not a vault total or a historical snapshot. */
export const createStoredCompanyDirectoryReader = (
  scope: Omit<ListCompanyDirectoryInputV1, "after">,
  read: StoredCompanyDirectoryApi["page"],
  changed: (state: StoredCompanyDirectoryState) => void,
) => {
  const owner = parseCompanyDirectoryRequestV1(scope);
  if (owner.after !== null) throw new TypeError("Choose a first-page directory owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredCompanyDirectoryState = Object.freeze({
    owner,
    page: null,
    busy: false,
    failed: null,
    error: null,
    refreshRequired: false,
  });
  const publish = (next: StoredCompanyDirectoryState) => {
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
    const after = mode === "next" ? (prior.page?.nextCursor ?? null) : null;
    const input = parseCompanyDirectoryRequestV1({ ...owner, after });
    publish({ ...prior, busy: true, failed: null, error: null });
    if (!isActive()) return false;
    let refreshRequired = false;
    try {
      const result = await read(input);
      if (!isActive()) return false;
      if (!result.ok) {
        refreshRequired = result.error.code !== "unavailable" || !result.error.retryable;
        throw new Error("Directory read failed.");
      }
      // The application owns field validation. These checks protect this reader's lifetime
      // and live continuation, including an accidentally misbound runtime callback.
      refreshRequired = true;
      const page = result.value;
      if (
        page.vaultId !== owner.expectedVaultId ||
        page.includeArchived !== owner.includeArchived ||
        page.items.length > owner.limit ||
        page.hasMore !== (page.nextCursor !== null)
      )
        throw new Error("Directory scope changed.");
      const nextCursor = parseCompanyDirectoryRequestV1({
        ...owner,
        specVersion: page.specVersion,
        after: page.nextCursor,
      }).after;
      const last = page.items.at(-1);
      if (
        nextCursor !== null &&
        (page.items.length !== owner.limit ||
          last === undefined ||
          compareCompanyDirectoryEntries(last, nextCursor) !== 0 ||
          nextCursor.rowVersion !== last.rowVersion)
      )
        throw new Error("Directory cursor changed.");
      const priorIds = new Set(mode === "next" ? prior.page?.items.map(({ id }) => id) : []);
      const seen = new Set<string>();
      let previous = after === null ? null : { createdAt: after.createdAt, id: after.id };
      for (const item of page.items) {
        if (
          seen.has(item.id) ||
          priorIds.has(item.id) ||
          (previous !== null && compareCompanyDirectoryEntries(previous, item) >= 0)
        )
          throw new Error("Directory continuation changed.");
        seen.add(item.id);
        previous = item;
      }
      publish({
        owner,
        page: Object.freeze({
          ...page,
          items: Object.freeze(page.items.map((item) => Object.freeze({ ...item }))),
          nextCursor,
        }),
        busy: false,
        failed: null,
        error: null,
        refreshRequired: false,
      });
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        failed: mode,
        refreshRequired,
        error: refreshRequired
          ? "The local directory changed or could not be validated. Load the first page again; retained values may be stale."
          : "Local companies could not be read. Retry this page; retained values may be stale.",
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
