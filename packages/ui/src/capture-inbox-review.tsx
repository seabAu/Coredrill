import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { CaptureSourceStateV1 } from "@coredrill/application";

export interface CaptureInboxPreviewSection {
  readonly id: string;
  readonly label: string;
  readonly pointer: string;
  readonly format: "text" | "json";
  readonly text: string;
}

export const CAPTURE_INBOX_FIELD_GROUPS = [
  "role_company",
  "location_work_mode",
  "compensation",
  "description",
  "requirements",
  "source_date",
  "additional",
] as const;

export type CaptureInboxFieldGroupId = (typeof CAPTURE_INBOX_FIELD_GROUPS)[number];

export interface CaptureInboxEvidence {
  readonly id: string;
  readonly fieldName: string;
  readonly fieldGroup: CaptureInboxFieldGroupId;
  readonly value: string;
  readonly rawValue?: string;
  readonly method: string;
  readonly confidence: number;
  readonly confirmationState: "unconfirmed" | "user_confirmed";
  readonly conflictState: "none" | "unresolved";
  readonly fieldCandidateCount: number;
  readonly pointer: string;
  readonly sourceExcerpt: string;
  readonly targetSectionId: string | null;
}

export interface CaptureInboxPreviewItem {
  readonly envelopeId: string;
  readonly label: string;
  readonly capturedAt: string;
  readonly captureMethod: string;
  readonly sourceKind: string;
  readonly sourceUrl: string | null;
  readonly sourceState: CaptureSourceStateV1;
  readonly sections: readonly CaptureInboxPreviewSection[];
  readonly evidence: readonly CaptureInboxEvidence[];
  readonly reviewState: "pending" | "snoozed";
  readonly snoozedUntil: string | null;
  readonly reviewRowVersion: number;
  readonly eligibleCandidateIds: readonly string[];
  readonly reviewDecisions: readonly {
    readonly fieldName: string;
    readonly selectedCandidateId: string;
    readonly disposition: "accept" | "preserve" | "review_required";
    readonly reasons: readonly string[];
  }[];
  readonly mergeTargets: readonly {
    readonly jobId: string;
    readonly title: string;
    readonly companyName: string | null;
    readonly reasons: readonly string[];
  }[];
}

export type CaptureInboxReviewAction =
  | {
      readonly kind: "save_new";
      readonly envelopeId: string;
      readonly expectedRowVersion: number;
      readonly acceptedCandidateIds: readonly string[];
    }
  | {
      readonly kind: "merge_existing";
      readonly envelopeId: string;
      readonly expectedRowVersion: number;
      readonly acceptedCandidateIds: readonly string[];
      readonly targetJobId: string;
    }
  | {
      readonly kind: "snooze" | "wake" | "discard";
      readonly envelopeId: string;
      readonly expectedRowVersion: number;
    };

export interface CaptureInboxReviewProps {
  readonly items: readonly CaptureInboxPreviewItem[];
  readonly state?: "loading" | "ready" | "error";
  readonly onAction?: (action: CaptureInboxReviewAction) => Promise<void>;
  readonly discardUndo?: { readonly tokenId: string; readonly label: string } | null;
  readonly onUndoDiscard?: (tokenId: string) => Promise<void>;
  readonly onManualFallback?: (request: {
    readonly envelopeId: string;
    readonly mode: "manual" | "paste";
    readonly sourceUrl: string | null;
  }) => void;
}

const FIELD_GROUP_LABELS: Readonly<Record<CaptureInboxFieldGroupId, string>> = Object.freeze({
  role_company: "Role & company",
  location_work_mode: "Location & work mode",
  compensation: "Compensation",
  description: "Description",
  requirements: "Requirements",
  source_date: "Source & dates",
  additional: "Additional details",
});

function safeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function validateItems(items: readonly CaptureInboxPreviewItem[]): void {
  if (
    items.length > 256 ||
    new Set(items.map(({ envelopeId }) => envelopeId)).size !== items.length
  ) {
    throw new RangeError("Capture preview items must be unique and bounded.");
  }
  for (const item of items) {
    const sectionIds = new Set(item.sections.map(({ id }) => id));
    const evidenceIds = new Set(item.evidence.map(({ id }) => id));
    if (
      item.envelopeId.length === 0 ||
      item.label.length === 0 ||
      item.sections.length > 8 ||
      item.evidence.length > 256 ||
      sectionIds.size !== item.sections.length ||
      evidenceIds.size !== item.evidence.length ||
      !["pending", "snoozed"].includes(item.reviewState) ||
      (item.reviewState === "pending" && item.snoozedUntil !== null) ||
      (item.reviewState === "snoozed" && item.snoozedUntil === null) ||
      !Number.isSafeInteger(item.reviewRowVersion) ||
      item.reviewRowVersion < 1 ||
      item.eligibleCandidateIds.length > 256 ||
      new Set(item.eligibleCandidateIds).size !== item.eligibleCandidateIds.length ||
      item.reviewDecisions.length > 256 ||
      item.mergeTargets.length > 256 ||
      !CAPTURE_SOURCE_STATE_KINDS.includes(item.sourceState.kind) ||
      (item.sourceState.kind === "blocked" && item.sourceState.promotionAllowed) ||
      (item.sourceState.manualFallback !== null &&
        !["manual", "paste"].includes(item.sourceState.manualFallback.mode)) ||
      (item.sourceUrl !== null && !safeHttpUrl(item.sourceUrl))
    ) {
      throw new RangeError("Capture preview item is invalid.");
    }
    for (const section of item.sections) {
      if (
        section.id.length === 0 ||
        section.label.length === 0 ||
        !section.pointer.startsWith("/") ||
        section.text.length === 0
      ) {
        throw new RangeError("Capture preview section is invalid.");
      }
    }
    for (const evidence of item.evidence) {
      if (
        evidence.id.length === 0 ||
        evidence.fieldName.length === 0 ||
        !CAPTURE_INBOX_FIELD_GROUPS.includes(evidence.fieldGroup) ||
        evidence.value.length === 0 ||
        !evidence.pointer.startsWith("/") ||
        evidence.sourceExcerpt.length === 0 ||
        !Number.isFinite(evidence.confidence) ||
        evidence.confidence < 0 ||
        evidence.confidence > 1 ||
        !["unconfirmed", "user_confirmed"].includes(evidence.confirmationState) ||
        !["none", "unresolved"].includes(evidence.conflictState) ||
        !Number.isInteger(evidence.fieldCandidateCount) ||
        evidence.fieldCandidateCount < 1 ||
        evidence.fieldCandidateCount > 256 ||
        (evidence.conflictState === "unresolved" && evidence.fieldCandidateCount < 2) ||
        (evidence.targetSectionId !== null && !sectionIds.has(evidence.targetSectionId))
      ) {
        throw new RangeError("Capture preview evidence is invalid.");
      }
    }
  }
}

const CAPTURE_SOURCE_STATE_KINDS = [
  "available",
  "expired",
  "changed",
  "blocked",
  "unsupported",
] as const;

function titleCase(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

function confidenceText(value: number): string {
  const percentage = value * 100;
  return `${percentage.toFixed(Number.isInteger(percentage) ? 0 : 1)}% confidence`;
}

function highlightedText(text: string, excerpt: string | undefined): ReactNode {
  if (excerpt === undefined || excerpt.length === 0) return text;
  const index = text.indexOf(excerpt);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{excerpt}</mark>
      {text.slice(index + excerpt.length)}
    </>
  );
}

