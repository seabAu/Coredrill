import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  parseCompanyWorkspaceV1,
  type ApplicationResult,
  type CompanyWorkspaceV1,
  type CompanyJobSummaryV1,
  type ListCompanyJobsRequestV1,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import { restoreFocusAfterChange } from "@coredrill/ui";
import { createStoredCompanyEditor, type StoredCompanyDraft } from "./stored-company-editor.js";
import type { StoredCompanyWorkspaceApi } from "./stored-company-workspace.js";
import { StoredCompanyJobsView } from "./stored-company-jobs-view.js";
import type { StoredCompanyJobsApi } from "./stored-company-jobs.js";
import type { StoredCompanyInteractionsApi } from "./stored-company-interactions.js";
import { StoredCompanyInteractionsView } from "./stored-company-interactions-view.js";
import type { CompanyJobReturn } from "./company-job-navigation.js";

export const useStoredCompanyEditor = (options: {
  readonly api: StoredCompanyWorkspaceApi | undefined;
  readonly vaultId: string | null;
  readonly selectedCompanyId: string | null;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly mutationBlocked: boolean;
  readonly needsReopen: boolean;
  readonly exclusive: (
    vaultId: string,
    work: () => Promise<ApplicationResult<CompanyWorkspaceV1>>,
  ) => Promise<ApplicationResult<CompanyWorkspaceV1>>;
  readonly onSelect: (id: string | null) => void;
  readonly onSaved: (draft: StoredCompanyDraft) => void;
}) => {
  const formId = useId();
  const live = useRef(options);
  live.current = options;
  const controller = useRef<ReturnType<typeof createStoredCompanyEditor> | null>(null);
  const [model, setModel] = useState<StoredCompanyDraft | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{
    owner: NonNullable<typeof controller.current>;
    vaultId: string;
    companyId: string | null;
    origin: Element | null;
  } | null>(null);
  useEffect(() => {
    if (!options.enabled) {
      setModel(null);
      return;
    }
    const current = createStoredCompanyEditor({
      api: () => {
        const api = live.current.api;
        if (api === undefined) throw new Error("Company runtime unavailable.");
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
        current.selectedCompanyId !== request.companyId
      )
        return null;
      return (
        container.current?.querySelector<HTMLElement>("[data-company-editor-error]") ??
        container.current?.querySelector<HTMLElement>("[data-company-editor-close]") ??
        container.current?.querySelector<HTMLElement>(
          "[data-company-editor-input]:not([disabled])",
        ) ??
        document.querySelector<HTMLElement>("[data-company-start-notes]:not([disabled])") ??
        document.querySelector<HTMLElement>("[data-company-start-new]:not([disabled])")
      );
    });
    setFocus(null);
  }, [focus, model?.busy]);
  const run = (action: "save" | "recover") => {
    const current = controller.current;
    const vaultId = options.vaultId;
    if (current === null || vaultId === null) return;
    const origin = document.activeElement;
    const companyId = options.selectedCompanyId;
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
      if (ownsFocus) setFocus({ owner: current, vaultId, companyId, origin });
    });
  };
  const discard = () => {
    const current = controller.current;
    if (current === null || options.vaultId === null) return;
    const origin = document.activeElement;
    if (current.discard(options.vaultId)) {
      setConfirmDiscard(false);
      setFocus({
        owner: current,
        vaultId: options.vaultId,
        companyId: options.selectedCompanyId,
        origin,
      });
    }
  };
  const owned = options.enabled && model?.vaultId === options.vaultId ? model : null;
  const sameTarget =
    owned !== null &&
    (owned.mode === "create"
      ? options.selectedCompanyId === null ||
        (owned.phase === "saved" && owned.companyId === options.selectedCompanyId)
      : owned.companyId === options.selectedCompanyId);
  const form = (
    <div ref={container}>
      {!options.enabled || model === null ? null : owned === null ? (
        <p>A company draft is retained for another vault. Its private fields are not shown here.</p>
      ) : !sameTarget ? (
        <p>
          A company draft is retained for a different selection.{" "}
          <button
            type="button"
            className="cd-button"
            onClick={() => {
              options.onSelect(owned.mode === "create" ? null : owned.companyId);
            }}
          >
            Return to company draft
          </button>
        </p>
      ) : (
        <form
          aria-label={owned.mode === "create" ? "Create local company" : "Edit company notes"}
          className="cd-company-editor"
          onSubmit={(event) => {
            event.preventDefault();
            run("save");
          }}
        >
          <h3>{owned.mode === "create" ? "Create local company" : "Edit company notes"}</h3>
          {owned.mode === "notes" ? (
            <p>
              Original viewed company:{" "}
              <span className="cd-company-literal">{owned.fields.canonicalName}</span>. Stored
              version {owned.expectedRowVersion} stays bound to this draft.
            </p>
          ) : (
            <p>
              Explicit manual entry only. Opening this form creates no stored company and verifies
              no employer or public source.
            </p>
          )}
          <fieldset disabled={owned.busy || options.mutationBlocked || options.needsReopen}>
            <legend>{owned.mode === "create" ? "Manual company fields" : "Local notes"}</legend>
            {owned.mode === "create" ? (
              <>
                <div className="cd-company-editor__field">
                  <label htmlFor={`${formId}-name`}>Company name</label>
                  <input
                    id={`${formId}-name`}
                    data-company-editor-input="true"
                    readOnly={owned.phase !== "editing"}
                    autoComplete="off"
                    value={owned.fields.canonicalName}
                    onChange={(event) => {
                      controller.current?.edit(
                        owned.vaultId,
                        "canonicalName",
                        event.currentTarget.value,
                      );
                    }}
                  />
                </div>
                <div className="cd-company-editor__field">
                  <label htmlFor={`${formId}-website`}>Company website (optional)</label>
                  <input
                    id={`${formId}-website`}
                    readOnly={owned.phase !== "editing"}
                    autoComplete="off"
                    value={owned.fields.websiteUrl}
                    onChange={(event) => {
                      controller.current?.edit(
                        owned.vaultId,
                        "websiteUrl",
                        event.currentTarget.value,
                      );
                    }}
                  />
                </div>
                <div className="cd-company-editor__field">
                  <label htmlFor={`${formId}-domain`}>Company domain (optional)</label>
                  <input
                    id={`${formId}-domain`}
                    readOnly={owned.phase !== "editing"}
                    autoComplete="off"
                    value={owned.fields.domain}
                    onChange={(event) => {
                      controller.current?.edit(owned.vaultId, "domain", event.currentTarget.value);
                    }}
                  />
                </div>
                <p>
                  Names support 512 characters; website accepts HTTP/HTTPS. Domain case is
                  normalized on save. This form leaves the optional location unset.
                </p>
              </>
            ) : null}
            <div className="cd-company-editor__field">
              <label htmlFor={`${formId}-notes`}>Company notes</label>
              <textarea
                id={`${formId}-notes`}
                data-company-editor-input="true"
                readOnly={owned.phase !== "editing"}
                rows={8}
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
            <button type="submit" className="cd-button" disabled={owned.phase !== "editing"}>
              {owned.mode === "create" ? "Save local company" : "Save company notes"}
            </button>
          </fieldset>
          {owned.error !== null ? (
            <p role="alert" tabIndex={-1} data-company-editor-error="true">
              {owned.error}
            </p>
          ) : null}
          <p role="status" aria-live="polite">
            {owned.busy
              ? "Waiting for the owned local company operation…"
              : owned.phase === "saved"
                ? owned.recovered
                  ? "Stored company now matches this draft. No new write was submitted during the check."
                  : "Local save acknowledged. Details and directory are refreshed separately; do not repeat the save if reading fails."
                : owned.phase === "uncertain"
                  ? "Save result uncertain. Input is retained; no automatic retry."
                  : "Draft remains in this session across navigation. Nothing is sent to an employer."}
          </p>
          <div className="cd-stored-companies__actions">
            {owned.phase === "saved" ? (
              <button
                type="button"
                className="cd-button"
                onClick={() => {
                  options.onSelect(owned.companyId);
                }}
              >
                View saved company
              </button>
            ) : null}
            {owned.phase === "uncertain" ? (
              <button
                type="button"
                className="cd-button"
                disabled={owned.busy || options.mutationBlocked || options.needsReopen}
                onClick={() => {
                  run("recover");
                }}
              >
                Check stored company state
              </button>
            ) : null}
            {owned.phase === "saved" ? (
              <button
                type="button"
                className="cd-button"
                data-company-editor-close="true"
                disabled={owned.busy}
                onClick={discard}
              >
                Close saved company draft
              </button>
            ) : confirmDiscard ? (
              <>
                <span>Discarding this draft does not undo any possibly committed save.</span>
                <button type="button" className="cd-button" disabled={owned.busy} onClick={discard}>
                  Confirm discard company draft
                </button>
                <button
                  type="button"
                  className="cd-button"
                  disabled={owned.busy}
                  onClick={() => {
                    setConfirmDiscard(false);
                  }}
                >
                  Keep company draft
                </button>
              </>
            ) : (
              <button
                type="button"
                className="cd-button"
                disabled={owned.busy}
                onClick={() => {
                  setConfirmDiscard(true);
                }}
              >
                Discard company draft
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
    startCreate: () => {
      if (options.vaultId === null || !options.enabled) return;
      const current = controller.current;
      const origin = document.activeElement;
      if (current?.startCreate(options.vaultId)) {
        setConfirmDiscard(false);
        options.onSelect(null);
        setFocus({ owner: current, vaultId: options.vaultId, companyId: null, origin });
      }
    },
    startNotes: (value: CompanyWorkspaceV1) => {
      if (value.vaultId !== options.vaultId || !options.enabled) return;
      const current = controller.current;
      const origin = document.activeElement;
      if (current?.startNotes(value)) {
        setConfirmDiscard(false);
        setFocus({ owner: current, vaultId: value.vaultId, companyId: value.company.id, origin });
      }
    },
  };
};

export const StoredCompanyDetails = ({
  api,
  jobsApi,
  interactionsApi,
  jobReturn,
  onOpenJob,
  vaultId,
  companyId,
  revision,
  disabled,
  onEdit,
  contactDraftBlocked,
  onCreateContact,
  onViewContacts,
}: {
  readonly api: StoredCompanyWorkspaceApi;
  readonly jobsApi: StoredCompanyJobsApi | undefined;
  readonly interactionsApi: StoredCompanyInteractionsApi | undefined;
  readonly jobReturn: CompanyJobReturn | null;
  readonly onOpenJob: (job: CompanyJobSummaryV1, request: ListCompanyJobsRequestV1) => void;
  readonly vaultId: string;
  readonly companyId: string;
  readonly revision: number;
  readonly disabled: boolean;
  readonly onEdit: (value: CompanyWorkspaceV1) => void;
  readonly contactDraftBlocked: boolean;
  readonly onCreateContact: (value: CompanyWorkspaceV1) => void;
  readonly onViewContacts: (value: CompanyWorkspaceV1) => void;
}) => {
  const owner = useMemo(() => ({ api, vaultId, companyId }), [api, vaultId, companyId]);
  const liveOwner = useRef(owner);
  liveOwner.current = owner;
  const container = useRef<HTMLElement>(null);
  const [retry, setRetry] = useState(0);
  const readOwner = useMemo(() => ({ owner, revision, retry }), [owner, revision, retry]);
  const liveReadOwner = useRef(readOwner);
  liveReadOwner.current = readOwner;
  const readFocusOrigin = useRef<{
    owner: typeof owner;
    retry: number;
    origin: Element | null;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    readOwner: typeof readOwner;
    origin: Element | null;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<{
    owner: typeof owner;
    revision: number;
    retry: number;
    value: CompanyWorkspaceV1 | null;
    busy: boolean;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const isActive = () => active;
    const retained = readFocusOrigin.current;
    const origin =
      retained?.owner === owner && retained.retry === retry
        ? retained.origin
        : document.activeElement;
    const restoreReadFocus = container.current?.contains(origin) === true;
    readFocusOrigin.current = restoreReadFocus ? { owner, retry, origin } : null;
    setSnapshot((prior) => ({
      owner,
      revision,
      retry,
      value: prior?.owner === owner ? prior.value : null,
      busy: true,
      error: null,
    }));
    void (async () => {
      try {
        const scope = {
          specVersion: 1 as const,
          expectedVaultId: entityId("vault", owner.vaultId),
          companyId: entityId("company", owner.companyId),
          includeArchived: true,
        };
        const result = await owner.api.read(scope);
        if (!result.ok) throw new Error("Company details unavailable.");
        const value = parseCompanyWorkspaceV1(result.value, scope);
        if (isActive()) setSnapshot({ owner, revision, retry, value, busy: false, error: null });
      } catch {
        if (isActive())
          setSnapshot((prior) => ({
            owner,
            revision,
            retry,
            value: prior?.owner === owner ? prior.value : null,
            busy: false,
            error:
              "The selected company could not be read in this vault. No missing details or relationships were invented. Retry reads only; it does not save again.",
          }));
      } finally {
        if (isActive()) {
          if (restoreReadFocus) setFocusRequest({ readOwner, origin });
          if (readFocusOrigin.current?.owner === owner && readFocusOrigin.current.retry === retry)
            readFocusOrigin.current = null;
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [owner, readOwner, revision, retry]);
  const visible = snapshot?.owner === owner ? snapshot : null;
  // A stale revision blocks edits immediately, but read busy starts after the effect captures
  // focus. Disabling Refresh in the revision render can blur it before that capture.
  const busy = visible?.busy !== false || visible.retry !== retry;
  const stale = visible?.revision !== revision;
  const value = visible?.value ?? null;
  useLayoutEffect(() => {
    if (focusRequest === null) return;
    const request = focusRequest;
    if (request.readOwner !== readOwner) {
      setFocusRequest(null);
      return;
    }
    if (busy) return;
    restoreFocusAfterChange(request.origin, () => {
      if (
        liveReadOwner.current !== request.readOwner ||
        liveOwner.current !== request.readOwner.owner
      )
        return null;
      if (
        request.origin instanceof HTMLElement &&
        container.current?.contains(request.origin) === true &&
        !request.origin.matches(":disabled")
      )
        return request.origin;
      return (
        container.current?.querySelector<HTMLButtonElement>(
          "[data-company-detail-refresh]:not([disabled])",
        ) ?? null
      );
    });
    setFocusRequest(null);
  }, [focusRequest, readOwner, busy]);
  return (
    <section ref={container} aria-label="Stored company details" className="cd-company-details">
      <h3>Selected company details</h3>
      <p>Selected-record lookup includes archived local companies. Archived notes are read-only.</p>
      <button
        type="button"
        className="cd-button"
        data-company-detail-refresh="true"
        disabled={busy}
        onClick={() => {
          const nextRetry = retry + 1;
          readFocusOrigin.current = { owner, retry: nextRetry, origin: document.activeElement };
          setRetry(nextRetry);
        }}
      >
        Refresh selected company
      </button>
      <p role="status" aria-live="polite">
        {busy || stale
          ? "Reading selected company…"
          : value === null
            ? "No company detail is available."
            : "Company detail read from local storage."}
      </p>
      {visible?.error ? <p role="alert">{visible.error}</p> : null}
      {value !== null ? (
        <>
          {busy || visible.error || visible.revision !== revision ? (
            <p>
              Previously read company details may be stale. Editing is unavailable until a
              successful read.
            </p>
          ) : null}
          <h4 className="cd-company-literal">{value.company.canonicalName}</h4>
          <dl>
            <dt>Website</dt>
            <dd>{value.company.websiteUrl ?? "Not recorded"}</dd>
            <dt>Domain</dt>
            <dd>{value.company.domain ?? "Not recorded"}</dd>
            <dt>Stored location reference</dt>
            <dd>{value.company.locationId ?? "Not recorded"}</dd>
            <dt>Archive state</dt>
            <dd>
              {value.company.archivedAt === null
                ? "Active local record"
                : `Archived at ${value.company.archivedAt}`}
            </dd>
            <dt>Stored version</dt>
            <dd>{value.company.rowVersion}</dd>
          </dl>
          <h4>Company notes</h4>
          <p className="cd-company-literal">
            {value.company.notes === "" ? "No company notes recorded." : value.company.notes}
          </p>
          <button
            type="button"
            className="cd-button"
            data-company-start-notes="true"
            disabled={
              disabled ||
              busy ||
              stale ||
              visible.error !== null ||
              value.company.archivedAt !== null
            }
            onClick={() => {
              onEdit(value);
            }}
          >
            Edit company notes
          </button>
          <div className="cd-stored-companies__actions">
            <button
              type="button"
              className="cd-button"
              disabled={
                disabled ||
                contactDraftBlocked ||
                busy ||
                stale ||
                visible.error !== null ||
                value.company.archivedAt !== null
              }
              onClick={() => {
                onCreateContact(value);
              }}
            >
              Create local contact for this company
            </button>
            <button
              type="button"
              className="cd-button"
              disabled={busy || visible.error !== null}
              onClick={() => {
                onViewContacts(value);
              }}
            >
              View linked contacts
            </button>
          </div>
          <StoredCompanyJobsView
            api={jobsApi}
            workspace={value}
            ready={!busy && !stale && visible.error === null}
            blocked={disabled}
            restore={jobReturn}
            onOpenJob={onOpenJob}
          />
          <StoredCompanyInteractionsView
            api={interactionsApi}
            workspace={value}
            ready={!busy && !stale && visible.error === null}
          />
        </>
      ) : null}
      <p>
        These are local stored facts, not a verified employer profile. Relationship totals,
        provenance sources, salary observations and application outcomes are not loaded here.
      </p>
    </section>
  );
};
