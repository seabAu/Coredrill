import type { ApplicationOperationContext } from "@coredrill/application";
import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  JOB_FILTER_SPEC_VERSION,
  JOB_VIEW_GROUPS,
  JOB_VIEW_PRESENTATIONS,
  JOB_VIEW_SETTINGS_SPEC_VERSION,
  JOB_VIEW_SORT_DIRECTIONS,
  JOB_VIEW_SORT_FIELDS,
  SavedJobViewError,
  createSavedJobViewOperations,
  parseJobFilter,
  type ArchiveSavedJobViewPortInput,
  type CreateSavedJobViewPortInput,
  type DuplicateSavedJobViewPortInput,
  type JobFilterDocumentV1,
  type SavedJobViewDto,
  type SavedJobViewPort,
  type SavedJobViewPortRecord,
  type UpdateSavedJobViewPortInput,
} from "../src/index.js";

const IDS = Object.freeze({
  operation: entityId("application-operation", "0198e500-0000-7000-8000-000000000001"),
  view: entityId("saved-view", "0198e500-0000-7000-8000-000000000002"),
  duplicate: entityId("saved-view", "0198e500-0000-7000-8000-000000000003"),
  source: entityId("saved-view", "0198e500-0000-7000-8000-000000000004"),
});

const CREATED_AT = instant("2026-08-29T14:00:00.000Z");
const UPDATED_AT = instant("2026-08-29T14:05:00.000Z");

const CONTEXT: ApplicationOperationContext = Object.freeze({
  operationId: IDS.operation,
  initiatedAt: CREATED_AT,
});

const UPDATE_CONTEXT: ApplicationOperationContext = Object.freeze({
  operationId: IDS.operation,
  initiatedAt: UPDATED_AT,
});

const FILTER: JobFilterDocumentV1 = Object.freeze({
  specVersion: JOB_FILTER_SPEC_VERSION,
  root: Object.freeze({
    type: "group",
    op: "and",
    negated: false,
    children: Object.freeze([
      Object.freeze({
        type: "predicate",
        field: "workplace_type",
        operator: "equals",
        value: "remote",
      }),
      Object.freeze({
        type: "predicate",
        field: "status_category",
        operator: "one_of",
        value: Object.freeze(["saved", "preparing"]),
      }),
    ]),
  }),
});

const SETTINGS = Object.freeze({
  specVersion: JOB_VIEW_SETTINGS_SPEC_VERSION,
  presentation: "table",
  sort: Object.freeze([
    Object.freeze({ field: "next_action_at", direction: "asc" }),
    Object.freeze({ field: "updated_at", direction: "desc" }),
  ]),
  groupBy: null,
});

const CREATE_INPUT = Object.freeze({
  name: "Remote roles to review",
  filter: FILTER,
  presentation: "table",
  sort: SETTINGS.sort,
  groupBy: null,
});

const record = (overrides: Partial<SavedJobViewPortRecord> = {}): SavedJobViewPortRecord => ({
  id: IDS.view,
  scope: "jobs",
  name: CREATE_INPUT.name,
  filterAstVersion: JOB_FILTER_SPEC_VERSION,
  filterAst: FILTER as unknown as JsonValue,
  uiSettings: SETTINGS as unknown as JsonValue,
  isSystem: false,
  archivedAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  rowVersion: 1,
  ...overrides,
});

const successfulPort = (): SavedJobViewPort => ({
  create: vi.fn(async (input: CreateSavedJobViewPortInput) =>
    record({
      id: input.id,
      name: input.name,
      filterAstVersion: input.filterAstVersion,
      filterAst: input.filterAst,
      uiSettings: input.uiSettings,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }),
  ),
  update: vi.fn(async (input: UpdateSavedJobViewPortInput) =>
    record({
      id: input.id,
      name: input.name,
      filterAstVersion: input.filterAstVersion,
      filterAst: input.filterAst,
      uiSettings: input.uiSettings,
      createdAt: CREATED_AT,
      updatedAt: input.updatedAt,
      rowVersion: input.expectedRowVersion + 1,
    }),
  ),
  duplicate: vi.fn(async (input: DuplicateSavedJobViewPortInput) =>
    record({
      id: input.id,
      name: input.name,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }),
  ),
  archive: vi.fn(async (input: ArchiveSavedJobViewPortInput) =>
    record({
      id: input.id,
      archivedAt: input.archivedAt,
      updatedAt: input.updatedAt,
      rowVersion: input.expectedRowVersion + 1,
    }),
  ),
});

