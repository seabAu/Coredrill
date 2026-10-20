import type {
  JobSourceContentChunkDto,
  JobSourceContentKind,
  JobSourceEvidenceDto,
  JobSourceEvidencePageDto,
  JobSourceEvidenceValueChunkDto,
  JobSourceSnapshotMetadataDto,
  JobSourceSnapshotPageDto,
  SourceEvidenceValuePart,
  JobSourceComparisonDto,
} from "@coredrill/application";
import {
  StoredListingChanges,
  type ComparisonLiteralValue,
  type ComparisonValueSelection,
} from "./stored-listing-changes.js";

export type StoredSourceSlot = "primary" | "comparison";
export interface StoredSourcePane {
  readonly snapshot: JobSourceSnapshotMetadataDto;
  readonly content: JobSourceContentChunkDto;
  readonly evidence: JobSourceEvidencePageDto;
  readonly value: JobSourceEvidenceValueChunkDto | null;
}
export interface StoredJobSourceModel {
  readonly jobId: string;
  readonly history: JobSourceSnapshotPageDto | null;
  readonly primary: StoredSourcePane | null;
  readonly comparison: StoredSourcePane | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly listingChanges: JobSourceComparisonDto | null;
  readonly comparisonLiteral: ComparisonLiteralValue | null;
}
export interface StoredJobSourceProps {
  readonly model: StoredJobSourceModel;
  readonly onReload: () => void;
  readonly onRetry: () => void;
  readonly onHistoryMore: () => void;
  readonly onCompare: () => void;
  readonly onComparisonInspect: (selection: ComparisonValueSelection) => void;
  readonly onComparisonPart: (more: boolean) => void;
  readonly onSelect: (slot: StoredSourceSlot, id: string) => void;
  readonly onContent: (slot: StoredSourceSlot, kind: JobSourceContentKind, more: boolean) => void;
  readonly onEvidencePage: (slot: StoredSourceSlot, more: boolean) => void;
  readonly onValue: (
    slot: StoredSourceSlot,
    item: JobSourceEvidenceDto,
    part: SourceEvidenceValuePart,
    more: boolean,
  ) => void;
}
const fact = (label: string, value: string | number | null) => (
  <div key={label}>
    <dt>{label}</dt>
    <dd>{value ?? "Not recorded"}</dd>
  </div>
);
const literal = (text: string | null, label: string) =>
  text === null ? (
    <p>No retained value for this part.</p>
  ) : (
    <pre className="cd-stored-source-literal" role="region" aria-label={label} tabIndex={0}>
      {text === "" ? "[Retained empty text]" : text}
    </pre>
  );
const bytePosition = (value: {
  readonly byteOffset: number;
  readonly bytesRead: number;
  readonly byteLength: number | null;
}) =>
  value.byteLength === null
    ? "No retained bytes."
    : `Bytes ${String(value.byteOffset)}–${String(value.byteOffset + value.bytesRead)} of ${String(value.byteLength)} (UTF-8; end exclusive).`;

