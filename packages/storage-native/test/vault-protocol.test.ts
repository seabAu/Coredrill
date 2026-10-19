import { describe, expect, it } from "vitest";

import { deserializeNativeVaultError, parseNativeVaultResponse } from "../src/vault-protocol.js";
import {
  openNativeSqliteDatabase,
  type NativeVaultRequest,
  type NativeStorageRequest,
} from "../src/index.js";

const requestId = "vault-preview-1";
const inventory = {
  attachmentFiles: 3,
  managedBackups: 2,
  providerSecrets: 1,
  sharedAttachmentFiles: 1,
};

describe("native vault protocol", () => {
  it("binds production deletion operations to the opened session and closes it after success", async () => {
    const requests: NativeVaultRequest[] = [];
    const database = await openNativeSqliteDatabase({
      databaseName: "runtime-vault.sqlite3",
      transport: {
        invoke: async (request: NativeStorageRequest) => ({
          protocolVersion: 1,
          requestId: request.requestId,
          data: { type: "opened", sessionId: "native-session-42" },
        }),
      },
      vaultTransport: {
        invokeVault: async (request) => {
          requests.push(request);
          return {
            protocolVersion: 1,
            requestId: request.requestId,
            data:
              request.operation.type === "preview_deletion"
                ? {
                    type: "deletion_preview",
                    previewId: "preview",
                    vaultId: "vault",
                    vaultName: "Synthetic runtime vault",
                    storageMode: "desktop",
                    inventory,
                    lastSuccessfulPortableExportAt: null,
                    requiredConfirmation: "DELETE Synthetic runtime vault",
                  }
                : {
                    type: "deleted",
                    deletionId: "deletion",
                    vaultId: "vault",
                    status: "deleted",
                    deleted: inventory,
                    externalPortableArchivesAffected: false,
                  },
          };
        },
      },
    });
    await expect(
      database.previewVaultDeletion({ vaultId: "vault", previewId: "preview" }),
    ).resolves.toMatchObject({ storageMode: "desktop" });
    await expect(
      database.deleteVault({
        vaultId: "vault",
        previewId: "preview",
        deletionId: "deletion",
        confirmation: "DELETE Synthetic runtime vault",
      }),
    ).resolves.toMatchObject({ status: "deleted" });
    expect(requests.map((request) => request.operation.sessionId)).toEqual([
      "native-session-42",
      "native-session-42",
    ]);
    await expect(database.diagnostics()).rejects.toMatchObject({ code: "session_closed" });
  });
  it("rejects a mismatched native deletion preview instead of exposing it", async () => {
    const database = await openNativeSqliteDatabase({
      databaseName: "runtime-drift.sqlite3",
      transport: {
        invoke: async (request: NativeStorageRequest) => ({
          protocolVersion: 1,
          requestId: request.requestId,
          data: { type: "opened", sessionId: "native-session-1" },
        }),
      },
      vaultTransport: {
        invokeVault: async (request) => ({
          protocolVersion: 1,
          requestId: request.requestId,
          data: {
            type: "deletion_preview",
            previewId: "other-preview",
            vaultId: "vault",
            vaultName: "Synthetic vault",
            storageMode: "desktop",
            inventory,
            lastSuccessfulPortableExportAt: null,
            requiredConfirmation: "DELETE Synthetic vault",
          },
        }),
      },
    });
    await expect(
      database.previewVaultDeletion({ vaultId: "vault", previewId: "preview" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("copies a path-free deletion preview and exact confirmation contract", () => {
    const response = parseNativeVaultResponse(
      {
        protocolVersion: 1,
        requestId,
        data: {
          type: "deletion_preview",
          previewId: "0198f200-0000-7000-8000-000000000002",
          vaultId: "0198f200-0000-7000-8000-000000000001",
          vaultName: "Career search",
          storageMode: "desktop",
          inventory,
          lastSuccessfulPortableExportAt: null,
          requiredConfirmation: "DELETE Career search",
          databasePath: "C:/private/vault.sqlite3",
          providerIds: ["private-provider"],
        },
      },
      requestId,
    );

    expect(response.data).toEqual({
      type: "deletion_preview",
      previewId: "0198f200-0000-7000-8000-000000000002",
      vaultId: "0198f200-0000-7000-8000-000000000001",
      vaultName: "Career search",
      storageMode: "desktop",
      inventory,
      lastSuccessfulPortableExportAt: null,
      requiredConfirmation: "DELETE Career search",
    });
    expect(response.data).not.toHaveProperty("databasePath");
    expect(response.data).not.toHaveProperty("providerIds");
    expect(Object.isFrozen(response.data)).toBe(true);
    if (response.data.type !== "deletion_preview") {
      throw new TypeError("Expected a native vault deletion preview.");
    }
    expect(Object.isFrozen(response.data.inventory)).toBe(true);
  });

  it("accepts only reviewed deletion statuses and the external-archive invariant", () => {
    const deleted = parseNativeVaultResponse(
      {
        protocolVersion: 1,
        requestId: "vault-delete-1",
        data: {
          type: "deleted",
          deletionId: "0198f200-0000-7000-8000-000000000003",
          vaultId: "0198f200-0000-7000-8000-000000000001",
          status: "cleanup_pending",
          deleted: inventory,
          externalPortableArchivesAffected: false,
        },
      },
      "vault-delete-1",
    );
    expect(deleted.data).toMatchObject({
      type: "deleted",
      status: "cleanup_pending",
      externalPortableArchivesAffected: false,
    });

    for (const malformed of [
      {
        protocolVersion: 2,
        requestId,
        data: { type: "deletion_preview" },
      },
      {
        protocolVersion: 1,
        requestId,
        data: {
          type: "deleted",
          deletionId: "delete",
          vaultId: "vault",
          status: "unknown",
          deleted: inventory,
          externalPortableArchivesAffected: false,
        },
      },
      {
        protocolVersion: 1,
        requestId,
        data: {
          type: "deleted",
          deletionId: "delete",
          vaultId: "vault",
          status: "deleted",
          deleted: inventory,
          externalPortableArchivesAffected: true,
        },
      },
    ]) {
      expect(() => parseNativeVaultResponse(malformed, requestId)).toThrow(
        "The native vault boundary returned an invalid response.",
      );
    }
  });

  it("deserializes only stable content-free native errors", () => {
    expect(
      deserializeNativeVaultError({
        code: "cleanup_failed",
        message: "The vault was restored after local cleanup failed.",
        retryable: true,
      }),
    ).toMatchObject({ code: "cleanup_failed", retryable: true });
    expect(deserializeNativeVaultError("private native exception")).toMatchObject({
      code: "invalid_response",
      retryable: false,
    });
  });
});
