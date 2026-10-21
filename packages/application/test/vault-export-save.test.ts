import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createSaveVaultExportCommand,
  type SaveVaultExportInput,
} from "../src/vault-export-save.js";

const vaultId = "0198e102-0000-7000-8000-000000000001";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const context = {
  operationId: entityId("application-operation", archiveId),
  initiatedAt: instant("2026-10-21T08:00:00.000Z"),
};
const request = () => {
  const bytes = new TextEncoder().encode("PK\x03\x04synthetic opaque archive bytes");
  return {
    vaultId,
    archiveId,
    schemaVersion: 160,
    acknowledgeUnencrypted: true as const,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes,
  };
};
const acknowledged = (input: Omit<SaveVaultExportInput, "acknowledgeUnencrypted">) => ({
  status: "saved_verified",
  vaultId: input.vaultId,
  archiveId: input.archiveId,
  byteLength: input.byteLength,
  sha256: input.sha256,
});
describe("explicit complete archive save command", () => {
  it("captures owned bytes and intent before awaiting and exposes only correlated evidence", async () => {
    const save = vi.fn(async (input) => acknowledged(input));
    const input = request();
    const expected = input.bytes.slice();
    const pending = createSaveVaultExportCommand({ save }).execute(input, context);
    input.bytes.fill(9);
    input.vaultId = archiveId;
    const result = await pending;
    expect(result).toMatchObject({
      ok: true,
      value: { status: "saved_verified", vaultId, archiveId },
    });
    expect(save.mock.calls[0]?.[0].bytes).toEqual(expected);
    expect(JSON.stringify(result)).not.toContain("bytes");
    expect(save).toHaveBeenCalledTimes(1);
  });
  it.each([
    { acknowledgeUnencrypted: false },
    { schemaVersion: 0 },
    { vaultId: "foreign" },
    { byteLength: 0 },
    { byteLength: 544 * 1024 * 1024 + 1 },
    { sha256: "0".repeat(64) },
    { path: "PRIVATE_PATH" },
  ])("rejects invalid intent before local save: %j", async (change) => {
    const save = vi.fn();
    const result = await createSaveVaultExportCommand({ save }).execute(
      { ...request(), ...change } as SaveVaultExportInput,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps cancellation separate and does not write or invent backup history", async () => {
    const save = vi.fn(async () => ({ status: "cancelled" }));
    expect(await createSaveVaultExportCommand({ save }).execute(request(), context)).toEqual({
      ok: true,
      value: { status: "cancelled" },
    });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it.each(["foreign", "path", "throw"])(
    "redacts unconfirmed %s acknowledgement without retry or a no-file claim",
    async (kind) => {
      const save = vi.fn(async (input) => {
        if (kind === "throw") throw new Error("PRIVATE_DESTINATION");
        return {
          ...acknowledged(input),
          ...(kind === "foreign" ? { archiveId: vaultId } : { path: "PRIVATE_DESTINATION" }),
        };
      });
      const result = await createSaveVaultExportCommand({ save }).execute(request(), context);
      expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: false } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_DESTINATION");
      expect(JSON.stringify(result)).not.toContain("No file");
      expect(save).toHaveBeenCalledTimes(1);
    },
  );
});
