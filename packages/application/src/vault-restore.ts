import { PORTABLE_ARCHIVE_LIMITS, portableArchiveManifestV1Schema } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";
import { defineCommand, defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export const VAULT_RESTORE_MAX_ARCHIVE_BYTES = 544 * 1024 * 1024;
export type VaultRestoreConfirmation = "commit" | "replace_same_vault" | "replace_different_vault";
export interface VaultRestorePreviewDto {
  readonly version: 1;
  readonly previewId: string;
  readonly viewedVaultId: string | null;
  readonly archive: {
    readonly sha256: string;
    readonly databaseSha256: string;
    readonly byteLength: number;
    readonly createdAt: string;
    readonly createdByVersion: string;
    readonly vaultId: string;
    readonly schemaVersion: number;
    readonly dataFileCount: number;
    readonly attachmentCount: number;
  };
  readonly target: {
    readonly state: "empty" | "present";
    readonly fingerprint: string;
    readonly vaultId: string | null;
    readonly schemaVersion: number | null;
    readonly attachmentCount: number;
  };
  readonly conflict: "none" | "identical" | "same_vault_replace" | "different_vault_replace";
  readonly requiredConfirmation: VaultRestoreConfirmation;
  readonly changes: {
    readonly database: "create" | "replace" | "unchanged";
    readonly attachmentsAdded: number;
    readonly attachmentsReused: number;
    readonly attachmentsRemoved: number;
  };
}
export interface PreviewVaultRestoreInput {
  readonly viewedVaultId: string | null;
  readonly bytes: Uint8Array;
}
export interface CommitVaultRestoreInput {
  readonly preview: VaultRestorePreviewDto;
  readonly confirmation: VaultRestoreConfirmation;
}
export interface DiscardVaultRestoreInput {
  readonly previewId: string;
  readonly viewedVaultId: string | null;
}
export interface VaultRestoreResultDto {
  readonly version: 1;
  readonly previewId: string;
  readonly committed: true;
  readonly archiveSha256: string;
  readonly vaultId: string;
  readonly schemaVersion: number;
  readonly databaseSha256: string;
  readonly attachmentCount: number;
}
export interface VaultRestorePort {
  /** Must inspect without committing; retain at most one owned, explicitly discardable capability. */
  preview(input: PreviewVaultRestoreInput & { readonly previewId: string }): Promise<unknown>;
  /** Exact viewed tuple, fresh target fingerprint and atomic old-or-new usable state are mandatory. */
  commit(input: CommitVaultRestoreInput): Promise<unknown>;
  discard(input: DiscardVaultRestoreInput): Promise<void>;
}
export class VaultRestoreError extends Error {
  public constructor(
    public readonly code: "conflict" | "invalid_archive" | "unsupported" | "unavailable",
  ) {
    super("The local restore boundary reported a failure.");
    this.name = "VaultRestoreError";
  }
}

const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> => {
  if (
    !record(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new TypeError("Invalid restore shape.");
  return value;
};
const hash = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new TypeError("Invalid digest.");
  return value;
};
const id = (value: unknown): string => {
  if (typeof value !== "string") throw new TypeError("Invalid identity.");
  return entityId("vault", value);
};
const owner = (value: unknown): string | null => (value === null ? null : id(value));
const integer = (value: unknown, max: number, min = 0): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new TypeError("Invalid count.");
  return value;
};

/** Strict path/byte-free version-1 view; rebuilds and freezes every nested value. */
export const parseVaultRestorePreviewDto = (value: unknown): VaultRestorePreviewDto => {
  const raw = exact(value, [
    "version",
    "previewId",
    "viewedVaultId",
    "archive",
    "target",
    "conflict",
    "requiredConfirmation",
    "changes",
  ]);
  if (raw["version"] !== 1) throw new TypeError("Unsupported restore view.");
  const a = exact(raw["archive"], [
    "sha256",
    "databaseSha256",
    "byteLength",
    "createdAt",
    "createdByVersion",
    "vaultId",
    "schemaVersion",
    "dataFileCount",
    "attachmentCount",
  ]);
  const createdAt = a["createdAt"];
  const createdByVersion = a["createdByVersion"];
  if (
    typeof createdAt !== "string" ||
    instant(createdAt) !== createdAt ||
    new Date(createdAt).toISOString() !== createdAt ||
    typeof createdByVersion !== "string" ||
    !portableArchiveManifestV1Schema.shape.createdBy.safeParse({
      name: "coredrill",
      version: createdByVersion,
    }).success
  )
    throw new TypeError("Invalid archive metadata.");
  const archive = Object.freeze({
    sha256: hash(a["sha256"]),
    databaseSha256: hash(a["databaseSha256"]),
    byteLength: integer(a["byteLength"], VAULT_RESTORE_MAX_ARCHIVE_BYTES, 22),
    createdAt,
    createdByVersion,
    vaultId: id(a["vaultId"]),
    schemaVersion: integer(a["schemaVersion"], 0xffff_ffff, 1),
    dataFileCount: integer(a["dataFileCount"], PORTABLE_ARCHIVE_LIMITS.maxDataFiles),
    attachmentCount: integer(a["attachmentCount"], PORTABLE_ARCHIVE_LIMITS.maxAttachments),
  });
  const t = exact(raw["target"], [
    "state",
    "fingerprint",
    "vaultId",
    "schemaVersion",
    "attachmentCount",
  ]);
  const state = t["state"];
  if (state !== "empty" && state !== "present") throw new TypeError("Invalid target.");
  const target = Object.freeze({
    state,
    fingerprint:
      state === "empty" && t["fingerprint"] === "empty" ? "empty" : hash(t["fingerprint"]),
    vaultId: owner(t["vaultId"]),
    schemaVersion: t["schemaVersion"] === null ? null : integer(t["schemaVersion"], 0xffff_ffff, 1),
    attachmentCount: integer(t["attachmentCount"], PORTABLE_ARCHIVE_LIMITS.maxAttachments),
  });
  const viewedVaultId = owner(raw["viewedVaultId"]);
  if (
    target.vaultId !== viewedVaultId ||
    (state === "empty"
      ? target.vaultId !== null || target.schemaVersion !== null || target.attachmentCount !== 0
      : target.vaultId === null || target.schemaVersion === null)
  )
    throw new TypeError("Restore target changed ownership.");
  const c = exact(raw["changes"], [
    "database",
    "attachmentsAdded",
    "attachmentsReused",
    "attachmentsRemoved",
  ]);
  const database = c["database"];
  if (database !== "create" && database !== "replace" && database !== "unchanged")
    throw new TypeError("Invalid database change.");
  const changes = Object.freeze({
    database,
    attachmentsAdded: integer(c["attachmentsAdded"], PORTABLE_ARCHIVE_LIMITS.maxAttachments),
    attachmentsReused: integer(c["attachmentsReused"], PORTABLE_ARCHIVE_LIMITS.maxAttachments),
    attachmentsRemoved: integer(c["attachmentsRemoved"], PORTABLE_ARCHIVE_LIMITS.maxAttachments),
  });
  if (
    changes.attachmentsAdded + changes.attachmentsReused !== archive.attachmentCount ||
    changes.attachmentsRemoved + changes.attachmentsReused !== target.attachmentCount ||
    (state === "empty") !== (database === "create")
  )
    throw new TypeError("Incoherent restore inventory.");
  const conflict =
    state === "empty"
      ? "none"
      : target.vaultId !== archive.vaultId
        ? "different_vault_replace"
        : database === "unchanged" &&
            changes.attachmentsAdded === 0 &&
            changes.attachmentsRemoved === 0
          ? "identical"
          : "same_vault_replace";
  const requiredConfirmation =
    conflict === "different_vault_replace"
      ? "replace_different_vault"
      : conflict === "same_vault_replace"
        ? "replace_same_vault"
        : "commit";
  if (
    raw["conflict"] !== conflict ||
    raw["requiredConfirmation"] !== requiredConfirmation ||
    (conflict === "different_vault_replace" && database !== "replace")
  )
    throw new TypeError("Invalid restore decision.");
  return Object.freeze({
    version: 1,
    previewId: id(raw["previewId"]),
    viewedVaultId,
    archive,
    target,
    conflict,
    requiredConfirmation,
    changes,
  });
};

const invalid = () =>
  applicationFailure({
    code: "validation",
    retryable: false,
    message: "Review a valid local archive and its exact restore preview before continuing.",
  });
const previewFailure = (error: unknown) =>
  applicationFailure({
    code:
      error instanceof VaultRestoreError && error.code === "conflict" ? "conflict" : "unavailable",
    retryable: false,
    message:
      error instanceof VaultRestoreError && error.code === "unsupported"
        ? "This archive needs a compatible Coredrill build. No restore was submitted."
        : error instanceof VaultRestoreError && error.code === "conflict"
          ? "The viewed vault changed or another vault operation is pending. Review it again. No restore was submitted."
          : "The archive could not be reviewed. No restore was submitted.",
  });

export const createVaultRestoreOperations = (port: VaultRestorePort) => ({
  preview: defineQuery<PreviewVaultRestoreInput, VaultRestorePreviewDto>(
    "PreviewVaultRestoreQuery",
    async (input, context) => {
      let request: PreviewVaultRestoreInput & { readonly previewId: string };
      try {
        const raw = exact(input, ["viewedVaultId", "bytes"]);
        if (!(raw["bytes"] instanceof Uint8Array)) return invalid();
        integer(raw["bytes"].byteLength, VAULT_RESTORE_MAX_ARCHIVE_BYTES, 22);
        request = Object.freeze({
          previewId: entityId("application-operation", context.operationId),
          viewedVaultId: owner(raw["viewedVaultId"]),
          bytes: raw["bytes"].slice(),
        });
      } catch {
        return invalid();
      }
      try {
        const value = parseVaultRestorePreviewDto(await port.preview(request));
        if (
          value.previewId !== request.previewId ||
          value.viewedVaultId !== request.viewedVaultId ||
          value.archive.byteLength !== request.bytes.byteLength
        )
          throw new VaultRestoreError("unavailable");
        return applicationSuccess(value);
      } catch (error) {
        try {
          await port.discard({
            previewId: request.previewId,
            viewedVaultId: request.viewedVaultId,
          });
        } catch {
          // Cleanup may itself reject or throw synchronously; preserve the redacted primary failure.
        }
        return previewFailure(error);
      }
    },
  ),
  commit: defineCommand<CommitVaultRestoreInput, VaultRestoreResultDto>(
    "CommitVaultRestoreCommand",
    async (input) => {
      let request: CommitVaultRestoreInput;
      try {
        const raw = exact(input, ["preview", "confirmation"]);
        const preview = parseVaultRestorePreviewDto(raw["preview"]);
        if (raw["confirmation"] !== preview.requiredConfirmation) return invalid();
        request = Object.freeze({ preview, confirmation: preview.requiredConfirmation });
      } catch {
        return invalid();
      }
      try {
        const raw = exact(await port.commit(request), [
          "version",
          "previewId",
          "committed",
          "archiveSha256",
          "vaultId",
          "schemaVersion",
          "databaseSha256",
          "attachmentCount",
        ]);
        const expected = request.preview;
        if (
          raw["version"] !== 1 ||
          raw["committed"] !== true ||
          raw["previewId"] !== expected.previewId ||
          raw["archiveSha256"] !== expected.archive.sha256 ||
          raw["vaultId"] !== expected.archive.vaultId ||
          raw["schemaVersion"] !== expected.archive.schemaVersion ||
          raw["databaseSha256"] !== expected.archive.databaseSha256 ||
          raw["attachmentCount"] !== expected.archive.attachmentCount
        )
          throw new VaultRestoreError("unavailable");
        return applicationSuccess(
          Object.freeze({
            version: 1,
            previewId: expected.previewId,
            committed: true,
            archiveSha256: expected.archive.sha256,
            vaultId: expected.archive.vaultId,
            schemaVersion: expected.archive.schemaVersion,
            databaseSha256: hash(raw["databaseSha256"]),
            attachmentCount: expected.archive.attachmentCount,
          }),
        );
      } catch (error) {
        if (error instanceof VaultRestoreError && error.code === "conflict")
          return applicationFailure({
            code: "conflict",
            retryable: false,
            message:
              "The restore preview is stale, retired or no longer belongs to this vault. Review a fresh preview. No restore was submitted.",
          });
        return applicationFailure({
          code: "unavailable",
          retryable: false,
          message:
            "Restore could not be confirmed. The local vault may have changed. Review local storage before a new restore; do not assume a retry is safe.",
        });
      }
    },
  ),
  discard: defineCommand<DiscardVaultRestoreInput, { readonly discarded: true }>(
    "DiscardVaultRestoreCommand",
    async (input) => {
      let request: DiscardVaultRestoreInput;
      try {
        const raw = exact(input, ["previewId", "viewedVaultId"]);
        request = Object.freeze({
          previewId: id(raw["previewId"]),
          viewedVaultId: owner(raw["viewedVaultId"]),
        });
      } catch {
        return invalid();
      }
      try {
        await port.discard(request);
        return applicationSuccess(Object.freeze({ discarded: true }));
      } catch {
        return previewFailure(new VaultRestoreError("conflict"));
      }
    },
  ),
});
