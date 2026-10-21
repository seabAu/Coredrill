import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";
import { defineCommand, defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";
import {
  parseBrowserExportReminderPreference,
  type BrowserExportReminderPreferenceV1,
} from "./browser-recovery.js";

export const VAULT_EXPORT_VERIFICATION_SETTING_KEY = "vault-export-verifications-v1";
export const VAULT_EXPORT_VERIFICATION_LIMIT = 20;
export interface VaultExportObservation {
  readonly archiveId: string;
  readonly archiveCreatedAt: string;
  readonly schemaVersion: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly verifiedAt: string;
  readonly method: "selected_local_copy" | "native_readback";
}
export interface VaultExportVerificationHistory {
  readonly version: 1;
  readonly vaultId: string;
  readonly observations: readonly VaultExportObservation[];
}
export interface VaultExportVerificationView {
  readonly history: VaultExportVerificationHistory;
  readonly reminder: BrowserExportReminderPreferenceV1;
}
export interface RecordVaultExportVerificationInput {
  readonly vaultId: string;
  readonly observation: VaultExportObservation;
}
export interface UpdateVaultExportReminderInput {
  readonly vaultId: string;
  readonly action: "enable" | "disable" | "snooze";
}
export interface VaultExportVerificationPort {
  read(input: { readonly vaultId: string }): Promise<unknown>;
  record(
    input: RecordVaultExportVerificationInput & { readonly recordedAt: string },
  ): Promise<unknown>;
  updateReminder(
    input: UpdateVaultExportReminderInput & { readonly updatedAt: string },
  ): Promise<unknown>;
}
export class VaultExportVerificationError extends Error {
  public override readonly name = "VaultExportVerificationError";
  public constructor(
    public readonly code: "validation" | "conflict" | "not_found" | "unavailable",
  ) {
    super("The export verification observation is unavailable.");
  }
}
const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const shape = (value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> => {
  if (!record(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|"))
    throw new VaultExportVerificationError("validation");
  return value;
};
const text = (value: unknown): string => {
  if (typeof value !== "string") throw new VaultExportVerificationError("validation");
  return value;
};
export const parseVaultExportObservation = (value: unknown): VaultExportObservation => {
  const raw = shape(value, [
    "archiveId",
    "archiveCreatedAt",
    "schemaVersion",
    "byteLength",
    "sha256",
    "verifiedAt",
    "method",
  ]);
  const archiveId = entityId("portable-archive", text(raw["archiveId"]));
  const archiveCreatedAt = instant(text(raw["archiveCreatedAt"]));
  const verifiedAt = instant(text(raw["verifiedAt"]));
  const schemaVersion = raw["schemaVersion"],
    byteLength = raw["byteLength"],
    method = raw["method"],
    sha256 = raw["sha256"];
  if (
    typeof schemaVersion !== "number" ||
    !Number.isSafeInteger(schemaVersion) ||
    schemaVersion < 1 ||
    schemaVersion > 0xffff_ffff ||
    typeof byteLength !== "number" ||
    !Number.isSafeInteger(byteLength) ||
    byteLength < 22 ||
    byteLength > 544 * 1024 * 1024 ||
    typeof sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(sha256) ||
    (method !== "native_readback" && method !== "selected_local_copy") ||
    verifiedAt < archiveCreatedAt ||
    Date.parse(archiveCreatedAt) < 0
  )
    throw new VaultExportVerificationError("validation");
  return Object.freeze({
    archiveId,
    archiveCreatedAt,
    schemaVersion,
    byteLength,
    sha256,
    verifiedAt,
    method,
  });
};
const compare = (a: VaultExportObservation, b: VaultExportObservation): number =>
  a.verifiedAt !== b.verifiedAt
    ? a.verifiedAt > b.verifiedAt
      ? -1
      : 1
    : a.archiveId !== b.archiveId
      ? a.archiveId < b.archiveId
        ? -1
        : 1
      : a.method < b.method
        ? -1
        : a.method > b.method
          ? 1
          : 0;
const observationKey = (value: VaultExportObservation) =>
  `${value.archiveId}|${value.verifiedAt}|${value.method}`;
const archiveTuple = (value: VaultExportObservation) =>
  JSON.stringify([value.archiveCreatedAt, value.schemaVersion, value.byteLength, value.sha256]);
export const emptyVaultExportVerificationHistory = (
  vaultId: string,
): VaultExportVerificationHistory =>
  Object.freeze({
    version: 1,
    vaultId: entityId("vault", vaultId),
    observations: Object.freeze([]),
  });
export const parseVaultExportVerificationHistory = (
  value: unknown,
): VaultExportVerificationHistory => {
  const raw = shape(value, ["version", "vaultId", "observations"]);
  if (
    raw["version"] !== 1 ||
    !Array.isArray(raw["observations"]) ||
    raw["observations"].length > VAULT_EXPORT_VERIFICATION_LIMIT
  )
    throw new VaultExportVerificationError("validation");
  const observations = raw["observations"].map(parseVaultExportObservation);
  const seen = new Set<string>(),
    archives = new Map<string, string>();
  for (let index = 0; index < observations.length; index += 1) {
    const item = observations[index];
    if (item === undefined) throw new VaultExportVerificationError("validation");
    const previous = observations[index - 1];
    if (
      seen.has(observationKey(item)) ||
      (previous !== undefined && compare(previous, item) > 0) ||
      (archives.has(item.archiveId) && archives.get(item.archiveId) !== archiveTuple(item))
    )
      throw new VaultExportVerificationError("validation");
    seen.add(observationKey(item));
    archives.set(item.archiveId, archiveTuple(item));
  }
  return Object.freeze({
    version: 1,
    vaultId: entityId("vault", text(raw["vaultId"])),
    observations: Object.freeze(observations),
  });
};
export const appendVaultExportObservation = (
  history: VaultExportVerificationHistory,
  observation: VaultExportObservation,
): VaultExportVerificationHistory => {
  const current = parseVaultExportVerificationHistory(history),
    next = parseVaultExportObservation(observation);
  if (
    current.observations.some(
      (item) => item.archiveId === next.archiveId && archiveTuple(item) !== archiveTuple(next),
    )
  )
    throw new VaultExportVerificationError("conflict");
  if (current.observations.some((item) => observationKey(item) === observationKey(next)))
    return current;
  const observations = [...current.observations, next]
    .sort(compare)
    .slice(0, VAULT_EXPORT_VERIFICATION_LIMIT);
  if (!observations.includes(next)) throw new VaultExportVerificationError("conflict");
  return Object.freeze({ ...current, observations: Object.freeze(observations) });
};
export const serializeVaultExportVerificationHistory = (
  value: VaultExportVerificationHistory,
): JsonValue => {
  const history = parseVaultExportVerificationHistory(value);
  return Object.freeze({
    version: 1,
    vaultId: history.vaultId,
    observations: history.observations.map((item) => Object.freeze({ ...item })),
  });
};
export const parseVaultExportVerificationView = (
  value: unknown,
  vaultId: string,
): VaultExportVerificationView => {
  const raw = shape(value, ["history", "reminder"]);
  const history = parseVaultExportVerificationHistory(raw["history"]);
  if (history.vaultId !== vaultId) throw new VaultExportVerificationError("conflict");
  return Object.freeze({
    history,
    reminder: parseBrowserExportReminderPreference(raw["reminder"]),
  });
};
const failure = (error: unknown) =>
  applicationFailure({
    code: error instanceof VaultExportVerificationError ? error.code : "unavailable",
    retryable: false,
    message:
      "The export verification record could not be confirmed. A verified file is not undone; review the current vault before an explicit record-only retry.",
  });
const scope = (input: unknown) => entityId("vault", text(shape(input, ["vaultId"])["vaultId"]));
export const createReadVaultExportVerificationsQuery = (port: VaultExportVerificationPort) =>
  defineQuery<{ readonly vaultId: string }, VaultExportVerificationView>(
    "ReadVaultExportVerificationsQuery",
    async (input) => {
      let vaultId: string;
      try {
        vaultId = scope(input);
      } catch {
        return failure(new VaultExportVerificationError("validation"));
      }
      try {
        return applicationSuccess(
          parseVaultExportVerificationView(await port.read({ vaultId }), vaultId),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
export const createRecordVaultExportVerificationCommand = (port: VaultExportVerificationPort) =>
  defineCommand<RecordVaultExportVerificationInput, VaultExportVerificationView>(
    "RecordVaultExportVerificationCommand",
    async (input, context) => {
      let vaultId: string, observation: VaultExportObservation;
      try {
        const raw = shape(input, ["vaultId", "observation"]);
        vaultId = entityId("vault", text(raw["vaultId"]));
        observation = parseVaultExportObservation(raw["observation"]);
        if (observation.verifiedAt > instant(context.initiatedAt))
          throw new VaultExportVerificationError("validation");
      } catch {
        return failure(new VaultExportVerificationError("validation"));
      }
      try {
        const view = parseVaultExportVerificationView(
          await port.record({ vaultId, observation, recordedAt: context.initiatedAt }),
          vaultId,
        );
        if (
          !view.history.observations.some(
            (item) =>
              observationKey(item) === observationKey(observation) &&
              archiveTuple(item) === archiveTuple(observation),
          )
        )
          throw new VaultExportVerificationError("unavailable");
        return applicationSuccess(view);
      } catch (error) {
        return failure(error);
      }
    },
  );
export const createUpdateVaultExportReminderCommand = (port: VaultExportVerificationPort) =>
  defineCommand<UpdateVaultExportReminderInput, VaultExportVerificationView>(
    "UpdateVaultExportReminderCommand",
    async (input, context) => {
      let vaultId: string, action: UpdateVaultExportReminderInput["action"];
      try {
        const raw = shape(input, ["vaultId", "action"]);
        vaultId = entityId("vault", text(raw["vaultId"]));
        if (raw["action"] !== "enable" && raw["action"] !== "disable" && raw["action"] !== "snooze")
          throw new VaultExportVerificationError("validation");
        action = raw["action"];
      } catch {
        return failure(new VaultExportVerificationError("validation"));
      }
      try {
        return applicationSuccess(
          parseVaultExportVerificationView(
            await port.updateReminder({ vaultId, action, updatedAt: context.initiatedAt }),
            vaultId,
          ),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
