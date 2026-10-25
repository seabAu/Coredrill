import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CompanyOutcomeStageV1, CompanyWorkspaceV1 } from "@coredrill/application";
import { restoreFocusAfterChange } from "@coredrill/ui";
import type { StoredCompanyOutcomesApi } from "./stored-company-outcomes.js";
import {
  createStoredCompanyOutcomesReader,
  type StoredCompanyOutcomesState,
} from "./stored-company-outcomes-reader.js";

const Stage = ({ value }: { readonly value: CompanyOutcomeStageV1 | null }) =>
  value === null ? (
    <p>No previous stage recorded.</p>
  ) : (
    <div>
      <p className="cd-company-literal">{value.name}</p>
      <p>
        Current category: {value.category};{" "}
        {value.terminal ? "marked terminal" : "not marked terminal"}.
        {value.archivedAt === null ? "" : " This stage definition is archived."}
      </p>
    </div>
  );
export const StoredCompanyOutcomesView = ({
  api,
  workspace,
  ready,
}: {
  readonly api: StoredCompanyOutcomesApi | undefined;
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
  const reader = useRef<ReturnType<typeof createStoredCompanyOutcomesReader> | null>(null),
    container = useRef<HTMLElement>(null);
  const [snapshot, setSnapshot] = useState<{
    readonly owner: typeof owner;
    readonly state: StoredCompanyOutcomesState;
  } | null>(null);
  const [focus, setFocus] = useState<{
    readonly owner: typeof owner;
    readonly reader: NonNullable<typeof reader.current>;
    readonly origin: Element | null;
  } | null>(null);
  useEffect(() => {
    if (!ready || owner.api === undefined) return;
    const { api: selected, ...scope } = owner,
      origin = document.activeElement;
    const current = createStoredCompanyOutcomesReader(scope, selected.page, (state) => {
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
        setFocus({ owner, reader: current, origin });
    });
    return () => {
      current.dispose();
      if (reader.current === current) reader.current = null;
    };
  }, [owner, ready]);
  const visible = snapshot?.owner === owner ? snapshot.state : null,
    busy = ready && api !== undefined && visible?.busy !== false,
    page = visible?.page ?? null;
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
      if (
        request.origin instanceof HTMLElement &&
        container.current?.contains(request.origin) &&
        !request.origin.matches(":disabled")
      )
        return request.origin;
      return (
        container.current?.querySelector<HTMLElement>(
          "[data-company-outcomes-retry]:not(:disabled),[data-company-outcomes-status]",
        ) ?? null
      );
    });
    setFocus(null);
  }, [focus, busy, ready]);
  const run = (mode: "first" | "next" | "retry") => {
    const current = reader.current;
    if (current === null || !ready || live.current.owner !== owner) return;
    const origin = document.activeElement;
    void current[mode]().then(() => {
      if (reader.current === current) setFocus({ owner, reader: current, origin });
    });
  };
  const confirmed = ready && !busy && visible?.error === null;
  return (
    <section
      ref={container}
      aria-label="Company recorded outcome history"
      className="cd-company-jobs"
    >
      <h4>Recorded stage and outcome history</h4>
      <p>
        These are local status changes for jobs currently linked to this company. They do not verify
        employer decisions, submission receipt or historical employer links.
      </p>
      <p>
        All recorded transitions are included. Stage names, categories and terminal markers are
        current definitions at this read, not snapshots of their meaning at event time. A later move
        does not erase an earlier record.
      </p>
      <p>
        Up to {owner.limit} records per page. Reload reads a fresh first page. Event notes,
        application notes and totals are not loaded.
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
        Include history for archived linked jobs
      </label>
      <p role="status" aria-live="polite" tabIndex={-1} data-company-outcomes-status>
        {!ready
          ? "Stage history awaits a confirmed selected-company read."
          : api === undefined
            ? "Recorded stage-history storage is unavailable."
            : busy
              ? "Reading recorded stage history…"
              : page === null
                ? "No recorded stage-history page has been read."
                : "Recorded stage-history page read from local storage."}
      </p>
      {visible?.error !== null && visible?.error !== undefined ? (
        <p role="alert">{visible.error}</p>
      ) : null}
      {page !== null && !confirmed ? <p>Previously read stage history may be stale.</p> : null}
      <div className="cd-stored-companies__actions">
        <button
          className="cd-button"
          type="button"
          disabled={!ready || api === undefined || busy || visible?.refreshRequired === true}
          onClick={() => {
            run("first");
          }}
        >
          First recorded outcomes
        </button>
        <button
          className="cd-button"
          type="button"
          disabled={!confirmed || page?.hasMore !== true || visible.refreshRequired}
          onClick={() => {
            run("next");
          }}
        >
          Next recorded outcomes
        </button>
        {visible?.failedRequest !== null &&
        visible?.failedRequest !== undefined &&
        !visible.refreshRequired ? (
          <button
            className="cd-button"
            type="button"
            data-company-outcomes-retry
            disabled={!ready || busy}
            onClick={() => {
              run("retry");
            }}
          >
            Retry recorded-outcome page
          </button>
        ) : null}
      </div>
      {confirmed && page?.items.length === 0 ? (
        <p>No recorded stage changes for linked jobs in this archive scope.</p>
      ) : null}
      {page !== null ? (
        <ul aria-label="Recorded company stage changes on this page">
          {page.items.map((entry) => (
            <li key={entry.id} data-company-outcome={entry.id}>
              <p className="cd-company-literal">
                Current linked job: {entry.currentJob.title}
                {entry.currentJob.archivedAt === null ? "" : " (archived)"}
              </p>
              <p>
                Occurred at <time dateTime={entry.occurredAt}>{entry.occurredAt}</time>; recorded
                locally at <time dateTime={entry.createdAt}>{entry.createdAt}</time>.
              </p>
              <p>From (current definition)</p>
              <Stage value={entry.fromStatus} />
              <p>To (current definition)</p>
              <Stage value={entry.toStatus} />
              {entry.application === null ? (
                <p>Job-level change; no application reference recorded.</p>
              ) : (
                <p className="cd-company-literal">
                  Recorded application reference: {entry.application.id}.
                  {entry.application.archivedAt === null
                    ? ""
                    : " This application record is archived."}
                </p>
              )}
              <p>
                {entry.undo?.consumedAt === null || entry.undo === null
                  ? "No undo reversal is recorded for this change."
                  : `Original change reversed by a recorded undo at ${entry.undo.consumedAt}.`}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
