import type { PreparedVaultExportDto } from "@coredrill/application";

/** A browser handoff is not a saved-file acknowledgement. Never used on native. */
export const createBrowserVaultExportHandoff = (runtime: "browser" | "native") =>
  runtime === "native"
    ? undefined
    : (artifact: PreparedVaultExportDto) => {
        const url = URL.createObjectURL(
          new Blob([Uint8Array.from(artifact.bytes)], { type: artifact.mediaType }),
        );
        const anchor = document.createElement("a");
        anchor.download = artifact.fileName;
        anchor.href = url;
        try {
          document.body.append(anchor);
          anchor.click();
          return Promise.resolve(Object.freeze({ status: "download_handoff" as const }));
        } finally {
          anchor.remove();
          // Let the browser consume the URL; cancellation/blocked downloads remain unconfirmed.
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 1_000);
        }
      };
