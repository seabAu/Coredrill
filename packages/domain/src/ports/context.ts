import type { EntityId } from "../identifiers.js";
import type { Instant } from "../temporal.js";

export interface PortCancellation {
  readonly aborted: boolean;
  throwIfAborted(): void;
}

export interface PortRequestContext {
  readonly operationId: EntityId<"port-operation">;
  readonly initiatedAt: Instant;
  readonly cancellation?: PortCancellation;
}

export interface PortWarning {
  /** Stable content-free code suitable for deterministic handling and diagnostics. */
  readonly code: string;
}