/** Inert local evidence only. No action can fetch, confirm or render captured markup. */
export const StoredJobSource = (props: StoredJobSourceProps) => {
  const { model } = props;
  const { history, primary, comparison, busy } = model;
  const select = (slot: StoredSourceSlot, pane: StoredSourcePane | null) => {
    const items = [...(history?.items ?? [])];
    if (pane !== null && !items.some(({ id }) => id === pane.snapshot.id))
      items.unshift(pane.snapshot);
    return (
      <label>
        {slot === "primary" ? "Snapshot to inspect" : "Second snapshot to inspect"}
        <select
          aria-label={slot === "primary" ? "Snapshot to inspect" : "Second snapshot to inspect"}
          disabled={busy || history === null}
          value={pane?.snapshot.id ?? ""}
          onChange={(event) => {
            props.onSelect(slot, event.target.value);
          }}
        >
          <option value="">
            {slot === "comparison" ? "No paired inspection" : "Choose a retained snapshot"}
          </option>
          {items.map((item) => (
            <option
              key={item.id}
              value={item.id}
              disabled={
                (slot === "primary" ? comparison?.snapshot.id : primary?.snapshot.id) === item.id
              }
            >
              {item.capturedAt} · {item.id}
            </option>
          ))}
        </select>
      </label>
    );
  };
  const renderPane = (slot: StoredSourceSlot, pane: StoredSourcePane) => {
    const { snapshot, content, evidence, value } = pane;
    const source = snapshot.currentSource;
    const inspected =
      value === null
        ? undefined
        : evidence.items.find(
            (item) => item.kind === value.evidenceKind && item.id === value.evidenceId,
          );
    return (
      <article
        className="cd-stored-source-pane"
        aria-label={slot === "primary" ? "Selected retained snapshot" : "Paired retained snapshot"}
        data-source-snapshot={snapshot.id}
      >
        <h4>{slot === "primary" ? "Selected retained snapshot" : "Paired retained snapshot"}</h4>
        <dl className="cd-job-source-facts">
          {fact("Snapshot ID", snapshot.id)}
          {fact("Captured at", snapshot.capturedAt)}
          {fact("Saved locally at", snapshot.createdAt)}
          {fact("Extractor", `${snapshot.extractorId} ${snapshot.extractorVersion}`)}
          {fact("Recorded capture fingerprint", snapshot.contentHash)}
          {fact("Retention class", snapshot.retentionClass)}
        </dl>
        <details>
          <summary>Current source metadata at history read time</summary>
          <p>
            These source URLs, observation times and primary flag are current stored metadata, not a
            historical snapshot of those fields.
          </p>
          <dl className="cd-job-source-facts">
            {fact("Source ID", source.id)}
            {fact("Connector", source.connectorId)}
            {fact("External ID", source.externalId)}
            {fact("Canonical URL (not visited)", source.canonicalUrl)}
            {fact("Apply URL (not visited)", source.applyUrl)}
            {fact("First observed", source.firstSeenAt)}
            {fact("Last observed", source.lastSeenAt)}
            {fact("Primary source", source.primary ? "Yes" : "No")}
          </dl>
        </details>
        <section aria-label={`${slot} retained content`}>
          <h5>Retained content — literal part</h5>
          <label>
            Retained content kind
            <select
              aria-label={`${slot} retained content kind`}
              disabled={busy}
              value={content.kind}
              onChange={(event) => {
                const kind = event.target.value;
                if (kind === "text" || kind === "markup" || kind === "structured")
                  props.onContent(slot, kind, false);
              }}
            >
              <option value="text">Text</option>
              <option value="markup">Markup as inert text</option>
              <option value="structured">Structured JSON as inert text</option>
            </select>
          </label>
          <p>
            {bytePosition(content)}{" "}
            {content.byteOffset > 0 || content.hasMore
              ? "This is one bounded part, not the complete retained body."
              : "This part contains the complete retained body when present."}
          </p>
          {literal(content.text, `${slot} literal retained content`)}
          <div className="cd-stored-source-actions">
            <button
              type="button"
              className="cd-button cd-button-secondary"
              disabled={busy || content.byteOffset === 0}
              onClick={() => {
                props.onContent(slot, content.kind, false);
              }}
            >
              First content part
            </button>
            <button
              type="button"
              className="cd-button cd-button-secondary"
              disabled={busy || !content.hasMore}
              onClick={() => {
                props.onContent(slot, content.kind, true);
              }}
            >
              Next content part
            </button>
          </div>
        </section>
        <section aria-label={`${slot} retained field provenance`}>
          <h5>Retained field candidates and requirements</h5>
          <p>
            Creation order is newest first. Review annotations below are current when read, not
            their state at capture time. An unsuperseded candidate is not proof of the job's current
            resolved value.
          </p>
          {evidence.items.length === 0 ? (
            <p>No field candidates or accepted requirement records are linked to this snapshot.</p>
          ) : null}
          {evidence.items.map((item) => (
            <details key={`${item.kind}:${item.id}`} data-source-evidence={item.id}>
              <summary>
                {item.kind === "field-value"
                  ? `Field candidate: ${item.fieldName}`
                  : `Requirement source category: ${item.sourceCategory}`}{" "}
                · {item.id}
              </summary>
              <dl className="cd-job-source-facts">
                {fact("Evidence kind", item.kind)}
                {fact("Created at", item.createdAt)}
                {fact("Provenance ID", item.provenance.id)}
                {fact("Method", item.provenance.method)}
                {fact("Extraction confidence (not verification)", item.provenance.confidence)}
                {fact("Source pointer", item.provenance.pointer)}
                {fact("Source excerpt", item.provenance.excerpt)}
                {fact("Captured at", item.provenance.capturedAt)}
                {fact("License note", item.provenance.licenseNote)}
                {fact("Current review updated at", item.currentReview.updatedAt)}
                {fact("Current row version", item.currentReview.rowVersion)}
                {item.kind === "field-value" ? (
                  <>
                    {fact("Confirmation ID", item.currentReview.confirmation?.id ?? null)}
                    {fact("Confirmed at", item.currentReview.confirmation?.confirmedAt ?? null)}
                    {fact(
                      "Recorded confirmed-value hash",
                      item.currentReview.confirmation?.confirmedValueHash ?? null,
                    )}
                    {fact("Superseded by candidate", item.currentReview.supersededBy?.id ?? null)}
                    {fact(
                      "Replacement snapshot",
                      item.currentReview.supersededBy?.snapshotId ?? null,
                    )}
                  </>
                ) : (
                  <>
                    {fact("Current reviewed category", item.currentReview.category)}
                    {fact("User confirmed", item.currentReview.userConfirmed ? "Yes" : "No")}
                  </>
                )}
              </dl>
              <p>
                Normalized {item.normalized.format} preview ·{" "}
                {item.normalized.complete ? "Complete preview" : "Incomplete preview"} ·{" "}
                {item.normalized.byteLength} UTF-8 bytes total.
              </p>
              {literal(item.normalized.text, `${slot} normalized evidence preview`)}
              <p>
                Raw preview:{" "}
                {item.raw === null
                  ? "not retained"
                  : `${item.raw.complete ? "complete" : "incomplete"}, ${String(item.raw.byteLength)} UTF-8 bytes total`}
                .
              </p>
              {item.raw === null ? null : literal(item.raw.text, `${slot} raw evidence preview`)}
              <div className="cd-stored-source-actions">
                <button
                  className="cd-button cd-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    props.onValue(slot, item, "normalized", false);
                  }}
                >
                  Inspect normalized value
                </button>
                <button
                  className="cd-button cd-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    props.onValue(slot, item, "raw", false);
                  }}
                >
                  Inspect raw value
                </button>
              </div>
            </details>
          ))}
          <button
            className="cd-button cd-button-secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              props.onEvidencePage(slot, false);
            }}
          >
            Reload first evidence page
          </button>
          <button
            className="cd-button cd-button-secondary"
            type="button"
            disabled={busy || !evidence.hasMore}
            onClick={() => {
              props.onEvidencePage(slot, true);
            }}
          >
            Next evidence page
          </button>
          {value === null ? null : (
            <section aria-label={`${slot} full serialized evidence value`}>
              <h5>Serialized value — literal part</h5>
              <p>
                {value.evidenceKind} {value.evidenceId} · {value.part} · {value.format} · provenance{" "}
                {value.provenanceId} · row version {value.rowVersion}.
              </p>
              <p>{bytePosition(value)} No parsed object or verified fact is implied.</p>
              {inspected !== undefined &&
              inspected.currentReview.rowVersion !== value.rowVersion ? (
                <p role="note">
                  Review annotations changed since this evidence page. Reload evidence to see
                  current annotations; this value names the version actually read.
                </p>
              ) : null}
              {value.byteOffset > 0 || value.hasMore ? (
                <p>
                  This is one bounded part, not the whole value. Use First/Next to inspect all
                  parts.
                </p>
              ) : null}
              {literal(value.text, `${slot} full value literal part`)}
              <div className="cd-stored-source-actions">
                <button
                  className="cd-button cd-button-secondary"
                  type="button"
                  disabled={busy || value.byteOffset === 0}
                  onClick={() => {
                    const item = evidence.items.find(
                      (candidate) =>
                        candidate.kind === value.evidenceKind && candidate.id === value.evidenceId,
                    );
                    if (item !== undefined) props.onValue(slot, item, value.part, false);
                  }}
                >
                  First value part
                </button>
                <button
                  className="cd-button cd-button-secondary"
                  type="button"
                  disabled={busy || !value.hasMore}
                  onClick={() => {
                    const item = evidence.items.find(
                      (candidate) =>
                        candidate.kind === value.evidenceKind && candidate.id === value.evidenceId,
                    );
                    if (item !== undefined) props.onValue(slot, item, value.part, true);
                  }}
                >
                  Next value part
                </button>
              </div>
            </section>
          )}
        </section>
      </article>
    );
  };
  return (
    <section
      className="cd-job-content-section cd-stored-job-source"
      aria-label="Stored job Source"
      aria-busy={busy}
    >
      <h3>Source and provenance</h3>
      <p>
        Read-only local evidence. Viewing never visits source URLs, refreshes a listing, executes
        markup or changes confirmed values.
      </p>
      <div className="cd-stored-source-actions">
        <button
          className="cd-button cd-button-secondary"
          type="button"
          data-source-reload
          disabled={busy}
          onClick={props.onReload}
        >
          Reload newest history and reset selection
        </button>
        <button
          className="cd-button cd-button-secondary"
          type="button"
          disabled={busy || !(history?.hasMore ?? false)}
          onClick={props.onHistoryMore}
        >
          Next snapshot page
        </button>
      </div>
      {busy || (history === null && model.error === null) ? (
        <p role="status">Loading local Source evidence…</p>
      ) : null}
      {model.error === null ? null : (
        <div role="alert">
          <p>{model.error} Previously loaded evidence remains below and may be stale.</p>
          <button
            className="cd-button cd-button-secondary"
            type="button"
            disabled={busy}
            onClick={props.onRetry}
          >
            Retry Source read
          </button>
        </div>
      )}
      {history !== null && history.items.length === 0 ? (
        <p>No retained snapshots are linked to this job.</p>
      ) : null}
      <div className="cd-stored-source-selectors">
        {select("primary", primary)}
        {select("comparison", comparison)}
      </div>
      {primary !== null && comparison !== null ? (
        <aside aria-label="Retained snapshot fingerprint inspection" className="cd-job-policy-note">
          <p>
            Explicitly inspecting snapshots {primary.snapshot.id} and {comparison.snapshot.id}.
          </p>
          <p>
            {primary.snapshot.contentHash === comparison.snapshot.contentHash
              ? "Recorded capture fingerprints are the same."
              : "Recorded capture fingerprints differ."}{" "}
            These are recorded capture identities, not newly calculated body-integrity certificates.
          </p>
          <p>
            Compare the selected retained fields below; no absent field is inferred to be unchanged.
          </p>
        </aside>
      ) : null}
      {primary !== null && comparison !== null ? (
        <StoredListingChanges
          changes={model.listingChanges ?? null}
          literal={model.comparisonLiteral ?? null}
          busy={busy}
          chronological={primary.snapshot.capturedAt !== comparison.snapshot.capturedAt}
          onCompare={props.onCompare}
          onInspect={props.onComparisonInspect}
          onPart={props.onComparisonPart}
        />
      ) : (
        <p>Select a second retained snapshot to compare listing fields.</p>
      )}
      <div className="cd-stored-source-panes">
        {primary === null ? null : renderPane("primary", primary)}
        {comparison === null ? null : renderPane("comparison", comparison)}
      </div>
    </section>
  );
};