const operations = (port: SavedJobViewPort = successfulPort()) =>
  createSavedJobViewOperations({
    savedViews: port,
    createSavedViewId: vi.fn(() => IDS.view),
  });

const expectFailure = (result: Awaited<ReturnType<typeof executeCreate>>) => {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected a failed application result.");
  return result.error;
};

const executeCreate = async (
  input: unknown,
  port: SavedJobViewPort = successfulPort(),
  context: ApplicationOperationContext = CONTEXT,
) =>
  operations(port).createSavedJobViewCommand.execute(
    input as Parameters<ReturnType<typeof operations>["createSavedJobViewCommand"]["execute"]>[0],
    context,
  );

describe("saved job-view command definitions", () => {
  it("exposes four PascalCase transactional application commands", () => {
    const commands = operations();
    expect([
      commands.createSavedJobViewCommand,
      commands.updateSavedJobViewCommand,
      commands.duplicateSavedJobViewCommand,
      commands.archiveSavedJobViewCommand,
    ]).toEqual([
      expect.objectContaining({
        kind: "command",
        name: "CreateSavedJobViewCommand",
        transactional: true,
      }),
      expect.objectContaining({
        kind: "command",
        name: "UpdateSavedJobViewCommand",
        transactional: true,
      }),
      expect.objectContaining({
        kind: "command",
        name: "DuplicateSavedJobViewCommand",
        transactional: true,
      }),
      expect.objectContaining({
        kind: "command",
        name: "ArchiveSavedJobViewCommand",
        transactional: true,
      }),
    ]);
  });

  it("publishes frozen reviewed setting vocabularies", () => {
    expect(JOB_VIEW_PRESENTATIONS).toEqual(["board", "table"]);
    expect(JOB_VIEW_GROUPS).toEqual(["company", "status"]);
    expect(JOB_VIEW_SORT_DIRECTIONS).toEqual(["asc", "desc"]);
    expect(JOB_VIEW_SORT_FIELDS).toEqual([
      "company_name",
      "date_posted",
      "last_interaction_at",
      "next_action_at",
      "status_sort_order",
      "title",
      "updated_at",
    ]);
    expect(Object.isFrozen(JOB_VIEW_SORT_FIELDS)).toBe(true);
  });
});

