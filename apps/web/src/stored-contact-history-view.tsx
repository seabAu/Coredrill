import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  parseContactInteractionsRequestV1,
  parseContactWorkspaceV1,
  type ContactInteractionSummaryV1,
  type ContactWorkspaceV1,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredContactHistoryReader,
  createStoredContactSummaryReader,
  type StoredContactHistoryState,
  type StoredContactSummaryState,
} from "./stored-contact-history-reader.js";
import type { StoredContactHistoryApi } from "./stored-contact-history.js";

/** Root-owned ephemeral reads survive route/reflow; selected-contact lookup confirms company scope. */
export const useStoredContactHistory = (options: {
  readonly api: StoredContactHistoryApi | undefined;
  readonly vaultId: string | null;
  readonly contactId: string | null;
  readonly companyScope: string | null;
  readonly revision: number;
  readonly enabled: boolean;
}) => {
  const { api, vaultId, contactId, companyScope, revision, enabled } = options;
  const owner = useMemo(
    () => ({ api, vaultId, contactId, companyScope, revision, enabled }),
    [api, vaultId, contactId, companyScope, revision, enabled],
  );
  const liveOwner = useRef(owner);
  liveOwner.current = owner;
  const [includeArchived, setIncludeArchived] = useState(false);
  const [confirmed, setConfirmed] = useState<{ owner: typeof owner; version: number } | null>(null);
  const liveConfirmed = useRef(confirmed);
  liveConfirmed.current = confirmed;
  const lifetime = useMemo(
    () => ({ owner, confirmed, includeArchived }),
    [owner, confirmed, includeArchived],
  );
  const liveLifetime = useRef(lifetime);
  liveLifetime.current = lifetime;
  const [pageSnapshot, setPageSnapshot] = useState<{
    lifetime: typeof lifetime;
    state: StoredContactHistoryState;
  } | null>(null);
  const [summarySnapshot, setSummarySnapshot] = useState<{
    lifetime: typeof lifetime;
    state: StoredContactSummaryState;
  } | null>(null);
  const pageReader = useRef<{
    lifetime: typeof lifetime;
    reader: ReturnType<typeof createStoredContactHistoryReader>;
  } | null>(null);
  const summaryReader = useRef<{
    lifetime: typeof lifetime;
    reader: ReturnType<typeof createStoredContactSummaryReader>;
  } | null>(null);
  const observeWorkspace = useCallback(
    (untrusted: ContactWorkspaceV1 | null) => {
      if (liveOwner.current !== owner) return;
      try {
        if (
          !owner.enabled ||
          owner.vaultId === null ||
          owner.contactId === null ||
          untrusted === null
        )
          throw new Error();
        if (owner.companyScope !== null) entityId("company", owner.companyScope);
        const workspace = parseContactWorkspaceV1(untrusted, {
          expectedVaultId: entityId("vault", owner.vaultId),
          contactId: entityId("contact", owner.contactId),
          includeArchived: true,
        });
        if (owner.companyScope !== null && workspace.contact.companyId !== owner.companyScope)
          throw new Error();
        setConfirmed((prior) =>
          prior?.owner === owner && prior.version === workspace.contact.rowVersion
            ? prior
            : { owner, version: workspace.contact.rowVersion },
        );
      } catch {
        setConfirmed(null);
      }
    },
    [owner],
  );
  useEffect(() => {
    if (
      !owner.enabled ||
      owner.api === undefined ||
      owner.vaultId === null ||
      owner.contactId === null ||
      confirmed?.owner !== owner
    )
      return;
    const scope = parseContactInteractionsRequestV1({
      specVersion: 1,
      expectedVaultId: owner.vaultId,
      contactId: owner.contactId,
      includeArchived,
    });
    const reader = createStoredContactHistoryReader(
      scope,
      owner.api.page,
      (state) => {
        if (liveLifetime.current === lifetime && liveConfirmed.current === confirmed)
          setPageSnapshot({ lifetime, state });
      },
      confirmed.version,
    );
    const current = { lifetime, reader };
    pageReader.current = current;
    void reader.first();
    return () => {
      reader.dispose();
      if (pageReader.current === current) pageReader.current = null;
      if (summaryReader.current?.lifetime === lifetime) {
        summaryReader.current.reader.dispose();
        summaryReader.current = null;
      }
    };
  }, [owner, confirmed, includeArchived, lifetime]);
  const ready = owner.enabled && confirmed?.owner === owner;
  const page = ready && pageSnapshot?.lifetime === lifetime ? pageSnapshot.state : null;
  const summary = ready && summarySnapshot?.lifetime === lifetime ? summarySnapshot.state : null;
  const closeSummary = () => {
    summaryReader.current?.reader.dispose();
    summaryReader.current = null;
    setSummarySnapshot(null);
  };
  const run = async (mode: "first" | "next" | "retry") => {
    const current = pageReader.current;
    if (!ready || current?.lifetime !== lifetime) return false;
    closeSummary();
    const completed = await current.reader[mode]();
    return completed && liveLifetime.current === lifetime && pageReader.current === current;
  };
  const inspect = async (item: ContactInteractionSummaryV1) => {
    const current = pageReader.current;
    const state = current?.reader.current();
    const stored = state?.page?.items.find((candidate) => candidate === item);
    if (
      !ready ||
      owner.api === undefined ||
      current?.lifetime !== lifetime ||
      stored === undefined ||
      state?.busy ||
      state?.error !== null ||
      state.page === null
    )
      return false;
    closeSummary();
    const reader = createStoredContactSummaryReader(
      {
        specVersion: 1,
        summaryByteLength: stored.summaryByteLength,
        reference: {
          specVersion: 1,
          vaultId: state.page.vaultId,
          contactId: state.page.contactId,
          includeArchived: state.page.includeArchived,
          contactRowVersion: state.page.contactRowVersion,
          occurredAt: stored.occurredAt,
          id: stored.id,
          rowVersion: stored.rowVersion,
          jobId: stored.currentJob.id,
          jobRowVersion: stored.currentJob.rowVersion,
        },
      },
      owner.api.summaryPart,
      (next) => {
        if (liveLifetime.current === lifetime && summaryReader.current?.reader === reader)
          setSummarySnapshot({ lifetime, state: next });
      },
    );
    const selected = { lifetime, reader };
    summaryReader.current = selected;
    setSummarySnapshot({ lifetime, state: reader.current() });
    const completed = await reader.more();
    return completed && liveLifetime.current === lifetime && summaryReader.current === selected;
  };
  const readSummary = async (mode: "more" | "retry") => {
    const selected = summaryReader.current;
    if (!ready || selected?.lifetime !== lifetime) return false;
    const completed = await selected.reader[mode]();
    return completed && liveLifetime.current === lifetime && summaryReader.current === selected;
  };
  return {
    lifetime,
    page,
    summary,
    includeArchived,
    setIncludeArchived,
    observeWorkspace,
    run,
    inspect,
    readSummary,
    closeSummary,
    waiting: !ready,
    unavailable: !owner.enabled || owner.api === undefined,
  };
};

