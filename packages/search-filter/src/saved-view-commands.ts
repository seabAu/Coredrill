import {
  applicationFailure,
  applicationSuccess,
  defineCommand,
  type ApplicationCommand,
  type ApplicationError,
  type ApplicationOperationContext,
  type ApplicationResult,
} from "@coredrill/application";
import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import {
  JOB_FILTER_SPEC_VERSION,
  jobFilterToJson,
  parseJobFilter,
  type JobFilterDocumentV1,
} from "./filter-ast.js";

export const JOB_VIEW_SETTINGS_SPEC_VERSION = 1 as const;
export const JOB_VIEW_PRESENTATIONS = Object.freeze(["board", "table"] as const);
export const JOB_VIEW_GROUPS = Object.freeze(["company", "status"] as const);
export const JOB_VIEW_SORT_DIRECTIONS = Object.freeze(["asc", "desc"] as const);
export const JOB_VIEW_SORT_FIELDS = Object.freeze([
  "company_name",
  "date_posted",
  "last_interaction_at",
  "next_action_at",
  "status_sort_order",
  "title",
  "updated_at",
] as const);

export type JobViewPresentation = (typeof JOB_VIEW_PRESENTATIONS)[number];
export type JobViewGroup = (typeof JOB_VIEW_GROUPS)[number];
export type JobViewSortDirection = (typeof JOB_VIEW_SORT_DIRECTIONS)[number];
export type JobViewSortField = (typeof JOB_VIEW_SORT_FIELDS)[number];

export interface JobViewSortInput {
  readonly field: JobViewSortField;
  readonly direction: JobViewSortDirection;
}

export interface JobViewSettingsV1 {
  readonly specVersion: typeof JOB_VIEW_SETTINGS_SPEC_VERSION;
  readonly presentation: JobViewPresentation;
  readonly sort: readonly JobViewSortInput[];
  readonly groupBy: JobViewGroup | null;
}

