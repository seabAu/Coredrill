import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  ApplicationResult,
  ContactDeletionResultV1,
  ContactWorkspaceV1,
} from "@coredrill/application";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredContactDeletionController,
  type StoredContactDeletionReview,
} from "./stored-contact-deletion-controller.js";
import type { StoredContactDeletionApi } from "./stored-contact-deletion.js";

const descriptions = {
  review: "Review the original contact before submitting deletion.",
  uncertain: "Deletion may have committed. No automatic retry was made. Check stored state first.",
  original_present:
    "The original contact and version are still present. You may explicitly retry the identical deletion.",
  changed:
    "The contact changed. This review cannot delete the changed record. Close and refresh before starting a new review.",
  unresolved:
    "The parent is absent but contact-owned data remains. Cleanup is unresolved; this review will not purge it or retry deletion.",
  deleted:
    "Local deletion was acknowledged. Contact-owned fields and history were removed; recorded interactions were preserved with their contact link detached.",
  absent_complete:
    "The contact and owned data are absent. This read does not establish who removed them or whether the earlier attempt caused deletion.",
} as const;

/** Root-owned across route/tab/reflow changes; vault/restore retirement invalidates late results. */
export const useStoredContactDeletion = (options: {
  readonly api: StoredContactDeletionApi | undefined;
  readonly vaultId: string | null;
  readonly contactId: string | null;
  readonly companyScope: string | null;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly needsReopen: boolean;
  readonly mutationBlocked: boolean;
  readonly draftsBlocked: boolean;
  readonly exclusive: (
    vaultId: string,
    work: () => Promise<ApplicationResult<ContactDeletionResultV1>>,
  ) => Promise<ApplicationResult<ContactDeletionResultV1>>;
  readonly onActive: (active: boolean) => void;
  readonly onRemoved: (review: StoredContactDeletionReview) => void;
  readonly onSelect: (contactId: string, companyScope: string | null) => void;
}) => {
  const live = useRef(options);
  live.current = options;
  const controller = useRef<ReturnType<typeof createStoredContactDeletionController> | null>(null);
  const [model, setModel] = useState<StoredContactDeletionReview | null>(null);
  const [closeConsent, setCloseConsent] = useState(false);
  const container = useRef<HTMLElement>(null);
  const id = useId();
  const [focus, setFocus] = useState<{
    owner: NonNullable<typeof controller.current>;
    origin: Element | null;
  } | null>(null);
  useEffect(() => {
    const current = createStoredContactDeletionController({
      api: () => {
        const api = live.current.api;
        if (api === undefined) throw new Error("Contact deletion unavailable.");
        return api;
      },
      allowed: (review) => {
        const value = live.current;
        return (
          value.enabled &&
          value.visible &&
          !value.needsReopen &&
          !value.draftsBlocked &&
          (!value.mutationBlocked || current.current()?.busy === true) &&
          (review === null ||
            (value.vaultId === review.target.expectedVaultId &&
              value.contactId === review.target.contactId &&
              value.companyScope === review.companyScope))
        );
      },
      exclusive: (vaultId, work) => live.current.exclusive(vaultId, work),
      changed: (value) => {
        setModel(value);
        live.current.onActive(value !== null);
      },
    });
    controller.current = current;
    setModel(null);
    setCloseConsent(false);
    live.current.onActive(false);
    return () => {
      current.dispose();
      if (controller.current === current) controller.current = null;
    };
  }, [options.api, options.enabled, options.vaultId, options.needsReopen]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const value = controller.current?.current();
      if (value !== null && value !== undefined && (value.busy || value.phase === "uncertain"))
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  useLayoutEffect(() => {
    if (focus === null || model?.busy) return;
    const request = focus;
    restoreFocusAfterChange(request.origin, () => {
      if (
        controller.current !== request.owner ||
        !live.current.enabled ||
        !live.current.visible ||
        live.current.needsReopen
      )
        return null;
      const review = request.owner.current();
      if (
        review !== null &&
        (review.target.expectedVaultId !== live.current.vaultId ||
          (review.target.contactId !== live.current.contactId &&
            !(
              ["deleted", "absent_complete"].includes(review.phase) &&
              live.current.contactId === null
            )) ||
          review.companyScope !== live.current.companyScope)
      )
        return null;
      return (
        container.current?.querySelector<HTMLElement>("[data-contact-delete-status]") ??
        document.querySelector<HTMLElement>("[data-contact-start-new]:not([disabled])")
      );
    });
    setFocus(null);
  }, [focus, model]);
  const run = (mode: "remove" | "inspect") => {
    const current = controller.current;
    if (current === null) return;
    const invokedApi = live.current.api;
    const origin = document.activeElement;
    void current[mode]().then((removed) => {
      if (controller.current !== current) return;
      const review = current.current();
      if (
        removed &&
        review !== null &&
        live.current.enabled &&
        !live.current.needsReopen &&
        live.current.api === invokedApi &&
        live.current.vaultId === review.target.expectedVaultId
      )
        live.current.onRemoved(review);
      const active = document.activeElement;
      if (active === null || active === document.body || active === origin || !active.isConnected)
        setFocus({ owner: current, origin });
    });
  };
  const owned =
    options.enabled && !options.needsReopen && model?.target.expectedVaultId === options.vaultId
      ? model
      : null;
  const sameTarget =
    owned !== null &&
    owned.target.contactId === options.contactId &&
    owned.companyScope === options.companyScope;
  const disabled = options.mutationBlocked || options.draftsBlocked || owned?.busy === true;
  const complete = owned?.phase === "deleted" || owned?.phase === "absent_complete";
  const view =
    !options.enabled || options.needsReopen || model === null ? null : (
      <section ref={container} aria-label="Review local contact deletion">
        {owned === null ? (
          <p>
            A contact deletion review belongs to a retired vault. Its details are not shown here.
          </p>
        ) : !sameTarget &&
          !(
            complete &&
            options.contactId === null &&
            owned.companyScope === options.companyScope
          ) ? (
          <p>
            A contact deletion review is retained for another selection. No write or read is
            automatically repeated.{" "}
            <button
              className="cd-button"
              type="button"
              onClick={() => {
                options.onSelect(owned.target.contactId, owned.companyScope);
              }}
            >
              Return to contact deletion review
            </button>
          </p>
        ) : (
          <>
            <h4>Review local contact deletion</h4>
            <p>
              Original local contact ID:{" "}
              <span className="cd-contact-literal">{owned.target.contactId}</span>; stored version{" "}
              {owned.target.expectedRowVersion}. No withheld contact values are shown in this
              review.
            </p>
            <p>
              Removes this contact’s fields, notes, owned field-value history, manual creation
              receipt and contact field links. Recorded interactions remain with their contact link
              detached.
            </p>
            <p>
              Does not erase companies, jobs, recorded interaction text, historical interview
              contact IDs, shared sources/provenance, external archives or free-text mentions.
              Nothing is sent or scheduled. This is not an all-copies erasure guarantee.
            </p>
            <p role="status" tabIndex={-1} data-contact-delete-status="true">
              {owned.busy
                ? "Checking or submitting the original contact deletion. Do not repeat it."
                : descriptions[owned.phase]}
            </p>
            {owned.error !== null ? <p role="alert">{owned.error}</p> : null}
            {!complete ? (
              <>
                <label htmlFor={`${id}-consent`}>
                  Type DELETE CONTACT to confirm this local deletion
                </label>
                <input
                  id={`${id}-consent`}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={64}
                  value={owned.confirmation}
                  disabled={disabled || owned.phase !== "review"}
                  onChange={(event) => controller.current?.edit(event.currentTarget.value)}
                />
                <button
                  className="cd-button"
                  type="button"
                  disabled={
                    disabled ||
                    !sameTarget ||
                    !["review", "original_present"].includes(owned.phase) ||
                    owned.confirmation !== "DELETE CONTACT"
                  }
                  onClick={() => {
                    run("remove");
                  }}
                >
                  {owned.phase === "original_present"
                    ? "Retry identical contact deletion"
                    : "Delete this local contact"}
                </button>
                {["uncertain", "changed", "unresolved", "original_present"].includes(
                  owned.phase,
                ) ? (
                  <button
                    className="cd-button"
                    type="button"
                    disabled={disabled || !sameTarget}
                    onClick={() => {
                      run("inspect");
                    }}
                  >
                    Check contact deletion state
                  </button>
                ) : null}
              </>
            ) : null}
            <p>
              Closing this review does not undo or cancel a deletion that may already have
              committed. Session intent is not crash-proof storage.
            </p>
            {closeConsent || complete || owned.phase === "review" ? (
              <button
                className="cd-button"
                type="button"
                disabled={owned.busy}
                onClick={() => {
                  const current = controller.current;
                  const origin = document.activeElement;
                  if (current?.close()) {
                    setCloseConsent(false);
                    setFocus({ owner: current, origin });
                  }
                }}
              >
                {closeConsent
                  ? "Confirm close without undoing deletion"
                  : "Close contact deletion review"}
              </button>
            ) : (
              <button
                className="cd-button"
                type="button"
                disabled={owned.busy}
                onClick={() => {
                  setCloseConsent(true);
                }}
              >
                Close unresolved contact deletion review
              </button>
            )}
          </>
        )}
      </section>
    );
  return {
    view,
    hasReview: model !== null,
    canStart:
      options.enabled &&
      options.visible &&
      !options.needsReopen &&
      !options.mutationBlocked &&
      !options.draftsBlocked &&
      options.api !== undefined &&
      model === null,
    start: (workspace: ContactWorkspaceV1) => {
      if (
        workspace.vaultId !== options.vaultId ||
        workspace.contact.id !== options.contactId ||
        (options.companyScope !== null && workspace.contact.companyId !== options.companyScope)
      )
        return false;
      const current = controller.current;
      const origin = document.activeElement;
      if (current?.start(workspace, options.companyScope)) {
        setCloseConsent(false);
        setFocus({ owner: current, origin });
        return true;
      }
      return false;
    },
  };
};
