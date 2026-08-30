/** Official SQLite WASM dedicated-Worker and OPFS adapter boundary. */
export {
  BrowserAttachmentStore,
  createBrowserPortableArchiveRestorePortV1,
} from "./browser-attachment-store.js";
export {
  BrowserSqliteDatabase,
  openBrowserSqliteDatabase,
  type BrowserSqliteOptions,
} from "./browser-sqlite.js";
export {
  BrowserSqliteBusyError,
  BrowserStorageUnavailableError,
  BrowserVaultBusyError,
  deserializeBrowserStorageError,
} from "./errors.js";
export {
  inspectBrowserStorageEnvironment,
  type BrowserExpectedDatabaseState,
  type BrowserStorageEnvironment,
  type BrowserStorageHealthSnapshot,
  type BrowserStorageManager,
  type BrowserStoragePersistenceState,
  type BrowserStorageQuotaState,
  type BrowserStorageWarning,
  type InspectBrowserStorageOptions,
} from "./storage-environment.js";
export type { BrowserLockManager, BrowserVaultLease } from "./vault-lock.js";
export {
  BROWSER_STORAGE_PROTOCOL_VERSION,
  type BrowserStorageDeleteResult,
  type BrowserStorageOpenResult,
  type BrowserStorageRestoreInspectionResult,
  type BrowserStorageRestoreResult,
} from "./protocol.js";
