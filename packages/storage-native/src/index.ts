/** Thin native SQLite adapter over the versioned Tauri command boundary. */
export {
  deserializeNativeArchiveError,
  NATIVE_ARCHIVE_PROTOCOL_VERSION,
  NATIVE_BACKUP_RETENTION_LIMITS,
  parseNativeArchiveResponse,
  type NativeArchiveMetadata,
  type NativeArchiveOutcome,
  type NativeArchiveRequest,
  type NativeArchiveResponse,
  type NativeArchiveTransport,
  type NativeAutomaticBackupMetadata,
  type NativePortableAttachment,
  type NativePortableDatabase,
  type NativePortableTarget,
} from "./archive-protocol.js";
export {
  createNativePortableArchiveRestorePortV1,
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
export {
  deserializeNativeVaultError,
  NATIVE_VAULT_PROTOCOL_VERSION,
  NativeVaultProtocolError,
  parseNativeVaultResponse,
  type NativeVaultDeleted,
  type NativeVaultDeletionInventory,
  type NativeVaultDeletionPreview,
  type NativeVaultRequest,
  type NativeVaultResponse,
  type NativeVaultTransport,
} from "./vault-protocol.js";
