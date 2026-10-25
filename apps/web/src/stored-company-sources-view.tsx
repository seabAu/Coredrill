import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CompanySourceV1,
  CompanyWorkspaceV1,
  ListCompanySourcesRequestV1,
  StoredSourceUrlV1,
} from "@coredrill/application";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredCompanySourcesReader,
  type StoredCompanySourcesState,
} from "./stored-company-sources-reader.js";
import type { StoredCompanySourcesApi } from "./stored-company-sources.js";
import type { CompanySourceReturn } from "./company-source-navigation.js";

const SourceUrl = ({
  value,
  label,
  enabled,
}: {
  readonly value: StoredSourceUrlV1 | null;
  readonly label: string;
  readonly enabled: boolean;
}) =>
  value === null ? (
    <p>{label}: not recorded.</p>
  ) : (
    <div>
      <p className="cd-company-literal">
        {label}: {value.text}
      </p>
      {enabled ? (
        <a className="cd-button" href={value.href} target="_blank" rel="noopener noreferrer">
          Open {label.toLowerCase()} externally
        </a>
      ) : (
        <p>External navigation awaits a confirmed read.</p>
      )}
    </div>
  );

export const StoredCompanySourcesView = ({
  api,
  workspace,
  ready,
  blocked,
  restore,
  onInspectJob,
}: {
  readonly api: StoredCompanySourcesApi | undefined;
  readonly workspace: CompanyWorkspaceV1;
  readonly ready: boolean;
  readonly blocked: boolean;
  readonly restore: CompanySourceReturn | null;
  readonly onInspectJob: (source: CompanySourceV1, request: ListCompanySourcesRequestV1) => void;
}) => {
  const [includeArchivedJobs, setIncludeArchivedJobs] = useState(() =>
    restore?.request.expectedVaultId === workspace.vaultId &&
    restore.request.companyId === workspace.company.id
      ? restore.request.includeArchivedJobs
      : false,
  );
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
  const reader = useRef<ReturnType<typeof createStoredCompanySourcesReader> | null>(null);
  const container = useRef<HTMLElement>(null),
    restoreAttempted = useRef(false);
  const [snapshot, setSnapshot] = useState<{
    owner: typeof owner;
    state: StoredCompanySourcesState;
  } | null>(null);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    owner: typeof owner;
    reader: NonNullable<typeof reader.current>;
    origin: Element | null;
    returnTo: CompanySourceReturn | null;
  } | null>(null);
  useEffect(() => {
    if (!ready || owner.api === undefined) return;
    const { api: selected, ...scope } = owner;
    const origin = document.activeElement;
    const current = createStoredCompanySourcesReader(scope, selected.page, (state) => {
      setSnapshot((prior) => ({
        owner,
        state:
          state.page === null && prior?.owner === owner
            ? { ...state, page: prior.state.page }
            : state,
      }));
    });
    reader.current = current;
    const returning = restoreAttempted.current ? null : restore;
    restoreAttempted.current = true;
    setReturnNotice(null);
    if (returning !== null) {
      try {
        void current.restore(returning.request).then(() => {
          if (reader.current === current)
            setFocus({ owner, reader: current, origin, returnTo: returning });
        });
      } catch {
        setSnapshot({ owner, state: current.current() });
        setReturnNotice(
          "The saved source return no longer matches this viewed company. Load the first listing-source page explicitly.",
        );
        setFocus({ owner, reader: current, origin, returnTo: null });
      }
    } else
      void current.first().then(() => {
        if (reader.current === current && container.current?.contains(origin))
          setFocus({ owner, reader: current, origin, returnTo: null });
      });
    return () => {
      current.dispose();
      if (reader.current === current) reader.current = null;
    };
  }, [owner, ready, restore]);
  const visible = snapshot?.owner === owner ? snapshot.state : null;
  const busy = ready && api !== undefined && visible?.busy !== false,
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
      if (request.returnTo !== null && visible?.error === null) {
        window.scrollTo({ top: request.returnTo.scrollY });
        return (
          Array.from(
            container.current?.querySelectorAll<HTMLButtonElement>("[data-company-source-open]") ??
              [],
          ).find((button) => button.dataset["companySourceOpen"] === request.returnTo?.sourceId) ??
          container.current?.querySelector<HTMLElement>("[data-company-sources-status]") ??
          null
        );
      }
      if (
        request.origin instanceof HTMLElement &&
        container.current?.contains(request.origin) &&
        !request.origin.matches(":disabled")
      )
        return request.origin;
      return (
        container.current?.querySelector<HTMLButtonElement>(
          "[data-company-sources-retry]:not([disabled])",
        ) ??
        container.current?.querySelector<HTMLElement>("[data-company-sources-status]") ??
        null
      );
    });
    setFocus(null);
  }, [focus, busy, ready, visible?.error]);
  const run = (mode: "first" | "next" | "retry") => {
    const current = reader.current;
    if (current === null || !ready || live.current.owner !== owner) return;
    const origin = document.activeElement;
    setReturnNotice(null);
    void current[mode]().then(() => {
      if (reader.current === current) setFocus({ owner, reader: current, origin, returnTo: null });
    });
  };
  const confirmed = ready && !busy && visible?.error === null;
  return (
    <section ref={container} aria-label="Company listing sources" className="cd-company-jobs">
      <h4>Stored listing sources for linked jobs</h4>
      <p>
        These are sources of jobs currently linked to this company, not verified employer facts or
        historical employer links. Current source metadata and retained captures are separate.
      </p>
      <p>
        Up to {owner.limit} source records per page. Viewing this page fetches no URLs and loads no
        retained bodies.
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
        Include sources for archived linked jobs
      </label>
      <p role="status" aria-live="polite" tabIndex={-1} data-company-sources-status>
        {!ready
          ? "Listing sources await a confirmed selected-company read."
          : api === undefined
            ? "Listing-source storage is unavailable."
            : busy
              ? "Reading listing sources…"
              : (returnNotice ??
                (page === null
                  ? "No listing-source page has been read."
                  : "Listing-source page read from local storage."))}
      </p>
      {visible?.error !== null && visible?.error !== undefined ? (
        <p role="alert">{visible.error}</p>
      ) : null}
      {page !== null && !confirmed ? (
        <p>
          Previously read sources may be stale. Inspection and external navigation await
          confirmation.
        </p>
      ) : null}
      <div className="cd-stored-companies__actions">
        <button
          className="cd-button"
          type="button"
          disabled={!ready || api === undefined || busy || visible?.refreshRequired === true}
          onClick={() => {
            run("first");
          }}
        >
          First listing sources
        </button>
        <button
          className="cd-button"
          type="button"
          disabled={!confirmed || page?.hasMore !== true || visible.refreshRequired}
          onClick={() => {
            run("next");
          }}
        >
          Next listing sources
        </button>
        {visible?.failedRequest !== null &&
        visible?.failedRequest !== undefined &&
        !visible.refreshRequired ? (
          <button
            className="cd-button"
            type="button"
            data-company-sources-retry
            disabled={!ready || busy}
            onClick={() => {
              run("retry");
            }}
          >
            Retry listing-source page
          </button>
        ) : null}
      </div>
      {confirmed && page?.items.length === 0 ? (
        <p>No stored listing sources for linked jobs in this archive scope.</p>
      ) : null}
      {page !== null ? (
        <ul aria-label="Company listing sources on this page">
          {page.items.map((source) => (
            <li key={source.id} data-company-source={source.id}>
              <p className="cd-company-literal">
                Current linked job: {source.currentJob.title}
                {source.currentJob.archivedAt === null ? "" : " (archived)"}
              </p>
              <p className="cd-company-literal">
                Connector:{" "}
                {source.connectorId === null
                  ? "not recorded"
                  : source.connectorId.length === 0
                    ? "stored empty identifier"
                    : source.connectorId}
              </p>
              <p className="cd-company-literal">
                External identifier:{" "}
                {source.externalId === null
                  ? "not recorded"
                  : source.externalId.length === 0
                    ? "stored empty identifier"
                    : source.externalId}
              </p>
              <SourceUrl value={source.canonicalUrl} label="Listing URL" enabled={confirmed} />
              <SourceUrl value={source.applyUrl} label="Application URL" enabled={confirmed} />
              <p>
                First seen {source.firstSeenAt}; last seen {source.lastSeenAt}.{" "}
                {source.primary ? "Marked primary in the stored record." : "Not marked primary."}
              </p>
              {source.contentHash === null ? (
                <p>No current source content hash recorded.</p>
              ) : (
                <p className="cd-company-literal">
                  Stored current source hash: {source.contentHash}
                </p>
              )}
              {source.latestSnapshot === null ? (
                <p>No retained snapshot recorded for this source.</p>
              ) : (
                <div>
                  <p>
                    Most recent retained capture at this read: {source.latestSnapshot.capturedAt}.
                  </p>
                  <p className="cd-company-literal">
                    Extractor: {source.latestSnapshot.extractorId}{" "}
                    {source.latestSnapshot.extractorVersion}
                  </p>
                  <p className="cd-company-literal">
                    Stored snapshot hash: {source.latestSnapshot.contentHash}
                  </p>
                </div>
              )}
              <button
                className="cd-button"
                type="button"
                data-company-source-open={source.id}
                disabled={!confirmed || blocked || visible.request === null}
                onClick={() => {
                  if (
                    visible?.request !== null &&
                    visible?.request !== undefined &&
                    !visible.busy &&
                    live.current.owner === owner &&
                    live.current.ready
                  )
                    onInspectJob(source, visible.request);
                }}
              >
                Inspect this job&apos;s saved source evidence
              </button>
              <p>
                The job Source workspace lists its retained snapshots; it does not fetch or verify
                an employer profile.
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