export interface SavedJobViewDto {
  readonly id: EntityId<"saved-view">;
  readonly scope: "jobs";
  readonly name: string;
  readonly filter: JobFilterDocumentV1;
  readonly presentation: JobViewPresentation;
  readonly sort: readonly JobViewSortInput[];
  readonly groupBy: JobViewGroup | null;
  readonly isSystem: boolean;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface SavedJobViewPortRecord {
  readonly id: EntityId<"saved-view">;
  readonly scope: "jobs";
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

export interface CreateSavedJobViewPortInput {
  readonly id: EntityId<"saved-view">;
  readonly scope: "jobs";
  readonly name: string;
  readonly filterAstVersion: typeof JOB_FILTER_SPEC_VERSION;
  readonly filterAst: JsonValue;
  readonly uiSettings: JsonValue;
  readonly isSystem: false;
  readonly archivedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface UpdateSavedJobViewPortInput {
  readonly id: EntityId<"saved-view">;
  readonly expectedRowVersion: number;
  readonly scope: "jobs";
  readonly name: string;
  readonly filterAstVersion: typeof JOB_FILTER_SPEC_VERSION;
  readonly filterAst: JsonValue;
  readonly uiSettings: JsonValue;
  readonly isSystem: false;
  readonly archivedAt: null;
  readonly updatedAt: Instant;
}

export interface DuplicateSavedJobViewPortInput {
  readonly sourceViewId: EntityId<"saved-view">;
  readonly id: EntityId<"saved-view">;
  readonly name: string;
  readonly scope: "jobs";
  readonly isSystem: false;
  readonly archivedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface ArchiveSavedJobViewPortInput {
  readonly id: EntityId<"saved-view">;
  readonly expectedRowVersion: number;
  readonly archivedAt: Instant;
  readonly updatedAt: Instant;
}

/**
 * Runtime-owned local persistence boundary for saved job views.
 * Each method MUST perform its complete read/write sequence atomically, and
 * list queries MUST place nulls last and append job ID ascending as the final
 * stable sort key. Grouped queries retain one explicit unassigned group.
 */
export interface SavedJobViewPort {
  create(input: CreateSavedJobViewPortInput): Promise<SavedJobViewPortRecord>;
  update(input: UpdateSavedJobViewPortInput): Promise<SavedJobViewPortRecord>;
  duplicate(input: DuplicateSavedJobViewPortInput): Promise<SavedJobViewPortRecord>;
  archive(input: ArchiveSavedJobViewPortInput): Promise<SavedJobViewPortRecord>;
}

export const SAVED_JOB_VIEW_ERROR_CODES = Object.freeze([
  "already_exists",
  "not_found",
  "row_version_conflict",
  "system_view_protected",
  "source_archived",
  "busy",
  "unavailable",
  "permission_denied",
  "read_only",
  "invalid_state",
] as const);
export type SavedJobViewErrorCode = (typeof SAVED_JOB_VIEW_ERROR_CODES)[number];

/** Content-free typed failure for implementations of SavedJobViewPort. */
export class SavedJobViewError extends Error {
  public override readonly name = "SavedJobViewError";

  public constructor(public readonly code: SavedJobViewErrorCode) {
    if (!SAVED_JOB_VIEW_ERROR_CODES.includes(code)) {
      throw new TypeError("Saved-view failures require a reviewed stable code.");
    }
    super("The saved-view port reported a failure.");
  }
}

interface JobViewDefinitionInput {
  readonly name: string;
  readonly filter: unknown;
  readonly presentation: JobViewPresentation;
  readonly sort: readonly JobViewSortInput[];
  readonly groupBy: JobViewGroup | null;
}

export type CreateSavedJobViewInput = JobViewDefinitionInput;

export interface UpdateSavedJobViewInput extends JobViewDefinitionInput {
  readonly id: string;
  readonly expectedRowVersion: number;
}

export interface DuplicateSavedJobViewInput {
  readonly sourceViewId: string;
  readonly name: string;
}

export interface ArchiveSavedJobViewInput {
  readonly id: string;
  readonly expectedRowVersion: number;
}

export interface SavedJobViewOperationDependencies {
  readonly savedViews: SavedJobViewPort;
  readonly createSavedViewId: () => EntityId<"saved-view">;
}

export interface SavedJobViewOperations {
  readonly createSavedJobViewCommand: ApplicationCommand<CreateSavedJobViewInput, SavedJobViewDto>;
  readonly updateSavedJobViewCommand: ApplicationCommand<UpdateSavedJobViewInput, SavedJobViewDto>;
  readonly duplicateSavedJobViewCommand: ApplicationCommand<
    DuplicateSavedJobViewInput,
    SavedJobViewDto
  >;
  readonly archiveSavedJobViewCommand: ApplicationCommand<
    ArchiveSavedJobViewInput,
    SavedJobViewDto
  >;
}

interface ParsedJobViewDefinition {
  readonly name: string;
  readonly filter: JobFilterDocumentV1;
  readonly filterAst: JsonValue;
  readonly settings: JobViewSettingsV1;
  readonly uiSettings: JsonValue;
}

const MAXIMUM_SORT_FIELDS = 4;

const VALID_SAVED_VIEW_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the saved-view fields and try again.",
  retryable: false,
});
const UNKNOWN_SAVED_VIEW_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local saved-view operation failed safely.",
  retryable: false,
});

const SAVED_VIEW_ERRORS: Readonly<Record<SavedJobViewErrorCode, ApplicationError>> = Object.freeze({
  already_exists: Object.freeze({
    code: "conflict",
    message: "A local saved view with that identity or name already exists.",
    retryable: false,
  }),
  not_found: Object.freeze({
    code: "not_found",
    message: "The selected local saved view was not found.",
    retryable: false,
  }),
  row_version_conflict: Object.freeze({
    code: "conflict",
    message: "The saved view changed before this edit committed.",
    retryable: false,
  }),
  system_view_protected: Object.freeze({
    code: "permission_denied",
    message: "This built-in view cannot be changed by a user command.",
    retryable: false,
  }),
  source_archived: Object.freeze({
    code: "conflict",
    message: "An archived view cannot be duplicated.",
    retryable: false,
  }),
  busy: Object.freeze({
    code: "unavailable",
    message: "The local vault is busy. Try the saved-view action again.",
    retryable: true,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "The local saved-view store is temporarily unavailable.",
    retryable: true,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "The local saved-view store denied this action.",
    retryable: false,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "The local vault is read-only.",
    retryable: false,
  }),
  invalid_state: UNKNOWN_SAVED_VIEW_ERROR,
});

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};

const requireKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void => {
  const keys = Object.keys(value);
  const allowed = new Set(expected);
  if (keys.length !== expected.length || keys.some((key) => !allowed.has(key))) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
};

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
};

const viewName = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 120 ||
    value.trim() !== value ||
    hasControlCharacter(value)
  ) {
    throw new TypeError("Saved-view names must be normalized bounded text.");
  }
  return value;
};

const positiveInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
};

const savedViewId = (value: unknown): EntityId<"saved-view"> => {
  if (typeof value !== "string") throw new TypeError("Saved-view identity must be text.");
  return entityId("saved-view", value);
};

const storedInstant = (value: unknown, label: string): Instant => {
  if (typeof value !== "string") throw new TypeError(`${label} must be an instant.`);
  return instant(value);
};

const parseContext = (context: ApplicationOperationContext): ApplicationOperationContext =>
  Object.freeze({
    operationId: entityId("application-operation", context.operationId),
    initiatedAt: instant(context.initiatedAt),
  });

const isPresentation = (value: unknown): value is JobViewPresentation =>
  typeof value === "string" &&
  JOB_VIEW_PRESENTATIONS.some((presentation) => presentation === value);

const isGroup = (value: unknown): value is JobViewGroup =>
  typeof value === "string" && JOB_VIEW_GROUPS.some((group) => group === value);

const isSortField = (value: unknown): value is JobViewSortField =>
  typeof value === "string" && JOB_VIEW_SORT_FIELDS.some((field) => field === value);

const isSortDirection = (value: unknown): value is JobViewSortDirection =>
  typeof value === "string" && JOB_VIEW_SORT_DIRECTIONS.some((direction) => direction === value);

const parseSort = (value: unknown): readonly JobViewSortInput[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAXIMUM_SORT_FIELDS) {
    throw new TypeError("Saved-view sort must contain one to four clauses.");
  }
  const parsed = value.map((entry) => {
    if (!isRecord(entry)) throw new TypeError("Saved-view sort clauses must be objects.");
    requireKeys(entry, ["field", "direction"], "Saved-view sort clause");
    if (!isSortField(entry["field"]) || !isSortDirection(entry["direction"])) {
      throw new TypeError("Saved-view sort clause is unsupported.");
    }
    return Object.freeze({ field: entry["field"], direction: entry["direction"] });
  });
  if (new Set(parsed.map(({ field }) => field)).size !== parsed.length) {
    throw new TypeError("Saved-view sort fields must be unique.");
  }
  return Object.freeze(parsed);
};

const parseSettingsParts = (
  presentationInput: unknown,
  sortInput: unknown,
  groupInput: unknown,
): JobViewSettingsV1 => {
  if (!isPresentation(presentationInput)) {
    throw new TypeError("Saved-view presentation is unsupported.");
  }
  const groupBy = groupInput === null ? null : isGroup(groupInput) ? groupInput : undefined;
  if (groupBy === undefined || (presentationInput === "board" && groupBy === null)) {
    throw new TypeError("Saved-view grouping is incompatible with its presentation.");
  }
  return Object.freeze({
    specVersion: JOB_VIEW_SETTINGS_SPEC_VERSION,
    presentation: presentationInput,
    sort: parseSort(sortInput),
    groupBy,
  });
};

const parseSettings = (input: unknown): JobViewSettingsV1 => {
  if (!isRecord(input)) throw new TypeError("Saved-view settings must be an object.");
  requireKeys(input, ["specVersion", "presentation", "sort", "groupBy"], "Saved-view settings");
  if (input["specVersion"] !== JOB_VIEW_SETTINGS_SPEC_VERSION) {
    throw new TypeError("Saved-view settings version is unsupported.");
  }
  return parseSettingsParts(input["presentation"], input["sort"], input["groupBy"]);
};

const freezeJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeJson)) as unknown as JsonValue;
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeJson(child)])),
    );
  }
  return value;
};

