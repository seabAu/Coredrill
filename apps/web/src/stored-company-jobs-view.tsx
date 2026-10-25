import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CompanyJobSummaryV1,
  CompanyWorkspaceV1,
  ListCompanyJobsRequestV1,
} from "@coredrill/application";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredCompanyJobsReader,
  type StoredCompanyJobsState,
} from "./stored-company-jobs-reader.js";
import type { StoredCompanyJobsApi } from "./stored-company-jobs.js";
import type { CompanyJobReturn } from "./company-job-navigation.js";

export const StoredCompanyJobsView = ({
  api,
  workspace,
  ready,
  blocked,
  restore,
  onOpenJob,
}: {
  readonly api: StoredCompanyJobsApi | undefined;
  readonly workspace: CompanyWorkspaceV1;
  readonly ready: boolean;
  readonly blocked: boolean;
  readonly restore: CompanyJobReturn | null;
  readonly onOpenJob: (job: CompanyJobSummaryV1, request: ListCompanyJobsRequestV1) => void;
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
  const reader = useRef<ReturnType<typeof createStoredCompanyJobsReader> | null>(null);
  const container = useRef<HTMLElement>(null),
    restoreAttempted = useRef(false);
  const [snapshot, setSnapshot] = useState<{
    owner: typeof owner;
    state: StoredCompanyJobsState;
  } | null>(null);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    owner: typeof owner;
    reader: NonNullable<typeof reader.current>;
    origin: Element | null;
    returnTo: CompanyJobReturn | null;
  } | null>(null);
  useEffect(() => {
    if (!ready || owner.api === undefined) return;
    const { api: selected, ...scope } = owner;
    const origin = document.activeElement;
    const current = createStoredCompanyJobsReader(scope, selected.page, (state) => {
      setSnapshot((prior) => ({
        owner,
        state:
          state.page === null && prior?.owner === owner
            ? { ...state, page: prior.state.page }
            : state,
      }));
    });
    reader.current = current;
    const returning = !restoreAttempted.current ? restore : null;
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
          "The saved return page no longer matches this viewed company. Load the first linked-role page explicitly.",
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
  const busy = ready && api !== undefined && visible?.busy !== false;
  const page = visible?.page ?? null;
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
            container.current?.querySelectorAll<HTMLButtonElement>("[data-company-job]") ?? [],
          ).find((button) => button.dataset["companyJob"] === request.returnTo?.jobId) ??
          container.current?.querySelector<HTMLElement>("[data-company-jobs-status]") ??
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
          "[data-company-jobs-retry]:not([disabled])",
        ) ??
        container.current?.querySelector<HTMLElement>("[data-company-jobs-status]") ??
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
  return (
    <section ref={container} aria-label="Company linked roles" className="cd-company-jobs">
      <h4>Saved roles at this company</h4>
      <p>
        Up to {owner.limit} saved roles per page. Stages reflect your stored records; changes can
        move roles between pages.
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
        Include archived linked roles
      </label>
      <p role="status" tabIndex={-1} data-company-jobs-status aria-live="polite">
        {!ready
          ? "Linked roles await a confirmed selected-company read."
          : api === undefined
            ? "Linked-role storage is unavailable."
            : busy
              ? "Reading linked roles…"
              : (returnNotice ??
                (page === null
                  ? "No linked-role page has been read."
                  : "Linked-role page read from local storage."))}
      </p>
      {visible?.error !== null && visible?.error !== undefined ? (
        <p role="alert">{visible.error}</p>
      ) : null}
      {page !== null && (!ready || busy || visible?.error !== null) ? (
        <p>
          Previously read linked roles may be stale. Open-role actions are unavailable until
          confirmed.
        </p>
      ) : null}
      <div className="cd-stored-companies__actions">
        <button
          type="button"
          className="cd-button"
          disabled={!ready || api === undefined || busy || visible?.refreshRequired === true}
          onClick={() => {
            run("first");
          }}
        >
          First linked roles
        </button>
        <button
          type="button"
          className="cd-button"
          disabled={
            !ready ||
            busy ||
            visible?.error !== null ||
            page?.hasMore !== true ||
            visible.refreshRequired
          }
          onClick={() => {
            run("next");
          }}
        >
          Next linked roles
        </button>
        {visible?.failedRequest !== null &&
        visible?.failedRequest !== undefined &&
        !visible.refreshRequired ? (
          <button
            type="button"
            className="cd-button"
            data-company-jobs-retry
            disabled={!ready || busy}
            onClick={() => {
              run("retry");
            }}
          >
            Retry linked-role page
          </button>
        ) : null}
      </div>
      {ready && !busy && visible?.error === null && page?.items.length === 0 ? (
        <p>No stored linked roles in this archive scope.</p>
      ) : null}
      {page !== null ? (
        <ul aria-label="Linked roles on this page">
          {page.items.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                className="cd-button cd-company-literal"
                data-company-job={job.id}
                disabled={
                  !ready || busy || blocked || visible?.error !== null || visible.request === null
                }
                onClick={() => {
                  if (
                    visible?.request !== null &&
                    visible?.request !== undefined &&
                    !visible.busy &&
                    live.current.owner === owner &&
                    live.current.ready
                  )
                    onOpenJob(job, visible.request);
                }}
              >
                {job.title}
              </button>
              <p className="cd-company-literal">
                Current status: {job.status?.name ?? "Not assigned"}
              </p>
              <p>
                {job.archivedAt === null ? "Active stored role" : `Archived at ${job.archivedAt}`}.
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
