import {
  companyInteractionReferenceV1,
  parseCompanyInteractionsPageV1,
  parseCompanyInteractionsRequestV1,
  parseCompanyInteractionSummaryRequestV1,
  parseCompanyInteractionSummaryTextPartV1,
  type CompanyInteractionReferenceV1,
  type CompanyInteractionsPageV1,
  type ListCompanyInteractionsInputV1,
  type ListCompanyInteractionsRequestV1,
  type ReadCompanyInteractionSummaryRequestV1,
} from "@coredrill/application";
import type { StoredCompanyInteractionsApi } from "./stored-company-interactions.js";

export interface StoredCompanyInteractionSummaryState {
  readonly reference: CompanyInteractionReferenceV1;
  readonly summaryByteLength: number;
  readonly text: string;
  readonly nextByteOffset: number | null;
  readonly complete: boolean;
  readonly busy: boolean;
  readonly failedRequest: ReadCompanyInteractionSummaryRequestV1 | null;
  readonly error: string | null;
}
export interface StoredCompanyInteractionsState {
  readonly owner: ListCompanyInteractionsRequestV1;
  readonly page: CompanyInteractionsPageV1 | null;
  readonly request: ListCompanyInteractionsRequestV1 | null;
  readonly failedRequest: ListCompanyInteractionsRequestV1 | null;
  readonly busy: boolean;
  readonly refreshRequired: boolean;
  readonly error: string | null;
  readonly summary: StoredCompanyInteractionSummaryState | null;
}

/** One owned live page and deliberate bounded summary; never canonical storage or automatic retry. */
export const createStoredCompanyInteractionsReader = (
  scope: Omit<ListCompanyInteractionsInputV1, "after">,
  api: StoredCompanyInteractionsApi,
  changed: (state: StoredCompanyInteractionsState) => void,
) => {
  const owner = parseCompanyInteractionsRequestV1(scope);
  if (owner.after !== null) throw new TypeError("Choose a first-page company history owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredCompanyInteractionsState = Object.freeze({
    owner,
    page: null,
    request: null,
    failedRequest: null,
    busy: false,
    refreshRequired: false,
    error: null,
    summary: null,
  });
  const publish = (next: StoredCompanyInteractionsState) => {
    if (!active) return;
    state = Object.freeze(next);
    changed(state);
  };
  const unavailable = (refreshRequired: boolean) =>
    refreshRequired
      ? "Company history changed or could not be validated. Refresh the selected company before continuing; retained records may be stale."
      : "Company history could not be read. Retry the same page; retained records may be stale.";
  const loadPage = async (request: ListCompanyInteractionsRequestV1) => {
    if (!active || state.busy || state.summary?.busy === true || state.refreshRequired)
      return false;
    const prior = state;
    publish({ ...prior, busy: true, error: null, failedRequest: null, summary: null });
    if (!isActive()) return false;
    let refreshRequired = false;
    try {
      const result = await api.page(request);
      if (!isActive()) return false;
      if (!result.ok) {
        refreshRequired = result.error.code !== "unavailable" || !result.error.retryable;
        throw new Error();
      }
      refreshRequired = true;
      const page = parseCompanyInteractionsPageV1(result.value, request);
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
        summary: null,
      });
      return true;
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        failedRequest: request,
        refreshRequired,
        error: unavailable(refreshRequired),
        summary: null,
      });
      return false;
    }
  };
  const loadSummary = async (request: ReadCompanyInteractionSummaryRequestV1) => {
    if (
      !active ||
      state.busy ||
      state.summary?.busy === true ||
      state.refreshRequired ||
      state.error !== null ||
      state.page === null
    )
      return false;
    const item = state.page.items.find((entry) => entry.id === request.reference.id);
    if (
      item === undefined ||
      JSON.stringify(companyInteractionReferenceV1(owner, item)) !==
        JSON.stringify(request.reference)
    )
      return false;
    const prior = state.summary;
    const continuing =
      prior !== null &&
      request.byteOffset > 0 &&
      JSON.stringify(prior.reference) === JSON.stringify(request.reference);
    if (request.byteOffset > 0 && (!continuing || request.byteOffset !== prior.nextByteOffset))
      return false;
    const selected: StoredCompanyInteractionSummaryState = Object.freeze({
      reference: request.reference,
      summaryByteLength: request.summaryByteLength,
      text: continuing ? prior.text : "",
      nextByteOffset: request.byteOffset,
      complete: false,
      busy: true,
      failedRequest: null,
      error: null,
    });
    publish({ ...state, summary: selected });
    if (!isActive()) return false;
    let refreshRequired = false;
    try {
      const result = await api.summary(request);
      if (!isActive()) return false;
      if (!result.ok) {
        refreshRequired = result.error.code !== "unavailable" || !result.error.retryable;
        throw new Error();
      }
      refreshRequired = true;
      const part = parseCompanyInteractionSummaryTextPartV1(result.value, request);
      publish({
        ...state,
        summary: Object.freeze({
          ...selected,
          busy: false,
          text: selected.text + part.text,
          nextByteOffset: part.nextByteOffset,
          complete: !part.hasMore,
        }),
      });
      return true;
    } catch {
      if (!isActive()) return false;
      publish({
        ...state,
        refreshRequired,
        error: refreshRequired ? unavailable(true) : null,
        summary: Object.freeze({
          ...selected,
          busy: false,
          failedRequest: request,
          error: refreshRequired
            ? "The viewed summary is no longer confirmed. Refresh its company and history."
            : "The summary part could not be read. Retry the same part.",
        }),
      });
      return false;
    }
  };
  return Object.freeze({
    current: () => state,
    first: () => loadPage(owner),
    next: () =>
      state.error !== null || state.page?.nextCursor === undefined || state.page.nextCursor === null
        ? Promise.resolve(false)
        : loadPage(parseCompanyInteractionsRequestV1({ ...owner, after: state.page.nextCursor })),
    retry: () =>
      state.failedRequest === null ? Promise.resolve(false) : loadPage(state.failedRequest),
    openSummary: (id: string) => {
      const item = state.page?.items.find((entry) => entry.id === id);
      return item === undefined
        ? Promise.resolve(false)
        : loadSummary(
            parseCompanyInteractionSummaryRequestV1({
              specVersion: 1,
              reference: companyInteractionReferenceV1(owner, item),
              summaryByteLength: item.summaryByteLength,
            }),
          );
    },
    moreSummary: () => {
      const selected = state.summary;
      return selected === null ||
        selected.complete ||
        selected.failedRequest !== null ||
        selected.nextByteOffset === null
        ? Promise.resolve(false)
        : loadSummary(
            parseCompanyInteractionSummaryRequestV1({
              specVersion: 1,
              reference: selected.reference,
              summaryByteLength: selected.summaryByteLength,
              byteOffset: selected.nextByteOffset,
            }),
          );
    },
    retrySummary: () =>
      state.summary?.failedRequest === undefined || state.summary.failedRequest === null
        ? Promise.resolve(false)
        : loadSummary(state.summary.failedRequest),
    closeSummary: () => {
      if (active && !state.summary?.busy) publish({ ...state, summary: null });
    },
    dispose: () => {
      active = false;
    },
  });
};
