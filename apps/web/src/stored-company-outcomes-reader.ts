import {
  parseCompanyOutcomesPageV1,
  parseCompanyOutcomesRequestV1,
  type CompanyOutcomesPageV1,
  type ListCompanyOutcomesInputV1,
  type ListCompanyOutcomesRequestV1,
} from "@coredrill/application";
import type { StoredCompanyOutcomesApi } from "./stored-company-outcomes.js";
export interface StoredCompanyOutcomesState {
  readonly owner: ListCompanyOutcomesRequestV1;
  readonly page: CompanyOutcomesPageV1 | null;
  readonly failedRequest: ListCompanyOutcomesRequestV1 | null;
  readonly busy: boolean;
  readonly refreshRequired: boolean;
  readonly error: string | null;
}
/** One owned live page; reload starts a freshly validated first read. */
export const createStoredCompanyOutcomesReader = (
  scope: Omit<ListCompanyOutcomesInputV1, "after">,
  read: StoredCompanyOutcomesApi["page"],
  changed: (state: StoredCompanyOutcomesState) => void,
) => {
  const owner = parseCompanyOutcomesRequestV1(scope);
  if (owner.after !== null) throw new TypeError("Choose a first-page stage-history owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredCompanyOutcomesState = Object.freeze({
    owner,
    page: null,
    failedRequest: null,
    busy: false,
    refreshRequired: false,
    error: null,
  });
  const publish = (value: StoredCompanyOutcomesState) => {
    if (active) {
      state = Object.freeze(value);
      changed(state);
    }
  };
  const load = async (request: ListCompanyOutcomesRequestV1) => {
    if (!active || state.busy || state.refreshRequired) return false;
    const prior = state;
    publish({ ...prior, busy: true, error: null, failedRequest: null });
    if (!isActive()) return false;
    let refreshRequired = false;
    try {
      const result = await read(request);
      if (!isActive()) return false;
      if (!result.ok) {
        refreshRequired = result.error.code !== "unavailable" || !result.error.retryable;
        throw new Error();
      }
      refreshRequired = true;
      const page = parseCompanyOutcomesPageV1(result.value, request);
      if (request.after !== null) {
        const previous = new Set(prior.page?.items.map((item) => item.id));
        if (page.items.some((item) => previous.has(item.id))) throw new TypeError();
      }
      publish({
        owner,
        page,
        busy: false,
        error: null,
        failedRequest: null,
        refreshRequired: false,
      });
      return true;
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        failedRequest: request,
        refreshRequired,
        error: refreshRequired
          ? "Recorded stage history changed or could not be validated. Refresh the selected company before continuing; retained history may be stale."
          : "Recorded stage history could not be read. Retry the same page; retained history may be stale.",
      });
      return false;
    }
  };
  return Object.freeze({
    current: () => state,
    first: () => load(owner),
    next: () =>
      state.error !== null || state.page?.nextCursor === undefined || state.page.nextCursor === null
        ? Promise.resolve(false)
        : load(parseCompanyOutcomesRequestV1({ ...owner, after: state.page.nextCursor })),
    retry: () =>
      state.failedRequest === null ? Promise.resolve(false) : load(state.failedRequest),
    dispose: () => {
      active = false;
    },
  });
};
