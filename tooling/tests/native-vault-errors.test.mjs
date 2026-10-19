import { describe, expect, it } from "vitest";
import {
  VAULT_DELETION_ERROR_CODES,
  VaultDeletionError,
} from "../../packages/application/dist/index.js";
import { NativeVaultProtocolError } from "../../packages/storage-native/dist/index.js";
import { nativeVaultOperation } from "../../apps/web/src/native-vault-errors.ts";

describe("native vault application failure mapping", () => {
  it.each(VAULT_DELETION_ERROR_CODES)("preserves the reviewed %s recovery code", async (code) => {
    await expect(
      nativeVaultOperation(async () => {
        throw new NativeVaultProtocolError(code, "synthetic private detail", false);
      }),
    ).rejects.toEqual(new VaultDeletionError(code));
  });
  it("does not trust unknown codes or lookalike objects", async () => {
    for (const error of [
      new NativeVaultProtocolError("invalid_response", "synthetic detail", false),
      { code: "stale_preview", message: "untrusted detail" },
      new Error("unavailable"),
    ]) {
      await expect(
        nativeVaultOperation(async () => {
          throw error;
        }),
      ).rejects.toBe(error);
    }
  });
  it("returns successful results unchanged", async () => {
    const result = { status: "cleanup_pending" };
    expect(await nativeVaultOperation(async () => result)).toBe(result);
  });
});
