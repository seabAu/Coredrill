import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  ApplicationResult,
  CompanyWorkspaceV1,
  ContactWorkspaceV1,
} from "@coredrill/application";
import { restoreFocusAfterChange } from "@coredrill/ui";
import { createStoredContactEditor, type StoredContactDraft } from "./stored-contact-editor.js";
import type { StoredContactWorkspaceApi } from "./stored-contact-workspace.js";

const inputs = [
  ["name", "Contact name"],
  ["role", "Role (optional)"],
  ["email", "Email (optional)"],
  ["phone", "Phone (optional)"],
  ["publicProfileUrl", "Profile URL (optional)"],
] as const;

export const useStoredContactEditor = (options: {
  readonly api: StoredContactWorkspaceApi | undefined;
  readonly vaultId: string | null;
  readonly selectedContactId: string | null;
  readonly companyScope: string | null;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly mutationBlocked: boolean;
  readonly needsReopen: boolean;
  readonly exclusive: (
    vaultId: string,
    work: () => Promise<ApplicationResult<ContactWorkspaceV1>>,
  ) => Promise<ApplicationResult<ContactWorkspaceV1>>;
  readonly onSelect: (id: string | null, companyScope?: string | null) => void;
  readonly onSaved: (draft: StoredContactDraft) => void;
}) => {
  const formId = useId();
  const live = useRef(options);
  live.current = options;
  const controller = useRef<ReturnType<typeof createStoredContactEditor> | null>(null);
  const [model, setModel] = useState<StoredContactDraft | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [draftCompanyScope, setDraftCompanyScope] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{
    owner: NonNullable<typeof controller.current>;
    vaultId: string;
    contactId: string | null;
    companyScope: string | null;
    origin: Element | null;
  } | null>(null);
  useEffect(() => {
    if (!options.enabled) {
      setModel(null);
      setStartError(null);
      return;
    }
    const current = createStoredContactEditor({
      api: () => {
        const api = live.current.api;
        if (api === undefined) throw new Error("Contact runtime unavailable.");
        return api;
      },
      allowed: () =>
        live.current.enabled &&
        !live.current.needsReopen &&
        (!live.current.mutationBlocked || controller.current?.current()?.busy === true),
      changed: setModel,
      exclusive: (vaultId, work) => live.current.exclusive(vaultId, work),
    });
    controller.current = current;
    setModel(null);
    setStartError(null);
    return () => {
      current.dispose();
      controller.current = null;
    };
  }, [options.enabled]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (live.current.enabled && controller.current?.hasUnsaved()) event.preventDefault();
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
      const current = live.current;
      if (
        controller.current !== request.owner ||
        !current.enabled ||
        !current.visible ||
        current.vaultId !== request.vaultId ||
        current.selectedContactId !== request.contactId ||
        current.companyScope !== request.companyScope
      )
        return null;
      return (
        container.current?.querySelector<HTMLElement>("[data-contact-editor-error]") ??
        container.current?.querySelector<HTMLElement>("[data-contact-editor-close]") ??
        container.current?.querySelector<HTMLElement>(
          "[data-contact-editor-input]:not([disabled])",
        ) ??
        document.querySelector<HTMLElement>("[data-contact-start-notes]:not([disabled])") ??
        document.querySelector<HTMLElement>("[data-contact-start-new]:not([disabled])")
      );
    });
    setFocus(null);
  }, [focus, model?.busy]);
  const run = (action: "save" | "recover") => {
    const current = controller.current;
    const vaultId = options.vaultId;
    if (current === null || vaultId === null) return;
    const origin = document.activeElement;
    const contactId = options.selectedContactId;
    const companyScope = options.companyScope;
    setConfirmDiscard(false);
    void current[action](vaultId).then((saved) => {
      if (controller.current !== current) return;
      const active = document.activeElement;
      const ownsFocus =
        active === null || active === document.body || active === origin || !active.isConnected;
      const acknowledged = current.current();
      if (
        saved &&
        acknowledged !== null &&
        live.current.enabled &&
        live.current.vaultId === acknowledged.vaultId
      )
        live.current.onSaved(acknowledged);
      if (ownsFocus) setFocus({ owner: current, vaultId, contactId, companyScope, origin });
    });
  };
  const discard = () => {
    const current = controller.current;
    if (current === null || options.vaultId === null) return;
    const origin = document.activeElement;
    if (current.discard(options.vaultId)) {
      setConfirmDiscard(false);
      setStartError(null);
      setFocus({
        owner: current,
        vaultId: options.vaultId,
        contactId: options.selectedContactId,
        companyScope: options.companyScope,
        origin,
      });
    }
  };
  const owned = options.enabled && model?.vaultId === options.vaultId ? model : null;
  const sameTarget =
    owned !== null &&
    options.companyScope === draftCompanyScope &&
    (owned.mode === "create"
      ? options.companyScope === owned.companyId &&
        (options.selectedContactId === null ||
          (owned.phase === "saved" && owned.contactId === options.selectedContactId))
      : owned.contactId === options.selectedContactId &&
        (options.companyScope === null || options.companyScope === owned.companyId));
  const form = (
    <div ref={container}>
      {options.enabled && startError !== null ? <p role="alert">{startError}</p> : null}
      {!options.enabled || model === null ? null : owned === null ? (
        <p>A contact draft is retained for another vault. Its private fields are not shown here.</p>
      ) : !sameTarget ? (
        <p>
          A contact draft is retained for a different selection or company scope.{" "}
          <button
            className="cd-button"
            type="button"
            onClick={() => {
              const current = controller.current;
              if (current === null) return;
              const origin = document.activeElement;
              const contactId =
                owned.mode === "create" && owned.phase !== "saved" ? null : owned.contactId;
              options.onSelect(contactId, draftCompanyScope);
              setFocus({
                owner: current,
                vaultId: owned.vaultId,
                contactId,
                companyScope: draftCompanyScope,
                origin,
              });
            }}
          >
            Return to contact draft
          </button>
        </p>
      ) : (
        <form
          className="cd-contact-editor"
          aria-label={owned.mode === "create" ? "Create local contact" : "Edit contact notes"}
          onSubmit={(event) => {
            event.preventDefault();
            run("save");
          }}
        >
          <h3>{owned.mode === "create" ? "Create local contact" : "Edit contact notes"}</h3>
          {owned.mode === "create" ? (
            <>
              <p>
                Explicit manual entry only. Opening this form creates no stored contact, verifies no
                identity or public source, and permits no outreach.
              </p>
              <p>
                {owned.companyName === null ? (
                  "No company is linked to this draft. To link a company, start a contact from its stored company details."
                ) : (
                  <>
                    Original company selection:{" "}
                    <span className="cd-contact-literal">{owned.companyName}</span>. Viewed version{" "}
                    {owned.expectedCompanyRowVersion} stays bound to this draft.
                  </>
                )}
              </p>
            </>
          ) : (
            <p>
              Only notes may change. Original stored version {owned.expectedRowVersion}, contact
              identity, methods, company and evidence stay bound to this draft.
            </p>
          )}
          <fieldset disabled={owned.busy || options.mutationBlocked || options.needsReopen}>
            <legend>{owned.mode === "create" ? "Manual contact fields" : "Local notes"}</legend>
            {owned.mode === "create" ? (
              <>
                {inputs.map(([field, label]) => (
                  <div className="cd-contact-editor__field" key={field}>
                    <label htmlFor={`${formId}-${field}`}>{label}</label>
                    <input
                      id={`${formId}-${field}`}
                      data-contact-editor-input="true"
                      type="text"
                      inputMode={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                      autoComplete="off"
                      readOnly={owned.phase !== "editing"}
                      value={owned.fields[field]}
                      onChange={(event) => {
                        controller.current?.edit(owned.vaultId, field, event.currentTarget.value);
                      }}
                    />
                  </div>
                ))}
                <p>
                  Name and role support 512 characters; email 320, phone 128 and HTTP/HTTPS profile
                  URL 8192. URLs may be canonicalized on save. Missing methods remain missing; no
                  address, phone or public/license basis is guessed.
                </p>
              </>
            ) : null}
            <div className="cd-contact-editor__field">
              <label htmlFor={`${formId}-notes`}>Contact notes</label>
              <textarea
                id={`${formId}-notes`}
                data-contact-editor-input="true"
                rows={8}
                readOnly={owned.phase !== "editing"}
                value={owned.fields.notes}
                onChange={(event) => {
                  controller.current?.edit(owned.vaultId, "notes", event.currentTarget.value);
                }}
              />
            </div>
            <p>
              Up to 200,000 characters. Oversized or NUL-containing input is refused without
              truncating the prior value. Empty notes explicitly clear this local field.
            </p>
            <button className="cd-button" type="submit" disabled={owned.phase !== "editing"}>
              {owned.mode === "create" ? "Save local contact" : "Save contact notes"}
            </button>
          </fieldset>
          {owned.error !== null ? (
            <p role="alert" tabIndex={-1} data-contact-editor-error="true">
              {owned.error}
            </p>
          ) : null}
          <p role="status" aria-live="polite">
            {owned.busy
              ? "Waiting for the owned local contact operation…"
              : owned.phase === "saved"
                ? owned.recovered
                  ? "Stored contact now matches this draft. No new write was submitted during the check."
                  : "Local save acknowledged. Details and directory refresh separately; do not repeat the save if reading fails."
                : owned.phase === "uncertain"
                  ? "Save result uncertain. Input is retained; no automatic retry."
                  : "Draft remains in this session across navigation. Nothing is sent or enriched."}
          </p>
          <div className="cd-stored-companies__actions">
            {owned.phase === "saved" ? (
              <button
                className="cd-button"
                type="button"
                onClick={() => {
                  options.onSelect(owned.contactId, draftCompanyScope);
                }}
              >
                View saved contact
              </button>
            ) : null}
            {owned.phase === "uncertain" ? (
              <button
                className="cd-button"
                type="button"
                disabled={owned.busy || options.mutationBlocked || options.needsReopen}
                onClick={() => {
                  run("recover");
                }}
              >
                Check stored contact state
              </button>
            ) : null}
            {owned.phase === "saved" ? (
              <button
                className="cd-button"
                type="button"
                data-contact-editor-close="true"
                disabled={owned.busy}
                onClick={discard}
              >
                Close saved contact draft
              </button>
            ) : confirmDiscard ? (
              <>
                <span>Discarding this draft does not undo any possibly committed save.</span>
                <button className="cd-button" type="button" disabled={owned.busy} onClick={discard}>
                  Confirm discard contact draft
                </button>
                <button
                  className="cd-button"
                  type="button"
                  disabled={owned.busy}
                  onClick={() => {
                    setConfirmDiscard(false);
                  }}
                >
                  Keep contact draft
                </button>
              </>
            ) : (
              <button
                className="cd-button"
                type="button"
                disabled={owned.busy}
                onClick={() => {
                  setConfirmDiscard(true);
                }}
              >
                Discard contact draft
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
  return {
    hasDraft: options.enabled && model !== null,
    form,
    startCreate: (company: CompanyWorkspaceV1 | null = null): boolean => {
      if (options.vaultId === null || !options.enabled) return false;
      const current = controller.current;
      const origin = document.activeElement;
      if (current?.startCreate(options.vaultId, company)) {
        const draft = current.current();
        if (draft === null) return false;
        setConfirmDiscard(false);
        setStartError(null);
        setDraftCompanyScope(draft.companyId);
        options.onSelect(null, draft.companyId);
        setFocus({
          owner: current,
          vaultId: options.vaultId,
          contactId: null,
          companyScope: draft.companyId,
          origin,
        });
        return true;
      }
      setStartError(
        "A contact draft could not be started in this viewed context. Retained drafts were not replaced.",
      );
      return false;
    },
    startNotes: (value: ContactWorkspaceV1): boolean => {
      if (
        value.vaultId !== options.vaultId ||
        value.contact.id !== options.selectedContactId ||
        (options.companyScope !== null && value.contact.companyId !== options.companyScope) ||
        !options.enabled
      )
        return false;
      const current = controller.current;
      const origin = document.activeElement;
      if (current?.startNotes(value)) {
        setConfirmDiscard(false);
        setStartError(null);
        setDraftCompanyScope(options.companyScope);
        setFocus({
          owner: current,
          vaultId: value.vaultId,
          contactId: value.contact.id,
          companyScope: options.companyScope,
          origin,
        });
        return true;
      }
      setStartError(
        "A notes draft could not be started from these contact details. Refresh before editing.",
      );
      return false;
    },
  };
};
