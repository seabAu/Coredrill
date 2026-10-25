import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  CONTACT_SOURCE_USE_ACKNOWLEDGEMENT,
  CONTACT_FIELD_USE_ACKNOWLEDGEMENT,
  contactFieldValues,
  contactResearchTextSpanV1,
  parseContactWorkspaceV1,
  parseContactUseResearchInputV1,
  parseContactUseResearchViewV1,
  parseContactFieldUseStateV1,
  type ApplicationResult,
  type ContactWorkspaceV1,
  type ContactProvenanceFieldName,
  type ContactFieldUseStateV1,
  type ContactResearchEvidenceV1,
  type ContactUseResearchInputV1,
  type ContactUseResearchViewV1,
  type ContactUseRecordReceiptV1,
  type ContactUseControlReceiptV1,
} from "@coredrill/application";
import { instant } from "@coredrill/domain";
import { restoreFocusAfterChange } from "@coredrill/ui";
import { createLocalScheduleLoader, type ScheduleLoaderState } from "./local-schedule-loader.js";
import {
  createStoredContactUseController,
  type StoredContactUseReview,
} from "./stored-contact-use-controller.js";
import type { StoredContactFieldUseApi } from "./stored-contact-field-use.js";

type Source = ContactResearchEvidenceV1["source"];
type Span = ReturnType<typeof contactResearchTextSpanV1>;
type SourcePage = Extract<ContactUseResearchViewV1, { kind: "sources" }>;
type PolicyPage = Extract<ContactUseResearchViewV1, { kind: "policies" }>;
type ReviewDetail = Extract<ContactUseResearchViewV1, { kind: "review" }>;
type Target = "sources" | "terms-sources" | "policies" | "source" | "terms" | "policy" | "review";
type Clock = "captured" | "permissionDue" | "reviewDue" | "expiry";
interface Fields {
  readonly sourceClass: string;
  readonly sourceUrl: string;
  readonly sourceText: string;
  readonly captured: string;
  readonly permissionDue: string;
  readonly reviewDue: string;
  readonly expiry: string;
  readonly capturedOccurrence: string;
  readonly permissionDueOccurrence: string;
  readonly reviewDueOccurrence: string;
  readonly expiryOccurrence: string;
  readonly zone: string;
  readonly purposeNote: string;
  readonly permissionAck: boolean;
  readonly fieldAck: boolean;
}
interface Flow {
  readonly token: object;
  readonly api: StoredContactFieldUseApi;
  readonly workspace: ContactWorkspaceV1;
  readonly companyScope: string | null;
  readonly fieldName: ContactProvenanceFieldName;
  readonly fields: Fields;
  readonly source: Source | null;
  readonly terms: Source | null;
  readonly termsSpan: Span | null;
  readonly valueSpan: Span | null;
  readonly permission: ContactResearchEvidenceV1 | null;
  readonly detail: ReviewDetail | null;
  readonly sources: SourcePage | null;
  readonly sourceTarget: "sources" | "terms-sources";
  readonly policies: PolicyPage | null;
  readonly query: {
    readonly request: ContactUseResearchInputV1;
    readonly target: Target;
    readonly busy: boolean;
    readonly error: string | null;
  } | null;
  readonly basis: ContactFieldUseStateV1 | null;
  readonly basisBusy: boolean;
  readonly basisError: string | null;
  readonly action: StoredContactUseReview | null;
  readonly preparing: boolean;
  readonly dirty: boolean;
  readonly error: string | null;
}
const labels: Record<ContactProvenanceFieldName, string> = {
  name: "Name",
  role: "Role",
  email: "Email",
  phone: "Phone",
  public_profile_url: "Profile URL",
};
const classes = {
  official_employer_page: "Official employer page",
  public_dataset: "Public dataset",
  licensed_material: "Licensed material",
};
const clockLabels: Record<Clock, string> = {
  captured: "Captured at",
  permissionDue: "Permission review deadline",
  reviewDue: "Field review deadline",
  expiry: "Field use expires at",
};
class FormError extends Error {}
const initialFields = (): Fields => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === kind)?.value ?? "";
  return Object.freeze({
    sourceClass: "",
    sourceUrl: "",
    sourceText: "",
    captured: `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`,
    permissionDue: "",
    reviewDue: "",
    expiry: "",
    capturedOccurrence: "",
    permissionDueOccurrence: "",
    reviewDueOccurrence: "",
    expiryOccurrence: "",
    zone,
    purposeNote: "",
    permissionAck: false,
    fieldAck: false,
  });
};
const limits: Partial<Record<keyof Fields, number>> = {
  sourceClass: 64,
  sourceUrl: 8192,
  sourceText: 4194304,
  captured: 23,
  permissionDue: 23,
  reviewDue: 23,
  expiry: 23,
  capturedOccurrence: 8,
  permissionDueOccurrence: 8,
  reviewDueOccurrence: 8,
  expiryOccurrence: 8,
  zone: 128,
  purposeNote: 2000,
};

