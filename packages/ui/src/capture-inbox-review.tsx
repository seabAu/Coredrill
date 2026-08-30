import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface CaptureInboxPreviewSection {
  readonly id: string;
  readonly label: string;
  readonly pointer: string;
  readonly format: "text" | "json";
  readonly text: string;
}

export interface CaptureInboxEvidence {
  readonly id: string;
  readonly fieldName: string;
  readonly value: string;
  readonly rawValue?: string;
  readonly method: string;
  readonly confidence: number;
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
  readonly sections: readonly CaptureInboxPreviewSection[];
  readonly evidence: readonly CaptureInboxEvidence[];
}

export interface CaptureInboxReviewProps {
  readonly items: readonly CaptureInboxPreviewItem[];
  readonly state?: "loading" | "ready" | "error";
}

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
        evidence.value.length === 0 ||
        !evidence.pointer.startsWith("/") ||
        evidence.sourceExcerpt.length === 0 ||
        !Number.isFinite(evidence.confidence) ||
        evidence.confidence < 0 ||
        evidence.confidence > 1 ||
        (evidence.targetSectionId !== null && !sectionIds.has(evidence.targetSectionId))
      ) {
        throw new RangeError("Capture preview evidence is invalid.");
      }
    }
  }
}

function titleCase(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
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

export function CaptureInboxReview({ items, state = "ready" }: CaptureInboxReviewProps) {
  validateItems(items);
  const headingId = useId();
  const previewTarget = useRef<HTMLElement | null>(null);
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
  const selectedSection =
    selectedItem?.sections.find(({ id }) => id === selectedSectionId) ??
    selectedItem?.sections[0] ??
    null;
  const selectedEvidence =
    selectedItem?.evidence.find(({ id }) => id === selectedEvidenceId) ?? null;

  useEffect(() => {
    if (navigationVersion > 0) previewTarget.current?.focus();
  }, [navigationVersion]);

  const navigate = (sectionId: string | null, evidenceId: string | null): void => {
    setSelectedSectionId(sectionId);
    setSelectedEvidenceId(evidenceId);
    setNavigationVersion((version) => version + 1);
  };

  const selectItem = (item: CaptureInboxPreviewItem): void => {
    setSelectedEnvelopeId(item.envelopeId);
    setSelectedSectionId(item.sections[0]?.id ?? null);
    setSelectedEvidenceId(null);
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
      <div className="cd-capture-review__heading">
        <div>
          <p className="cd-eyebrow">Durable local inbox</p>
          <h3 id={headingId}>Review captured evidence</h3>
        </div>
        <p>Preview text is inert. Nothing here executes or refreshes a source.</p>
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
          <aside aria-label="Capture queue" className="cd-capture-review__queue">
            <ol>
              {items.map((item) => (
                <li key={item.envelopeId}>
                  <button
                    aria-current={item.envelopeId === selectedItem.envelopeId ? "true" : undefined}
                    onClick={() => {
                      selectItem(item);
                    }}
                    type="button"
                  >
                    <strong>{item.label}</strong>
                    <span>{titleCase(item.sourceKind)}</span>
                    <small>{item.capturedAt}</small>
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <article className="cd-capture-review__preview">
            <header>
              <div>
                <p className="cd-eyebrow">{titleCase(selectedItem.captureMethod)} capture</p>
                <h4>{selectedItem.label}</h4>
              </div>
              <span className="cd-evidence-chip">Review required</span>
            </header>

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
                <div className="cd-capture-review__evidence-list">
                  {selectedItem.evidence.map((evidence) => (
                    <button
                      aria-pressed={evidence.id === selectedEvidence?.id}
                      key={evidence.id}
                      onClick={() => {
                        navigate(
                          evidence.targetSectionId ?? selectedSection?.id ?? null,
                          evidence.id,
                        );
                      }}
                      type="button"
                    >
                      <strong>{titleCase(evidence.fieldName)}</strong>
                      <span>{evidence.value}</span>
                      <small>View source | {evidence.pointer}</small>
                    </button>
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
