import { VAULT_DELETION_ERROR_CODES, VaultDeletionError } from "@coredrill/application";
import { NativeVaultProtocolError } from "@coredrill/storage-native";

/** Only reviewed native error codes cross into application recovery behavior. */
export const nativeVaultOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof NativeVaultProtocolError) {
      const code = VAULT_DELETION_ERROR_CODES.find((candidate) => candidate === error.code);
      if (code !== undefined) throw new VaultDeletionError(code);
    }
    // Unknown errors remain unavailable, never reclassified from arbitrary object properties.
    throw error;
  }
};