/** AppShell-owned session workflow. Canonical selections come only from validated local queries. */
export const useStoredContactUseWorkflow = (options: {
  readonly api: StoredContactFieldUseApi | undefined;
  readonly vaultId: string | null;
  readonly contactId: string | null;
  readonly companyScope: string | null;
  readonly observed: ContactWorkspaceV1 | null;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly needsReopen: boolean;
  readonly mutationBlocked: boolean;
  readonly draftsBlocked: boolean;
  readonly exclusive: (
    vaultId: string,
    work: () => Promise<ApplicationResult<ContactUseRecordReceiptV1 | ContactUseControlReceiptV1>>,
  ) => Promise<ApplicationResult<ContactUseRecordReceiptV1 | ContactUseControlReceiptV1>>;
  readonly onActive: (active: boolean) => void;
  readonly onSaved: () => void;
  readonly onSelect: (contactId: string, companyScope: string | null) => void;
}) => {
  const live = useRef(options);
  live.current = options;
  const [flow, setFlow] = useState<Flow | null>(null),
    current = useRef<Flow | null>(null);
  const actor = useRef<ReturnType<typeof createStoredContactUseController> | null>(null);
  const schedule = useRef<ReturnType<typeof createLocalScheduleLoader> | null>(null);
  const [scheduleState, setScheduleState] = useState<ScheduleLoaderState>("idle");
  const [discard, setDiscard] = useState(false),
    [focusTick, setFocusTick] = useState(0),
    [clockTick, setClockTick] = useState(0);
  const queryGeneration = useRef(0),
    basisGeneration = useRef(0),
    container = useRef<HTMLElement>(null),
    sourceText = useRef<HTMLTextAreaElement>(null),
    termsText = useRef<HTMLTextAreaElement>(null);
  const focusOrigin = useRef<Element | null>(null),
    formId = useId();
  const publish = (next: Flow | null) => {
    current.current = next;
    setFlow(next);
    live.current.onActive(next !== null);
  };
  const update = (change: (value: Flow) => Flow) => {
    const value = current.current;
    if (value !== null) publish(Object.freeze(change(value)));
  };
  const selection = (value: Flow) => {
    const latest = live.current;
    return (
      latest.enabled &&
      latest.visible &&
      latest.api === value.api &&
      latest.vaultId === value.workspace.vaultId &&
      latest.contactId === value.workspace.contact.id &&
      latest.companyScope === value.companyScope
    );
  };
  const viewed = (value: Flow) => {
    const seen = live.current.observed;
    return (
      selection(value) &&
      !live.current.needsReopen &&
      seen?.vaultId === value.workspace.vaultId &&
      seen.contact.id === value.workspace.contact.id &&
      seen.contact.rowVersion === value.workspace.contact.rowVersion
    );
  };
  const writeAllowed = (value: Flow) =>
    viewed(value) &&
    !live.current.draftsBlocked &&
    (!live.current.mutationBlocked || actor.current?.current()?.busy === true);
  const editable = (value: Flow) =>
    writeAllowed(value) && value.action === null && !value.preparing && value.query?.busy !== true;
  const requestFocus = (origin: Element | null = document.activeElement) => {
    focusOrigin.current = origin;
    setFocusTick((t) => t + 1);
  };
  useEffect(() => {
    const loader = createLocalScheduleLoader(setScheduleState);
    schedule.current = loader;
    setScheduleState("idle");
    actor.current?.dispose();
    actor.current = null;
    current.current = null;
    setFlow(null);
    setDiscard(false);
    live.current.onActive(false);
    queryGeneration.current++;
    basisGeneration.current++;
    return () => {
      loader.dispose();
      if (schedule.current === loader) schedule.current = null;
      actor.current?.dispose();
      actor.current = null;
      current.current = null;
      queryGeneration.current++;
      basisGeneration.current++;
    };
  }, [options.api, options.enabled]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const value = current.current;
      if (
        value !== null &&
        (value.dirty || value.action?.busy || value.action?.phase === "uncertain")
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  useLayoutEffect(() => {
    if (focusTick === 0) return;
    const token = current.current?.token,
      origin = focusOrigin.current;
    restoreFocusAfterChange(origin, () => {
      const value = current.current;
      if (value === null || value.token !== token || !selection(value)) return null;
      if (
        origin instanceof HTMLElement &&
        origin !== document.body &&
        origin.isConnected &&
        !origin.matches(":disabled")
      )
        return origin;
      return (
        container.current?.querySelector<HTMLElement>("[data-contact-use-retry]:not([disabled])") ??
        container.current?.querySelector<HTMLElement>("[data-contact-use-status]") ??
        null
      );
    });
  }, [focusTick]);
  useEffect(() => {
    const deadline = flow?.basis?.assessment?.validUntil;
    if (deadline === undefined || deadline === null) return;
    const remaining = Date.parse(deadline) - Date.now();
    const refresh = () => {
      setClockTick((t) => t + 1);
    };
    const timer =
      remaining > 0 ? window.setTimeout(refresh, Math.min(remaining, 2147483647)) : null;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [flow?.basis, clockTick]);
  const edit = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    const model = current.current;
    if (model === null || !editable(model)) return;
    if (typeof value === "string" && value.length > (limits[key] ?? 0)) {
      update((m) => ({ ...m, error: "This input exceeds the field's supported limit." }));
      return;
    }
    update((m) => ({
      ...m,
      dirty: true,
      error: null,
      fields: Object.freeze({
        ...m.fields,
        [key]: value,
        ...(key === "captured" || key === "permissionDue" || key === "reviewDue" || key === "expiry"
          ? { [`${key}Occurrence`]: "" }
          : {}),
        ...(key === "zone"
          ? {
              capturedOccurrence: "",
              permissionDueOccurrence: "",
              reviewDueOccurrence: "",
              expiryOccurrence: "",
              permissionAck: false,
              fieldAck: false,
            }
          : {}),
        ...(key === "permissionDue" || key === "permissionDueOccurrence"
          ? { permissionAck: false }
          : {}),
        ...(key === "reviewDue" ||
        key === "expiry" ||
        key === "reviewDueOccurrence" ||
        key === "expiryOccurrence" ||
        key === "purposeNote"
          ? { fieldAck: false }
          : {}),
      }),
    }));
  };
  const clock = (model: Flow, key: Clock) => {
    const resolver = schedule.current?.resolver();
    if (resolver === null || resolver === undefined)
      throw new FormError("Load the local date helper before reviewing time inputs.");
    const resolution = resolver(model.fields[key], model.fields.zone);
    if (resolution.kind === "gap")
      throw new FormError(
        `${clockLabels[key]} does not exist in this time zone. Choose another time.`,
      );
    if (resolution.kind !== "resolved")
      throw new FormError(`Choose a valid ${clockLabels[key].toLowerCase()} and time zone.`);
    const occurrence = model.fields[`${key}Occurrence`];
    if (resolution.candidates.length > 1 && occurrence !== "earlier" && occurrence !== "later")
      throw new FormError(`Choose which occurrence of ${clockLabels[key].toLowerCase()} you mean.`);
    const result =
      resolution.candidates[occurrence === "later" ? resolution.candidates.length - 1 : 0];
    if (result === undefined) throw new FormError("The selected time could not be resolved.");
    return result;
  };
  const readBasis = async () => {
    const model = current.current;
    if (model === null || !viewed(model) || model.basisBusy || model.action?.busy) return;
    const generation = ++basisGeneration.current,
      token = model.token;
    const origin = document.activeElement;
    update((m) => ({ ...m, basisBusy: true, basisError: null }));
    try {
      const request = {
        specVersion: 1 as const,
        expectedVaultId: model.workspace.vaultId,
        contactId: model.workspace.contact.id,
        expectedContactRowVersion: model.workspace.contact.rowVersion,
        fieldName: model.fieldName,
        includeArchived: true,
      };
      const result = await model.api.readField(request);
      const latest = current.current;
      if (latest?.token !== token || generation !== basisGeneration.current) return;
      if (!selection(latest) || live.current.needsReopen || !result.ok) throw new Error();
      const basis = parseContactFieldUseStateV1(result.value, {
        ...request,
        observedAt: instant(new Date().toISOString()),
      });
      update((m) => ({ ...m, basis, basisBusy: false, basisError: null }));
      requestFocus(origin);
    } catch {
      if (current.current?.token === token && generation === basisGeneration.current) {
        update((m) => ({
          ...m,
          basis: null,
          basisBusy: false,
          basisError:
            "Current field review could not be confirmed. Refresh reads only; it never saves again.",
        }));
        requestFocus(origin);
      }
    }
  };
  const research = async (input: ContactUseResearchInputV1, target: Target) => {
    const model = current.current;
    if (
      model === null ||
      !viewed(model) ||
      model.query?.busy ||
      model.preparing ||
      model.action?.busy ||
      (model.action !== null && !["acknowledged", "matching"].includes(model.action.phase))
    )
      return;
    const request = parseContactUseResearchInputV1(input),
      token = model.token,
      generation = ++queryGeneration.current;
    const origin = document.activeElement;
    update((m) => ({ ...m, query: { request, target, busy: true, error: null }, error: null }));
    try {
      const result = await model.api.readResearch(request),
        latest = current.current;
      if (latest?.token !== token || generation !== queryGeneration.current) return;
      if (!selection(latest) || live.current.needsReopen || !result.ok) throw new Error();
      const view = parseContactUseResearchViewV1(result.value, request);
      update((m) => {
        const base = { ...m, query: { request, target, busy: false, error: null } };
        if (view.kind === "sources")
          return {
            ...base,
            sources: view,
            sourceTarget: target === "terms-sources" ? "terms-sources" : "sources",
          };
        if (view.kind === "policies") return { ...base, policies: view };
        if (view.kind === "review") return { ...base, detail: view };
        const fields = Object.freeze({ ...m.fields, permissionAck: false, fieldAck: false });
        if (target === "terms")
          return { ...base, terms: view.source, termsSpan: null, permission: null, fields };
        if (target === "policy")
          return { ...base, permission: view, terms: view.terms, termsSpan: null, fields };
        return {
          ...base,
          source: view.source,
          terms: null,
          termsSpan: null,
          valueSpan: null,
          permission: null,
          policies: null,
          detail: null,
          fields,
        };
      });
      requestFocus(origin);
    } catch {
      if (current.current?.token === token && generation === queryGeneration.current) {
        update((m) => ({
          ...m,
          query: {
            request,
            target,
            busy: false,
            error:
              "The original research read could not be confirmed. Retry reads that same scope; it does not write or rebind evidence.",
          },
        }));
        requestFocus(origin);
      }
    }
  };
  const sources = (terms = false, next = false) => {
    const m = current.current;
    if (m === null) return;
    void research(
      {
        specVersion: 1,
        kind: "sources",
        expectedVaultId: m.workspace.vaultId,
        pageSize: 10,
        cursor: next ? (m.sources?.nextCursor ?? null) : null,
      },
      terms ? "terms-sources" : "sources",
    );
  };
  const chooseSource = (source: Pick<Source, "sourceSnapshotId" | "sourceHash">, terms = false) => {
    const m = current.current;
    if (m === null) return;
    void research(
      {
        specVersion: 1,
        kind: "evidence",
        expectedVaultId: m.workspace.vaultId,
        sourceSnapshotId: source.sourceSnapshotId,
        expectedSourceHash: source.sourceHash,
        fieldName: m.fieldName,
        policyId: null,
        expectedPolicyRowVersion: null,
      },
      terms ? "terms" : "source",
    );
  };
  const policies = (next = false) => {
    const m = current.current;
    if (m?.source === null || m === null) return;
    void research(
      {
        specVersion: 1,
        kind: "policies",
        expectedVaultId: m.workspace.vaultId,
        sourceSnapshotId: m.source.sourceSnapshotId,
        expectedSourceHash: m.source.sourceHash,
        fieldName: m.fieldName,
        pageSize: 10,
        cursor: next ? (m.policies?.nextCursor ?? null) : null,
      },
      "policies",
    );
  };
  const choosePolicy = (policyId: string, rowVersion: 1 | 2) => {
    const m = current.current;
    if (m?.source === null || m === null) return;
    void research(
      {
        specVersion: 1,
        kind: "evidence",
        expectedVaultId: m.workspace.vaultId,
        sourceSnapshotId: m.source.sourceSnapshotId,
        expectedSourceHash: m.source.sourceHash,
        fieldName: m.fieldName,
        policyId,
        expectedPolicyRowVersion: rowVersion,
      },
      "policy",
    );
  };
  const inspectReview = () => {
    const m = current.current,
      review = m?.basis?.latestReview;
    if (m === null || review === undefined || review === null || m.basisError !== null) return;
    void research(
      {
        specVersion: 1,
        kind: "review",
        expectedVaultId: m.workspace.vaultId,
        contactId: m.workspace.contact.id,
        expectedContactRowVersion: m.workspace.contact.rowVersion,
        fieldName: m.fieldName,
        reviewId: review.id,
        expectedReviewRowVersion: review.rowVersion,
      },
      "review",
    );
  };
  const selectSpan = (target: "terms" | "value") => {
    const m = current.current;
    if (m === null || !editable(m)) return;
    const text = target === "terms" ? termsText.current : sourceText.current,
      source = target === "terms" ? m.terms : m.source;
    try {
      if (text === null || source === null)
        throw new FormError("Choose retained source text first.");
      const span = contactResearchTextSpanV1(source, text.selectionStart, text.selectionEnd);
      if (
        target === "value" &&
        span.excerpt !== contactFieldValues(m.workspace.contact)[m.fieldName]
      )
        throw new FormError(
          "Select text that exactly matches the stored field, including its spacing and case.",
        );
      update((value) => ({
        ...value,
        dirty: true,
        error: null,
        ...(target === "terms" ? { termsSpan: span } : { valueSpan: span }),
        fields: Object.freeze({ ...value.fields, permissionAck: false, fieldAck: false }),
      }));
    } catch (error) {
      update((value) => ({
        ...value,
        error:
          error instanceof FormError
            ? error.message
            : "Select whole characters and a bounded literal excerpt.",
      }));
    }
  };
  const prepare = async (
    kind: "source" | "policy" | "review" | "disable_policy" | "revoke_review",
  ) => {
    const model = current.current,
      controller = actor.current;
    if (model === null || controller === null || !editable(model) || model.query?.error) return;
    const token = model.token;
    const origin = document.activeElement;
    update((m) => ({ ...m, preparing: true, error: null }));
    try {
      const base = { specVersion: 1, expectedVaultId: model.workspace.vaultId };
      let payload: unknown;
      if (kind === "source") {
        const sourceClass = model.fields.sourceClass;
        if (
          sourceClass !== "official_employer_page" &&
          sourceClass !== "public_dataset" &&
          sourceClass !== "licensed_material"
        )
          throw new FormError("Choose the class of the material you supplied.");
        payload = {
          ...base,
          kind,
          sourceSnapshotId: model.api.newRecordId(),
          sourceClass,
          sourceUrl: model.fields.sourceUrl,
          capturedAt: clock(model, "captured"),
          literalText: model.fields.sourceText,
        };
      } else if (kind === "policy") {
        if (
          model.source === null ||
          model.terms === null ||
          model.termsSpan === null ||
          !model.fields.permissionAck
        )
          throw new FormError(
            "Choose the source, select its retained permission evidence and acknowledge the field-use review.",
          );
        const span = model.termsSpan;
        if (
          span.sourceSnapshotId !== model.terms.sourceSnapshotId ||
          span.sourceHash !== model.terms.sourceHash
        )
          throw new FormError("Select permission evidence from the current retained text.");
        payload = {
          ...base,
          kind,
          policyId: model.api.newRecordId(),
          sourceSnapshotId: model.source.sourceSnapshotId,
          expectedSourceHash: model.source.sourceHash,
          fieldName: model.fieldName,
          termsSnapshotId: model.terms.sourceSnapshotId,
          expectedTermsHash: model.terms.sourceHash,
          termsStartByte: span.startByte,
          termsEndByte: span.endByte,
          termsExcerpt: span.excerpt,
          permissionKind:
            model.source.sourceClass === "official_employer_page"
              ? "explicit_public_job_search_contact"
              : model.source.sourceClass === "public_dataset"
                ? "compatible_public_reuse"
                : "documented_license_grant",
          purpose: "job_search",
          reviewDueAt: clock(model, "permissionDue"),
          acknowledgement: CONTACT_SOURCE_USE_ACKNOWLEDGEMENT,
        };
      } else if (kind === "review") {
        const p = model.permission?.policy,
          span = model.valueSpan;
        if (
          model.source === null ||
          p === null ||
          p === undefined ||
          span === null ||
          model.basis === null ||
          model.basisError !== null ||
          !model.fields.fieldAck
        )
          throw new FormError(
            "Read the latest field state, choose a permission review, select the exact field excerpt and acknowledge the review.",
          );
        if (
          model.permission?.policyDisabledAt !== null ||
          model.permission.policyRowVersion !== 1 ||
          Date.parse(p.reviewDueAt) <= Date.now()
        )
          throw new FormError("Choose a current enabled permission review or record a new one.");
        if (
          p.sourceSnapshotId !== model.source.sourceSnapshotId ||
          p.expectedSourceHash !== model.source.sourceHash ||
          p.fieldName !== model.fieldName ||
          span.sourceSnapshotId !== model.source.sourceSnapshotId ||
          span.sourceHash !== model.source.sourceHash ||
          span.excerpt !== contactFieldValues(model.workspace.contact)[model.fieldName]
        )
          throw new FormError(
            "The selected field, source or permission changed. Read them again before reviewing.",
          );
        payload = {
          ...base,
          kind,
          reviewId: model.api.newRecordId(),
          contactId: model.workspace.contact.id,
          expectedContactRowVersion: model.workspace.contact.rowVersion,
          expectedLatestReviewId: model.basis.latestReview?.id ?? null,
          fieldName: model.fieldName,
          expectedValueHash: await model.api.reviewedValueHash(model.workspace, model.fieldName),
          sourceSnapshotId: model.source.sourceSnapshotId,
          expectedSourceHash: model.source.sourceHash,
          sourceStartByte: span.startByte,
          sourceEndByte: span.endByte,
          sourceExcerpt: span.excerpt,
          policyId: p.policyId,
          policyRevision: 1,
          purpose: "job_search",
          purposeNote: model.fields.purposeNote,
          reviewDueAt: clock(model, "reviewDue"),
          expiresAt: clock(model, "expiry"),
          acknowledgement: CONTACT_FIELD_USE_ACKNOWLEDGEMENT,
        };
      } else if (kind === "disable_policy") {
        const p = model.permission?.policy;
        if (p === null || p === undefined || model.permission?.policyRowVersion !== 1)
          throw new FormError("Inspect an enabled permission review first.");
        payload = {
          ...base,
          kind,
          recordId: p.policyId,
          expectedRowVersion: 1,
          sourceSnapshotId: p.sourceSnapshotId,
          expectedSourceHash: p.expectedSourceHash,
        };
      } else {
        const review = model.basis?.latestReview;
        if (review?.rowVersion !== 1 || model.basisError !== null)
          throw new FormError("Read the current unrevoked field review first.");
        payload = {
          ...base,
          kind,
          recordId: review.id,
          expectedRowVersion: 1,
          contactId: model.workspace.contact.id,
          expectedContactRowVersion: model.workspace.contact.rowVersion,
          fieldName: model.fieldName,
        };
      }
      if (current.current?.token !== token) return;
      update((m) => ({ ...m, preparing: false }));
      if (
        !controller.begin(
          model.workspace,
          model.companyScope,
          model.fieldName,
          kind === "disable_policy" || kind === "revoke_review" ? "control" : "record",
          payload,
        )
      )
        throw new FormError(
          "The original review inputs or contact scope could not be validated. Review the source URL, literal text, dates and current selection.",
        );
      requestFocus(origin);
    } catch (error) {
      if (current.current?.token === token)
        update((m) => ({
          ...m,
          preparing: false,
          error:
            error instanceof FormError
              ? error.message
              : "The original review inputs could not be validated. Nothing is automatically retried.",
        }));
    }
  };
  const run = async (mode: "submit" | "inspect") => {
    const model = current.current,
      controller = actor.current;
    if (model === null || controller === null) return;
    const origin = document.activeElement;
    const changed = await controller[mode]();
    if (current.current?.token !== model.token || actor.current !== controller) return;
    if (
      changed &&
      live.current.enabled &&
      !live.current.needsReopen &&
      live.current.api === model.api &&
      live.current.vaultId === model.workspace.vaultId
    ) {
      update((m) => ({
        ...m,
        basis: null,
        basisError: null,
        detail: null,
        fields: Object.freeze({ ...m.fields, permissionAck: false, fieldAck: false }),
        sources: null,
        policies: null,
        query: null,
        ...(m.action?.input.kind === "disable_policy" ? { permission: null } : {}),
      }));
      live.current.onSaved();
    }
    requestFocus(origin);
  };
  const open = (
    workspace: ContactWorkspaceV1,
    companyScope: string | null,
    fieldName: ContactProvenanceFieldName,
  ): boolean => {
    if (
      current.current !== null ||
      live.current.api === undefined ||
      !live.current.enabled ||
      live.current.needsReopen ||
      live.current.mutationBlocked ||
      live.current.draftsBlocked
    )
      return false;
    try {
      const copied = parseContactWorkspaceV1(workspace, {
        expectedVaultId: workspace.vaultId,
        contactId: workspace.contact.id,
        includeArchived: true,
      });
      if (contactFieldValues(copied.contact)[fieldName] === null) return false;
      const token = Object.freeze({}),
        api = live.current.api;
      const model: Flow = {
        token,
        api,
        workspace: copied,
        companyScope,
        fieldName,
        fields: initialFields(),
        source: null,
        terms: null,
        termsSpan: null,
        valueSpan: null,
        permission: null,
        detail: null,
        sources: null,
        sourceTarget: "sources",
        policies: null,
        query: null,
        basis: null,
        basisBusy: false,
        basisError: null,
        action: null,
        preparing: false,
        dirty: false,
        error: null,
      };
      if (!viewed(model)) return false;
      const controller = createStoredContactUseController({
        api: () => api,
        allowed: () => {
          const value = current.current;
          return value?.token === token && writeAllowed(value);
        },
        exclusive: (vaultId, work) => live.current.exclusive(vaultId, work),
        changed: (action) => {
          if (current.current?.token === token) update((m) => ({ ...m, action, error: null }));
        },
      });
      actor.current = controller;
      publish(Object.freeze(model));
      setDiscard(false);
      void schedule.current?.request();
      void readBasis();
      requestFocus();
      return true;
    } catch {
      return false;
    }
  };
  const close = () => {
    const m = current.current;
    if (m === null || m.action?.busy || m.preparing) return;
    if ((m.dirty || m.action?.phase === "uncertain" || m.action?.phase === "changed") && !discard) {
      setDiscard(true);
      return;
    }
    actor.current?.dispose();
    actor.current = null;
    queryGeneration.current++;
    basisGeneration.current++;
    publish(null);
    setDiscard(false);
    restoreFocusAfterChange(document.activeElement, () => {
      const latest = live.current;
      if (
        !latest.enabled ||
        !latest.visible ||
        latest.api !== m.api ||
        latest.vaultId !== m.workspace.vaultId ||
        latest.contactId !== m.workspace.contact.id ||
        latest.companyScope !== m.companyScope ||
        latest.needsReopen
      )
        return null;
      return document.querySelector<HTMLElement>(
        `[data-contact-review-field="${m.fieldName}"]:not([disabled])`,
      );
    });
  };
  const owned =
    options.enabled &&
    flow !== null &&
    flow.api === options.api &&
    flow.workspace.vaultId === options.vaultId
      ? flow
      : null;
  const same = owned !== null && selection(owned),
    available = owned !== null && viewed(owned);
  const locked = owned === null || !editable(owned),
    activeRecord = owned?.workspace.contact.archivedAt === null;
  const basis = owned?.basis;
  const currentBasis =
    available &&
    basis?.contactArchivedAt === null &&
    basis.assessment?.eligible === true &&
    basis.latestReview !== null &&
    basis.policy !== null &&
    Date.now() >=
      Math.max(Date.parse(basis.latestReview.reviewedAt), Date.parse(basis.policy.reviewedAt)) &&
    Date.now() < Date.parse(basis.assessment.validUntil)
      ? basis.assessment
      : null;
  const clockInput = (key: Clock) => {
    if (owned === null) return null;
    const resolver = schedule.current?.resolver(),
      resolution = resolver?.(owned.fields[key], owned.fields.zone);
    return (
      <div className="cd-contact-use-clock">
        <label htmlFor={`${formId}-${key}`}>{clockLabels[key]}</label>
        <input
          id={`${formId}-${key}`}
          type="datetime-local"
          step="60"
          value={owned.fields[key]}
          disabled={locked || !activeRecord}
          onChange={(event) => {
            edit(key, event.currentTarget.value);
          }}
        />
        {resolution?.kind === "gap" ? (
          <p role="alert">This local time does not exist. Choose another time.</p>
        ) : null}
        {resolution?.kind === "resolved" && resolution.candidates.length > 1 ? (
          <label>
            Which occurrence of {clockLabels[key].toLowerCase()}?
            <select
              value={owned.fields[`${key}Occurrence`]}
              disabled={locked || !activeRecord}
              onChange={(event) => {
                edit(`${key}Occurrence`, event.currentTarget.value);
              }}
            >
              <option value="">Choose an occurrence</option>
              <option value="earlier">Earlier: {resolution.candidates[0]}</option>
              <option value="later">Later: {resolution.candidates.at(-1)}</option>
            </select>
          </label>
        ) : null}
      </div>
    );
  };
  const action = owned?.action;
  const actionLabels = {
    source: "Retain source",
    policy: "Record permission review",
    review: "Record exact field review",
    disable_policy: "Disable permission review",
    revoke_review: "Revoke field review",
  };
  const view =
    !options.enabled || flow === null ? null : (
      <section
        ref={container}
        aria-label="Contact source-use review"
        className="cd-contact-use-workflow"
      >
        {owned === null ? (
          <p>
            A review is retained for another vault or retired runtime. Its private fields are
            hidden.
          </p>
        ) : !same ? (
          <p>
            A review is retained for another contact or company selection. Nothing is automatically
            resubmitted.{" "}
            <button
              className="cd-button"
              type="button"
              onClick={() => {
                options.onSelect(owned.workspace.contact.id, owned.companyScope);
              }}
            >
              Return to source-use review
            </button>
          </p>
        ) : (
          <>
            <h3>Review {labels[owned.fieldName].toLowerCase()} source use</h3>
            <p>
              Retain material, review its permitted use, then review this exact stored field for
              your job search. These are separate local decisions. Nothing fetches a source, changes
              a contact value or sends a message.
            </p>
            <p>
              Stored field under review:{" "}
              <span className="cd-contact-literal">
                {contactFieldValues(owned.workspace.contact)[owned.fieldName]}
              </span>
              . Its appearance here is for your deliberate review, not a grant of public or licensed
              use.
            </p>
            {options.needsReopen ? (
              <p role="alert">
                An archive was restored. This pre-restore draft is disabled. Deliberately reopen the
                vault before starting another review; reloading ends this session draft.
              </p>
            ) : !available ? (
              <p role="alert">
                Current contact details do not confirm this original version. Refresh the selected
                contact before continuing; the draft has not been rebound.
              </p>
            ) : null}
            {!activeRecord ? (
              <p>
                This contact is archived. New source/permission/field records are unavailable here;
                retained evidence can still be inspected and an existing review revoked.
              </p>
            ) : null}
            <p role="status" tabIndex={-1} data-contact-use-status="true">
              {owned.preparing
                ? "Validating the original review inputs…"
                : action?.busy
                  ? "Submitting or inspecting the original action. Do not repeat it."
                  : action
                    ? `Original action: ${action.phase}.`
                    : "Review inputs are session-only until an explicit action is acknowledged."}
            </p>
            {owned.error !== null ? <p role="alert">{owned.error}</p> : null}
            <button
              className="cd-button"
              type="button"
              disabled={!available || owned.basisBusy || action?.busy}
              onClick={() => {
                void readBasis();
              }}
            >
              Refresh current field review
            </button>
            {owned.basisBusy ? <p role="status">Reading current field review…</p> : null}
            {owned.basisError !== null ? <p role="alert">{owned.basisError}</p> : null}
            {owned.basis !== null ? (
              <>
                <p>
                  {owned.basis.latestReview === null
                    ? "No field-use review is recorded."
                    : `Latest review expires at ${owned.basis.latestReview.expiresAt}; ${owned.basis.latestReview.revokedAt === null ? "not revoked when read" : "revoked"}.`}
                </p>
                <p>
                  {currentBasis === null
                    ? "A current reviewed-use basis is not established. Manual-entry evidence is independent."
                    : `Current user-reviewed ${currentBasis.rightsBasis} basis is confirmed until ${currentBasis.validUntil}.`}
                </p>
              </>
            ) : null}
            {owned.basis?.latestReview ? (
              <>
                <button
                  className="cd-button"
                  type="button"
                  disabled={!available || owned.query?.busy === true || action !== null}
                  onClick={inspectReview}
                >
                  Inspect latest retained review
                </button>
                <button
                  className="cd-button"
                  type="button"
                  disabled={locked || owned.basis.latestReview.rowVersion !== 1}
                  onClick={() => {
                    void prepare("revoke_review");
                  }}
                >
                  Review revocation
                </button>
              </>
            ) : null}
            {owned.detail !== null ? (
              <details open>
                <summary>Retained latest-review evidence</summary>
                <p>
                  Recorded at {owned.detail.review.recordedAt}; review deadline{" "}
                  {owned.detail.review.reviewDueAt}; expires at {owned.detail.review.expiresAt}.{" "}
                  {owned.detail.revokedAt === null
                    ? "Not revoked when inspected."
                    : `Revoked at ${owned.detail.revokedAt}.`}
                </p>
                <p className="cd-contact-literal">
                  Source: {owned.detail.evidence.source.sourceUrl}; captured{" "}
                  {owned.detail.evidence.source.capturedAt}.
                </p>
                <p>
                  Purpose:{" "}
                  <span className="cd-contact-literal">{owned.detail.review.purposeNote}</span>
                </p>
                <p>
                  Exact field excerpt:{" "}
                  <span className="cd-contact-literal">{owned.detail.review.sourceExcerpt}</span>
                </p>
                <pre className="cd-contact-literal">{owned.detail.evidence.source.literalText}</pre>
                <p>
                  Retained permission excerpt:{" "}
                  <span className="cd-contact-literal">
                    {owned.detail.evidence.policy?.termsExcerpt}
                  </span>
                </p>
                <pre className="cd-contact-literal">{owned.detail.evidence.terms?.literalText}</pre>
                <p>This is retained user-reviewed evidence, not legal or identity verification.</p>
              </details>
            ) : null}
            <fieldset disabled={locked || !activeRecord}>
              <legend>1. Retain material you supplied</legend>
              <label htmlFor={`${formId}-class`}>Source class</label>
              <select
                id={`${formId}-class`}
                value={owned.fields.sourceClass}
                onChange={(event) => {
                  edit("sourceClass", event.currentTarget.value);
                }}
              >
                <option value="">Choose source class</option>
                {Object.entries(classes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor={`${formId}-url`}>Source URL</label>
              <input
                id={`${formId}-url`}
                type="text"
                inputMode="url"
                autoComplete="off"
                maxLength={8192}
                value={owned.fields.sourceUrl}
                onChange={(event) => {
                  edit("sourceUrl", event.currentTarget.value);
                }}
              />
              <label htmlFor={`${formId}-zone`}>Time zone for date inputs</label>
              <input
                id={`${formId}-zone`}
                type="text"
                maxLength={128}
                value={owned.fields.zone}
                onChange={(event) => {
                  edit("zone", event.currentTarget.value);
                }}
              />
              {clockInput("captured")}
              <label htmlFor={`${formId}-literal`}>Material to retain verbatim</label>
              <textarea
                id={`${formId}-literal`}
                rows={8}
                maxLength={4194304}
                value={owned.fields.sourceText}
                onChange={(event) => {
                  edit("sourceText", event.currentTarget.value);
                }}
              />
              <p>
                Only material you explicitly supply is stored. Retaining it does not establish
                permission to use a contact field.
              </p>
              <button
                className="cd-button"
                type="button"
                onClick={() => {
                  void prepare("source");
                }}
              >
                Review source retention
              </button>
            </fieldset>
            {scheduleState !== "ready" ? (
              <p role={scheduleState === "error" ? "alert" : "status"}>
                Local date helper: {scheduleState}.{" "}
                <button
                  className="cd-button"
                  type="button"
                  disabled={scheduleState === "loading"}
                  onClick={() => {
                    void schedule.current?.request();
                  }}
                >
                  Load local date helper
                </button>{" "}
                Date failures retain the draft and never silently shift a nonexistent time.
              </p>
            ) : null}
            <h4>Choose retained source and permission evidence</h4>
            <button
              className="cd-button"
              type="button"
              disabled={!available || owned.query?.busy === true || action !== null}
              onClick={() => {
                sources();
              }}
            >
              Browse retained sources
            </button>
            <button
              className="cd-button"
              type="button"
              disabled={!available || owned.query?.busy === true || action !== null}
              onClick={() => {
                sources(true);
              }}
            >
              Browse retained permission material
            </button>
            {owned.query?.busy === true ? (
              <p role="status">Reading the selected local research scope…</p>
            ) : null}
            {owned.query?.error ? (
              <p role="alert">
                {owned.query.error}{" "}
                <button
                  className="cd-button"
                  type="button"
                  disabled={!available || owned.query.busy}
                  data-contact-use-retry="true"
                  onClick={() => {
                    if (owned.query !== null)
                      void research(owned.query.request, owned.query.target);
                  }}
                >
                  Retry original research read
                </button>
              </p>
            ) : null}
            {owned.sources !== null ? (
              <div
                aria-label={
                  owned.sourceTarget === "sources"
                    ? "Retained source page"
                    : "Retained permission-material page"
                }
              >
                <ul>
                  {owned.sources.items.map((item) => (
                    <li key={item.id}>
                      <span className="cd-contact-literal">{item.sourceUrl}</span> —{" "}
                      {classes[item.sourceClass]}; captured {item.capturedAt}.{" "}
                      <button
                        className="cd-button"
                        type="button"
                        disabled={!available || owned.query?.busy === true || action !== null}
                        onClick={() => {
                          chooseSource(
                            { sourceSnapshotId: item.id, sourceHash: item.sourceHash },
                            owned.sourceTarget === "terms-sources",
                          );
                        }}
                      >
                        {owned.sourceTarget === "sources"
                          ? "Inspect and choose source"
                          : "Inspect and choose permission material"}
                      </button>
                    </li>
                  ))}
                </ul>
                {owned.sources.items.length === 0 ? <p>No retained sources in this page.</p> : null}
                <button
                  className="cd-button"
                  type="button"
                  disabled={
                    !available ||
                    owned.query?.busy === true ||
                    owned.query?.error !== null ||
                    owned.sources.nextCursor === null ||
                    action !== null
                  }
                  onClick={() => {
                    sources(owned.sourceTarget === "terms-sources", true);
                  }}
                >
                  Next retained-source page
                </button>
              </div>
            ) : null}
            {owned.source !== null ? (
              <>
                <h4>Selected retained source</h4>
                <p className="cd-contact-literal">{owned.source.sourceUrl}</p>
                <label htmlFor={`${formId}-source-body`}>Retained source text (read-only)</label>
                <textarea
                  ref={sourceText}
                  id={`${formId}-source-body`}
                  rows={8}
                  readOnly
                  className="cd-contact-literal"
                  value={owned.source.literalText}
                />
                <button
                  className="cd-button"
                  type="button"
                  disabled={locked || !activeRecord}
                  onClick={() => {
                    selectSpan("value");
                  }}
                >
                  Use selected text as exact field excerpt
                </button>
                {owned.valueSpan ? (
                  <p>
                    Selected field excerpt:{" "}
                    <span className="cd-contact-literal">{owned.valueSpan.excerpt}</span>
                  </p>
                ) : null}
                <button
                  className="cd-button"
                  type="button"
                  disabled={locked || !activeRecord}
                  onClick={() => {
                    update((m) => ({
                      ...m,
                      terms: m.source,
                      termsSpan: null,
                      permission: null,
                      fields: Object.freeze({ ...m.fields, permissionAck: false, fieldAck: false }),
                    }));
                  }}
                >
                  Use this retained source for permission evidence
                </button>
                <button
                  className="cd-button"
                  type="button"
                  disabled={!available || owned.query?.busy === true || action !== null}
                  onClick={() => {
                    policies();
                  }}
                >
                  Browse permission reviews for this field
                </button>
              </>
            ) : null}
            {owned.policies !== null ? (
              <div aria-label="Retained permission-review page">
                <ul>
                  {owned.policies.items.map((item) => (
                    <li key={item.id}>
                      Reviewed {item.reviewedAt}; due {item.reviewDueAt};{" "}
                      {item.disabledAt === null ? "not disabled" : "disabled"}.{" "}
                      <button
                        className="cd-button"
                        type="button"
                        disabled={!available || owned.query?.busy === true || action !== null}
                        onClick={() => {
                          choosePolicy(item.id, item.rowVersion);
                        }}
                      >
                        Inspect and choose permission review
                      </button>
                    </li>
                  ))}
                </ul>
                {owned.policies.items.length === 0 ? (
                  <p>No permission review for this source and field in this page.</p>
                ) : null}
                <button
                  className="cd-button"
                  type="button"
                  disabled={
                    !available ||
                    owned.query?.busy === true ||
                    owned.query?.error !== null ||
                    owned.policies.nextCursor === null ||
                    action !== null
                  }
                  onClick={() => {
                    policies(true);
                  }}
                >
                  Next permission-review page
                </button>
              </div>
            ) : null}
            {owned.permission?.policy ? (
              <details open>
                <summary>Selected canonical permission review</summary>
                <p>
                  Recorded for {labels[owned.permission.policy.fieldName]} and manual job-search
                  use; review deadline {owned.permission.policy.reviewDueAt}.{" "}
                  {owned.permission.policyDisabledAt === null
                    ? "Not disabled when inspected."
                    : "Disabled; cannot support a new field review."}
                </p>
                <p className="cd-contact-literal">{owned.permission.policy.termsExcerpt}</p>
                <p>
                  Other contacts may rely on this permission review. Disabling it withholds all
                  dependent reviewed bases; contacts and retained evidence remain.
                </p>
                <button
                  className="cd-button"
                  type="button"
                  disabled={locked || owned.permission.policyRowVersion !== 1}
                  onClick={() => {
                    void prepare("disable_policy");
                  }}
                >
                  Review disabling permission
                </button>
                <button
                  className="cd-button"
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    update((m) => ({
                      ...m,
                      permission: null,
                      termsSpan: null,
                      fields: Object.freeze({ ...m.fields, permissionAck: false, fieldAck: false }),
                    }));
                  }}
                >
                  Prepare a separate new permission review
                </button>
              </details>
            ) : null}
            {owned.terms !== null ? (
              <>
                <label htmlFor={`${formId}-terms-body`}>Retained permission text (read-only)</label>
                <textarea
                  ref={termsText}
                  id={`${formId}-terms-body`}
                  rows={8}
                  readOnly
                  className="cd-contact-literal"
                  value={owned.terms.literalText}
                />
                <button
                  className="cd-button"
                  type="button"
                  disabled={locked || !activeRecord || owned.permission !== null}
                  onClick={() => {
                    selectSpan("terms");
                  }}
                >
                  Use selected text as permission evidence
                </button>
                {owned.termsSpan ? (
                  <p>
                    Selected permission excerpt:{" "}
                    <span className="cd-contact-literal">{owned.termsSpan.excerpt}</span>
                  </p>
                ) : null}
              </>
            ) : null}
            <fieldset disabled={locked || !activeRecord || owned.permission !== null}>
              <legend>2. Record a separate permitted-use review</legend>
              {clockInput("permissionDue")}
              <label>
                <input
                  type="checkbox"
                  checked={owned.fields.permissionAck}
                  onChange={(event) => {
                    edit("permissionAck", event.currentTarget.checked);
                  }}
                />
                {CONTACT_SOURCE_USE_ACKNOWLEDGEMENT}
              </label>
              <p>
                Review the retained terms for this source, field and manual job-search purpose. A
                URL, source class or license note alone is insufficient. This records your review,
                not legal verification or connector approval.
              </p>
              <button
                className="cd-button"
                type="button"
                onClick={() => {
                  void prepare("policy");
                }}
              >
                Review permission record
              </button>
            </fieldset>
            <fieldset disabled={locked || !activeRecord}>
              <legend>3. Review this exact stored field</legend>
              <label htmlFor={`${formId}-purpose`}>Job-search purpose for this field</label>
              <textarea
                id={`${formId}-purpose`}
                rows={3}
                maxLength={2000}
                value={owned.fields.purposeNote}
                onChange={(event) => {
                  edit("purposeNote", event.currentTarget.value);
                }}
              />
              {clockInput("reviewDue")}
              {clockInput("expiry")}
              <label>
                <input
                  type="checkbox"
                  checked={owned.fields.fieldAck}
                  onChange={(event) => {
                    edit("fieldAck", event.currentTarget.checked);
                  }}
                />
                {CONTACT_FIELD_USE_ACKNOWLEDGEMENT}
              </label>
              <p>
                Expiry or revocation withholds the reviewed basis; it does not delete a contact or
                revive an older review. No identity, deliverability or outreach permission is
                verified.
              </p>
              <button
                className="cd-button"
                type="button"
                onClick={() => {
                  void prepare("review");
                }}
              >
                Review exact field record
              </button>
            </fieldset>
            {action !== null && action !== undefined ? (
              <section aria-label="Confirm original source-use action">
                <h4>{actionLabels[action.input.kind]}</h4>
                <p>
                  This action keeps the original contact, field, source, input and first submission
                  time. Editing requires closing this action review; no automatic retry or rebase
                  occurs.
                </p>
                {action.input.kind === "source" ? (
                  <>
                    <p>
                      Recorded source class: {classes[action.input.sourceClass]}; captured at{" "}
                      {action.input.capturedAt}.
                    </p>
                    <p className="cd-contact-literal">{action.input.sourceUrl}</p>
                    <pre className="cd-contact-literal">{action.input.literalText}</pre>
                  </>
                ) : action.input.kind === "policy" ? (
                  <>
                    <p>Review deadline: {action.input.reviewDueAt}</p>
                    <pre className="cd-contact-literal">{action.input.termsExcerpt}</pre>
                  </>
                ) : action.input.kind === "review" ? (
                  <>
                    <p>
                      Review deadline: {action.input.reviewDueAt}; expiry: {action.input.expiresAt}
                    </p>
                    <pre className="cd-contact-literal">{action.input.sourceExcerpt}</pre>
                    <p className="cd-contact-literal">{action.input.purposeNote}</p>
                  </>
                ) : (
                  <p>
                    The retained record and contact remain. This one-way control withholds the
                    selected reviewed basis; it does not erase source evidence or send anything.
                  </p>
                )}
                {action.error ? <p role="alert">{action.error}</p> : null}
                {action.phase === "uncertain" ? (
                  <p>
                    The write may have committed. Inspect the original operation before an explicit
                    identical retry.
                  </p>
                ) : null}
                {action.phase === "matching" ? (
                  <p>
                    Matching original stored facts were observed. This read is not attribution of
                    who caused a lifecycle change.
                  </p>
                ) : null}
                <button
                  className="cd-button"
                  type="button"
                  disabled={
                    !available ||
                    options.draftsBlocked ||
                    options.mutationBlocked ||
                    action.busy ||
                    !["review", "absent", "original_present"].includes(action.phase)
                  }
                  onClick={() => {
                    void run("submit");
                  }}
                >
                  {action.phase === "review"
                    ? `Confirm ${actionLabels[action.input.kind].toLowerCase()}`
                    : "Retry identical original action"}
                </button>
                {["uncertain", "absent", "original_present", "changed"].includes(action.phase) ? (
                  <button
                    className="cd-button"
                    type="button"
                    disabled={!available || action.busy}
                    onClick={() => {
                      void run("inspect");
                    }}
                  >
                    Inspect original action outcome
                  </button>
                ) : null}
                {action.receipt?.kind === "source" ? (
                  <button
                    className="cd-button"
                    type="button"
                    disabled={!available || owned.query?.busy === true}
                    onClick={() => {
                      if (action.receipt !== null && "sourceHash" in action.receipt)
                        chooseSource({
                          sourceSnapshotId: action.receipt.sourceSnapshotId,
                          sourceHash: action.receipt.sourceHash,
                        });
                    }}
                  >
                    Inspect retained source
                  </button>
                ) : null}
                {action.receipt?.kind === "policy" ? (
                  <button
                    className="cd-button"
                    type="button"
                    disabled={!available || owned.query?.busy === true}
                    onClick={() => {
                      if (
                        action.receipt !== null &&
                        "policyId" in action.receipt &&
                        action.receipt.policyId !== null
                      )
                        choosePolicy(action.receipt.policyId, 1);
                    }}
                  >
                    Inspect recorded permission
                  </button>
                ) : null}
                <button
                  className="cd-button"
                  type="button"
                  disabled={action.busy || ["uncertain", "changed"].includes(action.phase)}
                  onClick={() => {
                    actor.current?.close();
                    requestFocus();
                  }}
                >
                  Close this action review
                </button>
              </section>
            ) : null}
            <p>
              Draft input is session-only. Closing or reloading does not undo retained records or
              cancel a write that may already have committed.
            </p>
            <button
              className="cd-button"
              type="button"
              disabled={action?.busy === true || owned.preparing}
              onClick={close}
            >
              {discard ? "Confirm discard session review draft" : "Close source-use workspace"}
            </button>
          </>
        )}
      </section>
    );
  return Object.freeze({ open, hasDraft: flow !== null, view });
};
