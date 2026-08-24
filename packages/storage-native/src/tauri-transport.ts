import { invoke } from "@tauri-apps/api/core";

import type { NativeStorageRequest, NativeStorageTransport } from "./protocol.js";
import type { NativeArchiveRequest, NativeArchiveTransport } from "./archive-protocol.js";

/** Bundled-window-only transport; Tauri capabilities gate the single command. */
export class TauriNativeStorageTransport implements NativeStorageTransport, NativeArchiveTransport {
  public invoke(request: NativeStorageRequest): Promise<unknown> {
    return invoke<unknown>("native_storage_invoke", { request });
  }

  public invokeArchive(request: NativeArchiveRequest): Promise<unknown> {
    return invoke<unknown>("native_archive_invoke", { request });
  }
}