describe("CreateSavedJobViewCommand", () => {
  it("validates and persists one versioned user-owned view", async () => {
    const port = successfulPort();
    const result = await executeCreate(CREATE_INPUT, port);

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: IDS.view,
        scope: "jobs",
        name: CREATE_INPUT.name,
        filter: FILTER,
        presentation: "table",
        sort: SETTINGS.sort,
        groupBy: null,
        isSystem: false,
        archivedAt: null,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        rowVersion: 1,
      }),
    });
    expect(port.create).toHaveBeenCalledTimes(1);
    expect(port.create).toHaveBeenCalledWith({
      id: IDS.view,
      scope: "jobs",
      name: CREATE_INPUT.name,
      filterAstVersion: JOB_FILTER_SPEC_VERSION,
      filterAst: FILTER,
      uiSettings: SETTINGS,
      isSystem: false,
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  });

  it("copies and deeply freezes the returned DTO", async () => {
    const filterValue = ["saved", "preparing"];
    const returned = record({
      filterAst: {
        specVersion: 1,
        root: {
          type: "predicate",
          field: "status_category",
          operator: "one_of",
          value: filterValue,
        },
      },
      uiSettings: {
        specVersion: 1,
        presentation: "board",
        sort: [{ field: "updated_at", direction: "desc" }],
        groupBy: "status",
      },
    });
    const port = successfulPort();
    vi.mocked(port.create).mockResolvedValueOnce(returned);
    const result = await executeCreate(
      {
        name: CREATE_INPUT.name,
        filter: returned.filterAst,
        presentation: "board",
        sort: [{ field: "updated_at", direction: "desc" }],
        groupBy: "status",
      },
      port,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    filterValue.push("offer");
    expect(result.value.filter).toEqual({
      specVersion: 1,
      root: {
        type: "predicate",
        field: "status_category",
        operator: "one_of",
        value: ["saved", "preparing"],
      },
    });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.filter)).toBe(true);
    expect(Object.isFrozen(result.value.filter.root)).toBe(true);
    expect(Object.isFrozen(result.value.sort)).toBe(true);
    expect(Object.isFrozen(result.value.sort[0])).toBe(true);
  });

  it.each([
    ["blank name", { ...CREATE_INPUT, name: "   " }],
    ["padded name", { ...CREATE_INPUT, name: " padded" }],
    ["control character", { ...CREATE_INPUT, name: "unsafe\nname" }],
    ["overlong name", { ...CREATE_INPUT, name: "v".repeat(121) }],
    ["unknown presentation", { ...CREATE_INPUT, presentation: "cards" }],
    ["empty sort", { ...CREATE_INPUT, sort: [] }],
    [
      "duplicate sort field",
      {
        ...CREATE_INPUT,
        sort: [
          { field: "updated_at", direction: "asc" },
          { field: "updated_at", direction: "desc" },
        ],
      },
    ],
    ["unknown sort field", { ...CREATE_INPUT, sort: [{ field: "salary", direction: "desc" }] }],
    [
      "unknown sort direction",
      { ...CREATE_INPUT, sort: [{ field: "title", direction: "sideways" }] },
    ],
    [
      "extra sort property",
      { ...CREATE_INPUT, sort: [{ field: "title", direction: "asc", sql: "DROP TABLE job" }] },
    ],
    ["ungrouped board", { ...CREATE_INPUT, presentation: "board", groupBy: null }],
    ["unknown group", { ...CREATE_INPUT, groupBy: "tag" }],
  ])("rejects %s before calling the port", async (_label, input) => {
    const port = successfulPort();
    const error = expectFailure(await executeCreate(input, port));
    expect(error).toEqual(expect.objectContaining({ code: "validation", retryable: false }));
    expect(port.create).not.toHaveBeenCalled();
  });

  it("rejects invalid or unsupported filter ASTs before persistence", async () => {
    const port = successfulPort();
    const invalidFilters = [
      { specVersion: 2, root: FILTER.root },
      {
        specVersion: 1,
        root: { type: "predicate", field: "salary", operator: "equals", value: "100000" },
      },
      {
        specVersion: 1,
        root: { type: "predicate", field: "title", operator: "contains", value: "x", sql: "1" },
      },
    ];

    for (const filter of invalidFilters) {
      const error = expectFailure(await executeCreate({ ...CREATE_INPUT, filter }, port));
      expect(error.code).toBe("validation");
    }
    expect(port.create).not.toHaveBeenCalled();
  });

  it("accepts every reviewed sort field and direction through property generation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...JOB_VIEW_SORT_FIELDS),
        fc.constantFrom(...JOB_VIEW_SORT_DIRECTIONS),
        async (field, direction) => {
          const result = await executeCreate({
            ...CREATE_INPUT,
            sort: [{ field, direction }],
          });
          expect(result.ok).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns only typed validation results for arbitrary JSON filters", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (filter) => {
        const port = successfulPort();
        const result = await executeCreate({ ...CREATE_INPUT, filter }, port);
        let valid = true;
        try {
          parseJobFilter(filter);
        } catch {
          valid = false;
        }
        expect(result.ok).toBe(valid);
        expect(port.create).toHaveBeenCalledTimes(valid ? 1 : 0);
        if (!result.ok) expect(result.error.code).toBe("validation");
      }),
      { numRuns: 500 },
    );
  });

  it("fails closed when context identity or time is invalid", async () => {
    const port = successfulPort();
    const invalidContexts = [
      { ...CONTEXT, operationId: "not-an-id" },
      { ...CONTEXT, initiatedAt: "not-an-instant" },
    ];
    for (const context of invalidContexts) {
      const error = expectFailure(
        await executeCreate(CREATE_INPUT, port, context as ApplicationOperationContext),
      );
      expect(error.code).toBe("validation");
    }
    expect(port.create).not.toHaveBeenCalled();
  });
});

