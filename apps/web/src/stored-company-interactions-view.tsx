import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CompanyWorkspaceV1 } from "@coredrill/application";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredCompanyInteractionsReader,
  type StoredCompanyInteractionsState,
} from "./stored-company-interactions-reader.js";
import type { StoredCompanyInteractionsApi } from "./stored-company-interactions.js";

export const StoredCompanyInteractionsView = ({
  api,
  workspace,
  ready,
}: {
  readonly api: StoredCompanyInteractionsApi | undefined;
  readonly workspace: CompanyWorkspaceV1;
  readonly ready: boolean;
}) => {
  const [includeArchivedJobs, setIncludeArchivedJobs] = useState(false);
  const owner = useMemo(
    () => ({
      api,
      specVersion: 1 as const,
      expectedVaultId: workspace.vaultId,
      companyId: workspace.company.id,
      expectedCompanyRowVersion: workspace.company.rowVersion,
      includeArchivedCompany: workspace.company.archivedAt !== null,
      includeArchivedJobs,
      limit: 10,
    }),
    [
      api,
      workspace.vaultId,
      workspace.company.id,
      workspace.company.rowVersion,
      workspace.company.archivedAt,
      includeArchivedJobs,
    ],
  );
  const live = useRef({ owner, ready });
  live.current = { owner, ready };
  const reader = useRef<ReturnType<typeof createStoredCompanyInteractionsReader> | null>(null);
  const container = useRef<HTMLElement>(null);
  const [snapshot, setSnapshot] = useState<{
    owner: typeof owner;
    state: StoredCompanyInteractionsState;
  } | null>(null);
  const [focus, setFocus] = useState<{
    owner: typeof owner;
    reader: NonNullable<typeof reader.current>;
    origin: Element | null;
    summary: boolean;
  } | null>(null);
  useEffect(() => {
    if (!ready || owner.api === undefined) return;
    const { api: selected, ...scope } = owner;
    const origin = document.activeElement;
    const current = createStoredCompanyInteractionsReader(scope, selected, (state) => {
      setSnapshot((prior) => ({
        owner,
        state:
          state.page === null && prior?.owner === owner
            ? { ...state, page: prior.state.page }
            : state,
      }));
    });
    reader.current = current;
    void current.first().then(() => {
      if (reader.current === current && container.current?.contains(origin))
        setFocus({ owner, reader: current, origin, summary: false });
    });
    return () => {
      current.dispose();
      if (reader.current === current) reader.current = null;
    };
  }, [owner, ready]);
  const visible = snapshot?.owner === owner ? snapshot.state : null;
  const busy =
    ready && api !== undefined && (visible?.busy !== false || visible.summary?.busy === true);
  const page = visible?.page ?? null,
    summary = visible?.summary ?? null;
  useLayoutEffect(() => {
    if (focus === null || busy || !ready) return;
    const request = focus;
    restoreFocusAfterChange(request.origin, () => {
      if (
        live.current.owner !== request.owner ||
        !live.current.ready ||
        reader.current !== request.reader
      )
        return null;
      if (request.summary && summary !== null && summary.error === null)
        return (
          container.current?.querySelector<HTMLElement>("[data-company-summary-title]") ?? null
        );
      if (
        request.origin instanceof HTMLElement &&
        container.current?.contains(request.origin) &&
        !request.origin.matches(":disabled")
      )
        return request.origin;
      return container.current?.querySelector<HTMLElement>("[data-company-history-status]") ?? null;
    });
    setFocus(null);
  }, [focus, busy, ready, summary]);
  const run = (
    mode: "first" | "next" | "retry" | "moreSummary" | "retrySummary" | "openSummary",
    id?: string,
  ) => {
    const current = reader.current;
    if (current === null || !ready || live.current.owner !== owner) return;
    const origin = document.activeElement;
    const pending = mode === "openSummary" ? current.openSummary(id ?? "") : current[mode]();
    void pending.then(() => {
      if (reader.current === current)
        setFocus({ owner, reader: current, origin, summary: mode === "openSummary" });
    });
  };
  const unavailable = !ready || api === undefined || busy || visible?.refreshRequired === true;
  return (
    <section ref={container} aria-label="Company recorded interactions" className="cd-company-jobs">
      <h4>Recorded interactions for linked jobs</h4>
      <p>
        These records belong to jobs currently linked to this company. Current links do not
        establish an employer at the time of an interaction.
      </p>
      <label>
        <input
          type="checkbox"
          checked={includeArchivedJobs}
          disabled={!ready}
          onChange={(event) => {
            setIncludeArchivedJobs(event.currentTarget.checked);
          }}
        />{" "}
        Include interactions for archived linked jobs
      </label>
      <p role="status" aria-live="polite" tabIndex={-1} data-company-history-status>
        {!ready
          ? "History awaits a confirmed selected-company read."
          : api === undefined
            ? "Company history storage is unavailable."
            : busy
              ? "Reading company history…"
              : page === null
                ? "No company history page has been read."
                : "Company history page read from local storage."}
      </p>
      {visible?.error !== null && visible?.error !== undefined ? (
        <p role="alert">{visible.error}</p>
      ) : null}
      {page !== null && (!ready || busy || visible?.error !== null) ? (
        <p>Previously read interactions may be stale. Summary actions await confirmation.</p>
      ) : null}
      <div className="cd-stored-companies__actions">
        <button
          className="cd-button"
          type="button"
          disabled={unavailable}
          onClick={() => {
            run("first");
          }}
        >
          First company interactions
        </button>
        <button
          className="cd-button"
          type="button"
          disabled={unavailable || visible?.error !== null || page?.hasMore !== true}
          onClick={() => {
            run("next");
          }}
        >
          Next company interactions
        </button>
        {visible?.failedRequest !== null &&
        visible?.failedRequest !== undefined &&
        !visible.refreshRequired ? (
          <button
            className="cd-button"
            type="button"
            disabled={unavailable}
            onClick={() => {
              run("retry");
            }}
          >
            Retry company history page
          </button>
        ) : null}
      </div>
      {ready && !busy && visible?.error === null && page?.items.length === 0 ? (
        <p>No recorded interactions for linked jobs in this archive scope.</p>
      ) : null}
      {page !== null ? (
        <ul aria-label="Company interactions on this page">
          {page.items.map((item) => (
            <li key={item.id} data-company-interaction={item.id}>
              <p className="cd-company-literal">
                {item.type} · {item.direction} · {item.occurredAt}
              </p>
              <p className="cd-company-literal">
                Current linked job: {item.currentJob.title}
                {item.currentJob.archivedAt === null ? "" : " (archived)"}
              </p>
              <p>
                {item.contactId === null
                  ? "No retained contact link."
                  : "Recorded contact link retained; contact details are not loaded here."}
              </p>
              <p className="cd-company-literal">
                {item.summaryPreview.length === 0
                  ? "Retained summary is empty."
                  : item.summaryPreview}
              </p>
              {item.summaryTruncated ? <p>Summary preview is partial.</p> : null}
              <button
                className="cd-button"
                type="button"
                disabled={unavailable || visible?.error !== null}
                onClick={() => {
                  run("openSummary", item.id);
                }}
              >
                Read summary for {item.type} at {item.occurredAt}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {summary !== null ? (
        <section aria-label="Selected company interaction summary">
          <h5 tabIndex={-1} data-company-summary-title>
            Recorded summary
          </h5>
          <p>
            {summary.complete
              ? "Complete retained summary read."
              : "Partial retained summary; read the next part to continue."}
          </p>
          {summary.error !== null ? <p role="alert">{summary.error}</p> : null}
          <p
            className="cd-company-literal cd-company-interaction-summary"
            role="region"
            aria-label="Retained company interaction summary text"
            tabIndex={0}
          >
            {summary.text.length === 0 && summary.complete
              ? "Retained summary is empty."
              : summary.text}
          </p>
          <div className="cd-stored-companies__actions">
            <button
              className="cd-button"
              type="button"
              disabled={unavailable || summary.complete || summary.failedRequest !== null}
              onClick={() => {
                run("moreSummary");
              }}
            >
              Read next summary part
            </button>
            {summary.failedRequest !== null && !visible?.refreshRequired ? (
              <button
                className="cd-button"
                type="button"
                disabled={unavailable}
                onClick={() => {
                  run("retrySummary");
                }}
              >
                Retry company summary part
              </button>
            ) : null}
            <button
              className="cd-button"
              type="button"
              disabled={busy || !ready}
              onClick={() => {
                const current = reader.current;
                if (current === null) return;
                const origin = document.activeElement;
                current.closeSummary();
                setFocus({ owner, reader: current, origin, summary: false });
              }}
            >
              Close company summary
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
};