export const StoredContactHistoryView = ({
  model,
}: {
  readonly model: ReturnType<typeof useStoredContactHistory>;
}) => {
  const container = useRef<HTMLElement>(null);
  const live = useRef(model);
  live.current = model;
  const mounted = useRef(true);
  const focusGeneration = useRef(0);
  const [focusRequest, setFocusRequest] = useState<{
    origin: Element | null;
    lifetime: typeof model.lifetime;
    selector: string;
    generation: number;
  } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const withFocus = async (work: () => Promise<boolean>, selector: string) => {
    const origin = document.activeElement;
    const lifetime = model.lifetime;
    const generation = ++focusGeneration.current;
    const completed = await work();
    if (
      !completed ||
      !mounted.current ||
      live.current.lifetime !== lifetime ||
      focusGeneration.current !== generation
    )
      return;
    setFocusRequest({ origin, lifetime, selector, generation });
  };
  useLayoutEffect(() => {
    if (focusRequest === null) return;
    const request = focusRequest;
    if (
      request.lifetime !== model.lifetime ||
      request.generation !== focusGeneration.current ||
      model.waiting
    ) {
      setFocusRequest(null);
      return;
    }
    if (model.page?.busy || model.summary?.busy) return;
    restoreFocusAfterChange(request.origin, () => {
      if (
        !mounted.current ||
        live.current.lifetime !== request.lifetime ||
        focusGeneration.current !== request.generation
      )
        return null;
      return (
        container.current?.querySelector<HTMLButtonElement>(
          `${request.selector}:not([disabled])`,
        ) ??
        container.current?.querySelector<HTMLButtonElement>(
          "[data-contact-history-read=first]:not([disabled])",
        ) ??
        null
      );
    });
    setFocusRequest(null);
  }, [focusRequest, model.lifetime, model.waiting, model.page?.busy, model.summary?.busy]);
  const page = model.page?.page ?? null;
  const blocked = model.waiting || model.unavailable || model.page === null || model.page.busy;
  return (
    <section ref={container} aria-label="Recorded contact history" className="cd-contact-details">
      <h3>Recorded interactions</h3>
      <p>
        Only interactions explicitly linked to this contact are shown. A shared company is not a
        conversation. Job labels below are current local metadata, not historical employer evidence.
        Nothing is sent or fetched remotely.
      </p>
      <label>
        <input
          type="checkbox"
          checked={model.includeArchived}
          disabled={model.unavailable}
          onChange={(event) => {
            model.setIncludeArchived(event.currentTarget.checked);
          }}
        />{" "}
        Include archived contact and linked jobs in history
      </label>
      <div className="cd-stored-companies__actions">
        <button
          className="cd-button"
          type="button"
          data-contact-history-read="first"
          disabled={blocked}
          onClick={() => {
            void withFocus(() => model.run("first"), "[data-contact-history-read=first]");
          }}
        >
          Load first history page / refresh
        </button>
        <button
          className="cd-button"
          type="button"
          data-contact-history-read="next"
          disabled={
            blocked ||
            page?.nextCursor === undefined ||
            page.nextCursor === null ||
            model.page?.error !== null
          }
          onClick={() => {
            void withFocus(() => model.run("next"), "[data-contact-history-read=next]");
          }}
        >
          Next history page
        </button>
        {model.page?.error && !model.page.refreshRequired ? (
          <button
            className="cd-button"
            type="button"
            data-contact-history-read="retry"
            disabled={blocked}
            onClick={() => {
              void withFocus(() => model.run("retry"), "[data-contact-history-read=retry]");
            }}
          >
            Retry history page
          </button>
        ) : null}
      </div>
      <p role="status" aria-live="polite">
        {model.unavailable
          ? "History is unavailable until this local vault is ready."
          : model.waiting
            ? "Waiting for the selected contact and company scope to be confirmed."
            : model.page === null || model.page.busy
              ? "Reading recorded contact history…"
              : page === null
                ? "No history page is available."
                : `${String(page.items.length)} recorded interactions on this live page. ${page.hasMore ? "Another page is available." : "No later page was available when read."}`}
      </p>
      {model.page?.error ? <p role="alert">{model.page.error}</p> : null}
      {page !== null && (model.page?.busy || model.page?.error) ? (
        <p>Previously read history may be stale.</p>
      ) : null}
      <p>
        Up to 25 records per page, occurrence newest first, with at most 1,024 UTF-8 preview bytes
        per summary. This is not a total or an immutable snapshot.
      </p>
      {page?.items.length === 0 && !blocked && model.page?.error === null ? (
        <p>
          No interactions were recorded for this contact in this archive scope when read. No
          conversation was inferred.
        </p>
      ) : null}
      <ol aria-label="Recorded interactions on this page" className="cd-stored-companies__list">
        {page?.items.map((item) => (
          <li key={item.id}>
            <h4>
              {item.type} — {item.direction}
            </h4>
            <dl>
              <dt>Recorded occurrence</dt>
              <dd>{item.occurredAt}</dd>
              <dt>Current linked job</dt>
              <dd className="cd-contact-literal">
                {item.currentJob.title} —{" "}
                {item.currentJob.archivedAt === null ? "active" : "archived"}
              </dd>
            </dl>
            <p className="cd-contact-literal">
              {item.summaryPreview === "" ? "Empty recorded summary." : item.summaryPreview}
            </p>
            <p>
              {item.summaryTruncated
                ? "Preview only; the complete summary has not been read."
                : "Complete summary fits in this preview."}{" "}
              {item.summaryByteLength} UTF-8 bytes in the recorded summary.
            </p>
            <button
              className="cd-button"
              type="button"
              data-contact-history-inspect={item.id}
              aria-label={`Inspect summary for interaction ${item.id}`}
              disabled={blocked || model.page?.error !== null}
              onClick={() => {
                void withFocus(
                  () => model.inspect(item),
                  `[data-contact-history-inspect="${item.id}"]`,
                );
              }}
            >
              Inspect summary
            </button>
          </li>
        ))}
      </ol>
      {model.summary === null ? null : (
        <section aria-label="Recorded interaction summary">
          <h4>Literal recorded summary</h4>
          <p>
            Interaction {model.summary.owner.reference.id}. This is stored text, not verified
            evidence or executable markup.
          </p>
          <p role="status" aria-live="polite">
            {model.summary.busy
              ? "Reading a bounded summary part…"
              : model.summary.loaded
                ? `${String(model.summary.bytesRead)} of ${String(model.summary.owner.summaryByteLength)} UTF-8 bytes read. ${model.summary.complete ? "Complete literal summary read." : "Only a prefix has been read; continue for the remaining text."}`
                : "No summary part has been read."}
          </p>
          {model.summary.error ? <p role="alert">{model.summary.error}</p> : null}
          {model.summary.loaded ? (
            <p className="cd-contact-literal" aria-label="Literal recorded summary text">
              {model.summary.text === "" ? "Empty recorded summary." : model.summary.text}
            </p>
          ) : null}
          <button
            className="cd-button"
            type="button"
            data-contact-summary-more="true"
            disabled={model.summary.busy || model.summary.complete || model.summary.error !== null}
            onClick={() => {
              void withFocus(() => model.readSummary("more"), "[data-contact-summary-more]");
            }}
          >
            Read next summary part
          </button>
          {model.summary.error && !model.summary.refreshRequired ? (
            <button
              className="cd-button"
              type="button"
              data-contact-summary-retry="true"
              disabled={model.summary.busy}
              onClick={() => {
                void withFocus(() => model.readSummary("retry"), "[data-contact-summary-retry]");
              }}
            >
              Retry summary part
            </button>
          ) : null}
          <button
            className="cd-button"
            type="button"
            onClick={() => {
              const origin = document.activeElement;
              const lifetime = model.lifetime;
              const id = model.summary?.owner.reference.id;
              const generation = ++focusGeneration.current;
              model.closeSummary();
              setFocusRequest({
                origin,
                lifetime,
                generation,
                selector: `[data-contact-history-inspect="${id ?? ""}"]`,
              });
            }}
          >
            Close recorded summary
          </button>
        </section>
      )}
    </section>
  );
};
