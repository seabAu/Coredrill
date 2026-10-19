import { isNativeRuntime } from "@coredrill/storage-native";
import type { RuntimeKind } from "./runtime-database.js";

// Select once from host evidence; a native failure must never create an OPFS vault.
export const RUNTIME_KIND: RuntimeKind =
  isNativeRuntime() || "__TAURI_INTERNALS__" in globalThis ? "native" : "browser";