const settingsToJson = (settings: JobViewSettingsV1): JsonValue =>
  freezeJson({
    specVersion: settings.specVersion,
    presentation: settings.presentation,
    sort: settings.sort.map(({ field, direction }) => ({ field, direction })),
    groupBy: settings.groupBy,
  });

const parseDefinition = (input: Record<string, unknown>): ParsedJobViewDefinition => {
  const filter = parseJobFilter(input["filter"]);
  const settings = parseSettingsParts(input["presentation"], input["sort"], input["groupBy"]);
  return Object.freeze({
    name: viewName(input["name"]),
    filter,
    filterAst: freezeJson(jobFilterToJson(filter)),
    settings,
    uiSettings: settingsToJson(settings),
  });
};

const parseCreate = (input: unknown): ParsedJobViewDefinition => {
  if (!isRecord(input)) throw new TypeError("Create saved-view input must be an object.");
  requireKeys(input, ["name", "filter", "presentation", "sort", "groupBy"], "Create input");
  return parseDefinition(input);
};

const parseUpdate = (
  input: unknown,
): ParsedJobViewDefinition & {
  readonly id: EntityId<"saved-view">;
  readonly expectedRowVersion: number;
} => {
  if (!isRecord(input)) throw new TypeError("Update saved-view input must be an object.");
  requireKeys(
    input,
    ["id", "expectedRowVersion", "name", "filter", "presentation", "sort", "groupBy"],
    "Update input",
  );
  return Object.freeze({
    ...parseDefinition(input),
    id: savedViewId(input["id"]),
    expectedRowVersion: positiveInteger(input["expectedRowVersion"], "Expected row version"),
  });
};

const parseDuplicate = (
  input: unknown,
): { readonly sourceViewId: EntityId<"saved-view">; readonly name: string } => {
  if (!isRecord(input)) throw new TypeError("Duplicate saved-view input must be an object.");
  requireKeys(input, ["sourceViewId", "name"], "Duplicate input");
  return Object.freeze({
    sourceViewId: savedViewId(input["sourceViewId"]),
    name: viewName(input["name"]),
  });
};

const parseArchive = (
  input: unknown,
): { readonly id: EntityId<"saved-view">; readonly expectedRowVersion: number } => {
  if (!isRecord(input)) throw new TypeError("Archive saved-view input must be an object.");
  requireKeys(input, ["id", "expectedRowVersion"], "Archive input");
  return Object.freeze({
    id: savedViewId(input["id"]),
    expectedRowVersion: positiveInteger(input["expectedRowVersion"], "Expected row version"),
  });
};

const canonicalJson = (value: JsonValue): string => {
  const normalize = (input: JsonValue): JsonValue => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
};

const sameJson = (left: JsonValue, right: JsonValue): boolean =>
  canonicalJson(left) === canonicalJson(right);

const parsePortRecord = (input: unknown): SavedJobViewDto => {
  if (!isRecord(input)) throw new TypeError("Saved-view port result must be an object.");
  requireKeys(
    input,
    [
      "id",
      "scope",
      "name",
      "filterAstVersion",
      "filterAst",
      "uiSettings",
      "isSystem",
      "archivedAt",
      "createdAt",
      "updatedAt",
      "rowVersion",
    ],
    "Saved-view port result",
  );
  if (input["scope"] !== "jobs" || typeof input["isSystem"] !== "boolean") {
    throw new TypeError("Saved-view port result has unsupported state.");
  }
  if (input["filterAstVersion"] !== JOB_FILTER_SPEC_VERSION) {
    throw new TypeError("Saved-view filter version is unsupported.");
  }
  const filter = parseJobFilter(input["filterAst"]);
  const settings = parseSettings(input["uiSettings"]);
  const createdAt = storedInstant(input["createdAt"], "Saved-view created time");
  const updatedAt = storedInstant(input["updatedAt"], "Saved-view updated time");
  const archivedAt =
    input["archivedAt"] === null
      ? null
      : storedInstant(input["archivedAt"], "Saved-view archive time");
  if (
    createdAt > updatedAt ||
    (archivedAt !== null && (archivedAt < createdAt || archivedAt > updatedAt))
  ) {
    throw new TypeError("Saved-view audit timestamps are inconsistent.");
  }
  return Object.freeze({
    id: savedViewId(input["id"]),
    scope: "jobs",
    name: viewName(input["name"]),
    filter,
    presentation: settings.presentation,
    sort: settings.sort,
    groupBy: settings.groupBy,
    isSystem: input["isSystem"],
    archivedAt,
    createdAt,
    updatedAt,
    rowVersion: positiveInteger(input["rowVersion"], "Saved-view row version"),
  });
};

