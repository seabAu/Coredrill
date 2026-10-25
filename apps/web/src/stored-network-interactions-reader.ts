import {
  networkInteractionReferenceV1,
  parseNetworkInteractionsPageV1,
  parseNetworkInteractionsRequestV1,
  parseNetworkInteractionSummaryRequestV1,
  parseNetworkInteractionSummaryTextPartV1,
  type NetworkInteractionReferenceV1,
  type NetworkInteractionsPageV1,
  type ListNetworkInteractionsInputV1,
  type ListNetworkInteractionsRequestV1,
  type ReadNetworkInteractionSummaryRequestV1,
} from "@coredrill/application";
import type { StoredNetworkInteractionsApi } from "./stored-network-interactions.js";
export interface StoredNetworkSummaryState {
  readonly reference: NetworkInteractionReferenceV1;
  readonly summaryByteLength: number;
  readonly text: string;
  readonly nextByteOffset: number | null;
  readonly complete: boolean;
  readonly busy: boolean;
  readonly failedRequest: ReadNetworkInteractionSummaryRequestV1 | null;
  readonly error: string | null;
}
export interface StoredNetworkInteractionsState {
  readonly owner: ListNetworkInteractionsRequestV1;
  readonly page: NetworkInteractionsPageV1 | null;
  readonly failedRequest: ListNetworkInteractionsRequestV1 | null;
  readonly busy: boolean;
  readonly refreshRequired: boolean;
  readonly error: string | null;
  readonly summary: StoredNetworkSummaryState | null;
}
/** Read-only owned page and deliberate body; no retry rebases a record or submits a write. */
export const createStoredNetworkInteractionsReader = (
  scope: Omit<ListNetworkInteractionsInputV1, "after">,
  api: StoredNetworkInteractionsApi,
  changed: (state: StoredNetworkInteractionsState) => void,
) => {
  const owner = parseNetworkInteractionsRequestV1(scope);
  if (owner.after !== null) throw new TypeError("Choose a first-page Network history owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredNetworkInteractionsState = Object.freeze({
    owner,
    page: null,
    failedRequest: null,
    busy: false,
    refreshRequired: false,
    error: null,
    summary: null,
  });
  const publish = (next: StoredNetworkInteractionsState) => {
    if (active) {
      state = Object.freeze(next);
      changed(state);
    }
  };
  const errorText = (refresh: boolean) =>
    refresh
      ? "Network history changed or could not be validated. Refresh the original viewed history before continuing; retained records may be stale."
      : "Network history could not be read. Retry the same page; retained records may be stale.";
  const page = async (request: ListNetworkInteractionsRequestV1) => {
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
      const value = parseNetworkInteractionsPageV1(result.value, request);
      if (request.after !== null) {
        const previous = new Set(prior.page?.items.map((item) => item.id));
        if (value.items.some((item) => previous.has(item.id))) throw new TypeError();
      }
      publish({
        owner,
        page: value,
        busy: false,
        error: null,
        failedRequest: null,
        refreshRequired: false,
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
        error: errorText(refreshRequired),
        summary: null,
      });
      return false;
    }
  };
  const summary = async (request: ReadNetworkInteractionSummaryRequestV1) => {
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
      item?.summaryByteLength !== request.summaryByteLength ||
      JSON.stringify(networkInteractionReferenceV1(owner, item)) !==
        JSON.stringify(request.reference)
    )
      return false;
    const prior = state.summary,
      continuing =
        prior !== null &&
        request.byteOffset > 0 &&
        JSON.stringify(prior.reference) === JSON.stringify(request.reference);
    if (request.byteOffset > 0 && (!continuing || request.byteOffset !== prior.nextByteOffset))
      return false;
    const selected: StoredNetworkSummaryState = Object.freeze({
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
      const part = parseNetworkInteractionSummaryTextPartV1(result.value, request);
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
        error: refreshRequired ? errorText(true) : null,
        summary: Object.freeze({
          ...selected,
          busy: false,
          failedRequest: request,
          error:
            "The original summary part could not be confirmed. Retained text may be incomplete or stale.",
        }),
      });
      return false;
    }
  };
  return Object.freeze({
    current: () => state,
    first: () => page(owner),
    next: () =>
      state.error !== null || state.page?.nextCursor === undefined || state.page.nextCursor === null
        ? Promise.resolve(false)
        : page(parseNetworkInteractionsRequestV1({ ...owner, after: state.page.nextCursor })),
    retry: () =>
      state.failedRequest === null ? Promise.resolve(false) : page(state.failedRequest),
    inspect: (id: string) => {
      const item = state.page?.items.find((entry) => entry.id === id);
      return item === undefined
        ? Promise.resolve(false)
        : summary(
            parseNetworkInteractionSummaryRequestV1({
              specVersion: 1,
              reference: networkInteractionReferenceV1(owner, item),
              summaryByteLength: item.summaryByteLength,
            }),
          );
    },
    moreSummary: () =>
      state.summary?.nextByteOffset === undefined ||
      state.summary.nextByteOffset === null ||
      state.summary.error !== null
        ? Promise.resolve(false)
        : summary(
            parseNetworkInteractionSummaryRequestV1({
              specVersion: 1,
              reference: state.summary.reference,
              summaryByteLength: state.summary.summaryByteLength,
              byteOffset: state.summary.nextByteOffset,
            }),
          ),
    retrySummary: () =>
      state.summary?.failedRequest === undefined || state.summary.failedRequest === null
        ? Promise.resolve(false)
        : summary(state.summary.failedRequest),
    closeSummary: () => {
      if (state.summary?.busy === true || state.busy) return false;
      publish({ ...state, summary: null });
      return true;
    },
    dispose: () => {
      active = false;
    },
  });
};
