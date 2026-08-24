/** Official SQLite WASM dedicated-Worker and OPFS adapter boundary. */
export {
  BrowserSqliteDatabase,
  openBrowserSqliteDatabase,
  type BrowserSqliteOptions,
} from "./browser-sqlite.js";
export {
  BROWSER_STORAGE_PROTOCOL_VERSION,
  type BrowserStorageDeleteResult,
  type BrowserStorageOpenResult,
  type BrowserStorageRestoreResult,
} from "./protocol.js";
