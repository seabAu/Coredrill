export type BrowserStoragePersistenceState = "denied" | "error" | "granted" | "unsupported";
export type BrowserStorageQuotaState = "available" | "low" | "unknown";
export type BrowserStorageWarning =
  | "expected-database-missing"
  | "opfs-unavailable"
  | "persistence-not-granted"
  | "quota-low"
  | "quota-unknown";

export interface BrowserStorageEnvironment {
  readonly opfsAvailable: boolean;
  readonly persistence: BrowserStoragePersistenceState;
  readonly quota: BrowserStorageQuotaState;
  readonly usageBytes?: number;
  readonly quotaBytes?: number;
  readonly remainingBytes?: number;
  readonly warnings: readonly BrowserStorageWarning[];
}

export interface BrowserStorageManager {
  readonly getDirectory?: () => Promise<unknown>;
  readonly estimate?: () => Promise<{
    readonly quota?: number;
    readonly usage?: number;
  }>;
  readonly persist?: () => Promise<boolean>;
  readonly persisted?: () => Promise<boolean>;
}

export interface InspectBrowserStorageOptions {
  readonly lowQuotaBytes?: number;
  readonly lowQuotaRatio?: number;
  readonly requestPersistence?: boolean;
  readonly storageManager?: BrowserStorageManager;
}

const DEFAULT_LOW_QUOTA_BYTES = 64 * 1024 * 1024;
const DEFAULT_LOW_QUOTA_RATIO = 0.1;

const currentStorageManager = (): BrowserStorageManager | undefined => {
  if (typeof navigator === "undefined") return undefined;
  return navigator.storage;
};

const validByteCount = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const inspectPersistence = async (
  storage: BrowserStorageManager | undefined,
  requestPersistence: boolean,
): Promise<BrowserStoragePersistenceState> => {
  if (storage?.persisted === undefined) return "unsupported";
  try {
    if (await storage.persisted()) return "granted";
    if (requestPersistence && storage.persist !== undefined && (await storage.persist())) {
      return "granted";
    }
    return "denied";
  } catch {
    return "error";
  }
};

export const inspectBrowserStorageEnvironment = async (
  options: InspectBrowserStorageOptions = {},
): Promise<BrowserStorageEnvironment> => {
  const storage = options.storageManager ?? currentStorageManager();
  const persistence = await inspectPersistence(storage, options.requestPersistence ?? false);
  const warnings: BrowserStorageWarning[] = [];
  const opfsAvailable = storage?.getDirectory !== undefined;
  if (!opfsAvailable) warnings.push("opfs-unavailable");
  if (persistence !== "granted") warnings.push("persistence-not-granted");

  let usageBytes: number | undefined;
  let quotaBytes: number | undefined;
  let remainingBytes: number | undefined;
  let quota: BrowserStorageQuotaState = "unknown";
  try {
    const estimate = await storage?.estimate?.();
    const estimatedUsage = estimate?.usage;
    const estimatedQuota = estimate?.quota;
    if (validByteCount(estimatedUsage) && validByteCount(estimatedQuota) && estimatedQuota > 0) {
      usageBytes = estimatedUsage;
      quotaBytes = estimatedQuota;
      remainingBytes = Math.max(0, quotaBytes - usageBytes);
      const lowQuotaBytes = options.lowQuotaBytes ?? DEFAULT_LOW_QUOTA_BYTES;
      const lowQuotaRatio = options.lowQuotaRatio ?? DEFAULT_LOW_QUOTA_RATIO;
      quota =
        remainingBytes <= lowQuotaBytes || remainingBytes / quotaBytes <= lowQuotaRatio
          ? "low"
          : "available";
    }
  } catch {
    // A failed estimate is represented by the fail-closed unknown state below.
  }

  if (quota === "low") warnings.push("quota-low");
  if (quota === "unknown") warnings.push("quota-unknown");

  return Object.freeze({
    opfsAvailable,
    persistence,
    quota,
    ...(usageBytes === undefined ? {} : { usageBytes }),
    ...(quotaBytes === undefined ? {} : { quotaBytes }),
    ...(remainingBytes === undefined ? {} : { remainingBytes }),
    warnings: Object.freeze(warnings),
  });
};

export const withBrowserStorageWarning = (
  environment: BrowserStorageEnvironment,
  warning: BrowserStorageWarning,
): BrowserStorageEnvironment =>
  environment.warnings.includes(warning)
    ? environment
    : Object.freeze({
        ...environment,
        warnings: Object.freeze([...environment.warnings, warning]),
      });
