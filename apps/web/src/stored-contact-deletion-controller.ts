import {
  parseContactDeletionResultV1,
  type ApplicationResult,
  type ContactDeletionResultV1,
  type ContactDeletionTargetV1,
  type ContactWorkspaceV1,
} from "@coredrill/application";
import type {
  StoredContactDeletionAction,
  StoredContactDeletionApi,
} from "./stored-contact-deletion.js";

export interface StoredContactDeletionReview {
  readonly target: ContactDeletionTargetV1;
  readonly companyScope: string | null;
  readonly confirmation: string;
  readonly busy: boolean;
  readonly phase: "review" | "uncertain" | ContactDeletionResultV1["state"];
  readonly error: string | null;
}

/** Session-only intent. Navigation never rebinds an action; disposal never cancels a dispatched write. */
export const createStoredContactDeletionController = (options: {
  readonly api: () => StoredContactDeletionApi;
  readonly allowed: (review: StoredContactDeletionReview | null) => boolean;
  readonly changed: (review: StoredContactDeletionReview | null) => void;
  readonly exclusive: (
    vaultId: string,
    work: () => Promise<ApplicationResult<ContactDeletionResultV1>>,
  ) => Promise<ApplicationResult<ContactDeletionResultV1>>;
}) => {
  let active = true;
  const isActive = () => active;
  let state: StoredContactDeletionReview | null = null;
  let action: StoredContactDeletionAction | null = null;
  const publish = (value: StoredContactDeletionReview | null) => {
    state = value === null ? null : Object.freeze(value);
    options.changed(state);
  };
  const run = async (mode: "remove" | "inspect"): Promise<boolean> => {
    const original = state;
    const bound = action;
    if (
      !active ||
      original === null ||
      bound === null ||
      original.busy ||
      !options.allowed(original)
    )
      return false;
    if (mode === "remove") {
      if (
        !["review", "original_present"].includes(original.phase) ||
        original.confirmation !== "DELETE CONTACT"
      )
        return false;
    } else if (!["uncertain", "changed", "unresolved", "original_present"].includes(original.phase))
      return false;
    publish({ ...original, busy: true, error: null });
    let dispatched = false;
    const wasDispatched = () => dispatched;
    try {
      const result =
        mode === "inspect"
          ? await bound.inspect()
          : await options.exclusive(original.target.expectedVaultId, () => {
              // Recheck after waiting for ownership of the vault mutation boundary.
              if (!active || !options.allowed(state)) throw new Error("Retired contact review.");
              dispatched = true;
              return bound.remove(original.confirmation);
            });
      if (!isActive()) return false;
      if (!result.ok) throw new Error("Unconfirmed contact deletion state.");
      const value = parseContactDeletionResultV1(
        result.value,
        original.target,
        mode === "remove"
          ? ["deleted"]
          : ["original_present", "changed", "absent_complete", "unresolved"],
      );
      publish({ ...original, busy: false, phase: value.state, error: null });
      return value.state === "deleted" || value.state === "absent_complete";
    } catch {
      if (!isActive()) return false;
      publish({
        ...original,
        busy: false,
        phase: mode === "remove" && wasDispatched() ? "uncertain" : original.phase,
        error:
          mode === "remove" && !wasDispatched()
            ? "Deletion was not submitted by this review. Review the current vault before continuing."
            : "The outcome could not be confirmed. Check stored state without repeating the write.",
      });
      return false;
    }
  };
  return Object.freeze({
    current: () => state,
    start: (workspace: ContactWorkspaceV1, companyScope: string | null): boolean => {
      if (!active || state !== null || !options.allowed(null)) return false;
      try {
        const bound = options.api().begin(workspace);
        if (companyScope !== null && companyScope !== bound.target.expectedCompanyId) return false;
        action = bound;
        publish({
          target: bound.target,
          companyScope,
          confirmation: "",
          busy: false,
          phase: "review",
          error: null,
        });
        return true;
      } catch {
        return false;
      }
    },
    edit: (value: string): boolean => {
      if (
        !active ||
        state === null ||
        state.busy ||
        state.phase !== "review" ||
        !options.allowed(state)
      )
        return false;
      // Bound session input; never trim or reinterpret exact consent.
      if (typeof value !== "string" || value.length > 64) return false;
      publish({ ...state, confirmation: value, error: null });
      return true;
    },
    remove: () => run("remove"),
    inspect: () => run("inspect"),
    close: (): boolean => {
      if (!active || state?.busy) return false;
      action = null;
      publish(null);
      return true;
    },
    dispose: () => {
      active = false;
      action = null;
      state = null;
    },
  });
};
