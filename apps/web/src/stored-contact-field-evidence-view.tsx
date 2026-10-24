import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CONTACT_PROVENANCE_FIELDS,
  parseContactWorkspaceV1,
  type ContactProvenanceFieldName,
  type ContactWorkspaceV1,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import { restoreFocusAfterChange } from "@coredrill/ui";
import {
  createStoredContactFieldEvidenceReader,
  type StoredContactFieldEvidenceState,
} from "./stored-contact-field-evidence-reader.js";
import type { StoredContactFieldEvidenceApi } from "./stored-contact-field-evidence.js";

const labels = {
  name: "Name",
  role: "Role",
  email: "Email",
  phone: "Phone",
  public_profile_url: "Profile URL",
} as const;

/** Root-owned, explicit inspection; never a canonical value or rights decision. */
export const useStoredContactFieldEvidence = (options: {
  readonly api: StoredContactFieldEvidenceApi | undefined;
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
  const [confirmed, setConfirmed] = useState<{ owner: typeof owner; version: number } | null>(null);
  const [selection, setSelection] = useState<{
    owner: typeof owner;
    fieldName: ContactProvenanceFieldName;
  } | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const lifetime = useMemo(
    () => ({ owner, confirmed, selection, includeArchived }),
    [owner, confirmed, selection, includeArchived],
  );
  const liveLifetime = useRef(lifetime);
  liveLifetime.current = lifetime;
  const [snapshot, setSnapshot] = useState<{
    lifetime: typeof lifetime;
    state: StoredContactFieldEvidenceState;
  } | null>(null);
  const reader = useRef<{
    lifetime: typeof lifetime;
    value: ReturnType<typeof createStoredContactFieldEvidenceReader>;
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
  const ready = owner.enabled && owner.api !== undefined && confirmed?.owner === owner;
  const fieldName = selection?.owner === owner ? selection.fieldName : null;
  useEffect(() => {
    if (
      !ready ||
      owner.api === undefined ||
      owner.vaultId === null ||
      owner.contactId === null ||
      fieldName === null
    )
      return;
    const value = createStoredContactFieldEvidenceReader(
      {
        specVersion: 1,
        expectedVaultId: owner.vaultId,
        contactId: owner.contactId,
        expectedContactRowVersion: confirmed.version,
        fieldName,
        includeArchived,
        limit: 5,
      },
      owner.api.page,
      (state) => {
        if (liveLifetime.current === lifetime) setSnapshot({ lifetime, state });
      },
    );
    const current = { lifetime, value };
    reader.current = current;
    void value.first();
    return () => {
      value.dispose();
      if (reader.current === current) reader.current = null;
    };
  }, [ready, owner, confirmed, fieldName, includeArchived, lifetime]);
  const state =
    ready && fieldName !== null && snapshot?.lifetime === lifetime ? snapshot.state : null;
  return {
    owner,
    lifetime,
    fieldName,
    state,
    includeArchived,
    observeWorkspace,
    waiting: !ready,
    unavailable: !owner.enabled || owner.api === undefined,
    selectField: (field: ContactProvenanceFieldName) => {
      if (!ready || liveOwner.current !== owner || !CONTACT_PROVENANCE_FIELDS.includes(field))
        return false;
      setSelection({ owner, fieldName: field });
      return true;
    },
    setIncludeArchived,
    close: () => {
      setSelection(null);
    },
    run: async (mode: "first" | "next" | "retry") => {
      const current = reader.current;
      if (!ready || current?.lifetime !== lifetime) return false;
      const completed = await current.value[mode]();
      return completed && liveLifetime.current === lifetime && reader.current === current;
    },
  };
};

export const StoredContactFieldEvidenceView = ({
  model,
}: {
  readonly model: ReturnType<typeof useStoredContactFieldEvidence>;
}) => {
  const container = useRef<HTMLElement>(null);
  const live = useRef(model);
  live.current = model;
  const mounted = useRef(true);
  const generation = useRef(0);
  const [focusRequest, setFocusRequest] = useState<{
    owner: typeof model.owner;
    lifetime: typeof model.lifetime | null;
    origin: Element | null;
    selector: string;
    generation: number;
  } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const matches = (request: NonNullable<typeof focusRequest>, current: typeof model) =>
    mounted.current &&
    request.generation === generation.current &&
    request.owner === current.owner &&
    (request.lifetime === null
      ? current.fieldName === null
      : request.lifetime === current.lifetime);
  const withFocus = async (mode: "first" | "next" | "retry") => {
    const request = {
      owner: model.owner,
      lifetime: model.lifetime,
      origin: document.activeElement,
      selector: `[data-contact-evidence-read="${mode}"]`,
      generation: ++generation.current,
    };
    if ((await model.run(mode)) && matches(request, live.current)) setFocusRequest(request);
  };
  useLayoutEffect(() => {
    if (focusRequest === null) return;
    const request = focusRequest;
    if (!matches(request, model) || model.waiting) {
      setFocusRequest(null);
      return;
    }
    if (model.state?.busy) return;
    restoreFocusAfterChange(request.origin, () => {
      if (!matches(request, live.current)) return null;
      return (
        container.current?.querySelector<HTMLButtonElement>(
          `${request.selector}:not([disabled])`,
        ) ??
        container.current?.querySelector<HTMLButtonElement>(
          "[data-contact-evidence-read=first]:not([disabled])",
        ) ??
        null
      );
    });
    setFocusRequest(null);
  }, [focusRequest, model]);
  const page = model.state?.page ?? null;
  const blocked =
    model.waiting || model.fieldName === null || model.state === null || model.state.busy;
  return (
    <section
      ref={container}
      aria-label="Contact field source evidence"
      className="cd-contact-details"
    >
      <h3>Retained contact source evidence</h3>
      <p>
        Inspect one field's stored source text, not qualified contact details. Historical excerpts
        may contain old or unqualified values. Nothing here grants public/licensed use, changes a
        contact, visits a source or sends a message.
      </p>
      <div className="cd-stored-companies__actions">
        {CONTACT_PROVENANCE_FIELDS.map((field) => (
          <button
            className="cd-button"
            type="button"
            key={field}
            data-contact-evidence-field={field}
            aria-pressed={model.fieldName === field}
            disabled={model.waiting}
            onClick={() => {
              generation.current += 1;
              model.selectField(field);
            }}
          >
            Inspect {labels[field]} evidence
          </button>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={model.includeArchived}
          disabled={model.unavailable}
          onChange={(event) => {
            generation.current += 1;
            model.setIncludeArchived(event.currentTarget.checked);
          }}
        />{" "}
        Include archived contact in evidence
      </label>
      <p role="status" aria-live="polite">
        {model.unavailable
          ? "Source evidence is unavailable until this local vault is ready."
          : model.waiting
            ? "Waiting for the selected contact and company scope to be confirmed."
            : model.fieldName === null
              ? "Choose a field to inspect; no evidence page is selected."
              : model.state === null || model.state.busy
                ? `Reading retained ${labels[model.fieldName]} evidence…`
                : page === null
                  ? "No evidence page is available."
                  : `${String(page.items.length)} retained source records on this live page. ${page.hasMore ? "Another page is available." : "No later page was available when read."}`}
      </p>
      {model.fieldName === null ? null : (
        <>
          <h4>{labels[model.fieldName]} source inspection</h4>
          <div className="cd-stored-companies__actions">
            <button
              className="cd-button"
              type="button"
              data-contact-evidence-read="first"
              disabled={blocked}
              onClick={() => {
                void withFocus("first");
              }}
            >
              Load first evidence page / refresh
            </button>
            <button
              className="cd-button"
              type="button"
              data-contact-evidence-read="next"
              disabled={
                blocked ||
                page?.nextCursor === undefined ||
                page.nextCursor === null ||
                model.state?.error !== null
              }
              onClick={() => {
                void withFocus("next");
              }}
            >
              Next evidence page
            </button>
            {model.state?.error && !model.state.refreshRequired ? (
              <button
                className="cd-button"
                type="button"
                data-contact-evidence-read="retry"
                disabled={blocked}
                onClick={() => {
                  void withFocus("retry");
                }}
              >
                Retry evidence page
              </button>
            ) : null}
            <button
              className="cd-button"
              type="button"
              onClick={() => {
                const request = {
                  owner: model.owner,
                  lifetime: null,
                  origin: document.activeElement,
                  selector: `[data-contact-evidence-field="${model.fieldName ?? ""}"]`,
                  generation: ++generation.current,
                };
                model.close();
                setFocusRequest(request);
              }}
            >
              Close evidence inspection
            </button>
          </div>
          {model.state?.error ? <p role="alert">{model.state.error}</p> : null}
          {page !== null && (model.state?.busy || model.state?.error) ? (
            <p>Previously read evidence may be stale.</p>
          ) : null}
          <p>
            Up to five records per live page, creation newest first. This is not a total or an
            immutable snapshot. Source links are not filtered by linked job archive state.
            Public/licensed field-use eligibility is not established by this evidence read;
            manual-entry evidence is independent.
          </p>
          {page === null ? null : (
            <p>
              {page.currentValueHash === null
                ? "The current field is absent; historical evidence, if any, is retained separately."
                : "The current field is present. Its display/use basis remains separate from these source links."}
            </p>
          )}
          {page?.items.length === 0 && !blocked && model.state?.error === null ? (
            <p>
              No retained source links were found for this field in this archive scope when read. No
              source or permission was invented.
            </p>
          ) : null}
          <ol
            aria-label="Retained field evidence on this page"
            className="cd-stored-companies__list"
          >
            {page?.items.map((item) => (
              <li key={item.id} data-contact-evidence-id={item.id}>
                <h5>Retained source record {item.id}</h5>
                <p>
                  {item.matchesCurrentValue
                    ? "Exact value hash matches the stored current field; this is not verification or use permission."
                    : "Historical value hash does not match the current field (or the current field is absent)."}
                </p>
                <dl>
                  <dt>Captured at</dt>
                  <dd>{item.capturedAt}</dd>
                  <dt>Extraction method and extractor</dt>
                  <dd className="cd-contact-literal">
                    {item.method} — {item.extractorId} / {item.extractorVersion}
                  </dd>
                  <dt>Stored extraction confidence</dt>
                  <dd>{item.confidence}</dd>
                  <dt>Retained pointer</dt>
                  <dd className="cd-contact-literal">{item.pointer}</dd>
                  <dt>Retained excerpt — untrusted literal text</dt>
                  <dd className="cd-contact-literal" data-contact-evidence-excerpt={item.id}>
                    {item.excerpt === null
                      ? "No excerpt retained."
                      : item.excerpt === ""
                        ? "Empty retained excerpt."
                        : item.excerpt}
                  </dd>
                  <dt>Retained license note — not a rights decision</dt>
                  <dd className="cd-contact-literal">
                    {item.licenseNote === null
                      ? "No license note retained."
                      : item.licenseNote === ""
                        ? "Empty retained license note."
                        : item.licenseNote}
                  </dd>
                  <dt>Current source URL metadata — not capture-time authorization</dt>
                  <dd className="cd-contact-literal">{item.sourceUrl ?? "Not recorded"}</dd>
                  <dt>Current connector metadata — not contact acquisition permission</dt>
                  <dd className="cd-contact-literal">{item.connectorId ?? "Not recorded"}</dd>
                  <dt>Local evidence lineage</dt>
                  <dd className="cd-contact-literal">
                    Provenance {item.provenanceId}; snapshot {item.snapshotId}; job source{" "}
                    {item.jobSourceId}; linked job {item.jobId}.
                  </dd>
                </dl>
              </li>
            ))}
          </ol>
          <p>
            Matching hashes, confirmation flags, confidence and free-text notes do not establish
            identity, consent, public/licensed rights or hiring probability. Current non-manual
            contact values remain withheld unless a separate supported basis is established.
          </p>
        </>
      )}
    </section>
  );
};
