import { safeParsePageCaptureSnapshot, type PageCaptureSnapshot } from "@coredrill/capture-core";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { isExtensionResponse, type ExtensionResponse } from "./messages";

interface OutboxSummary {
  readonly count: number;
  readonly bytes: number;
  readonly earliestExpiry?: string;
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
  const [snapshot, setSnapshot] = useState<PageCaptureSnapshot>();
  const [outbox, setOutbox] = useState<OutboxSummary>({ count: 0, bytes: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void sendRequest({ type: "outbox.status.v1" }).then((response) => {
      if (!active) return;
      if (response.success && response.type === "outbox.status.v1") {
        setOutbox({
          count: response.outboxCount,
          bytes: response.outboxBytes,
          ...(response.earliestExpiry === undefined
            ? {}
            : { earliestExpiry: response.earliestExpiry }),
        });
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
    const response = await sendRequest({ type: "capture.active-tab.v1" });
    if (response.success && response.type === "capture.preview.v1") {
      const parsed = safeParsePageCaptureSnapshot(response.snapshot);
      if (parsed.success) setSnapshot(parsed.data);
      else setError("The capture preview failed validation.");
    } else if (!response.success) {
      setError(response.message);
    }
    setBusy(false);
  };

  const queue = async (): Promise<void> => {
    if (snapshot === undefined) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const response = await sendRequest({ type: "capture.queue.v1", snapshot });
    if (response.success && response.type === "capture.queued.v1") {
      setOutbox({ count: response.outboxCount, bytes: response.outboxBytes });
      setNotice(`Queued locally until ${new Date(response.expiresAt).toLocaleString()}.`);
    } else if (!response.success) {
      setError(response.message);
    }
    setBusy(false);
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
        {outbox.earliestExpiry === undefined ? null : (
          <span>Earliest expiry {new Date(outbox.earliestExpiry).toLocaleDateString()}</span>
        )}
      </section>

      <button
        className="secondary"
        type="button"
        disabled={busy || outbox.count === 0}
        onClick={() => void exportOutbox()}
      >
        Export queued captures (.json)
      </button>

      <button className="primary" type="button" disabled={busy} onClick={() => void capture()}>
        {busy ? "Working…" : "Capture active job page"}
      </button>

      {snapshot === undefined ? (
        <section className="empty-state" aria-label="Capture preview">
          <p>No page preview yet.</p>
          <small>
            HTTP(S) pages only. Coredrill never reads cookies, forms, or browsing history.
          </small>
        </section>
      ) : (
        <section className="preview" aria-label="Capture preview">
          <div>
            <span>Title</span>
            <strong>{snapshot.fields.title?.value ?? "Needs review"}</strong>
          </div>
          <div>
            <span>Company</span>
            <strong>{snapshot.fields.company?.value ?? "Needs review"}</strong>
          </div>
          <div>
            <span>Source</span>
            <code>{snapshot.url}</code>
          </div>
          <div>
            <span>Selected text</span>
            <p>{snapshot.selectedText ?? "None selected"}</p>
          </div>
          <button className="secondary" type="button" disabled={busy} onClick={() => void queue()}>
            Queue this capture
          </button>
        </section>
      )}

      <div className="message-stack" aria-live="polite">
        {notice === undefined ? null : <p className="notice">{notice}</p>}
        {error === undefined ? null : <p className="error">{error}</p>}
      </div>
    </main>
  );
}
