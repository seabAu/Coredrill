import {
  parseCompanyJobsPageV1,
  parseCompanyJobsRequestV1,
  type CompanyJobsPageV1,
  type ListCompanyJobsInputV1,
  type ListCompanyJobsRequestV1,
} from "@coredrill/application";
import type { StoredCompanyJobsApi } from "./stored-company-jobs.js";

export interface StoredCompanyJobsState {
  readonly owner: ListCompanyJobsRequestV1;
  readonly page: CompanyJobsPageV1 | null;
  readonly request: ListCompanyJobsRequestV1 | null;
  readonly failedRequest: ListCompanyJobsRequestV1 | null;
  readonly busy: boolean;
  readonly refreshRequired: boolean;
  readonly error: string | null;
}

/** One owned live page; no canonical writes, automatic retries or inferred totals. */
export const createStoredCompanyJobsReader = (
  scope: Omit<ListCompanyJobsInputV1, "after">,
  read: StoredCompanyJobsApi["page"],
  changed: (state: StoredCompanyJobsState) => void,
) => {
  const owner = parseCompanyJobsRequestV1(scope);
  if (owner.after !== null) throw new TypeError("Choose a first-page company owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredCompanyJobsState = Object.freeze({
    owner,
    page: null,
    request: null,
    failedRequest: null,
    busy: false,
    refreshRequired: false,
    error: null,
  });
  const publish = (next: StoredCompanyJobsState) => {
    if (!active) return;
    state = Object.freeze(next);
    changed(state);
  };
  const load = async (request: ListCompanyJobsRequestV1): Promise<boolean> => {
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
        throw new Error("Unconfirmed linked roles.");
      }
      refreshRequired = true;
      const page = parseCompanyJobsPageV1(result.value, request);
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
          ? "Linked roles changed or could not be validated. Refresh the selected company before continuing; retained roles may be stale."
          : "Linked roles could not be read. Retry the same page; retained roles may be stale.",
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
        : load(parseCompanyJobsRequestV1({ ...owner, after: state.page.nextCursor })),
    retry: () =>
      state.failedRequest === null ? Promise.resolve(false) : load(state.failedRequest),
    restore: (input: unknown) => {
      const request = parseCompanyJobsRequestV1(input);
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
        throw new TypeError("Foreign linked-role return scope.");
      return load(request);
    },
    dispose: () => {
      active = false;
    },
  });
};
