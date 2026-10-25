import {
  parseCompanySourcesPageV1,
  parseCompanySourcesRequestV1,
  type CompanySourcesPageV1,
  type ListCompanySourcesInputV1,
  type ListCompanySourcesRequestV1,
} from "@coredrill/application";
import type { StoredCompanySourcesApi } from "./stored-company-sources.js";

export interface StoredCompanySourcesState {
  readonly owner: ListCompanySourcesRequestV1;
  readonly page: CompanySourcesPageV1 | null;
  readonly request: ListCompanySourcesRequestV1 | null;
  readonly failedRequest: ListCompanySourcesRequestV1 | null;
  readonly busy: boolean;
  readonly refreshRequired: boolean;
  readonly error: string | null;
}
export const createStoredCompanySourcesReader = (
  scope: Omit<ListCompanySourcesInputV1, "after">,
  read: StoredCompanySourcesApi["page"],
  changed: (state: StoredCompanySourcesState) => void,
) => {
  const owner = parseCompanySourcesRequestV1(scope);
  if (owner.after !== null) throw new TypeError("Choose a first-page listing-source owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredCompanySourcesState = Object.freeze({
    owner,
    page: null,
    request: null,
    failedRequest: null,
    busy: false,
    refreshRequired: false,
    error: null,
  });
  const publish = (next: StoredCompanySourcesState) => {
    if (active) {
      state = Object.freeze(next);
      changed(state);
    }
  };
  const load = async (request: ListCompanySourcesRequestV1) => {
    if (!active || state.busy || state.refreshRequired) return false;
    const prior = state;
    publish({ ...prior, busy: true, failedRequest: null, error: null });
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
      const page = parseCompanySourcesPageV1(result.value, request);
      if (request.after !== null) {
        const previous = new Set(prior.page?.items.map((item) => item.id));
        if (page.items.some((item) => previous.has(item.id))) throw new TypeError();
      }
      publish({
        owner,
        page,
        request,
        failedRequest: null,
        busy: false,
        refreshRequired: false,
        error: null,
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
          ? "Listing sources changed or could not be validated. Refresh the selected company before continuing; retained sources may be stale."
          : "Listing sources could not be read. Retry the same page; retained sources may be stale.",
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
        : load(parseCompanySourcesRequestV1({ ...owner, after: state.page.nextCursor })),
    retry: () =>
      state.failedRequest === null ? Promise.resolve(false) : load(state.failedRequest),
    restore: (value: unknown) => {
      const request = parseCompanySourcesRequestV1(value);
      const keys = [
        "specVersion",
        "expectedVaultId",
        "companyId",
        "expectedCompanyRowVersion",
        "includeArchivedCompany",
        "includeArchivedJobs",
        "limit",
      ] as const;
      if (keys.some((key) => request[key] !== owner[key]))
        throw new TypeError("Foreign listing-source return scope.");
      return load(request);
    },
    dispose: () => {
      active = false;
    },
  });
};
