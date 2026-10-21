import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { restoreFocusAfterChange, type NetworkTabId } from "@coredrill/ui";
import {
  createStoredCompanyDirectoryReader,
  type StoredCompanyDirectoryState,
} from "./stored-company-directory-reader.js";
import type { StoredCompanyDirectoryApi } from "./stored-company-directory.js";
import {
  StoredCompanyDetails,
  type useStoredCompanyEditor,
} from "./stored-company-workspace-view.js";
import type { StoredCompanyWorkspaceApi } from "./stored-company-workspace.js";

const CompanyPage = ({
  api,
  vaultId,
  revision,
  onSelectCompany,
}: {
  readonly api: StoredCompanyDirectoryApi;
  readonly vaultId: string;
  readonly revision: number;
  readonly onSelectCompany: (id: string | null) => void;
}) => {
  const [includeArchived, setIncludeArchived] = useState(false);
  const owner = useMemo(() => ({ api, vaultId, includeArchived }), [api, vaultId, includeArchived]);
  const lifetime = useMemo(() => ({ ...owner, revision }), [owner, revision]);
  const [snapshot, setSnapshot] = useState<{
    readonly lifetime: typeof lifetime;
    readonly owner: typeof owner;
    readonly state: StoredCompanyDirectoryState;
  } | null>(null);
  const reader = useRef<ReturnType<typeof createStoredCompanyDirectoryReader> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    readonly current: NonNullable<typeof reader.current>;
    readonly origin: Element | null;
    readonly mode: "first" | "next" | "retry" | "auto";
  } | null>(null);
  useEffect(() => {
    const origin = document.activeElement;
    const restoreReadFocus = container.current?.contains(origin) === true;
    const current = createStoredCompanyDirectoryReader(
      {
        specVersion: 1,
        expectedVaultId: lifetime.vaultId,
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
  // Effect cleanup is not a render-time privacy boundary: hide the prior owner immediately.
  const visible = snapshot?.owner === owner ? snapshot.state : null;
  const busy = visible?.busy ?? true;
  const page = visible?.page ?? null;
  useLayoutEffect(() => {
    if (focusRequest === null || busy) return;
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
          `[data-company-read="${request.mode}"]:not([disabled])`,
        ) ??
        container.current?.querySelector<HTMLButtonElement>("[data-company-read=first]") ??
        null
      );
    });
    setFocusRequest(null);
  }, [focusRequest, busy]);
  const run = (mode: "first" | "next" | "retry") => {
    const current = reader.current;
    if (current === null || visible === null) return;
    const origin = document.activeElement;
    void current[mode]().then((completed) => {
      if (!completed || reader.current !== current) return;
      setFocusRequest({ current, origin, mode });
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
        Include archived companies
      </label>
      <p>
        Up to 25 companies per live page, newest created first. This is not a vault total or a
        verified employer directory. Select a company for stored scalar details and local notes;
        contacts, relationship totals and interactions are not loaded by this directory.
      </p>
      <div className="cd-stored-companies__actions">
        <button
          className="cd-button"
          data-company-read="first"
          disabled={busy}
          onClick={() => {
            run("first");
          }}
          type="button"
        >
          Load first company page
        </button>
        <button
          className="cd-button"
          data-company-read="next"
          disabled={
            busy ||
            page?.nextCursor === undefined ||
            page.nextCursor === null ||
            visible?.error !== null
          }
          onClick={() => {
            run("next");
          }}
          type="button"
        >
          Next company page
        </button>
        {visible?.error !== null && visible?.error !== undefined && !visible.refreshRequired ? (
          <button
            className="cd-button"
            data-company-read="retry"
            disabled={busy}
            onClick={() => {
              run("retry");
            }}
            type="button"
          >
            Retry company page
          </button>
        ) : null}
      </div>
      <p aria-live="polite" role="status">
        {busy
          ? "Reading local companies…"
          : page === null
            ? "No company page is available."
            : `${String(page.items.length)} ${page.items.length === 1 ? "company" : "companies"} on this page. ${page.hasMore ? "Another page is available." : "No later page was available when read."}`}
      </p>
      {visible?.error ? <p role="alert">{visible.error}</p> : null}
      {page !== null && (busy || visible?.error !== null || snapshot?.lifetime !== lifetime) ? (
        <p>Previously loaded companies are shown below and may be stale.</p>
      ) : null}
      {page !== null && page.items.length === 0 && !busy && visible?.error === null ? (
        <p>
          No companies were found in this vault and archive scope when read. Saved job captures can
          add companies; no sample records are shown.
        </p>
      ) : null}
      <ul aria-label="Stored companies on this page" className="cd-stored-companies__list">
        {page?.items.map((company) => (
          <li key={company.id}>
            <h3>{company.canonicalName}</h3>
            <button
              className="cd-button"
              type="button"
              onClick={() => {
                onSelectCompany(company.id);
              }}
            >
              View company details
            </button>
            <dl>
              <div>
                <dt>Website</dt>
                <dd>{company.websiteUrl ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt>Domain</dt>
                <dd>{company.domain ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt>Archive state</dt>
                <dd>
                  {company.archivedAt === null ? "Active local record" : "Archived local record"}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const StoredCompanyDirectoryView = ({
  api,
  vaultId,
  activeTab,
  onTabChange,
  selectedCompanyId,
  workspaceApi,
  editor,
  revision,
  mutationBlocked,
  onSelectCompany,
}: {
  readonly api: StoredCompanyDirectoryApi | undefined;
  readonly vaultId: string | null;
  readonly activeTab: NetworkTabId;
  readonly onTabChange: (tab: NetworkTabId) => void;
  readonly selectedCompanyId: string | null;
  readonly workspaceApi: StoredCompanyWorkspaceApi | undefined;
  readonly editor: ReturnType<typeof useStoredCompanyEditor>;
  readonly revision: number;
  readonly mutationBlocked: boolean;
  readonly onSelectCompany: (id: string | null) => void;
}) => (
  <section aria-label="Stored Network" className="cd-stored-companies">
    <h2>Companies and contacts</h2>
    <nav aria-label="Network views" className="cd-stored-companies__actions">
      {(
        [
          ["companies", "Companies"],
          ["contacts", "Contacts"],
          ["interactions", "Interactions"],
        ] as const
      ).map(([tab, label]) => (
        <button
          aria-current={activeTab === tab ? "page" : undefined}
          className="cd-button"
          key={tab}
          onClick={() => {
            onTabChange(tab);
          }}
          type="button"
        >
          {label}
        </button>
      ))}
    </nav>
    {activeTab !== "companies" ? (
      <p>
        Stored {activeTab} navigation is not connected yet. No records or relationship totals have
        been loaded for this view.
      </p>
    ) : api === undefined || vaultId === null ? (
      <p>The viewed vault's company directory is unavailable. No companies have been loaded.</p>
    ) : (
      <>
        <div className="cd-stored-companies__actions">
          <button
            className="cd-button"
            data-company-start-new="true"
            type="button"
            disabled={workspaceApi === undefined || editor.hasDraft || mutationBlocked}
            onClick={editor.startCreate}
          >
            Create local company
          </button>
          {selectedCompanyId !== null ? (
            <button
              className="cd-button"
              type="button"
              onClick={() => {
                onSelectCompany(null);
              }}
            >
              Back to companies
            </button>
          ) : null}
        </div>
        {editor.form}
        {selectedCompanyId !== null && workspaceApi !== undefined ? (
          <StoredCompanyDetails
            api={workspaceApi}
            vaultId={vaultId}
            companyId={selectedCompanyId}
            revision={revision}
            disabled={editor.hasDraft || mutationBlocked}
            onEdit={editor.startNotes}
          />
        ) : null}
        <CompanyPage
          api={api}
          vaultId={vaultId}
          revision={revision}
          onSelectCompany={onSelectCompany}
        />
      </>
    )}
  </section>
);
