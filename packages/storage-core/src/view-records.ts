import type { JsonValue } from "@coredrill/contracts";
import type { EntityId, Instant } from "@coredrill/domain";

export interface TagRecord {
  readonly id: EntityId<"tag">;
  readonly name: string;
  readonly color: string | null;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export type SavedViewScope = "jobs";

export interface SavedViewRecord {
  readonly id: EntityId<"saved-view">;
  readonly scope: SavedViewScope;
  readonly name: string;
  readonly filterAstVersion: number;
  readonly filterAst: JsonValue;
  readonly uiSettings: JsonValue;
  readonly isSystem: boolean;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}