const dtoFilterJson = (dto: SavedJobViewDto): JsonValue => jobFilterToJson(dto.filter);
const dtoSettingsJson = (dto: SavedJobViewDto): JsonValue =>
  settingsToJson({
    specVersion: JOB_VIEW_SETTINGS_SPEC_VERSION,
    presentation: dto.presentation,
    sort: dto.sort,
    groupBy: dto.groupBy,
  });

const assertDefinitionMatches = (dto: SavedJobViewDto, expected: ParsedJobViewDefinition): void => {
  if (
    dto.name !== expected.name ||
    !sameJson(dtoFilterJson(dto), expected.filterAst) ||
    !sameJson(dtoSettingsJson(dto), expected.uiSettings)
  ) {
    throw new TypeError("Saved-view port result does not match the command.");
  }
};

const validationFailure = <Value>(): ApplicationResult<Value> =>
  applicationFailure(VALID_SAVED_VIEW_ERROR);

const portFailure = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof SavedJobViewError ? SAVED_VIEW_ERRORS[error.code] : UNKNOWN_SAVED_VIEW_ERROR,
  );

const resultFailure = <Value>(): ApplicationResult<Value> =>
  applicationFailure(UNKNOWN_SAVED_VIEW_ERROR);

const runPort = async <Value>(
  operation: () => Promise<SavedJobViewPortRecord>,
  validate: (record: SavedJobViewPortRecord) => Value,
): Promise<ApplicationResult<Value>> => {
  let stored: SavedJobViewPortRecord;
  try {
    stored = await operation();
  } catch (error) {
    return portFailure(error);
  }
  try {
    return applicationSuccess(validate(stored));
  } catch {
    return resultFailure();
  }
};

const createCommand = (
  dependencies: SavedJobViewOperationDependencies,
): SavedJobViewOperations["createSavedJobViewCommand"] =>
  defineCommand("CreateSavedJobViewCommand", async (input, rawContext) => {
    let definition: ParsedJobViewDefinition;
    let context: ApplicationOperationContext;
    try {
      definition = parseCreate(input);
      context = parseContext(rawContext);
    } catch {
      return validationFailure();
    }

    let id: EntityId<"saved-view">;
    try {
      id = entityId("saved-view", dependencies.createSavedViewId());
    } catch {
      return resultFailure();
    }
    const portInput: CreateSavedJobViewPortInput = Object.freeze({
      id,
      scope: "jobs",
      name: definition.name,
      filterAstVersion: JOB_FILTER_SPEC_VERSION,
      filterAst: definition.filterAst,
      uiSettings: definition.uiSettings,
      isSystem: false,
      archivedAt: null,
      createdAt: context.initiatedAt,
      updatedAt: context.initiatedAt,
    });

    return runPort(
      () => dependencies.savedViews.create(portInput),
      (stored) => {
        const dto = parsePortRecord(stored);
        assertDefinitionMatches(dto, definition);
        if (
          dto.id !== id ||
          dto.isSystem ||
          dto.archivedAt !== null ||
          dto.createdAt !== context.initiatedAt ||
          dto.updatedAt !== context.initiatedAt ||
          dto.rowVersion !== 1
        ) {
          throw new TypeError("Created saved-view result is inconsistent.");
        }
        return dto;
      },
    );
  });

