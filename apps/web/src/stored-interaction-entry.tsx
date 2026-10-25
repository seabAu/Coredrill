import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type {
  ApplicationResult,
  ContactWorkspaceV1,
  PipelineJobSummaryDto,
} from "@coredrill/application";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredInteractionComposer,
  sameInteractionOwner,
  type StoredInteractionDraft,
} from "./stored-interaction-composer.js";
import {
  STORED_INTERACTION_TYPES,
  type InteractionRecordingScopeV1,
  type StoredInteractionRecordingApi,
} from "./stored-interaction-recording.js";

const labels = {
  note: "Note",
  call: "Call",
  email_logged: "Email logged",
  meeting: "Meeting",
  referral: "Referral",
  follow_up: "Follow-up",
} as const;

/** Mounted at the root, not in either replaceable responsive workspace frame. */
export const useStoredInteractionEntry = (options: {
  readonly api: StoredInteractionRecordingApi;
  readonly vaultId: string | null;
  readonly enabled: boolean;
  readonly mutationBlocked: boolean;
  readonly needsReopen: boolean;
  readonly mode: "job" | "contact" | "network" | "hidden";
  readonly jobId: string | null;
  readonly contactId: string | null;
  readonly companyScope: string | null;
  readonly jobs: readonly PipelineJobSummaryDto[] | null;
  readonly contact: ContactWorkspaceV1 | null;
  readonly exclusive: (
    vaultId: string,
    work: () => Promise<ApplicationResult<unknown>>,
  ) => Promise<ApplicationResult<unknown>>;
  readonly onSaved: (value: {
    readonly jobId: string;
    readonly id: string;
    readonly contactId: string | null;
  }) => void;
}) => {
  const live = useRef(options);
  live.current = options;
  const controller = useRef<ReturnType<typeof createStoredInteractionComposer> | null>(null);
  const [model, setModel] = useState<StoredInteractionDraft | null>(null);
  const [selected, setSelected] = useState<{
    contactId: string | null;
    companyScope: string | null;
    jobId: string;
  } | null>(null);
  const [discard, setDiscard] = useState(false);
  const [surface, setSurface] = useState<{
    mode: "job" | "contact" | "network" | "hidden";
    companyScope: string | null;
  } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const container = useRef<HTMLElement>(null);
  const prefix = useId();
  const [focus, setFocus] = useState<{
    controller: NonNullable<typeof controller.current>;
    mode: typeof options.mode;
    jobId: string | null;
    contactId: string | null;
    companyScope: string | null;
    origin: Element | null;
  } | null>(null);
  useEffect(() => {
    const current = createStoredInteractionComposer({
      api: () => live.current.api,
      changed: setModel,
      allowed: () =>
        live.current.enabled &&
        !live.current.needsReopen &&
        (!live.current.mutationBlocked || controller.current?.current()?.busy === true),
      exclusive: (vaultId, work) => live.current.exclusive(vaultId, work),
    });
    controller.current = current;
    setModel(null);
    setDiscard(false);
    setInputError(null);
    setSelected(null);
    return () => {
      current.dispose();
      if (controller.current === current) controller.current = null;
    };
  }, [options.enabled, options.vaultId, options.needsReopen]);
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
    // A canonical Pipeline read may still be loading after navigation/discard.
    // Wait for the enabled replacement control's render, not just draft removal.
    if (model === null && container.current?.querySelector("[data-interaction-start]:disabled"))
      return;
    const request = focus;
    restoreFocusAfterChange(request.origin, () => {
      const current = live.current;
      if (
        controller.current !== request.controller ||
        !current.enabled ||
        current.needsReopen ||
        current.mode !== request.mode ||
        current.jobId !== request.jobId ||
        current.contactId !== request.contactId ||
        current.companyScope !== request.companyScope
      )
        return null;
      return (
        container.current?.querySelector<HTMLElement>("[data-interaction-error]") ??
        (request.controller.current()?.phase === "recorded"
          ? container.current?.querySelector<HTMLElement>("[data-interaction-result]")
          : null) ??
        container.current?.querySelector<HTMLElement>(
          "[data-interaction-input]:not([disabled]), [data-interaction-start]:not([disabled])",
        ) ??
        container.current?.querySelector<HTMLElement>("[data-interaction-result]") ??
        null
      );
    });
    setFocus(null);
  }, [focus, model, options.jobs, options.contact]);

  const owned = options.enabled && model?.scope.expectedVaultId === options.vaultId ? model : null;
  const chosenJobId =
    options.mode === "job"
      ? options.jobId
      : options.mode === "network"
        ? selected?.contactId === null && selected.companyScope === null
          ? selected.jobId
          : null
        : selected?.contactId === options.contactId &&
            selected.companyScope === options.companyScope
          ? selected.jobId
          : null;
  const job = options.jobs?.find((item) => item.id === chosenJobId);
  const contact = options.contact?.contact;
  const contactMatches =
    options.mode === "contact" &&
    contact?.id === options.contactId &&
    (options.companyScope === null || contact.companyId === options.companyScope) &&
    contact.archivedAt === null;
  const scope: InteractionRecordingScopeV1 | null =
    options.vaultId === null || job === undefined || (options.mode === "contact" && !contactMatches)
      ? null
      : {
          specVersion: 1,
          expectedVaultId: options.vaultId,
          jobId: job.id,
          jobRowVersion: job.rowVersion,
          contactId: options.mode === "contact" ? (contact?.id ?? null) : null,
          contactRowVersion: options.mode === "contact" ? (contact?.rowVersion ?? null) : null,
        };
  const sameSelection =
    owned !== null &&
    surface?.mode === options.mode &&
    (options.mode !== "contact" || surface.companyScope === options.companyScope) &&
    (options.mode === "job"
      ? owned.scope.jobId === options.jobId && owned.scope.contactId === null
      : options.mode === "network"
        ? owned.scope.jobId === chosenJobId && owned.scope.contactId === null
        : options.mode === "contact" && owned.scope.contactId === options.contactId);
  const currentOwner = owned !== null && scope !== null && sameInteractionOwner(owned.scope, scope);
  const blocked = options.mutationBlocked || options.needsReopen;
  const requestFocus = (origin: Element | null) => {
    const current = controller.current;
    if (current !== null)
      setFocus({
        controller: current,
        mode: options.mode,
        jobId: options.jobId,
        contactId: options.contactId,
        companyScope: options.companyScope,
        origin,
      });
  };
  const run = (action: "save" | "check") => {
    const current = controller.current,
      draft = current?.current();
    if (
      current === null ||
      draft === null ||
      draft === undefined ||
      blocked ||
      (action === "save" && !currentOwner)
    )
      return;
    const origin = document.activeElement;
    const request = {
      controller: current,
      mode: options.mode,
      jobId: options.jobId,
      contactId: options.contactId,
      companyScope: options.companyScope,
      origin,
    };
    setDiscard(false);
    setInputError(null);
    const pending =
      action === "check"
        ? current.check(draft.scope.expectedVaultId)
        : scope === null
          ? Promise.resolve(false)
          : current.save(scope);
    void pending.then((saved) => {
      if (
        controller.current !== current ||
        !live.current.enabled ||
        live.current.vaultId !== draft.scope.expectedVaultId
      )
        return;
      if (saved)
        live.current.onSaved({
          jobId: draft.scope.jobId,
          contactId: draft.scope.contactId,
          id: draft.interactionId,
        });
      setFocus(request);
    });
  };
  const result = (view: ReactNode) => ({ view, hasDraft: options.enabled && model !== null });
  if (!options.enabled || options.mode === "hidden") return result(null);
  if (options.needsReopen)
    return result(
      <p>
        Reload the restored vault before recording interactions. The retired draft is not shown.
      </p>,
    );
  return result(
    <section ref={container} className="cd-interaction-entry" aria-label="Record local interaction">
      <h3>Record local interaction</h3>
      <p>
        Log an event only. Nothing is sent, submitted or scheduled. This session draft is not
        crash-proof storage.
      </p>
      {model === null ? (
        <>
          {options.mode === "contact" || options.mode === "network" ? (
            <>
              <label htmlFor={`${prefix}-job`}>Linked stored job</label>
              <select
                id={`${prefix}-job`}
                value={chosenJobId ?? ""}
                disabled={
                  blocked ||
                  options.jobs === null ||
                  (options.mode === "contact" && !contactMatches)
                }
                onChange={(event) => {
                  if (options.mode === "network" || options.contactId !== null)
                    setSelected({
                      contactId: options.mode === "network" ? null : options.contactId,
                      companyScope: options.mode === "network" ? null : options.companyScope,
                      jobId: event.currentTarget.value,
                    });
                }}
              >
                <option value="">Choose a job explicitly</option>
                {(options.jobs ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} — {item.id}
                  </option>
                ))}
              </select>
              <p>
                No job or conversation is inferred from a shared company.{" "}
                {options.jobs === null
                  ? "Stored jobs are loading or unavailable; refresh Pipeline reads before continuing."
                  : options.mode === "network"
                    ? "Only the explicitly selected active job is linked. No contact is linked; use a selected contact's Network history to add that link."
                    : !contactMatches
                      ? "Wait for current active contact details or refresh their read."
                      : "Only the selected contact is linked."}
              </p>
            </>
          ) : (
            <p>
              No contact is linked here. To link a contact explicitly, record from its Network
              history.
            </p>
          )}
          <button
            type="button"
            className="cd-button"
            data-interaction-start="true"
            disabled={blocked || scope === null}
            onClick={() => {
              if (scope === null || job === undefined) return;
              const origin = document.activeElement;
              if (
                controller.current?.start(scope, {
                  job: job.title,
                  contact: options.mode === "contact" ? (contact?.name ?? null) : null,
                })
              ) {
                setSurface({ mode: options.mode, companyScope: options.companyScope });
                requestFocus(origin);
              }
            }}
          >
            New interaction
          </button>
        </>
      ) : owned === null ? (
        <p>A draft is retained for another vault; its private fields are not shown.</p>
      ) : (
        <>
          {!sameSelection ? (
            <p>
              A draft is retained for a different job or contact. Return to its original selection,
              or explicitly discard it. Its private fields are hidden here.
            </p>
          ) : (
            <form
              aria-label="Local interaction fields"
              onSubmit={(event) => {
                event.preventDefault();
                run("save");
              }}
            >
              <p>
                Original job: <span className="cd-contact-literal">{owned.labels.job}</span> ·{" "}
                {owned.scope.jobId}.{" "}
                {owned.labels.contact === null ? (
                  "No linked contact."
                ) : (
                  <>
                    Explicit contact:{" "}
                    <span className="cd-contact-literal">{owned.labels.contact}</span> ·{" "}
                    {owned.scope.contactId}.
                  </>
                )}
              </p>
              <p>
                Original job version {owned.scope.jobRowVersion}; contact version{" "}
                {owned.scope.contactRowVersion ?? "none"}. Refreshing reads does not rebase this
                draft.
              </p>
              <fieldset disabled={owned.busy || blocked}>
                <legend>Recorded event</legend>
                <label htmlFor={`${prefix}-type`}>Interaction type</label>
                <select
                  id={`${prefix}-type`}
                  disabled={owned.phase !== "editing"}
                  value={owned.fields.type}
                  onChange={(event) => {
                    controller.current?.edit(owned.scope, "type", event.currentTarget.value);
                  }}
                >
                  {STORED_INTERACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {labels[type]}
                    </option>
                  ))}
                </select>
                <label htmlFor={`${prefix}-direction`}>Direction</label>
                <select
                  id={`${prefix}-direction`}
                  disabled={owned.phase !== "editing"}
                  value={owned.fields.direction}
                  onChange={(event) => {
                    controller.current?.edit(owned.scope, "direction", event.currentTarget.value);
                  }}
                >
                  {["unknown", "inbound", "outbound", "mutual"].map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </select>
                <label htmlFor={`${prefix}-time`}>Occurred at (optional exact UTC instant)</label>
                <input
                  id={`${prefix}-time`}
                  type="text"
                  value={owned.fields.occurredAt}
                  readOnly={owned.phase !== "editing"}
                  autoComplete="off"
                  aria-describedby={`${prefix}-time-help`}
                  onChange={(event) => {
                    if (
                      !controller.current?.edit(
                        owned.scope,
                        "occurredAt",
                        event.currentTarget.value,
                      )
                    )
                      setInputError("Use a bounded exact UTC instant; input was not truncated.");
                  }}
                />
                <p id={`${prefix}-time-help`}>
                  Leave blank to use the first valid save's local operation time. Or enter
                  YYYY-MM-DDTHH:mm:ss.sssZ. Future instants are rejected. This records history, not
                  a scheduled task.
                </p>
                <label htmlFor={`${prefix}-summary`}>Interaction summary</label>
                <textarea
                  id={`${prefix}-summary`}
                  data-interaction-input="true"
                  rows={6}
                  value={owned.fields.summary}
                  readOnly={owned.phase !== "editing"}
                  aria-describedby={`${prefix}-summary-help`}
                  onChange={(event) => {
                    setInputError(
                      controller.current?.edit(owned.scope, "summary", event.currentTarget.value)
                        ? null
                        : "Summary exceeds 200,000 characters or contains NUL. The prior text is retained without truncation.",
                    );
                  }}
                />
                <p id={`${prefix}-summary-help`}>
                  {owned.fields.summary.length} / 200,000 characters. Exact text is retained; markup
                  is inert.
                </p>
                {owned.phase === "editing" || owned.phase === "not_recorded" ? (
                  <button type="submit" className="cd-button" disabled={!currentOwner}>
                    {owned.phase === "not_recorded"
                      ? "Retry identical interaction"
                      : "Record interaction"}
                  </button>
                ) : null}
              </fieldset>
              {!currentOwner && owned.phase !== "recorded" ? (
                <p>
                  The original viewed owner/version is unavailable or changed. Check an uncertain
                  acknowledgement if needed, or discard and open a fresh draft; saving cannot rebase
                  it.
                </p>
              ) : null}
            </form>
          )}
          {sameSelection && (owned.error !== null || inputError !== null) ? (
            <p role="alert" tabIndex={-1} data-interaction-error="true">
              {inputError ?? owned.error}
            </p>
          ) : null}
          <p role="status" tabIndex={-1} data-interaction-result="true">
            {owned.busy
              ? "Waiting for the original local operation…"
              : owned.phase === "recorded"
                ? owned.recovered
                  ? "Original interaction found by a read-only check. No new write was submitted."
                  : "Interaction save acknowledged. History refresh is separate; do not repeat the save if reading fails."
                : owned.phase === "uncertain"
                  ? "Save acknowledgement uncertain. Original input is retained and locked; no automatic retry."
                  : owned.phase === "not_recorded"
                    ? "Read-only check found no original record. Only an explicit identical retry is available."
                    : "Draft retained in this session; not yet saved."}
          </p>
          {sameSelection && owned.phase === "uncertain" ? (
            <button
              type="button"
              className="cd-button"
              disabled={owned.busy || blocked}
              onClick={() => {
                run("check");
              }}
            >
              Check original acknowledgement
            </button>
          ) : null}
          {discard ? (
            <div role="group" aria-label="Discard interaction draft confirmation">
              <p>
                Discard this session draft? An uncertain interaction may already be stored. Discard
                does not remove recorded history.
              </p>
              <button
                type="button"
                className="cd-button"
                disabled={owned.busy}
                onClick={() => {
                  setDiscard(false);
                }}
              >
                Keep interaction draft
              </button>
              <button
                type="button"
                className="cd-button"
                disabled={owned.busy}
                onClick={() => {
                  const origin = document.activeElement;
                  if (controller.current?.discard(owned.scope.expectedVaultId)) {
                    setDiscard(false);
                    setInputError(null);
                    requestFocus(origin);
                  }
                }}
              >
                Confirm discard interaction draft
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="cd-button"
              disabled={owned.busy}
              onClick={() => {
                if (owned.phase === "recorded") {
                  const origin = document.activeElement;
                  if (controller.current?.discard(owned.scope.expectedVaultId))
                    requestFocus(origin);
                } else setDiscard(true);
              }}
            >
              {owned.phase === "recorded"
                ? "Close recorded interaction"
                : "Discard interaction draft"}
            </button>
          )}
        </>
      )}
    </section>,
  );
};
