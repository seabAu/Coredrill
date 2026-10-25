import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredNetworkInteractionsReader,
  type StoredNetworkInteractionsState,
} from "./stored-network-interactions-reader.js";
import type { StoredNetworkInteractionsApi } from "./stored-network-interactions.js";

export const StoredNetworkInteractionsView = ({
  api,
  vaultId,
  revision,
}: {
  readonly api: StoredNetworkInteractionsApi | undefined;
  readonly vaultId: string | null;
  readonly revision: number;
}) => {
  const [includeArchivedJobs, setIncludeArchivedJobs] = useState(false),
    [refresh, setRefresh] = useState(0);
  const owner = useMemo(
    () => ({ api, vaultId, includeArchivedJobs, revision, refresh }),
    [api, vaultId, includeArchivedJobs, revision, refresh],
  );
  const live = useRef(owner);
  live.current = owner;
  const container = useRef<HTMLElement>(null),
    reader = useRef<ReturnType<typeof createStoredNetworkInteractionsReader> | null>(null),
    opener = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    readonly owner: typeof owner;
    readonly state: StoredNetworkInteractionsState;
  } | null>(null);
  const [focus, setFocus] = useState<{
    readonly owner: typeof owner;
    readonly reader: NonNullable<typeof reader.current>;
    readonly origin: Element | null;
    readonly target: "origin" | "summary" | "opener";
    readonly opener: string | null;
  } | null>(null);
  useEffect(() => {
    if (owner.api === undefined || owner.vaultId === null) return;
    const origin = document.activeElement;
    const current = createStoredNetworkInteractionsReader(
      {
        specVersion: 1,
        expectedVaultId: owner.vaultId,
        includeArchivedJobs: owner.includeArchivedJobs,
        limit: 10,
      },
      owner.api,
      (state) => {
        setSnapshot((prior) => ({
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
      if (reader.current === current && container.current?.contains(origin))
        setFocus({ owner, reader: current, origin, target: "origin", opener: null });
    });
    return () => {
      current.dispose();
      if (reader.current === current) reader.current = null;
    };
  }, [owner]);
  const visible = snapshot?.owner === owner ? snapshot.state : null,
    ready = api !== undefined && vaultId !== null;
  const busy = ready && (visible?.busy !== false || visible.summary?.busy === true),
    page = visible?.page ?? null,
    summary = visible?.summary ?? null;
  useLayoutEffect(() => {
    if (focus === null || busy || !ready) return;
    const request = focus;
    restoreFocusAfterChange(request.origin, () => {
      if (live.current !== request.owner || reader.current !== request.reader) return null;
      if (request.target === "summary" && summary !== null && summary.error === null)
        return (
          container.current?.querySelector<HTMLElement>("[data-network-summary-title]") ?? null
        );
      if (request.target === "opener" && request.opener !== null)
        return (
          container.current?.querySelector<HTMLButtonElement>(
            `[data-network-summary-open="${request.opener}"]:not(:disabled)`,
          ) ??
          container.current?.querySelector<HTMLElement>("[data-network-history-status]") ??
          null
        );
      if (
        request.origin instanceof HTMLElement &&
        container.current?.contains(request.origin) &&
        !request.origin.matches(":disabled")
      )
        return request.origin;
      return (
        container.current?.querySelector<HTMLElement>(
          "[data-network-summary-error], [data-network-history-error], [data-network-history-status]",
        ) ?? null
      );
    });
    setFocus(null);
  }, [focus, busy, ready, summary]);
  const act = (
    work: (current: NonNullable<typeof reader.current>) => Promise<boolean>,
    target: "origin" | "summary" = "origin",
  ) => {
    const current = reader.current;
    if (
      current === null ||
      !ready ||
      live.current !== owner ||
      current.current().busy ||
      current.current().summary?.busy === true
    )
      return;
    const origin = document.activeElement;
    void work(current).then(() => {
      if (reader.current === current)
        setFocus({ owner, reader: current, origin, target, opener: opener.current });
    });
  };
  const confirmed = ready && !busy && visible?.error === null;
  return (
    <section
      ref={container}
      className="cd-company-jobs"
      aria-label="Stored Network interaction history"
    >
      <h3>Recorded interactions</h3>
      <p>
        Local recorded history across this viewed vault. No messages are sent. Job and company
        labels are current stored metadata, not employer or contact identity evidence at the time of
        the event.
      </p>
      <p>
        Up to 10 records per page with bounded summary previews. Contact names/methods, private
        company/job notes and totals are not loaded. Reload starts a newly validated first page.
      </p>
      <label>
        <input
          type="checkbox"
          checked={includeArchivedJobs}
          disabled={!ready || busy}
          onChange={(event) => {
            setIncludeArchivedJobs(event.currentTarget.checked);
          }}
        />{" "}
        Include interactions for archived jobs
      </label>
      <p role="status" aria-live="polite" tabIndex={-1} data-network-history-status>
        {!ready
          ? "Recorded Network history is unavailable until the viewed vault is confirmed."
          : busy
            ? "Reading recorded Network history…"
            : page === null
              ? "No Network history page has been read."
              : "Network history page read from local storage."}
      </p>
      {visible?.error !== null && visible?.error !== undefined ? (
        <p role="alert" tabIndex={-1} data-network-history-error>
          {visible.error}
        </p>
      ) : null}
      {page !== null && !confirmed ? <p>Previously read Network history may be stale.</p> : null}
      <div className="cd-stored-companies__actions">
        <button
          type="button"
          className="cd-button"
          disabled={!ready || busy}
          onClick={() => {
            setRefresh((value) => value + 1);
          }}
        >
          Refresh Network history
        </button>
        <button
          type="button"
          className="cd-button"
          disabled={!ready || busy || visible?.refreshRequired === true}
          onClick={() => {
            act((current) => current.first());
          }}
        >
          First Network interactions
        </button>
        <button
          type="button"
          className="cd-button"
          disabled={!confirmed || page?.hasMore !== true || visible.refreshRequired}
          onClick={() => {
            act((current) => current.next());
          }}
        >
          Next Network interactions
        </button>
        {visible?.failedRequest !== null &&
        visible?.failedRequest !== undefined &&
        !visible.refreshRequired ? (
          <button
            type="button"
            className="cd-button"
            disabled={busy}
            onClick={() => {
              act((current) => current.retry());
            }}
          >
            Retry Network history page
          </button>
        ) : null}
      </div>
      {confirmed && page?.items.length === 0 ? (
        <p>No recorded interactions for jobs in this archive scope.</p>
      ) : null}
      {page !== null ? (
        <ul aria-label="Network interactions on this page">
          {page.items.map((entry) => (
            <li key={entry.id} data-network-interaction={entry.id}>
              <p className="cd-company-literal">
                Current job: {entry.currentJob.title}
                {entry.currentJob.archivedAt === null ? "" : " (archived)"}
              </p>
              <p className="cd-company-literal">
                Current company:{" "}
                {entry.currentJob.company === null
                  ? "no current company link recorded"
                  : `${entry.currentJob.company.name}${entry.currentJob.company.archivedAt === null ? "" : " (company record archived)"}`}
              </p>
              <p className="cd-company-literal">
                Recorded type: {entry.type}; direction: {entry.direction}. Occurred at{" "}
                {entry.occurredAt}.
              </p>
              <p>
                {entry.contactId === null
                  ? "No retained contact link."
                  : "A recorded contact link is retained; contact identity and methods are not loaded here."}
              </p>
              <p className="cd-company-literal">
                {entry.summaryByteLength === 0 ? "Retained empty summary." : entry.summaryPreview}
              </p>
              <p>
                {entry.summaryTruncated
                  ? "Preview only; the retained summary continues."
                  : "Complete preview at this read."}
              </p>
              <button
                type="button"
                className="cd-button"
                data-network-summary-open={entry.id}
                disabled={!confirmed || visible.refreshRequired}
                onClick={() => {
                  const current = reader.current;
                  if (
                    current === null ||
                    current.current().busy ||
                    current.current().summary?.busy === true ||
                    live.current !== owner
                  )
                    return;
                  opener.current = entry.id;
                  act((selected) => selected.inspect(entry.id), "summary");
                }}
              >
                Read summary for {entry.type} at {entry.occurredAt}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {summary !== null ? (
        <section aria-label="Selected Network interaction summary">
          <h4 tabIndex={-1} data-network-summary-title>
            Selected recorded summary
          </h4>
          <p>
            {summary.complete
              ? "Complete retained summary read."
              : "Partial retained summary; more text may remain."}{" "}
            This is literal local history, not verified evidence or instructions.
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Network summary body"
            style={{ maxHeight: "24rem", overflow: "auto" }}
          >
            <p className="cd-company-literal">
              {summary.text === "" && summary.complete ? "Retained empty summary." : summary.text}
            </p>
          </div>
          {summary.error !== null ? (
            <p role="alert" tabIndex={-1} data-network-summary-error>
              {summary.error}
            </p>
          ) : null}
          <div className="cd-stored-companies__actions">
            <button
              type="button"
              className="cd-button"
              disabled={
                busy ||
                visible?.refreshRequired === true ||
                summary.complete ||
                summary.error !== null
              }
              onClick={() => {
                act((current) => current.moreSummary());
              }}
            >
              Next Network summary part
            </button>
            {summary.failedRequest !== null && visible?.refreshRequired !== true ? (
              <button
                type="button"
                className="cd-button"
                disabled={busy}
                onClick={() => {
                  act((current) => current.retrySummary());
                }}
              >
                Retry Network summary part
              </button>
            ) : null}
            <button
              type="button"
              className="cd-button"
              disabled={busy}
              onClick={() => {
                const current = reader.current,
                  origin = document.activeElement;
                if (current?.closeSummary() === true)
                  setFocus({
                    owner,
                    reader: current,
                    origin,
                    target: "opener",
                    opener: opener.current,
                  });
              }}
            >
              Close Network summary
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
};