describe("saved-view update, duplicate, and archive commands", () => {
  it("updates a whole validated view with optimistic concurrency", async () => {
    const port = successfulPort();
    const result = await operations(port).updateSavedJobViewCommand.execute(
      {
        id: IDS.view,
        expectedRowVersion: 4,
        name: "Updated priorities",
        filter: FILTER,
        presentation: "board",
        sort: [{ field: "status_sort_order", direction: "asc" }],
        groupBy: "status",
      },
      UPDATE_CONTEXT,
    );

    expect(result.ok).toBe(true);
    expect(port.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: IDS.view,
        expectedRowVersion: 4,
        name: "Updated priorities",
        updatedAt: UPDATED_AT,
        archivedAt: null,
        isSystem: false,
      }),
    );
    if (result.ok) expect(result.value.rowVersion).toBe(5);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid expected row version %s",
    async (expectedRowVersion) => {
      const port = successfulPort();
      const result = await operations(port).updateSavedJobViewCommand.execute(
        { ...CREATE_INPUT, id: IDS.view, expectedRowVersion },
        UPDATE_CONTEXT,
      );
      expect(result.ok).toBe(false);
      expect(port.update).not.toHaveBeenCalled();
    },
  );

  it("duplicates by source identity without trusting caller-supplied AST or settings", async () => {
    const port = successfulPort();
    const createSavedViewId = vi.fn(() => IDS.duplicate);
    const result = await createSavedJobViewOperations({
      savedViews: port,
      createSavedViewId,
    }).duplicateSavedJobViewCommand.execute(
      { sourceViewId: IDS.source, name: "Copy of priorities" },
      UPDATE_CONTEXT,
    );

    expect(result.ok).toBe(true);
    expect(port.duplicate).toHaveBeenCalledWith({
      sourceViewId: IDS.source,
      id: IDS.duplicate,
      name: "Copy of priorities",
      scope: "jobs",
      isSystem: false,
      archivedAt: null,
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
    });
    if (result.ok) {
      expect(result.value.id).toBe(IDS.duplicate);
      expect(result.value.isSystem).toBe(false);
      expect(result.value.filter).toEqual(FILTER);
    }
  });

  it("fails closed if the local identity generator collides with the source view", async () => {
    const port = successfulPort();
    const result = await createSavedJobViewOperations({
      savedViews: port,
      createSavedViewId: () => IDS.source,
    }).duplicateSavedJobViewCommand.execute(
      { sourceViewId: IDS.source, name: "Copy of priorities" },
      UPDATE_CONTEXT,
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "internal", retryable: false }),
    });
    expect(port.duplicate).not.toHaveBeenCalled();
  });

  it("archives a user view at the operation instant with optimistic concurrency", async () => {
    const port = successfulPort();
    const result = await operations(port).archiveSavedJobViewCommand.execute(
      { id: IDS.view, expectedRowVersion: 7 },
      UPDATE_CONTEXT,
    );

    expect(result.ok).toBe(true);
    expect(port.archive).toHaveBeenCalledWith({
      id: IDS.view,
      expectedRowVersion: 7,
      archivedAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
    });
    if (result.ok) {
      expect(result.value.archivedAt).toBe(UPDATED_AT);
      expect(result.value.rowVersion).toBe(8);
    }
  });

  it("fails closed on mismatched adapter results", async () => {
    const mismatches: Partial<SavedJobViewPortRecord>[] = [
      { id: IDS.source },
      { scope: "contacts" as "jobs" },
      { name: "Different name" },
      { filterAstVersion: 2 },
      { uiSettings: { ...SETTINGS, specVersion: 2 } as unknown as JsonValue },
      { isSystem: true },
      { archivedAt: UPDATED_AT },
      { updatedAt: UPDATED_AT },
      { rowVersion: 2 },
    ];

    for (const mismatch of mismatches) {
      const port = successfulPort();
      vi.mocked(port.create).mockResolvedValueOnce(record(mismatch));
      const result = await executeCreate(CREATE_INPUT, port);
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "internal", retryable: false }),
      });
    }
  });
});

describe("saved-view failure translation", () => {
  it.each([
    ["already_exists", "conflict", false],
    ["not_found", "not_found", false],
    ["row_version_conflict", "conflict", false],
    ["system_view_protected", "permission_denied", false],
    ["source_archived", "conflict", false],
    ["busy", "unavailable", true],
    ["unavailable", "unavailable", true],
    ["permission_denied", "permission_denied", false],
    ["read_only", "permission_denied", false],
    ["invalid_state", "internal", false],
  ] as const)("maps %s to %s without leaking details", async (portCode, appCode, retryable) => {
    const port = successfulPort();
    vi.mocked(port.create).mockRejectedValueOnce(new SavedJobViewError(portCode));
    const error = expectFailure(await executeCreate(CREATE_INPUT, port));
    expect(error).toEqual(expect.objectContaining({ code: appCode, retryable }));
    expect(error.message).not.toContain("port reported");
  });

  it("redacts arbitrary adapter exception text", async () => {
    const port = successfulPort();
    vi.mocked(port.create).mockRejectedValueOnce(
      new Error("C:\\Users\\Applicant\\vault.sqlite token=provider-secret"),
    );
    const error = expectFailure(await executeCreate(CREATE_INPUT, port));
    expect(error).toEqual({
      code: "internal",
      message: "The local saved-view operation failed safely.",
      retryable: false,
    });
  });

  it("rejects unknown failure codes at their typed boundary", () => {
    expect(() => new SavedJobViewError("database_text" as "busy")).toThrow(TypeError);
  });
});

const assertDto = (value: SavedJobViewDto): SavedJobViewDto => value;
void assertDto;
