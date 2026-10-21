import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createPrepareVaultExportQuery,
  VaultExportPreparationError,
  type PrepareVaultExportInput,
} from "../src/vault-export.js";

const vaultId = "0198e102-0000-7000-8000-000000000001";
const context = {
  operationId: entityId("application-operation", "0198e102-0000-7000-8000-000000000002"),
  initiatedAt: instant("2026-10-21T06:00:00.000Z"),
};
const request = () => ({ vaultId, acknowledgeUnencrypted: true as const });
// Mock port acknowledgement only; actual SQLite/ZIP correctness has independent storage proof.
const acknowledgement = () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    byteLength: bytes.length,
    sha256,
    containerVersion: 1,
    mediaType: "application/zip",
    fileName: `coredrill-20261021-${context.operationId}.coredrill.zip`,
    manifest: {
      specVersion: 1,
      archiveId: context.operationId,
      createdAt: context.initiatedAt,
      createdBy: { name: "coredrill", version: "0.0.0" },
      vault: {
        id: vaultId,
        schemaVersion: 1,
        migrationHistory: [
          { version: 1, name: "initial", appliedAt: context.initiatedAt, sha256: "a".repeat(64) },
        ],
      },
      checksumAlgorithm: "sha256",
      database: {
        kind: "database",
        path: "database.sqlite3",
        mediaType: "application/vnd.sqlite3",
        byteLength: 1,
        sha256: "b".repeat(64),
      },
      dataFiles: [
        {
          kind: "data",
          path: "data/vault.json",
          mediaType: "application/json",
          format: "json",
          logicalName: "vault",
          byteLength: 1,
          sha256: "c".repeat(64),
        },
        {
          kind: "data",
          path: "data/vault.csv",
          mediaType: "text/csv",
          format: "csv",
          logicalName: "vault",
          byteLength: 1,
          sha256: "d".repeat(64),
        },
      ],
      attachments: [],
      encryption: { specVersion: 1, mode: "none" },
    },
  };
};
describe("user-consented portable archive preparation query", () => {
  it("binds original vault/operation/time, copies bytes and never claims a saved backup", async () => {
    const original = request();
    const result = acknowledgement();
    const prepare = vi.fn(async (input) => {
      expect(input).toEqual({
        vaultId,
        archiveId: context.operationId,
        createdAt: context.initiatedAt,
      });
      expect(Object.isFrozen(input)).toBe(true);
      original.vaultId = context.operationId;
      return { ...result, privateDiagnostic: "PRIVATE_EXPORT" };
    });
    const outcome = await createPrepareVaultExportQuery({ prepare }).execute(original, context);
    expect(outcome).toMatchObject({
      ok: true,
      value: {
        state: "prepared_not_saved",
        vaultId,
        archiveId: context.operationId,
        encryptionMode: "none",
        sha256: result.sha256,
        bytes: new Uint8Array([1, 2, 3]),
      },
    });
    result.bytes.fill(9);
    if (!outcome.ok) throw new Error("Expected prepared export.");
    expect(outcome.value.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(JSON.stringify(outcome)).not.toContain("PRIVATE_EXPORT");
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it.each([
    null,
    {},
    { vaultId },
    { ...request(), acknowledgeUnencrypted: false },
    { ...request(), vaultId: "invalid" },
    { ...request(), destination: "PRIVATE_PATH" },
  ])("rejects missing consent or invalid input before opening storage: %j", async (input) => {
    const prepare = vi.fn();
    expect(
      await createPrepareVaultExportQuery({ prepare }).execute(
        input as PrepareVaultExportInput,
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(prepare).not.toHaveBeenCalled();
  });
  it.each(["sha256", "byteLength", "fileName", "containerVersion", "mediaType"])(
    "rejects a forged archive acknowledgement: %s",
    async (field) => {
      const result = acknowledgement();
      const outcome = await createPrepareVaultExportQuery({
        prepare: async () => ({ ...result, [field]: "PRIVATE_INVALID_VALUE" }),
      }).execute(request(), context);
      expect(outcome).toMatchObject({ ok: false, error: { code: "unavailable" } });
      expect(JSON.stringify(outcome)).not.toContain("PRIVATE_INVALID_VALUE");
    },
  );
  it.each(["vault", "archive", "time"])(
    "rejects wrong %s identity in a valid manifest",
    async (field) => {
      const result = acknowledgement();
      if (field === "vault") result.manifest.vault.id = context.operationId;
      else if (field === "archive")
        result.manifest.archiveId = entityId("application-operation", vaultId);
      else result.manifest.createdAt = instant("2026-10-20T06:00:00.000Z");
      expect(
        await createPrepareVaultExportQuery({ prepare: async () => result }).execute(
          request(),
          context,
        ),
      ).toMatchObject({ ok: false, error: { code: "unavailable" } });
    },
  );
  it.each(["empty", "unpaired", "mismatched-path"])(
    "rejects a %s human-readable projection inventory",
    async (kind) => {
      const result = acknowledgement();
      if (kind === "empty") result.manifest.dataFiles = [];
      else if (kind === "unpaired") result.manifest.dataFiles.pop();
      else {
        const file = result.manifest.dataFiles[0];
        if (file === undefined) throw new Error("Missing synthetic data file.");
        file.path = "data/other.json";
      }
      expect(
        await createPrepareVaultExportQuery({ prepare: async () => result }).execute(
          request(),
          context,
        ),
      ).toMatchObject({ ok: false, error: { code: "unavailable" } });
    },
  );
  it.each([new Error("PRIVATE_PATH"), new VaultExportPreparationError("conflict")])(
    "redacts failures and never automatically retries",
    async (error) => {
      const prepare = vi.fn(async () => {
        throw error;
      });
      const result = await createPrepareVaultExportQuery({ prepare }).execute(request(), context);
      expect(result).toMatchObject({
        ok: false,
        error: { code: error instanceof VaultExportPreparationError ? "conflict" : "unavailable" },
      });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_PATH");
      expect(prepare).toHaveBeenCalledTimes(1);
    },
  );
});
