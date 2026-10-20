import type {
  JobSourceComparisonDto,
  ListingComparisonField,
  RetainedListingFact,
  RetainedListingField,
} from "@coredrill/application";

export interface ComparisonValueSelection {
  readonly analysisTime: string;
  readonly side: "before" | "after";
  readonly field: ListingComparisonField;
  readonly index: number;
  readonly key: string;
  readonly part: "comparison" | "source" | "raw";
}
export interface ComparisonLiteralValue extends ComparisonValueSelection {
  readonly snapshotId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourcePointer: string;
  readonly text: string | null;
  readonly byteLength: number | null;
  readonly byteOffset: number;
  readonly bytesRead: number;
  readonly hasMore: boolean;
}
export interface StoredListingChangesProps {
  readonly changes: JobSourceComparisonDto | null;
  readonly literal: ComparisonLiteralValue | null;
  readonly busy: boolean;
  readonly chronological: boolean;
  readonly onCompare: () => void;
  readonly onInspect: (selection: ComparisonValueSelection) => void;
  readonly onPart: (more: boolean) => void;
}
const names: Readonly<Record<ListingComparisonField, string>> = {
  requirements: "Requirements",
  compensation: "Compensation",
  deadline: "Deadline",
  locations: "Locations",
};
const states: Readonly<Record<RetainedListingField["state"], string>> = {
  known: "Comparable retained evidence",
  missing: "Unknown — no retained value",
  ambiguous: "Uncertain retained evidence",
  unavailable: "Local analysis unavailable",
};
const reasons: Readonly<Record<NonNullable<RetainedListingField["reason"]>, string>> = {
  missing_capture: "The original capture is not linked or retained for this snapshot.",
  no_candidates: "No usable field evidence was retained or extracted; absence is not inferred.",
  incomplete_normalization: "Some values cannot be normalized completely.",
  conflicting_candidates: "Retained sources disagree; no value was selected automatically.",
  extraction_uncertain:
    "Multiple postings or incomplete source-field coverage prevent a complete comparison.",
  duplicate_slots: "More than one candidate occupies a retained requirement coordinate.",
  parser_limit: "Retained text exceeds the local requirement parser's limits.",
  analysis_limit: "Retained data exceeds the local analysis limits.",
};
const preview = (text: string): string => {
  if (text.length <= 256) return text;
  let end = 256;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}… (preview; inspect the complete value)`;
};
/** Format only validated comparison derivatives; source/markup remains literal text. */
const summary = (fact: RetainedListingFact): string => {
  try {
    const value: unknown = JSON.parse(fact.valueJson);
    if (typeof value === "string") return preview(value);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return preview(fact.valueJson);
    const item = value as Record<string, unknown>;
    if (
      item["kind"] === "salary" &&
      typeof item["minimumDecimal"] === "string" &&
      typeof item["maximumDecimal"] === "string"
    )
      return preview(
        `${typeof item["currency"] === "string" ? item["currency"] : "Unknown currency"} ${item["minimumDecimal"]}–${item["maximumDecimal"]} / ${typeof item["interval"] === "string" ? item["interval"] : "unknown interval"}`,
      );
    if (item["kind"] === "date" && typeof item["date"] === "string")
      return item["precision"] === "instant" && typeof item["instant"] === "string"
        ? `${item["instant"]} (instant)`
        : `${item["date"]} (date only)`;
    if (item["kind"] === "location" && typeof item["label"] === "string")
      return preview(
        `${item["locationKind"] === "remote_region" ? "Remote eligibility: " : ""}${item["label"]} · ${typeof item["precision"] === "string" ? item["precision"] : "unknown precision"}`,
      );
    if (typeof item["category"] === "string") {
      const text = typeof item["text"] === "string" ? item["text"] : item["content"];
      if (typeof text === "string") return preview(`${item["category"]}: ${text}`);
    }
    return preview(fact.valueJson);
  } catch {
    return preview(fact.valueJson);
  }
};
const factRow = (label: string, value: string | number | null) => (
  <div key={label}>
    <dt>{label}</dt>
    <dd>{value ?? "Not recorded"}</dd>
  </div>
);

export const StoredListingChanges = ({
  changes,
  literal,
  busy,
  chronological,
  onCompare,
  onInspect,
  onPart,
}: StoredListingChangesProps) => (
  <section className="cd-stored-listing-changes" aria-label="Retained listing changes">
    <h4>Listing changes</h4>
    <p>
      Compare the explicitly selected retained pair using current local analysis. No source is
      refreshed and no confirmed value changes. These are not verified employer facts.
    </p>
    <button
      type="button"
      className="cd-button cd-button-secondary"
      data-source-compare
      disabled={busy || !chronological}
      onClick={onCompare}
    >
      Compare retained listing fields
    </button>
    {!chronological ? (
      <p role="note">
        These captures share a timestamp; change order is unknown. Choose a different pair.
      </p>
    ) : null}
    {changes === null ? (
      <p>Compare to inspect field changes. Missing evidence is never inferred to be unchanged.</p>
    ) : (
      <>
        <dl className="cd-job-source-facts">
          {factRow(
            "Earlier snapshot",
            `${changes.baselineSnapshotId} · ${changes.baselineCapturedAt}`,
          )}
          {factRow("Later snapshot", `${changes.currentSnapshotId} · ${changes.currentCapturedAt}`)}
          {factRow("Earlier original capture", changes.baselineEnvelopeId)}
          {factRow("Later original capture", changes.currentEnvelopeId)}
          {factRow(
            "Current local analysis",
            `${changes.analysis.name} ${changes.analysis.version}`,
          )}
          {factRow("Analyzed locally at", changes.analyzedAt)}
        </dl>
        <p>
          Original candidates and current JSON-LD/text analysis are labeled separately. Known means
          comparable retained evidence, not confirmation. Confidence describes extraction, not
          verification. Source values are retained or newly analyzed candidate values; Raw is a
          separate retained source value when recorded.
        </p>
        <p>
          Requirement deltas compare retained extraction or line slots, not inferred semantic
          identities between similar prose. Reordering can change slots. There is no overall score
          or zero-change claim for incomplete fields.
        </p>
        {Object.entries(changes.fields).map(([rawName, difference]) => {
          const name = rawName as ListingComparisonField;
          return (
            <section
              className="cd-stored-listing-field"
              aria-label={`${names[name]} changes`}
              key={name}
            >
              <h5>
                {names[name]} —{" "}
                {difference.kind === "not_comparable"
                  ? "Not comparable"
                  : difference.kind === "changed"
                    ? "Changed retained values"
                    : "Unchanged comparable values"}
              </h5>
              {difference.reason === "different_requirement_basis" ? (
                <p>
                  These requirement projections use different extraction/analysis bases and are not
                  treated as the same identities.
                </p>
              ) : null}
              {difference.kind !== "not_comparable" &&
              (name === "requirements" || name === "locations") ? (
                <p>
                  {name === "requirements" ? "Retained slots" : "Normalized location values"}:{" "}
                  {difference.added.length} added · {difference.removed.length} removed ·{" "}
                  {difference.changed.length} changed.
                </p>
              ) : null}
              <div className="cd-stored-listing-sides">
                {(["before", "after"] as const).map((side) => {
                  const field = difference[side];
                  return (
                    <article
                      aria-label={`${side === "before" ? "Earlier" : "Later"} ${names[name]}`}
                      key={side}
                    >
                      <h6>
                        {side === "before" ? "Earlier" : "Later"}: {states[field.state]}
                      </h6>
                      {field.reason === null ? null : <p>{reasons[field.reason]}</p>}
                      {field.state === "known" && field.items.length === 0 ? (
                        <p>Explicitly empty retained array; its absence evidence is below.</p>
                      ) : null}
                      {[...field.items, ...field.absenceEvidence].map((fact, index) => {
                        const coordinate = name === "requirements" ? fact.key : fact.valueJson;
                        const delta =
                          difference.kind === "not_comparable"
                            ? "Not evaluated"
                            : (side === "after" ? difference.added : difference.removed).includes(
                                  coordinate,
                                )
                              ? side === "after"
                                ? "Added"
                                : "Removed"
                              : difference.changed.includes(coordinate)
                                ? "Changed slot"
                                : "Retained value";
                        return (
                          <details key={`${fact.key}:${String(index)}`}>
                            <summary>
                              {delta} · {summary(fact)}
                            </summary>
                            <dl className="cd-job-source-facts">
                              {factRow(
                                "Evidence origin",
                                fact.origin === "original_candidate"
                                  ? "Original captured candidate (untrusted ingress)"
                                  : fact.origin === "current_jsonld_analysis"
                                    ? "Current local JSON-LD analysis"
                                    : "Current local text analysis",
                              )}
                              {factRow(
                                "Original candidate ID",
                                fact.candidateId ??
                                  (fact.origin === "original_candidate"
                                    ? "Not recorded"
                                    : "Not a stored candidate — current analysis"),
                              )}
                              {factRow("Source type", fact.sourceType)}
                              {factRow("Source ID", fact.sourceId)}
                              {factRow("Source pointer", fact.sourcePointer)}
                              {factRow("Source capture time", fact.capturedAt)}
                              {factRow(
                                "Analysis/extractor",
                                `${fact.extractor.name} ${fact.extractor.version}`,
                              )}
                              {factRow("Method", fact.method)}
                              {factRow("Extraction confidence (not verification)", fact.confidence)}
                              {factRow("License note", fact.licenseNote)}
                            </dl>
                            {fact.sourceExcerpt === null ? null : (
                              <p className="cd-stored-source-excerpt">
                                Source excerpt: {fact.sourceExcerpt}
                              </p>
                            )}
                            <p>Literal comparison preview: {preview(fact.valueJson)}</p>
                            <div className="cd-stored-source-actions">
                              {(["comparison", "source", "raw"] as const).map((part) => (
                                <button
                                  type="button"
                                  className="cd-button cd-button-secondary"
                                  disabled={busy}
                                  key={part}
                                  onClick={() => {
                                    onInspect({
                                      analysisTime: changes.analyzedAt,
                                      side,
                                      field: name,
                                      index,
                                      key: fact.key,
                                      part,
                                    });
                                  }}
                                >
                                  Inspect {side} {name} {part} value {index + 1}
                                </button>
                              ))}
                            </div>
                          </details>
                        );
                      })}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        {literal === null ? null : (
          <section aria-label="Comparison value inspector" data-comparison-value tabIndex={-1}>
            <h5>Complete comparison value — one literal part</h5>
            <p>
              {literal.side === "before" ? "Earlier" : "Later"} {names[literal.field]} ·{" "}
              {literal.part} · snapshot {literal.snapshotId}.
            </p>
            <p>
              Source: {literal.sourceType} {literal.sourceId} · {literal.sourcePointer}. JSON is
              displayed as inert literal text, never executed or confirmed.
            </p>
            <p>
              {literal.byteLength === null
                ? "No separate raw-candidate value was recorded for this fact. This is not JSON null or an empty string."
                : `Bytes ${String(literal.byteOffset)}–${String(literal.byteOffset + literal.bytesRead)} of ${String(literal.byteLength)} (UTF-8; end exclusive). ${literal.byteOffset > 0 || literal.hasMore ? "One bounded part, not the complete value." : "This part contains the complete value."}`}
            </p>
            {literal.text === null ? null : (
              <pre
                className="cd-stored-source-literal"
                role="region"
                aria-label="Comparison value literal part"
                tabIndex={0}
              >
                {literal.text}
              </pre>
            )}
            <div className="cd-stored-source-actions">
              <button
                type="button"
                className="cd-button cd-button-secondary"
                disabled={busy || literal.byteOffset === 0}
                onClick={() => {
                  onPart(false);
                }}
              >
                First comparison value part
              </button>
              <button
                type="button"
                className="cd-button cd-button-secondary"
                disabled={busy || !literal.hasMore}
                onClick={() => {
                  onPart(true);
                }}
              >
                Next comparison value part
              </button>
            </div>
          </section>
        )}
      </>
    )}
  </section>
);
