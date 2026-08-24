/** Thin native SQLite adapter over the versioned Tauri command boundary. */
export {
  deserializeNativeArchiveError,
  NATIVE_ARCHIVE_PROTOCOL_VERSION,
  parseNativeArchiveResponse,
  type NativeArchiveMetadata,
  type NativeArchiveOutcome,
  type NativeArchiveRequest,
  type NativeArchiveResponse,
  type NativeArchiveTransport,
} from "./archive-protocol.js";
export {
  openNativeSqliteDatabase,
  type NativeSqliteDatabase,
  type OpenNativeSqliteOptions,
} from "./native-database.js";
export {
  deserializeNativeStorageError,
  NATIVE_STORAGE_PROTOCOL_VERSION,
  NativeStorageCapabilityError,
  NativeStorageProtocolError,
  parseNativeStorageResponse,
  type NativeStorageRequest,
  type NativeStorageResponse,
  type NativeStorageTransport,
} from "./protocol.js";
export { TauriNativeStorageTransport } from "./tauri-transport.js";
