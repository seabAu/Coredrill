import {
  parseContactFieldEvidencePageV1,
  parseContactFieldEvidenceRequestV1,
  type ContactFieldEvidencePageV1,
  type ContactFieldEvidenceRequestV1,
  type ListContactFieldEvidenceInputV1,
} from "@coredrill/application";
import type { StoredContactFieldEvidenceApi } from "./stored-contact-field-evidence.js";

export interface StoredContactFieldEvidenceState {
  readonly owner: ContactFieldEvidenceRequestV1;
  readonly page: ContactFieldEvidencePageV1 | null;
  readonly busy: boolean;
  readonly failed: "first" | "next" | null;
  readonly error: string | null;
  readonly refreshRequired: boolean;
}
/** One live page of evidence, not canonical storage, an eligibility decision or a total. */
export const createStoredContactFieldEvidenceReader = (
  scope: Omit<ListContactFieldEvidenceInputV1, "after">,
  read: StoredContactFieldEvidenceApi["page"],
  changed: (state: StoredContactFieldEvidenceState) => void,
) => {
  const owner = parseContactFieldEvidenceRequestV1(scope);
  if (owner.after !== null) throw new TypeError("Choose a first-page contact field owner.");
  let active = true;
  const isActive = () => active;
  let state: StoredContactFieldEvidenceState = Object.freeze({
    owner,
    page: null,
    busy: false,
    failed: null,
    error: null,
    refreshRequired: false,
  });
  const publish = (next: StoredContactFieldEvidenceState) => {
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
    const input = parseContactFieldEvidenceRequestV1({
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
      const page = parseContactFieldEvidencePageV1(result.value, input);
      if (mode === "next" && page.currentValueHash !== prior.page?.currentValueHash)
        throw new Error();
      publish({ owner, page, busy: false, failed: null, error: null, refreshRequired: false });
    } catch {
      if (!isActive()) return false;
      publish({
        ...prior,
        busy: false,
        failed: mode,
        refreshRequired,
        error: refreshRequired
          ? "Contact evidence or its viewed owner changed or could not be validated. Refresh the selected contact, then load the first evidence page. Retained evidence may be stale."
          : "Contact evidence could not be read. Retry this page; retained evidence may be stale.",
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