const updateCommand = (
  dependencies: SavedJobViewOperationDependencies,
): SavedJobViewOperations["updateSavedJobViewCommand"] =>
  defineCommand("UpdateSavedJobViewCommand", async (input, rawContext) => {
    let parsed: ReturnType<typeof parseUpdate>;
    let context: ApplicationOperationContext;
    try {
      parsed = parseUpdate(input);
      context = parseContext(rawContext);
    } catch {
      return validationFailure();
    }
    const portInput: UpdateSavedJobViewPortInput = Object.freeze({
      id: parsed.id,
      expectedRowVersion: parsed.expectedRowVersion,
      scope: "jobs",
      name: parsed.name,
      filterAstVersion: JOB_FILTER_SPEC_VERSION,
      filterAst: parsed.filterAst,
      uiSettings: parsed.uiSettings,
      isSystem: false,
      archivedAt: null,
      updatedAt: context.initiatedAt,
    });
    return runPort(
      () => dependencies.savedViews.update(portInput),
      (stored) => {
        const dto = parsePortRecord(stored);
        assertDefinitionMatches(dto, parsed);
        if (
          dto.id !== parsed.id ||
          dto.isSystem ||
          dto.archivedAt !== null ||
          dto.updatedAt !== context.initiatedAt ||
          dto.rowVersion !== parsed.expectedRowVersion + 1
        ) {
          throw new TypeError("Updated saved-view result is inconsistent.");
        }
        return dto;
      },
    );
  });

const duplicateCommand = (
  dependencies: SavedJobViewOperationDependencies,
): SavedJobViewOperations["duplicateSavedJobViewCommand"] =>
  defineCommand("DuplicateSavedJobViewCommand", async (input, rawContext) => {
    let parsed: ReturnType<typeof parseDuplicate>;
    let context: ApplicationOperationContext;
    try {
      parsed = parseDuplicate(input);
      context = parseContext(rawContext);
    } catch {
      return validationFailure();
    }
    let id: EntityId<"saved-view">;
    try {
      id = entityId("saved-view", dependencies.createSavedViewId());
    } catch {
      return resultFailure();
    }
    if (id === parsed.sourceViewId) return resultFailure();
    const portInput: DuplicateSavedJobViewPortInput = Object.freeze({
      sourceViewId: parsed.sourceViewId,
      id,
      name: parsed.name,
      scope: "jobs",
      isSystem: false,
      archivedAt: null,
      createdAt: context.initiatedAt,
      updatedAt: context.initiatedAt,
    });
    return runPort(
      () => dependencies.savedViews.duplicate(portInput),
      (stored) => {
        const dto = parsePortRecord(stored);
        if (
          dto.id !== id ||
          dto.name !== parsed.name ||
          dto.isSystem ||
          dto.archivedAt !== null ||
          dto.createdAt !== context.initiatedAt ||
          dto.updatedAt !== context.initiatedAt ||
          dto.rowVersion !== 1
        ) {
          throw new TypeError("Duplicated saved-view result is inconsistent.");
        }
        return dto;
      },
    );
  });

const archiveCommand = (
  dependencies: SavedJobViewOperationDependencies,
): SavedJobViewOperations["archiveSavedJobViewCommand"] =>
  defineCommand("ArchiveSavedJobViewCommand", async (input, rawContext) => {
    let parsed: ReturnType<typeof parseArchive>;
    let context: ApplicationOperationContext;
    try {
      parsed = parseArchive(input);
      context = parseContext(rawContext);
    } catch {
      return validationFailure();
    }
    const portInput: ArchiveSavedJobViewPortInput = Object.freeze({
      id: parsed.id,
      expectedRowVersion: parsed.expectedRowVersion,
      archivedAt: context.initiatedAt,
      updatedAt: context.initiatedAt,
    });
    return runPort(
      () => dependencies.savedViews.archive(portInput),
      (stored) => {
        const dto = parsePortRecord(stored);
        if (
          dto.id !== parsed.id ||
          dto.isSystem ||
          dto.archivedAt !== context.initiatedAt ||
          dto.updatedAt !== context.initiatedAt ||
          dto.rowVersion !== parsed.expectedRowVersion + 1
        ) {
          throw new TypeError("Archived saved-view result is inconsistent.");
        }
        return dto;
      },
    );
  });

export const createSavedJobViewOperations = (
  dependencies: SavedJobViewOperationDependencies,
): SavedJobViewOperations =>
  Object.freeze({
    createSavedJobViewCommand: createCommand(dependencies),
    updateSavedJobViewCommand: updateCommand(dependencies),
    duplicateSavedJobViewCommand: duplicateCommand(dependencies),
    archiveSavedJobViewCommand: archiveCommand(dependencies),
  });
