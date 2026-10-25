import {
  CONTACT_PROVENANCE_FIELDS,
  parseContactWorkspaceV1,
  parseContactUseRecordInputV1,
  parseContactUseControlInputV1,
  parseContactUseRecordRequestV1,
  parseContactUseControlRequestV1,
  parseContactUseRecordReceiptV1,
  parseContactUseControlReceiptV1,
  parseContactUseInspectionV1,
  type ApplicationResult,
  type ContactProvenanceFieldName,
  type ContactWorkspaceV1,
  type ContactUseRecordInputV1,
  type ContactUseControlInputV1,
  type ContactUseRecordReceiptV1,
  type ContactUseControlReceiptV1,
  type ContactUseInspectionV1,
} from "@coredrill/application";
import type {
  StoredContactFieldUseAction,
  StoredContactFieldUseApi,
} from "./stored-contact-field-use.js";

export interface StoredContactUseOwner {
  readonly vaultId: string;
  readonly contactId: string;
  readonly contactRowVersion: number;
  readonly companyScope: string | null;
  readonly fieldName: ContactProvenanceFieldName;
}
type Receipt = ContactUseRecordReceiptV1 | ContactUseControlReceiptV1;
export interface StoredContactUseReview {
  readonly owner: StoredContactUseOwner;
  readonly input: ContactUseRecordInputV1 | ContactUseControlInputV1;
  readonly phase: "review" | "uncertain" | "acknowledged" | ContactUseInspectionV1["state"];
  readonly busy: boolean;
  readonly error: string | null;
  readonly receipt: Receipt | null;
  readonly observation: ContactUseInspectionV1 | null;
}
/** One explicit original action; navigation retains its owner, disposal never cancels a dispatched write. */
export const createStoredContactUseController = (options: {
  readonly api: () => StoredContactFieldUseApi;
  readonly allowed: (review: StoredContactUseReview | null) => boolean;
  readonly changed: (review: StoredContactUseReview | null) => void;
  readonly exclusive: (
    vaultId: string,
    work: () => Promise<ApplicationResult<Receipt>>,
  ) => Promise<ApplicationResult<Receipt>>;
}) => {
  let active = true;
  const isActive = () => active;
  let state: StoredContactUseReview | null = null;
  let action: StoredContactFieldUseAction | null = null;
  const publish = (value: StoredContactUseReview | null) => {
    if (!active) return;
    state = value === null ? null : Object.freeze(value);
    options.changed(state);
  };
  const originalRequest = (bound: StoredContactFieldUseAction, review: StoredContactUseReview) => {
    const raw = bound.originalRequest();
    const control = review.input.kind === "disable_policy" || review.input.kind === "revoke_review";
    const request = control
      ? parseContactUseControlRequestV1(raw)
      : parseContactUseRecordRequestV1(raw);
    const context = bound.attemptContext();
    if (
      request.operationId !== context?.operationId ||
      request.recordedAt !== context.initiatedAt ||
      Object.entries(review.input).some(
        ([key, value]) => (request as unknown as Record<string, unknown>)[key] !== value,
      )
    )
      throw new TypeError("The original contact review identity changed.");
    return request;
  };
  const run = async (mode: "submit" | "inspect"): Promise<boolean> => {
    const original = state,
      bound = action;
    if (
      !active ||
      original === null ||
      bound === null ||
      original.busy ||
      !options.allowed(original)
    )
      return false;
    const control =
      original.input.kind === "disable_policy" || original.input.kind === "revoke_review";
    if (mode === "submit") {
      if (
        original.phase !== "review" &&
        original.phase !== (control ? "original_present" : "absent")
      )
        return false;
    } else if (
      !["uncertain", "absent", "changed", "original_present"].includes(original.phase) ||
      bound.originalRequest() === null
    )
      return false;
    publish({ ...original, busy: true, error: null });
    let entered = false;
    const wasEntered = () => entered;
    try {
      if (mode === "submit") {
        const result = await options.exclusive(original.owner.vaultId, async () => {
          // Ownership can change while waiting for the vault mutation boundary.
          if (!isActive() || state?.owner !== original.owner || !options.allowed(state))
            throw new Error("Retired review.");
          entered = true;
          return bound.submit();
        });
        if (!isActive()) return false;
        if (!result.ok) throw new Error("Unconfirmed local review.");
        const request = originalRequest(bound, original);
        const receipt =
          request.kind === "disable_policy" || request.kind === "revoke_review"
            ? parseContactUseControlReceiptV1(result.value, request)
            : parseContactUseRecordReceiptV1(result.value, request);
        publish({
          ...original,
          busy: false,
          phase: "acknowledged",
          receipt,
          error: null,
          observation: null,
        });
        return true;
      }
      const result = await bound.inspect();
      if (!isActive()) return false;
      if (!result.ok) throw new Error("Unconfirmed observation.");
      const observation = parseContactUseInspectionV1(
        result.value,
        originalRequest(bound, original),
      );
      publish({ ...original, busy: false, phase: observation.state, observation, error: null });
      return observation.state === "matching";
    } catch {
      if (!isActive()) return false;
      const uncertain = mode === "submit" && wasEntered() && bound.wasDispatched();
      publish({
        ...original,
        busy: false,
        phase: uncertain ? "uncertain" : original.phase,
        error:
          mode === "submit" && !uncertain
            ? "This submission was not confirmed. Keep the original review context before trying again."
            : "The stored outcome could not be confirmed. Inspect the original record without repeating the write.",
      });
      return false;
    }
  };
  return Object.freeze({
    current: () => state,
    begin: (
      workspace: ContactWorkspaceV1,
      companyScope: string | null,
      fieldName: ContactProvenanceFieldName,
      mode: "record" | "control",
      input: unknown,
    ): boolean => {
      if (!active || state !== null || !options.allowed(null)) return false;
      try {
        if (!CONTACT_PROVENANCE_FIELDS.includes(fieldName)) return false;
        const copied = parseContactWorkspaceV1(workspace, {
          expectedVaultId: workspace.vaultId,
          contactId: workspace.contact.id,
          includeArchived: true,
        });
        if (companyScope !== null && copied.contact.companyId !== companyScope) return false;
        const payload =
          mode === "record"
            ? parseContactUseRecordInputV1(input)
            : parseContactUseControlInputV1(input);
        if (
          payload.expectedVaultId !== copied.vaultId ||
          (mode === "record" && copied.contact.archivedAt !== null)
        )
          return false;
        if ("fieldName" in payload && payload.fieldName !== fieldName) return false;
        if (
          "contactId" in payload &&
          (payload.contactId !== copied.contact.id ||
            payload.expectedContactRowVersion !== copied.contact.rowVersion)
        )
          return false;
        const owner = Object.freeze({
          vaultId: copied.vaultId,
          contactId: copied.contact.id,
          contactRowVersion: copied.contact.rowVersion,
          companyScope,
          fieldName,
        });
        const selected = options.api();
        const bound =
          mode === "record" ? selected.beginRecord(payload) : selected.beginControl(payload);
        action = bound;
        publish({
          owner,
          input: payload,
          phase: "review",
          busy: false,
          error: null,
          receipt: null,
          observation: null,
        });
        return true;
      } catch {
        return false;
      }
    },
    submit: () => run("submit"),
    inspect: () => run("inspect"),
    close: (discardUnresolved = false): boolean => {
      if (!active || state?.busy) return false;
      if (state !== null && ["uncertain", "changed"].includes(state.phase) && !discardUnresolved)
        return false;
      action = null;
      publish(null);
      return true;
    },
    dispose: () => {
      active = false;
      state = null;
      action = null;
    },
  });
};
