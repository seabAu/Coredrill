import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CONTACT_PROVENANCE_FIELDS,
  contactFieldValues,
  parseContactWorkspaceV1,
  type ContactProvenanceFieldName,
  type ContactWorkspaceV1,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import { restoreFocusAfterChange } from "@coredrill/ui";
import type { StoredContactWorkspaceApi } from "./stored-contact-workspace.js";

interface ContactDetailValue {
  readonly workspace: ContactWorkspaceV1;
  readonly manual: readonly ContactProvenanceFieldName[];
}
const labels = {
  name: "Name",
  role: "Role",
  email: "Email",
  phone: "Phone",
  public_profile_url: "Profile URL",
} as const;

export const StoredContactDetails = ({
  api,
  vaultId,
  contactId,
  companyScope,
  revision,
  disabled,
  onEdit,
  onDelete,
  deletionDisabled,
  onViewCompany,
  onObserved,
}: {
  readonly api: StoredContactWorkspaceApi;
  readonly vaultId: string;
  readonly contactId: string;
  readonly companyScope: string | null;
  readonly revision: number;
  readonly disabled: boolean;
  readonly onEdit: (value: ContactWorkspaceV1) => void;
  readonly onDelete: (value: ContactWorkspaceV1) => void;
  readonly deletionDisabled: boolean;
  readonly onViewCompany: (id: string) => void;
  readonly onObserved: (value: ContactWorkspaceV1 | null) => void;
}) => {
  const owner = useMemo(
    () => ({ api, vaultId, contactId, companyScope }),
    [api, vaultId, contactId, companyScope],
  );
  const liveOwner = useRef(owner);
  liveOwner.current = owner;
  const container = useRef<HTMLElement>(null);
  const [retry, setRetry] = useState(0);
  const readOwner = useMemo(() => ({ owner, revision, retry }), [owner, revision, retry]);
  const liveReadOwner = useRef(readOwner);
  liveReadOwner.current = readOwner;
  const observed = useRef(onObserved);
  observed.current = onObserved;
  const readFocusOrigin = useRef<{
    owner: typeof owner;
    retry: number;
    origin: Element | null;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    readOwner: typeof readOwner;
    origin: Element | null;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<{
    owner: typeof owner;
    revision: number;
    retry: number;
    value: ContactDetailValue | null;
    busy: boolean;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const isActive = () => active;
    const retained = readFocusOrigin.current;
    const origin =
      retained?.owner === owner && retained.retry === retry
        ? retained.origin
        : document.activeElement;
    const restoreReadFocus = container.current?.contains(origin) === true;
    readFocusOrigin.current = restoreReadFocus ? { owner, retry, origin } : null;
    setSnapshot((prior) => ({
      owner,
      revision,
      retry,
      value: prior?.owner === owner ? prior.value : null,
      busy: true,
      error: null,
    }));
    void (async () => {
      try {
        const scope = {
          specVersion: 1 as const,
          expectedVaultId: entityId("vault", owner.vaultId),
          contactId: entityId("contact", owner.contactId),
          includeArchived: true,
        };
        const result = await owner.api.read(scope);
        if (!isActive()) return;
        if (!result.ok) throw new Error("Contact details unavailable.");
        const workspace = parseContactWorkspaceV1(result.value, scope);
        if (owner.companyScope !== null && workspace.contact.companyId !== owner.companyScope)
          throw new Error("The selected contact no longer matches this directory scope.");
        const raw: unknown = await owner.api.resolveManualFields(workspace);
        if (!isActive()) return;
        if (!Array.isArray(raw) || raw.length > CONTACT_PROVENANCE_FIELDS.length)
          throw new Error("Contact basis unavailable.");
        const values = contactFieldValues(workspace.contact);
        const manual = Object.freeze(
          raw.map((candidate: unknown) => {
            const field = CONTACT_PROVENANCE_FIELDS.find((field) => field === candidate);
            if (
              field === undefined ||
              values[field] === null ||
              typeof workspace.manualCreation?.valueHashes[field] !== "string"
            )
              throw new Error("Invalid contact basis.");
            return field;
          }),
        );
        if (new Set(manual).size !== manual.length) throw new Error("Duplicate contact basis.");
        setSnapshot({
          owner,
          revision,
          retry,
          value: Object.freeze({ workspace, manual }),
          busy: false,
          error: null,
        });
        if (liveReadOwner.current === readOwner) observed.current(workspace);
      } catch {
        if (isActive() && liveReadOwner.current === readOwner) observed.current(null);
        if (isActive())
          setSnapshot((prior) => ({
            owner,
            revision,
            retry,
            value: prior?.owner === owner ? prior.value : null,
            busy: false,
            error:
              "The selected contact or its value basis could not be read in this vault and company scope. No missing methods or evidence were invented. Refresh reads only; it does not save again.",
          }));
      } finally {
        if (isActive()) {
          if (restoreReadFocus) setFocusRequest({ readOwner, origin });
          if (readFocusOrigin.current?.owner === owner && readFocusOrigin.current.retry === retry)
            readFocusOrigin.current = null;
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [owner, readOwner, revision, retry]);
  // Hide retired-owner facts synchronously, before effect cleanup or a replacement read.
  const visible = snapshot?.owner === owner ? snapshot : null;
  // Preserve a focused read control until the effect captures it; stale facts cannot be edited.
  const busy = visible === null || visible.busy || visible.retry !== retry;
  const stale = visible?.revision !== revision;
  const value = visible?.value ?? null;
  useLayoutEffect(() => {
    if (focusRequest === null) return;
    const request = focusRequest;
    if (request.readOwner !== readOwner) {
      setFocusRequest(null);
      return;
    }
    if (busy) return;
    restoreFocusAfterChange(request.origin, () => {
      if (
        liveReadOwner.current !== request.readOwner ||
        liveOwner.current !== request.readOwner.owner
      )
        return null;
      if (
        request.origin instanceof HTMLElement &&
        container.current?.contains(request.origin) === true &&
        !request.origin.matches(":disabled")
      )
        return request.origin;
      return (
        container.current?.querySelector<HTMLButtonElement>(
          "[data-contact-detail-refresh]:not([disabled])",
        ) ?? null
      );
    });
    setFocusRequest(null);
  }, [focusRequest, readOwner, busy]);
  const facts = value === null ? null : contactFieldValues(value.workspace.contact);
  return (
    <section ref={container} aria-label="Stored contact details" className="cd-contact-details">
      <h3>Selected contact details</h3>
      <p>
        Selected lookup includes archived contacts. Archived notes are read-only. Identity-only
        directory rows are separate from this value-basis view.
      </p>
      <button
        className="cd-button"
        type="button"
        data-contact-detail-refresh="true"
        disabled={busy}
        onClick={() => {
          const next = retry + 1;
          readFocusOrigin.current = { owner, retry: next, origin: document.activeElement };
          setRetry(next);
        }}
      >
        Refresh selected contact
      </button>
      <p role="status" aria-live="polite">
        {busy || stale
          ? "Reading selected contact and value basis…"
          : value === null
            ? "No contact detail is available."
            : "Contact detail and value basis read from local storage."}
      </p>
      {visible?.error ? <p role="alert">{visible.error}</p> : null}
      {value !== null && facts !== null ? (
        <>
          {busy || stale || visible.error ? (
            <p>
              Previously read contact details may be stale. Editing is unavailable until a
              successful read.
            </p>
          ) : null}
          <h4 className="cd-contact-literal">
            {value.manual.includes("name")
              ? value.workspace.contact.name
              : "Stored contact identity"}
          </h4>
          <p>
            Only exact initial manual-entry evidence currently establishes display basis here.
            Unknown populated values are withheld, not labeled missing, public, licensed or
            verified. Source-backed provenance remains separate work.
          </p>
          <dl aria-label="Contact values and basis">
            {CONTACT_PROVENANCE_FIELDS.map((field) => (
              <div key={field}>
                <dt>{labels[field]}</dt>
                <dd data-contact-field={field} className="cd-contact-literal">
                  {facts[field] === null
                    ? "Not recorded"
                    : value.manual.includes(field)
                      ? facts[field]
                      : "Value withheld — basis not established."}
                </dd>
                {facts[field] !== null ? (
                  <dd>
                    {value.manual.includes(field)
                      ? `User-entered at ${value.workspace.manualCreation?.createdAt ?? "the initial creation"}; this exact value still matches the creation evidence.`
                      : "Stored value exists, but no supported display basis has been established here."}
                  </dd>
                ) : null}
              </div>
            ))}
            <dt>Archive state</dt>
            <dd>
              {value.workspace.contact.archivedAt === null
                ? "Active local record"
                : `Archived at ${value.workspace.contact.archivedAt}`}
            </dd>
            <dt>Stored version</dt>
            <dd>{value.workspace.contact.rowVersion}</dd>
            <dt>Stored user confirmation</dt>
            <dd>
              {value.workspace.contact.userConfirmed
                ? "Confirmed flag recorded"
                : "No confirmation flag recorded"}
            </dd>
            <dt>Stored extraction confidence</dt>
            <dd>
              {value.workspace.contact.confidence === null
                ? "Not recorded"
                : String(value.workspace.contact.confidence)}
            </dd>
          </dl>
          <p>
            Confirmation or extraction confidence is not public/license basis, identity
            verification, consent to outreach, or a hiring-probability score.
          </p>
          <h4>Contact notes</h4>
          <p className="cd-contact-literal">
            {value.workspace.contact.notes === ""
              ? "No contact notes recorded."
              : value.workspace.contact.notes}
          </p>
          <button
            className="cd-button"
            type="button"
            data-contact-start-notes="true"
            disabled={
              disabled ||
              busy ||
              stale ||
              visible.error !== null ||
              value.workspace.contact.archivedAt !== null
            }
            onClick={() => {
              onEdit(value.workspace);
            }}
          >
            Edit contact notes
          </button>
          <button
            className="cd-button"
            type="button"
            disabled={disabled || deletionDisabled || busy || stale || visible.error !== null}
            onClick={() => {
              onDelete(value.workspace);
            }}
          >
            Review contact deletion
          </button>
          {value.workspace.contact.companyId !== null ? (
            <button
              className="cd-button"
              type="button"
              disabled={disabled || busy || visible.error !== null}
              onClick={() => {
                if (value.workspace.contact.companyId !== null)
                  onViewCompany(value.workspace.contact.companyId);
              }}
            >
              View linked company
            </button>
          ) : (
            <p>No company is linked to this contact.</p>
          )}
        </>
      ) : null}
      <p>
        Contact values above do not preload source histories, relationship totals or remote
        profiles. Recorded interactions are read separately below. Nothing sends messages or
        performs enrichment.
      </p>
    </section>
  );
};