export function CaptureInboxReview({
  items,
  state = "ready",
  onAction,
  discardUndo = null,
  onUndoDiscard,
  onManualFallback,
}: CaptureInboxReviewProps) {
  validateItems(items);
  const headingId = useId();
  const previewId = `${headingId}-preview`;
  const previewTarget = useRef<HTMLElement | null>(null);
  const queueButtons = useRef(new Map<string, HTMLButtonElement>());
  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState<string | null>(
    items[0]?.envelopeId ?? null,
  );
  const selectedItem =
    items.find(({ envelopeId }) => envelopeId === selectedEnvelopeId) ?? items[0] ?? null;
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    selectedItem?.sections[0]?.id ?? null,
  );
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [acceptedByEnvelope, setAcceptedByEnvelope] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [actionState, setActionState] = useState<"idle" | "busy" | "error">("idle");
  const selectedSection =
    selectedItem?.sections.find(({ id }) => id === selectedSectionId) ??
    selectedItem?.sections[0] ??
    null;
  const selectedEvidence =
    selectedItem?.evidence.find(({ id }) => id === selectedEvidenceId) ?? null;
  const selectedIndex = selectedItem === null ? -1 : items.indexOf(selectedItem);
  const evidenceGroups =
    selectedItem === null
      ? []
      : CAPTURE_INBOX_FIELD_GROUPS.map((id) => ({
          id,
          label: FIELD_GROUP_LABELS[id],
          evidence: selectedItem.evidence.filter(({ fieldGroup }) => fieldGroup === id),
        })).filter(({ evidence }) => evidence.length > 0);
  const acceptedCandidateIds =
    selectedItem === null ? [] : (acceptedByEnvelope[selectedItem.envelopeId] ?? []);
  const acceptedCandidateSet = new Set(acceptedCandidateIds);
  const acceptedTitle =
    selectedItem?.reviewDecisions.some(
      (decision) =>
        decision.fieldName === "title" &&
        acceptedCandidateSet.has(decision.selectedCandidateId) &&
        decision.disposition === "accept",
    ) ?? false;
  const remainingReviewDecisions =
    selectedItem?.reviewDecisions.filter(
      (decision) => decision.disposition === "review_required",
    ) ?? [];

  useEffect(() => {
    if (navigationVersion > 0) previewTarget.current?.focus();
  }, [navigationVersion]);

  useEffect(() => {
    setMergeTargetId(selectedItem?.mergeTargets[0]?.jobId ?? "");
    setConfirmDiscard(false);
  }, [selectedItem?.envelopeId, selectedItem?.mergeTargets]);

  const navigate = (sectionId: string | null, evidenceId: string | null): void => {
    setSelectedSectionId(sectionId);
    setSelectedEvidenceId(evidenceId);
    setNavigationVersion((version) => version + 1);
  };

  const selectItem = (item: CaptureInboxPreviewItem): void => {
    setSelectedEnvelopeId(item.envelopeId);
    setSelectedSectionId(item.sections[0]?.id ?? null);
    setSelectedEvidenceId(null);
    setMergeTargetId(item.mergeTargets[0]?.jobId ?? "");
    setConfirmDiscard(false);
    setActionState("idle");
  };

  const runAction = async (action: CaptureInboxReviewAction): Promise<void> => {
    if (onAction === undefined || actionState === "busy") return;
    setActionState("busy");
    try {
      await onAction(action);
      setActionState("idle");
      setConfirmDiscard(false);
    } catch {
      setActionState("error");
    }
  };

  const moveQueueSelection = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ): void => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = items[nextIndex];
    if (next === undefined) return;
    selectItem(next);
    queueButtons.current.get(next.envelopeId)?.focus();
  };

  const moveEvidence = (offset: number): void => {
    if (selectedItem === null || selectedItem.evidence.length === 0) return;
    const currentIndex =
      selectedEvidenceId === null
        ? 0
        : selectedItem.evidence.findIndex(({ id }) => id === selectedEvidenceId);
    const nextIndex =
      (Math.max(currentIndex, 0) + offset + selectedItem.evidence.length) %
      selectedItem.evidence.length;
    const next = selectedItem.evidence[nextIndex];
    if (next !== undefined) navigate(next.targetSectionId ?? selectedSection?.id ?? null, next.id);
  };

  return (
    <section aria-labelledby={headingId} className="cd-capture-review" data-testid="capture-review">
      {discardUndo === null ? null : (
        <div className="cd-capture-review__undo" role="status">
          <span>{discardUndo.label} was discarded.</span>
          <button
            disabled={actionState === "busy" || onUndoDiscard === undefined}
            onClick={() => {
              if (onUndoDiscard === undefined) return;
              setActionState("busy");
              void onUndoDiscard(discardUndo.tokenId)
                .then(() => {
                  setActionState("idle");
                })
                .catch(() => {
                  setActionState("error");
                });
            }}
            type="button"
          >
            Undo discard
          </button>
        </div>
      )}
      <div className="cd-capture-review__heading">
        <div>
          <p className="cd-eyebrow">Durable local inbox</p>
          <h3 id={headingId}>Review captured evidence</h3>
        </div>
        <div>
          <strong aria-live="polite">
            {items.length} {items.length === 1 ? "capture" : "captures"} awaiting review
          </strong>
          <p>Preview text is inert. Nothing here executes or refreshes a source.</p>
        </div>
      </div>

      {state === "loading" ? (
        <p aria-live="polite" className="cd-capture-review__state" role="status">
          Reading validated local captures...
        </p>
      ) : state === "error" ? (
        <p aria-live="polite" className="cd-capture-review__state is-error" role="status">
          A stored capture could not be verified for preview. No source content was rendered.
        </p>
      ) : items.length === 0 ? (
        <div className="cd-capture-review__state">
          <h4>No durable captures yet</h4>
          <p>Use Add job, Paste listing, Capture URL, or a saved file to create a review item.</p>
        </div>
      ) : selectedItem === null ? null : (
        <div className="cd-capture-review__layout">
          <aside
            aria-label={`Capture queue, ${String(items.length)} ${items.length === 1 ? "item" : "items"}`}
            className="cd-capture-review__queue"
          >
            <div className="cd-capture-review__queue-heading">
              <h4>Capture queue</h4>
              <span>
                Reviewing {String(selectedIndex + 1)} of {String(items.length)}
              </span>
            </div>
            <ol aria-label="Captures awaiting review">
              {items.map((item, index) => (
                <li key={item.envelopeId}>
                  <button
                    aria-controls={previewId}
                    aria-current={item.envelopeId === selectedItem.envelopeId ? "true" : undefined}
                    onClick={() => {
                      selectItem(item);
                    }}
                    onKeyDown={(event) => {
                      moveQueueSelection(event, index);
                    }}
                    ref={(node) => {
                      if (node === null) queueButtons.current.delete(item.envelopeId);
                      else queueButtons.current.set(item.envelopeId, node);
                    }}
                    tabIndex={item.envelopeId === selectedItem.envelopeId ? 0 : -1}
                    type="button"
                  >
                    <strong>{item.label}</strong>
                    <span>{titleCase(item.sourceKind)}</span>
                    <small>{item.capturedAt}</small>
                    {item.sourceState.kind === "available" ? null : (
                      <small>{item.sourceState.heading}</small>
                    )}
                    {item.reviewState === "snoozed" ? <small>Snoozed</small> : null}
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <article
            aria-labelledby={`${headingId}-preview-title`}
            className="cd-capture-review__preview"
            id={previewId}
          >
            <header>
              <div>
                <p className="cd-eyebrow">{titleCase(selectedItem.captureMethod)} capture</p>
                <h4 id={`${headingId}-preview-title`}>{selectedItem.label}</h4>
              </div>
              <span className="cd-evidence-chip">
                {selectedItem.reviewState === "snoozed" ? "Snoozed" : "Review required"}
              </span>
            </header>

            <section
              aria-labelledby={`${headingId}-source-state`}
              className="cd-capture-review__source-state"
              data-source-state={selectedItem.sourceState.kind}
            >
              <div>
                <p className="cd-eyebrow">Source condition</p>
                <h5 id={`${headingId}-source-state`}>{selectedItem.sourceState.heading}</h5>
                <p>{selectedItem.sourceState.explanation}</p>
                <p>{selectedItem.sourceState.retainedEvidence}</p>
                <p>No automatic refresh was performed.</p>
              </div>
              {selectedItem.sourceState.manualFallback === null ? null : (
                <div>
                  <p>{selectedItem.sourceState.manualFallback.instruction}</p>
                  <button
                    disabled={actionState === "busy" || onManualFallback === undefined}
                    onClick={() => {
                      const fallback = selectedItem.sourceState.manualFallback;
                      if (fallback === null || onManualFallback === undefined) return;
                      onManualFallback({
                        envelopeId: selectedItem.envelopeId,
                        mode: fallback.mode,
                        sourceUrl: selectedItem.sourceUrl,
                      });
                    }}
                    type="button"
                  >
                    {selectedItem.sourceState.manualFallback.label}
                  </button>
                </div>
              )}
            </section>

            <section aria-label="Review actions" className="cd-capture-review__actions">
              {selectedItem.reviewState === "snoozed" ? (
                <>
                  <p>
                    Snoozed until {selectedItem.snoozedUntil}. Return it to the inbox before saving
                    or merging.
                  </p>
                  <button
                    disabled={actionState === "busy" || onAction === undefined}
                    onClick={() => {
                      void runAction({
                        kind: "wake",
                        envelopeId: selectedItem.envelopeId,
                        expectedRowVersion: selectedItem.reviewRowVersion,
                      });
                    }}
                    type="button"
                  >
                    Return to inbox
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={
                      actionState === "busy" ||
                      !selectedItem.sourceState.promotionAllowed ||
                      selectedItem.eligibleCandidateIds.length === 0
                    }
                    onClick={() => {
                      setAcceptedByEnvelope((current) => ({
                        ...current,
                        [selectedItem.envelopeId]: selectedItem.eligibleCandidateIds,
                      }));
                    }}
                    type="button"
                  >
                    Accept high-confidence fields
                  </button>
                  <button
                    disabled={
                      actionState === "busy" ||
                      onAction === undefined ||
                      !selectedItem.sourceState.promotionAllowed ||
                      !acceptedTitle
                    }
                    onClick={() => {
                      void runAction({
                        kind: "save_new",
                        envelopeId: selectedItem.envelopeId,
                        expectedRowVersion: selectedItem.reviewRowVersion,
                        acceptedCandidateIds,
                      });
                    }}
                    type="button"
                  >
                    Save as new job
                  </button>
                  {selectedItem.mergeTargets.length === 0 ? (
                    <p>No explainable duplicate suggestion is available for merge.</p>
                  ) : (
                    <label>
                      Merge target
                      <select
                        disabled={!selectedItem.sourceState.promotionAllowed}
                        onChange={(event) => {
                          setMergeTargetId(event.target.value);
                        }}
                        value={
                          mergeTargetId.length > 0
                            ? mergeTargetId
                            : selectedItem.mergeTargets[0]?.jobId
                        }
                      >
                        {selectedItem.mergeTargets.map((target) => (
                          <option key={target.jobId} value={target.jobId}>
                            {target.title}
                            {target.companyName === null ? "" : ` at ${target.companyName}`}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={
                          actionState === "busy" ||
                          onAction === undefined ||
                          !selectedItem.sourceState.promotionAllowed
                        }
                        onClick={() => {
                          const targetJobId =
                            mergeTargetId.length > 0
                              ? mergeTargetId
                              : (selectedItem.mergeTargets[0]?.jobId ?? "");
                          if (targetJobId.length === 0) return;
                          void runAction({
                            kind: "merge_existing",
                            envelopeId: selectedItem.envelopeId,
                            expectedRowVersion: selectedItem.reviewRowVersion,
                            acceptedCandidateIds,
                            targetJobId,
                          });
                        }}
                        type="button"
                      >
                        Merge into selected job
                      </button>
                    </label>
                  )}
                  <button
                    disabled={actionState === "busy" || onAction === undefined}
                    onClick={() => {
                      void runAction({
                        kind: "snooze",
                        envelopeId: selectedItem.envelopeId,
                        expectedRowVersion: selectedItem.reviewRowVersion,
                      });
                    }}
                    type="button"
                  >
                    Snooze one week
                  </button>
                </>
              )}
              {confirmDiscard ? (
                <div role="alert">
                  <span>Discard this review item? You can undo immediately.</span>
                  <button
                    disabled={actionState === "busy" || onAction === undefined}
                    onClick={() => {
                      void runAction({
                        kind: "discard",
                        envelopeId: selectedItem.envelopeId,
                        expectedRowVersion: selectedItem.reviewRowVersion,
                      });
                    }}
                    type="button"
                  >
                    Confirm discard
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDiscard(false);
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setConfirmDiscard(true);
                  }}
                  type="button"
                >
                  Discard
                </button>
              )}
              {remainingReviewDecisions.length === 0 ? null : (
                <details>
                  <summary>
                    {remainingReviewDecisions.length} field
                    {remainingReviewDecisions.length === 1 ? "" : "s"} still need review
                  </summary>
                  <ul>
                    {remainingReviewDecisions.map((decision) => (
                      <li key={`${decision.fieldName}:${decision.selectedCandidateId}`}>
                        {titleCase(decision.fieldName)}: {decision.reasons.join(", ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {actionState === "error" ? (
                <p aria-live="assertive" className="is-error" role="alert">
                  The review action failed safely. Refresh the local queue and try again.
                </p>
              ) : null}
            </section>

            <dl className="cd-capture-review__metadata">
              <div>
                <dt>Envelope</dt>
                <dd>{selectedItem.envelopeId}</dd>
              </div>
              <div>
                <dt>Source kind</dt>
                <dd>{titleCase(selectedItem.sourceKind)}</dd>
              </div>
              <div>
                <dt>Captured</dt>
                <dd>{selectedItem.capturedAt}</dd>
              </div>
              <div>
                <dt>Source URL</dt>
                <dd>{selectedItem.sourceUrl ?? "Not supplied"}</dd>
              </div>
            </dl>

            {selectedItem.sections.length === 0 ? null : (
              <nav aria-label="Snapshot locations" className="cd-capture-review__locations">
                {selectedItem.sections.map((section) => (
                  <button
                    aria-pressed={section.id === selectedSection?.id && selectedEvidence === null}
                    key={section.id}
                    onClick={() => {
                      navigate(section.id, null);
                    }}
                    type="button"
                  >
                    <span>Jump to {section.label}</span>
                    <code>{section.pointer}</code>
                  </button>
                ))}
              </nav>
            )}

            {selectedItem.evidence.length === 0 ? null : (
              <section
                aria-labelledby={`${headingId}-evidence`}
                className="cd-capture-review__evidence"
              >
                <div className="cd-capture-review__subheading">
                  <div>
                    <p className="cd-eyebrow">Field candidates</p>
                    <h5 id={`${headingId}-evidence`}>Source excerpts and paths</h5>
                  </div>
                  {selectedItem.evidence.length > 1 ? (
                    <div>
                      <button
                        aria-label="Previous source evidence"
                        className="cd-icon-button"
                        onClick={() => {
                          moveEvidence(-1);
                        }}
                        type="button"
                      >
                        {"\u2190"}
                      </button>
                      <button
                        aria-label="Next source evidence"
                        className="cd-icon-button"
                        onClick={() => {
                          moveEvidence(1);
                        }}
                        type="button"
                      >
                        {"\u2192"}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="cd-capture-review__field-groups">
                  {evidenceGroups.map((group) => (
                    <section
                      aria-labelledby={`${headingId}-field-group-${group.id}`}
                      className="cd-capture-review__field-group"
                      key={group.id}
                    >
                      <div className="cd-capture-review__field-group-heading">
                        <h6 id={`${headingId}-field-group-${group.id}`}>{group.label}</h6>
                        <span>
                          {group.evidence.length}{" "}
                          {group.evidence.length === 1 ? "candidate" : "candidates"}
                        </span>
                      </div>
                      <div className="cd-capture-review__evidence-list">
                        {group.evidence.map((evidence) => (
                          <article
                            className="cd-capture-review__candidate"
                            data-conflict={evidence.conflictState}
                            key={evidence.id}
                          >
                            <div className="cd-capture-review__candidate-heading">
                              <strong>{titleCase(evidence.fieldName)}</strong>
                              <span
                                className={
                                  evidence.confirmationState === "user_confirmed"
                                    ? "cd-evidence-chip is-confirmed"
                                    : "cd-evidence-chip"
                                }
                              >
                                {evidence.confirmationState === "user_confirmed"
                                  ? "User confirmed"
                                  : "Needs user confirmation"}
                              </span>
                            </div>
                            <p>{evidence.value}</p>
                            <div className="cd-capture-review__candidate-facts">
                              <span>Method: {titleCase(evidence.method)}</span>
                              <span>{confidenceText(evidence.confidence)}</span>
                              {evidence.conflictState === "unresolved" ? (
                                <span className="is-conflict">
                                  Unresolved conflict · {String(evidence.fieldCandidateCount)}{" "}
                                  candidates
                                </span>
                              ) : (
                                <span>No conflicting value retained</span>
                              )}
                            </div>
                            <blockquote>{evidence.sourceExcerpt}</blockquote>
                            {selectedItem.eligibleCandidateIds.includes(evidence.id) ? (
                              <label>
                                <input
                                  checked={acceptedCandidateSet.has(evidence.id)}
                                  disabled={!selectedItem.sourceState.promotionAllowed}
                                  onChange={(event) => {
                                    setAcceptedByEnvelope((current) => {
                                      const selected = new Set(
                                        current[selectedItem.envelopeId] ?? [],
                                      );
                                      if (event.target.checked) selected.add(evidence.id);
                                      else selected.delete(evidence.id);
                                      return {
                                        ...current,
                                        [selectedItem.envelopeId]: [...selected],
                                      };
                                    });
                                  }}
                                  type="checkbox"
                                />
                                Accept for save
                              </label>
                            ) : null}
                            <button
                              aria-pressed={evidence.id === selectedEvidence?.id}
                              onClick={() => {
                                navigate(
                                  evidence.targetSectionId ?? selectedSection?.id ?? null,
                                  evidence.id,
                                );
                              }}
                              type="button"
                            >
                              <span>View source for {titleCase(evidence.fieldName)}</span>
                              <code>{evidence.pointer}</code>
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            )}

            <section
              aria-label="Active source location"
              className="cd-capture-review__source"
              data-source-pointer={selectedEvidence?.pointer ?? selectedSection?.pointer ?? "none"}
              ref={previewTarget}
              tabIndex={-1}
            >
              {selectedEvidence === null ? null : (
                <div className="cd-capture-review__active-evidence">
                  <p className="cd-eyebrow">Active field evidence</p>
                  <h5>{titleCase(selectedEvidence.fieldName)}</h5>
                  <dl>
                    <div>
                      <dt>Captured value</dt>
                      <dd>{selectedEvidence.value}</dd>
                    </div>
                    <div>
                      <dt>Source path</dt>
                      <dd>
                        <code>{selectedEvidence.pointer}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Method</dt>
                      <dd>
                        {titleCase(selectedEvidence.method)} |{" "}
                        {Math.round(selectedEvidence.confidence * 100)}%
                      </dd>
                    </div>
                  </dl>
                  <blockquote>
                    <mark>{selectedEvidence.sourceExcerpt}</mark>
                  </blockquote>
                </div>
              )}
              {selectedSection === null ? (
                <p>
                  No captured body was retained. Field excerpts and source paths remain available.
                </p>
              ) : (
                <Fragment key={selectedSection.id}>
                  <div className="cd-capture-review__source-heading">
                    <div>
                      <p className="cd-eyebrow">Inert snapshot content</p>
                      <h5>{selectedSection.label}</h5>
                    </div>
                    <code>{selectedSection.pointer}</code>
                  </div>
                  <pre data-source-format={selectedSection.format}>
                    {highlightedText(selectedSection.text, selectedEvidence?.sourceExcerpt)}
                  </pre>
                </Fragment>
              )}
            </section>
          </article>
        </div>
      )}
    </section>
  );
}
