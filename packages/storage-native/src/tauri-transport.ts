import { invoke } from "@tauri-apps/api/core";

import type { NativeStorageRequest, NativeStorageTransport } from "./protocol.js";
import type { NativeArchiveRequest, NativeArchiveTransport } from "./archive-protocol.js";
import type { NativeVaultRequest, NativeVaultTransport } from "./vault-protocol.js";

/** Bundled-window-only transport; Tauri capabilities gate the single command. */
export class TauriNativeStorageTransport
  implements NativeStorageTransport, NativeArchiveTransport, NativeVaultTransport
{
  public invoke(request: NativeStorageRequest): Promise<unknown> {
    return invoke<unknown>("native_storage_invoke", { request });
  }

  public invokeArchive(request: NativeArchiveRequest): Promise<unknown> {
    return invoke<unknown>("native_archive_invoke", { request });
  }

  public invokeVault(request: NativeVaultRequest): Promise<unknown> {
    return invoke<unknown>("native_vault_invoke", { request });
  }
}
