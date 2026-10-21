import { useEffect, useMemo, useRef, useState } from "react";
import { restoreFocusAfterChange, type NetworkTabId } from "@coredrill/ui";
import {
  createStoredCompanyDirectoryReader,
  type StoredCompanyDirectoryState,
} from "./stored-company-directory-reader.js";
import type { StoredCompanyDirectoryApi } from "./stored-company-directory.js";

const CompanyPage = ({
  api,
  vaultId,
}: {
  readonly api: StoredCompanyDirectoryApi;
  readonly vaultId: string;
}) => {
  const [includeArchived, setIncludeArchived] = useState(false);
  const lifetime = useMemo(
    () => ({ api, vaultId, includeArchived }),
    [api, vaultId, includeArchived],
  );
  const [snapshot, setSnapshot] = useState<{
    readonly lifetime: typeof lifetime;
    readonly state: StoredCompanyDirectoryState;
  } | null>(null);
  const reader = useRef<ReturnType<typeof createStoredCompanyDirectoryReader> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = createStoredCompanyDirectoryReader(
      {
        specVersion: 1,
        expectedVaultId: lifetime.vaultId,
        includeArchived: lifetime.includeArchived,
      },
      lifetime.api.page,
      (state) => {
        setSnapshot({ lifetime, state });
      },
    );
    reader.current = current;
    void current.first();
    return () => {
      current.dispose();
      reader.current = null;
    };
  }, [lifetime]);
  // Effect cleanup is not a render-time privacy boundary: hide the prior owner immediately.
  const visible = snapshot?.lifetime === lifetime ? snapshot.state : null;
  const busy = visible?.busy ?? true;
  const page = visible?.page ?? null;
  const run = (mode: "first" | "next" | "retry") => {
    const current = reader.current;
    if (current === null || visible === null) return;
    const origin = document.activeElement;
    void current[mode]().then((completed) => {
      if (!completed || reader.current !== current) return;
      restoreFocusAfterChange(origin, () => {
        if (reader.current !== current) return null;
        return (
          container.current?.querySelector<HTMLButtonElement>(
            `[data-company-read="${mode}"]:not([disabled])`,
          ) ??
          container.current?.querySelector<HTMLButtonElement>("[data-company-read=first]") ??
          null
        );
      });
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
        verified employer directory. Company details, contacts, notes and interactions are not
        connected to this view yet.
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
      {page !== null && (busy || visible?.error !== null) ? (
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
}: {
  readonly api: StoredCompanyDirectoryApi | undefined;
  readonly vaultId: string | null;
  readonly activeTab: NetworkTabId;
  readonly onTabChange: (tab: NetworkTabId) => void;
  readonly selectedCompanyId: string | null;
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
        {selectedCompanyId !== null ? (
          <p>
            Selected company details are not connected yet. The directory below does not load that
            record's notes, contacts or relationships.
          </p>
        ) : null}
        <CompanyPage api={api} vaultId={vaultId} />
      </>
    )}
  </section>
);
