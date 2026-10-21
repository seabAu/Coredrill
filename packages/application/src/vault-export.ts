import { portableArchiveManifestV1Schema } from "@coredrill/contracts";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface PrepareVaultExportInput {
  readonly vaultId: string;
  readonly acknowledgeUnencrypted: true;
}
export interface PrepareVaultExportPortInput {
  readonly vaultId: EntityId<"vault">;
  readonly archiveId: EntityId<"portable-archive">;
  readonly createdAt: Instant;
}
export interface VaultExportPreparationPort {
  /** Complete consistent archive, not a partial projection or a saved-copy acknowledgement. */
  prepare(input: PrepareVaultExportPortInput): Promise<unknown>;
}
export interface PreparedVaultExportDto {
  readonly state: "prepared_not_saved";
  readonly vaultId: EntityId<"vault">;
  readonly archiveId: EntityId<"portable-archive">;
  readonly createdAt: Instant;
  readonly schemaVersion: number;
  readonly fileName: string;
  readonly mediaType: "application/zip";
  readonly encryptionMode: "none";
  readonly byteLength: number;
  readonly sha256: string;
  readonly dataFileCount: number;
  readonly attachmentCount: number;
  /** An owned copy for the explicit local save boundary; never log or persist as UI state. */
  readonly bytes: Uint8Array;
}
export class VaultExportPreparationError extends Error {
  public override readonly name = "VaultExportPreparationError";
  public constructor(public readonly code: "conflict" | "not_found" | "unavailable") {
    super("The complete local archive could not be prepared.");
  }
}
// Version-1 reader ceiling (512 MiB payload plus bounded ZIP/manifest overhead).
// This does not increase the existing writer's per-entry or aggregate payload limits.
const MAX_ARCHIVE_BYTES = 544 * 1024 * 1024;
const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** User-triggered, read-only preparation. Saving and saved-copy verification are separate actions. */
export const createPrepareVaultExportQuery = (port: VaultExportPreparationPort) =>
  defineQuery<PrepareVaultExportInput, PreparedVaultExportDto>(
    "PrepareVaultExportQuery",
    async (input, context) => {
      let request: PrepareVaultExportPortInput;
      try {
        const untrusted: unknown = input;
        if (
          !record(untrusted) ||
          typeof untrusted["vaultId"] !== "string" ||
          untrusted["acknowledgeUnencrypted"] !== true ||
          Object.keys(untrusted).some((key) => !["vaultId", "acknowledgeUnencrypted"].includes(key))
        )
          throw new TypeError("Explicit unencrypted archive consent is required.");
        request = Object.freeze({
          vaultId: entityId("vault", untrusted["vaultId"]),
          archiveId: entityId("portable-archive", context.operationId),
          createdAt: instant(context.initiatedAt),
        });
      } catch {
        return applicationFailure({
          code: "validation",
          retryable: false,
          message:
            "Review the current vault and acknowledge that the portable archive is unencrypted.",
        });
      }
      try {
        const raw = await port.prepare(request);
        if (
          !record(raw) ||
          !(raw["bytes"] instanceof Uint8Array) ||
          raw["bytes"].byteLength < 1 ||
          raw["bytes"].byteLength > MAX_ARCHIVE_BYTES ||
          raw["byteLength"] !== raw["bytes"].byteLength ||
          raw["containerVersion"] !== 1 ||
          raw["mediaType"] !== "application/zip"
        )
          throw new VaultExportPreparationError("unavailable");
        const manifest = portableArchiveManifestV1Schema.parse(raw["manifest"]);
        if (manifest.dataFiles.length < 2) throw new VaultExportPreparationError("unavailable");
        const formats = new Map<string, Set<string>>();
        for (const file of manifest.dataFiles) {
          const group = formats.get(file.logicalName) ?? new Set<string>();
          if (
            group.has(file.format) ||
            file.path !== `data/${file.logicalName}.${file.format}` ||
            file.mediaType !== (file.format === "json" ? "application/json" : "text/csv")
          )
            throw new VaultExportPreparationError("unavailable");
          group.add(file.format);
          formats.set(file.logicalName, group);
        }
        if ([...formats.values()].some((group) => group.size !== 2))
          throw new VaultExportPreparationError("unavailable");
        const fileName = `coredrill-${request.createdAt.slice(0, 10).replaceAll("-", "")}-${request.archiveId}.coredrill.zip`;
        if (
          manifest.vault.id !== request.vaultId ||
          manifest.archiveId !== request.archiveId ||
          manifest.createdAt !== request.createdAt ||
          manifest.vault.schemaVersion < 1 ||
          raw["fileName"] !== fileName
        )
          throw new VaultExportPreparationError("unavailable");
        // Own the bytes before awaiting hashing; a port must not mutate an acknowledged result.
        const bytes = Uint8Array.from(raw["bytes"]);
        const expectedSha256 = raw["sha256"];
        const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
        const sha256 = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (sha256 !== expectedSha256) throw new VaultExportPreparationError("unavailable");
        return applicationSuccess(
          Object.freeze({
            state: "prepared_not_saved" as const,
            ...request,
            schemaVersion: manifest.vault.schemaVersion,
            fileName,
            mediaType: "application/zip" as const,
            encryptionMode: "none" as const,
            byteLength: bytes.byteLength,
            sha256,
            dataFileCount: manifest.dataFiles.length,
            attachmentCount: manifest.attachments.length,
            bytes,
          }),
        );
      } catch (error) {
        const code = error instanceof VaultExportPreparationError ? error.code : "unavailable";
        return applicationFailure({
          code,
          retryable: code === "unavailable",
          message:
            code === "conflict"
              ? "The vault changed during archive preparation. Review its current state before trying again."
              : code === "not_found"
                ? "The viewed vault is no longer available. No archive was saved."
                : "A complete portable archive could not be prepared. No file was saved.",
        });
      }
    },
  );
