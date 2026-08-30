import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { VaultDeletionSettings, type VaultDeletionSettingsProps } from "../src/index.js";

const preview = Object.freeze({
  previewId: "0198f120-0000-7000-8000-000000000001",
  vaultId: "0198f120-0000-7000-8000-000000000002",
  vaultName: "Job search 2026",
  storageMode: "desktop" as const,
  inventory: Object.freeze({
    attachmentFiles: 4,
    managedBackups: 3,
    providerSecrets: 2,
    sharedAttachmentFiles: 1,
  }),
  lastSuccessfulPortableExportAt: "2026-08-29T18:00:00.000Z",
  requiredConfirmation: "DELETE Job search 2026",
}) as VaultDeletionSettingsProps["preview"];

describe("vault deletion settings", () => {
  it("renders a separated destructive action that names the target and external-archive boundary", () => {
    const onDelete = vi.fn<VaultDeletionSettingsProps["onDelete"]>();
    const markup = renderToStaticMarkup(
      createElement(VaultDeletionSettings, { preview, onDelete }),
    );

    expect(markup).toContain("Local data deletion");
    expect(markup).toContain("Delete local vault");
    expect(markup).toContain("Job search 2026");
    expect(markup).toContain("External portable archives are not changed");
    expect(markup).not.toContain("countdown");
    expect(markup).not.toContain("last chance");
    expect(onDelete).not.toHaveBeenCalled();
  });
});
