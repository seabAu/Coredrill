import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VaultRestorePanel, type VaultRestorePanelState } from "../src/vault-restore.js";

const idle: VaultRestorePanelState = {
  ownerId: null,
  phase: "idle",
  busy: false,
  preview: null,
  confirmed: false,
  message: "No archive selected",
  error: null,
};
const render = (state = idle, runtime: "browser" | "native" = "browser", headingLevel: 2 | 3 = 3) =>
  renderToStaticMarkup(
    createElement(VaultRestorePanel, {
      state,
      runtime,
      blocked: false,
      headingLevel,
      onFile: () => {},
      onNativeSelect: () => {},
      onConfirm: () => {},
      onCommit: () => {},
      onDiscard: () => {},
      onReopen: () => {},
    }),
  );
describe("portable restore presentation", () => {
  it("uses H2 under a page H1 and H3 inside Settings, without changing the named region", () => {
    expect(render(idle, "browser", 2)).toMatch(/<h2[^>]*>Restore portable archive<\/h2>/);
    expect(render()).toMatch(/<h3[^>]*>Restore portable archive<\/h3>/);
    expect(render(idle, "browser", 2)).toContain('aria-label="Portable vault restore"');
  });
  it("keeps browser file and native picker controls separate and never implies selection is a restore", () => {
    expect(render()).toContain('type="file"');
    expect(render(idle, "native")).not.toContain('type="file"');
    expect(render(idle, "native")).toContain("Choose archive to review");
    expect(render()).toContain("Nothing is uploaded");
    expect(render()).toContain("Selection and inspection do not restore data");
    expect(render()).not.toContain("Confirm and restore reviewed archive");
  });
  it("discloses different-vault replacement, exact inventory and unchecked confirmation before enabling commit", () => {
    const preview: NonNullable<VaultRestorePanelState["preview"]> = {
      version: 1,
      previewId: "0198e102-0000-7000-8000-000000000001",
      viewedVaultId: "original",
      archive: {
        databaseSha256: "c".repeat(64),
        vaultId: "candidate",
        sha256: "a".repeat(64),
        byteLength: 123,
        createdAt: "2026-10-21T08:00:00.000Z",
        createdByVersion: "0.0.0",
        schemaVersion: 160,
        dataFileCount: 114,
        attachmentCount: 3,
      },
      target: {
        state: "present",
        vaultId: "original",
        schemaVersion: 160,
        fingerprint: "b".repeat(64),
        attachmentCount: 2,
      },
      changes: {
        database: "replace",
        attachmentsAdded: 2,
        attachmentsReused: 1,
        attachmentsRemoved: 1,
      },
      conflict: "different_vault_replace",
      requiredConfirmation: "replace_different_vault",
    };
    const html = render({ ...idle, phase: "review", preview });
    expect(html).toContain("DIFFERENT vault");
    expect(html).toContain("replacement of this different vault");
    expect(html).toContain("2 / 1 / 1");
    expect(html).toContain("a".repeat(64));
    expect(html).toContain("b".repeat(64));
    expect(html).not.toContain('checked=""');
    expect(html).toMatch(/disabled="">Confirm and restore reviewed archive/);
    expect(render({ ...idle, phase: "review", preview, confirmed: true })).not.toMatch(
      /disabled="">Confirm and restore reviewed archive/,
    );
  });
  it("uncertain commits expose only local reopening, not a repeat restore button", () => {
    const html = render({
      ...idle,
      phase: "reopen",
      message: "The local vault may have changed",
      error: "Review before a new restore",
    });
    expect(html).toContain("Reload local vault");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Confirm and restore reviewed archive");
    expect(html).not.toContain("Choose archive to review");
  });
});
