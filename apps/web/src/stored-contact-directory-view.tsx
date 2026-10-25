import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseContactDirectoryRequestV1, type ContactWorkspaceV1 } from "@coredrill/application";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredContactDirectoryReader,
  type StoredContactDirectoryState,
} from "./stored-contact-directory-reader.js";
import type { StoredContactDirectoryApi } from "./stored-contact-directory.js";
import { StoredContactDetails } from "./stored-contact-details.js";
import type { useStoredContactEditor } from "./stored-contact-editor-view.js";
import type { StoredContactWorkspaceApi } from "./stored-contact-workspace.js";
import type { StoredContactFieldUseApi } from "./stored-contact-field-use.js";

const ContactPage = ({
  api,
  vaultId,
  companyScope,
  revision,
  onSelectContact,
}: {
  readonly api: StoredContactDirectoryApi;
  readonly vaultId: string;
  readonly companyScope: string | null;
  readonly revision: number;
  readonly onSelectContact: (id: string) => void;
}) => {
  const [includeArchived, setIncludeArchived] = useState(false);
  const owner = useMemo(
    () => ({ api, vaultId, companyScope, includeArchived }),
    [api, vaultId, companyScope, includeArchived],
  );
  const lifetime = useMemo(() => ({ ...owner, revision }), [owner, revision]);
  const [snapshot, setSnapshot] = useState<{
    lifetime: typeof lifetime;
    owner: typeof owner;
    state: StoredContactDirectoryState;
  } | null>(null);
  const reader = useRef<ReturnType<typeof createStoredContactDirectoryReader> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    current: NonNullable<typeof reader.current>;
    origin: Element | null;
    mode: "first" | "next" | "retry" | "auto";
  } | null>(null);
  useEffect(() => {
    const origin = document.activeElement;
    const restoreReadFocus = container.current?.contains(origin) === true;
    const current = createStoredContactDirectoryReader(
      {
        specVersion: 1,
        expectedVaultId: lifetime.vaultId,
        companyId: lifetime.companyScope,
        includeArchived: lifetime.includeArchived,
      },
      lifetime.api.page,
      (state) => {
        setSnapshot((prior) => ({
          lifetime,
          owner,
          state:
            state.page === null && prior?.owner === owner
              ? { ...state, page: prior.state.page }
              : state,
        }));
      },
    );
    reader.current = current;
    void current.first().then(() => {
      if (!restoreReadFocus || reader.current !== current) return;
      setFocusRequest({ current, origin, mode: "auto" });
    });
    return () => {
      current.dispose();
      reader.current = null;
    };
  }, [lifetime, owner]);
  const visible = snapshot?.owner === owner ? snapshot.state : null;
  // Revision staleness blocks continuation, not the First control before read-focus capture.
  const busy = visible === null || visible.busy;
  const stale = snapshot?.lifetime !== lifetime;
  const page = visible?.page ?? null;
  useLayoutEffect(() => {
    if (focusRequest === null || busy || stale) return;
    const request = focusRequest;
    restoreFocusAfterChange(request.origin, () => {
      if (reader.current !== request.current) return null;
      if (
        request.mode === "auto" &&
        request.origin instanceof HTMLElement &&
        request.origin.isConnected &&
        !request.origin.matches(":disabled")
      )
        return request.origin;
      return (
        container.current?.querySelector<HTMLButtonElement>(
          `[data-contact-read="${request.mode}"]:not([disabled])`,
        ) ??
        container.current?.querySelector<HTMLButtonElement>(
          "[data-contact-read=first]:not([disabled])",
        ) ??
        null
      );
    });
    setFocusRequest(null);
  }, [focusRequest, busy, stale]);
  const run = (mode: "first" | "next" | "retry") => {
    const current = reader.current;
    if (current === null || visible === null || (stale && mode !== "first")) return;
    const origin = document.activeElement;
    void current[mode]().then((completed) => {
      if (completed && reader.current === current) setFocusRequest({ current, origin, mode });
    });
  };
  return (
    <div ref={container}>
      <label className="cd-stored-companies__archive">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => {
            setIncludeArchived(event.currentTarget.checked);
          }}
        />
        Include archived contacts
      </label>
      <p>
        Up to 25 contact identities per live page, newest created first. This is not a vault or
        relationship total. Methods, notes and value-basis evidence are loaded only for an explicit
        selection; directory identity is not public/license verification.
      </p>
      <div className="cd-stored-companies__actions">
        <button
          className="cd-button"
          type="button"
          data-contact-read="first"
          disabled={busy}
          onClick={() => {
            run("first");
          }}
        >
          Load first contact page
        </button>
        <button
          className="cd-button"
          type="button"
          data-contact-read="next"
          disabled={
            busy ||
            stale ||
            page?.nextCursor === undefined ||
            page.nextCursor === null ||
            visible.error !== null
          }
          onClick={() => {
            run("next");
          }}
        >
          Next contact page
        </button>
        {visible?.error !== null && visible?.error !== undefined && !visible.refreshRequired ? (
          <button
            className="cd-button"
            type="button"
            data-contact-read="retry"
            disabled={busy || stale}
            onClick={() => {
              run("retry");
            }}
          >
            Retry contact page
          </button>
        ) : null}
      </div>
      <p role="status" aria-live="polite">
        {busy || stale
          ? "Reading local contacts…"
          : page === null
            ? "No contact page is available."
            : `${String(page.items.length)} ${page.items.length === 1 ? "contact" : "contacts"} on this page. ${page.hasMore ? "Another page is available." : "No later page was available when read."}`}
      </p>
      {visible?.error ? <p role="alert">{visible.error}</p> : null}
      {page !== null && (busy || stale || visible.error !== null) ? (
        <p>Previously loaded contact identities are shown below and may be stale.</p>
      ) : null}
      {page !== null && page.items.length === 0 && !busy && !stale && visible.error === null ? (
        <p>
          No contacts were found in this vault, archive and company scope when read. No sample
          people or contact methods are shown.
        </p>
      ) : null}
      <ul aria-label="Stored contacts on this page" className="cd-stored-companies__list">
        {page?.items.map((contact) => (
          <li key={contact.id}>
            <h4>{contact.name}</h4>
            <button
              className="cd-button"
              type="button"
              onClick={() => {
                onSelectContact(contact.id);
              }}
            >
              View contact details
            </button>
            <dl>
              <dt>Stored role identity</dt>
              <dd>{contact.role ?? "Not recorded"}</dd>
              <dt>Company association</dt>
              <dd>
                {contact.companyId === null ? "No company linked" : "Local company link recorded"}
              </dd>
              <dt>Archive state</dt>
              <dd>
                {contact.archivedAt === null ? "Active local record" : "Archived local record"}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const StoredContactDirectoryView = ({
  api,
  workspaceApi,
  fieldUseApi,
  vaultId,
  companyScope,
  selectedContactId,
  editor,
  revision,
  mutationBlocked,
  needsReopen,
  onSelectContact,
  onViewCompany,
  historyView,
  onContactObserved,
  deletion,
}: {
  readonly api: StoredContactDirectoryApi | undefined;
  readonly workspaceApi: StoredContactWorkspaceApi | undefined;
  readonly fieldUseApi?: StoredContactFieldUseApi | undefined;
  readonly vaultId: string | null;
  readonly companyScope: string | null;
  readonly selectedContactId: string | null;
  readonly editor: ReturnType<typeof useStoredContactEditor>;
  readonly revision: number;
  readonly mutationBlocked: boolean;
  readonly needsReopen: boolean;
  readonly onSelectContact: (id: string | null, companyScope?: string | null) => void;
  readonly onViewCompany: (id: string) => void;
  readonly historyView: ReactNode;
  readonly onContactObserved: (value: ContactWorkspaceV1 | null) => void;
  readonly deletion: {
    readonly view: ReactNode;
    readonly hasReview: boolean;
    readonly canStart: boolean;
    readonly start: (value: ContactWorkspaceV1) => boolean;
  };
}) => {
  let validScope = false;
  if (vaultId !== null) {
    try {
      parseContactDirectoryRequestV1({
        specVersion: 1,
        expectedVaultId: vaultId,
        companyId: companyScope,
      });
      validScope = true;
    } catch {
      /* Invalid URL scope never becomes an unfiltered read. */
    }
  }
  return (
    <section aria-label="Stored contacts">
      <h3>Local contacts</h3>
      <p>
        {companyScope === null
          ? "All companies are in scope; pages still contain only bounded contact identities."
          : "Only contacts linked to the selected local company are requested. This is a live filter, not a relationship total."}
      </p>
      <div className="cd-stored-companies__actions">
        <button
          className="cd-button"
          type="button"
          data-contact-start-new="true"
          disabled={
            workspaceApi === undefined ||
            vaultId === null ||
            editor.hasDraft ||
            deletion.hasReview ||
            mutationBlocked ||
            needsReopen
          }
          onClick={() => editor.startCreate()}
        >
          {companyScope === null ? "Create local contact" : "Create local contact without company"}
        </button>
        {selectedContactId !== null ? (
          <button
            className="cd-button"
            type="button"
            onClick={() => {
              onSelectContact(null);
            }}
          >
            Back to contacts
          </button>
        ) : null}
        {companyScope !== null ? (
          <>
            <button
              className="cd-button"
              type="button"
              onClick={() => {
                onSelectContact(null, null);
              }}
            >
              Show contacts for all companies
            </button>
            {validScope ? (
              <button
                className="cd-button"
                type="button"
                onClick={() => {
                  onViewCompany(companyScope);
                }}
              >
                View directory company
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {editor.form}
      {deletion.view}
      {needsReopen ? <p>Reload the restored vault before editing contacts.</p> : null}
      {api === undefined || vaultId === null ? (
        <p>The viewed vault's contact directory is unavailable. No contacts have been loaded.</p>
      ) : !validScope ? (
        <p role="alert">
          The selected company scope is invalid. No contact read was submitted and no unfiltered
          fallback was used.
        </p>
      ) : (
        <>
          {selectedContactId !== null && workspaceApi !== undefined ? (
            <>
              <StoredContactDetails
                api={workspaceApi}
                fieldUseApi={fieldUseApi}
                vaultId={vaultId}
                contactId={selectedContactId}
                companyScope={companyScope}
                revision={revision}
                disabled={editor.hasDraft || deletion.hasReview || mutationBlocked || needsReopen}
                onEdit={editor.startNotes}
                onDelete={deletion.start}
                deletionDisabled={!deletion.canStart}
                onViewCompany={onViewCompany}
                onObserved={onContactObserved}
              />
              {historyView}
            </>
          ) : null}
          <ContactPage
            api={api}
            vaultId={vaultId}
            companyScope={companyScope}
            revision={revision}
            onSelectContact={onSelectContact}
          />
        </>
      )}
    </section>
  );
};
