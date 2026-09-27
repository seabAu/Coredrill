import {
  EXTENSION_CAPTURE_DRAFT_LIMITS,
  safeParseExtensionCaptureDraftV1,
  type ExtensionCaptureDraftV1,
} from "@coredrill/capture-core";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import {
  PRODUCTION_EXTENSION_STATE_CATALOG_V1,
  ProductionExtensionState,
  classifyCapturedPageV1,
  resolveProductionExtensionStateV1,
  type ProductionExtensionStateAction,
  type ProductionExtensionStateKind,
} from "./capture-state";
import { createCapturePreviewV1 } from "./capture-preview";
import { isExtensionResponse, type ExtensionResponse } from "./messages";
import { COREDRILL_PHASE0_APP_ORIGIN } from "./transfer-policy";

interface OutboxSummary {
  readonly count: number;
  readonly bytes: number;
  readonly earliestExpiry: string | null;
  readonly expiringSoonCount: number;
  readonly nextRetryAt: string | null;
  readonly retryExhaustedCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function sendRequest(message: unknown): Promise<ExtensionResponse> {
  const response: unknown = await browser.runtime.sendMessage(message);
  if (!isExtensionResponse(response)) {
    return {
      success: false,
      type: "extension.error.v1",
      code: "response_invalid",
      message: "The privileged extension boundary returned an invalid response.",
    };
  }
  return response;
}

export function CapturePanel(): React.JSX.Element {
  const [draft, setDraft] = useState<ExtensionCaptureDraftV1>();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [outbox, setOutbox] = useState<OutboxSummary>({
    count: 0,
    bytes: 0,
    earliestExpiry: null,
    expiringSoonCount: 0,
    nextRetryAt: null,
    retryExhaustedCount: 0,
  });
  const [captureState, setCaptureState] = useState<ProductionExtensionStateKind>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void sendRequest({ type: "outbox.status.v2" }).then((response) => {
      if (!active) return;
      if (response.success && response.type === "outbox.status.v2") {
        setOutbox({
          count: response.outboxCount,
          bytes: response.outboxBytes,
          earliestExpiry: response.earliestExpiry,
          expiringSoonCount: response.expiringSoonCount,
          nextRetryAt: response.nextRetryAt,
          retryExhaustedCount: response.retryExhaustedCount,
        });
        if (response.removedExpired > 0) {
          setNotice(
            `${String(response.removedExpired)} expired capture${response.removedExpired === 1 ? " was" : "s were"} removed from the bounded outbox.`,
          );
        }
        if (response.outboxCount > 0) {
          setCaptureState(
            resolveProductionExtensionStateV1({
              specVersion: 1,
              permission: "available",
              recognition: "unrecognized",
              transfer: "queued",
            }),
          );
        }
      } else if (!response.success) {
        setError(response.message);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const capture = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const response = await sendRequest({ type: "capture.active-tab.v2" });
    if (response.success && response.type === "capture.preview-draft.v1") {
      const parsed = safeParseExtensionCaptureDraftV1(response.draft);
      if (parsed.success) {
        const previousDraft = draft;
        setDraft(parsed.data);
        if (previousDraft === undefined) {
          setTitle(parsed.data.snapshot.fields.title?.value ?? "");
          setCompany(parsed.data.snapshot.fields.company?.value ?? "");
        }
        setCaptureState(
          resolveProductionExtensionStateV1({
            specVersion: 1,
            permission: "available",
            recognition: classifyCapturedPageV1(parsed.data.snapshot),
            transfer: "idle",
          }),
        );
      } else setError("The capture preview failed validation.");
    } else if (!response.success) {
      setError(response.message);
      if (response.code === "capture_permission_needed") {
        setCaptureState(
          resolveProductionExtensionStateV1({
            specVersion: 1,
            permission: "needed",
            recognition: "unrecognized",
            transfer: "idle",
          }),
        );
      }
    }
    setBusy(false);
  };

  const queue = async (): Promise<void> => {
    if (draft === undefined) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const normalizedTitle = title.trim();
    const normalizedCompany = company.trim();
    const normalizedNote = note.trim();
    const queuedDraft = {
      ...draft,
      ...((normalizedTitle !== "" && normalizedTitle !== draft.snapshot.fields.title?.value) ||
      (normalizedCompany !== "" && normalizedCompany !== draft.snapshot.fields.company?.value)
        ? {
            corrections: {
              ...(normalizedTitle === "" || normalizedTitle === draft.snapshot.fields.title?.value
                ? {}
                : { title: normalizedTitle }),
              ...(normalizedCompany === "" ||
              normalizedCompany === draft.snapshot.fields.company?.value
                ? {}
                : { company: normalizedCompany }),
            },
          }
        : {}),
      ...(normalizedNote === "" ? {} : { note: normalizedNote }),
    } satisfies ExtensionCaptureDraftV1;
    const parsedDraft = safeParseExtensionCaptureDraftV1(queuedDraft);
    if (!parsedDraft.success) {
      setError(parsedDraft.issue);
      setBusy(false);
      return;
    }
    const response = await sendRequest({ type: "capture.queue-draft.v1", draft: parsedDraft.data });
    if (response.success && response.type === "capture.queued.v1") {
      setOutbox({
        count: response.outboxCount,
        bytes: response.outboxBytes,
        earliestExpiry: response.expiresAt,
        expiringSoonCount: 0,
        nextRetryAt: null,
        retryExhaustedCount: 0,
      });
      setNotice(`Queued locally until ${new Date(response.expiresAt).toLocaleString()}.`);
      setCaptureState(
        resolveProductionExtensionStateV1({
          specVersion: 1,
          permission: "available",
          recognition: "unrecognized",
          transfer: "queued",
        }),
      );
    } else if (!response.success) {
      setError(response.message);
    }
    setBusy(false);
  };

  const openWorkspace = async (): Promise<void> => {
    await browser.tabs.create({ url: `${COREDRILL_PHASE0_APP_ORIGIN}/pipeline?view=inbox` });
  };

  const handleStateAction = (action: ProductionExtensionStateAction): void => {
    switch (action.id) {
      case "capture-selected-text":
      case "choose-page-text":
      case "request-temporary-access":
        void capture();
        break;
      case "capture-page-manually":
      case "send-to-workspace":
        void queue();
        break;
      case "export-capture":
        void exportOutbox();
        break;
      case "retry-transfer":
      case "open-workspace":
      case "open-inbox":
      case "continue-manually":
        void openWorkspace();
        break;
      case "close":
        window.close();
        break;
    }
  };

  const exportOutbox = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const response = await sendRequest({ type: "outbox.export.v1" });
    if (response.success && response.type === "outbox.export.v1") {
      const url = URL.createObjectURL(
        new Blob([response.json], { type: "application/json;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Export created. Captures remain queued until Coredrill acknowledges them.");
    } else if (!response.success) {
      setError(response.message);
    }
    setBusy(false);
  };

  const displayedDraft =
    draft === undefined
      ? undefined
      : ({
          ...draft,
          ...((title.trim() !== "" && title.trim() !== draft.snapshot.fields.title?.value) ||
          (company.trim() !== "" && company.trim() !== draft.snapshot.fields.company?.value)
            ? {
                corrections: {
                  ...(title.trim() === "" || title.trim() === draft.snapshot.fields.title?.value
                    ? {}
                    : { title: title.trim() }),
                  ...(company.trim() === "" ||
                  company.trim() === draft.snapshot.fields.company?.value
                    ? {}
                    : { company: company.trim() }),
                },
              }
            : {}),
        } satisfies ExtensionCaptureDraftV1);
  const preview = displayedDraft === undefined ? undefined : createCapturePreviewV1(displayedDraft);
  const queued = captureState === "queued" || captureState === "transferred";

  return (
    <main className="panel-shell">
      <header>
        <p className="eyebrow">Coredrill Capture</p>
        <h1>Review this job</h1>
        <p className="lede">
          Nothing is captured until you choose the active page. Review the preview before it enters
          the local outbox.
        </p>
      </header>

      <section className="outbox-summary" aria-label="Local outbox status">
        <span>{outbox.count} queued</span>
        <span>{formatBytes(outbox.bytes)}</span>
        {outbox.earliestExpiry === null ? null : (
          <span>Earliest expiry {new Date(outbox.earliestExpiry).toLocaleDateString()}</span>
        )}
        {outbox.nextRetryAt === null ? null : (
          <span>Next transfer retry {new Date(outbox.nextRetryAt).toLocaleTimeString()}</span>
        )}
      </section>

      {outbox.expiringSoonCount === 0 ? null : (
        <p className="notice" role="status">
          {outbox.expiringSoonCount === 1
            ? "One queued capture expires within 24 hours. Export it now if Coredrill cannot acknowledge it."
            : `${String(outbox.expiringSoonCount)} queued captures expire within 24 hours. Export them now if Coredrill cannot acknowledge them.`}
        </p>
      )}
      {outbox.retryExhaustedCount === 0 ? null : (
        <p className="error" role="alert">
          Automatic retries are exhausted for {String(outbox.retryExhaustedCount)} capture
          {outbox.retryExhaustedCount === 1 ? "" : "s"}. Export remains available.
        </p>
      )}

      {captureState === undefined ? (
        <button className="primary" type="button" disabled={busy} onClick={() => void capture()}>
          {busy ? "Working…" : "Capture active job page"}
        </button>
      ) : (
        <ProductionExtensionState
          busy={busy}
          model={PRODUCTION_EXTENSION_STATE_CATALOG_V1[captureState]}
          onAction={handleStateAction}
        />
      )}

      {preview === undefined ? (
        <section className="empty-state" aria-label="Capture preview">
          <p>No page preview yet.</p>
          <small>
            HTTP(S) pages only. Coredrill never reads cookies, forms, or browsing history.
          </small>
        </section>
      ) : (
        <section className="preview" aria-label="Provisional capture preview">
          <div className="preview__intro" role="note">
            <strong>Provisional preview</strong>
            <span>Edits stay unconfirmed and retain the originally detected evidence.</span>
          </div>

          <label className="preview__field">
            <span>Title</span>
            <input
              data-testid="capture-title"
              disabled={queued}
              maxLength={EXTENSION_CAPTURE_DRAFT_LIMITS.maxCorrectionCharacters}
              onChange={(event) => {
                setTitle(event.currentTarget.value);
              }}
              value={title}
            />
            <small>
              {preview.title.origin === "user"
                ? "User correction · provisional"
                : preview.title.confidence === undefined
                  ? "Needs review"
                  : `Detected · ${String(Math.round(preview.title.confidence * 100))}% confidence`}
            </small>
          </label>

          <label className="preview__field">
            <span>Company</span>
            <input
              data-testid="capture-company"
              disabled={queued}
              maxLength={EXTENSION_CAPTURE_DRAFT_LIMITS.maxCorrectionCharacters}
              onChange={(event) => {
                setCompany(event.currentTarget.value);
              }}
              value={company}
            />
            <small>
              {preview.company.origin === "user"
                ? "User correction · provisional"
                : preview.company.confidence === undefined
                  ? "Needs review"
                  : `Detected · ${String(Math.round(preview.company.confidence * 100))}% confidence`}
            </small>
          </label>

          <dl className="preview__facts">
            <div>
              <dt>Location</dt>
              <dd data-testid="capture-location">{preview.location ?? "Not detected"}</dd>
            </div>
            <div>
              <dt>Salary</dt>
              <dd data-testid="capture-salary">{preview.salary ?? "Not detected"}</dd>
            </div>
            <div>
              <dt>Detected source</dt>
              <dd data-testid="capture-source">
                {preview.source.signal} · {preview.source.hostname}
              </dd>
            </div>
            <div>
              <dt>Source confidence</dt>
              <dd data-testid="capture-confidence">
                {preview.confidence === undefined
                  ? "Not available"
                  : `${String(Math.round(preview.confidence * 100))}% minimum detected-field confidence`}
              </dd>
            </div>
            <div>
              <dt>Capture freshness</dt>
              <dd>
                <time data-testid="capture-freshness" dateTime={preview.capturedAt}>
                  {preview.freshness}
                </time>
                <small>Capture time only; this does not prove the listing is still current.</small>
              </dd>
            </div>
          </dl>

          <div className="preview__selection">
            <span>Selected page text</span>
            <p data-testid="capture-selected-text">{preview.selectedText ?? "None selected"}</p>
            <button
              className="secondary"
              disabled={busy || queued}
              onClick={() => void capture()}
              type="button"
            >
              Recapture selected page text
            </button>
          </div>

          <label className="preview__field">
            <span>Local capture note</span>
            <textarea
              data-testid="capture-note"
              disabled={queued}
              maxLength={EXTENSION_CAPTURE_DRAFT_LIMITS.maxNoteCharacters}
              onChange={(event) => {
                setNote(event.currentTarget.value);
              }}
              placeholder="Add context for Inbox review"
              rows={4}
              value={note}
            />
            <small>
              {note.length}/{EXTENSION_CAPTURE_DRAFT_LIMITS.maxNoteCharacters} · retained locally as
              user-authored provisional evidence
            </small>
          </label>
        </section>
      )}

      <div className="message-stack" aria-live="polite">
        {notice === undefined ? null : <p className="notice">{notice}</p>}
        {error === undefined ? null : <p className="error">{error}</p>}
      </div>
    </main>
  );
}
