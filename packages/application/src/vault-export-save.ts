import { entityId } from "@coredrill/domain";
import { defineCommand } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface SaveVaultExportInput {
  readonly vaultId: string;
  readonly archiveId: string;
  readonly schemaVersion: number;
  readonly acknowledgeUnencrypted: true;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}
export type VaultExportSavedDto =
  | { readonly status: "cancelled" }
  | {
      readonly status: "saved_verified";
      readonly vaultId: string;
      readonly archiveId: string;
      readonly byteLength: number;
      readonly sha256: string;
    };
export interface VaultExportSavePort {
  save(input: Omit<SaveVaultExportInput, "acknowledgeUnencrypted">): Promise<unknown>;
}
const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Explicit local save only. No retry, timestamp/history write or restore claim. */
export const createSaveVaultExportCommand = (port: VaultExportSavePort) =>
  defineCommand<SaveVaultExportInput, VaultExportSavedDto>(
    "SaveVaultExportCommand",
    async (input) => {
      let captured: Omit<SaveVaultExportInput, "acknowledgeUnencrypted">;
      try {
        const raw: unknown = input;
        if (
          !record(raw) ||
          raw["acknowledgeUnencrypted"] !== true ||
          typeof raw["vaultId"] !== "string" ||
          typeof raw["archiveId"] !== "string" ||
          typeof raw["schemaVersion"] !== "number" ||
          !Number.isSafeInteger(raw["schemaVersion"]) ||
          raw["schemaVersion"] < 1 ||
          raw["schemaVersion"] > 0xffff_ffff ||
          typeof raw["byteLength"] !== "number" ||
          !Number.isSafeInteger(raw["byteLength"]) ||
          raw["byteLength"] < 22 ||
          raw["byteLength"] > 544 * 1024 * 1024 ||
          typeof raw["sha256"] !== "string" ||
          !/^[0-9a-f]{64}$/.test(raw["sha256"]) ||
          !(raw["bytes"] instanceof Uint8Array) ||
          raw["bytes"].byteLength !== raw["byteLength"] ||
          Object.keys(raw).some(
            (key) =>
              ![
                "vaultId",
                "archiveId",
                "schemaVersion",
                "acknowledgeUnencrypted",
                "byteLength",
                "sha256",
                "bytes",
              ].includes(key),
          )
        )
          throw new TypeError("Invalid save intent.");
        const bytes = Uint8Array.from(raw["bytes"]);
        captured = Object.freeze({
          vaultId: entityId("vault", raw["vaultId"]),
          archiveId: entityId("portable-archive", raw["archiveId"]),
          schemaVersion: raw["schemaVersion"],
          byteLength: raw["byteLength"],
          sha256: raw["sha256"],
          bytes,
        });
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        if (
          [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") !==
          captured.sha256
        )
          throw new TypeError("Invalid bytes.");
      } catch {
        return applicationFailure({
          code: "validation",
          retryable: false,
          message:
            "Review the prepared archive and its unencrypted-state consent before saving. No save was requested.",
        });
      }
      try {
        const saved = await port.save(captured);
        if (!record(saved)) throw new TypeError("Unconfirmed save.");
        if (saved["status"] === "cancelled" && Object.keys(saved).length === 1)
          return applicationSuccess(Object.freeze({ status: "cancelled" as const }));
        if (
          saved["status"] !== "saved_verified" ||
          saved["vaultId"] !== captured.vaultId ||
          saved["archiveId"] !== captured.archiveId ||
          saved["byteLength"] !== captured.byteLength ||
          saved["sha256"] !== captured.sha256 ||
          Object.keys(saved).some(
            (key) => !["status", "vaultId", "archiveId", "byteLength", "sha256"].includes(key),
          )
        )
          throw new TypeError("Unconfirmed save.");
        return applicationSuccess(
          Object.freeze({
            status: "saved_verified" as const,
            vaultId: captured.vaultId,
            archiveId: captured.archiveId,
            byteLength: captured.byteLength,
            sha256: captured.sha256,
          }),
        );
      } catch {
        return applicationFailure({
          code: "unavailable",
          retryable: false,
          message:
            "Saving could not be confirmed. Check the selected destination before an explicit retry; the prepared archive is retained.",
        });
      }
    },
  );
