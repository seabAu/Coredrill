import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { dateOnly, entityId, instant, timeZone, webUrl } from "@coredrill/domain";

import {
  PipelineQueryError,
  createPipelineQueryOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type JobWorkspaceDto,
  type PipelineBoardGroupDto,
  type PipelineCountsDto,
  type PipelineJobPageDto,
  type PipelineJobSummaryDto,
  type PipelineQueryPort,
} from "../src/index.js";

const JOB_A = entityId("job", "0198e204-0000-7000-8000-000000000001");
const JOB_B = entityId("job", "0198e204-0000-7000-8000-000000000002");
const COMPANY_ID = entityId("company", "0198e204-0000-7000-8000-000000000003");
const STATUS_SAVED = entityId("status_definition", "0198e204-0000-7000-8000-000000000004");
const STATUS_INTERVIEW = entityId("status_definition", "0198e204-0000-7000-8000-000000000005");
const NEXT_ACTION_ID = entityId("next-action", "0198e204-0000-7000-8000-000000000006");
const APPLICATION_ID = entityId("application", "0198e204-0000-7000-8000-000000000007");
const SOURCE_ID = entityId("job-source", "0198e204-0000-7000-8000-000000000008");
const TAG_ID = entityId("tag", "0198e204-0000-7000-8000-000000000009");
const NOW = instant("2026-08-28T21:00:00.000Z");
const UPDATED_A = instant("2026-08-28T20:00:00.000Z");
const UPDATED_B = instant("2026-08-28T19:00:00.000Z");
const CREATED = instant("2026-08-20T12:00:00.000Z");
const FUTURE = instant("2026-08-29T15:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e204-0000-7000-8000-000000000010"),
  initiatedAt: NOW,
};

const counts = (): PipelineCountsDto => ({
  asOf: NOW,
  includeArchived: false,
  all: 8,
  needsAction: 3,
  overdue: 1,
  upcomingInterviews: 2,
  waiting: 2,
  closed: 1,
});

const savedGroup = (): PipelineBoardGroupDto => ({
  statusId: STATUS_SAVED,
  name: "Saved",
  category: "saved",
  color: "blue",
  sortOrder: 10,
  terminal: false,
  jobCount: 5,
});

const interviewGroup = (): PipelineBoardGroupDto => ({
  statusId: STATUS_INTERVIEW,
  name: "Interviewing",
  category: "interview",
  color: "purple",
  sortOrder: 20,
  terminal: false,
  jobCount: 2,
});

const jobSummary = (
  id: typeof JOB_A | typeof JOB_B = JOB_A,
  updatedAt = UPDATED_A,
): PipelineJobSummaryDto => ({
  id,
  title: id === JOB_A ? "Senior TypeScript Engineer" : "Platform Engineer",
  company: {
    id: COMPANY_ID,
    name: "Acme Research",
  },
  status: {
    id: STATUS_SAVED,
    name: "Saved",
    category: "saved",
    color: "blue",
    terminal: false,
  },
  workplaceType: "remote",
  locationLabel: "New York, NY",
  datePosted: dateOnly("2026-08-18"),
  validThrough: dateOnly("2026-09-30"),
  nextAction: {
    id: NEXT_ACTION_ID,
    title: "Research the team",
    dueAt: FUTURE,
  },
  lastInteractionAt: UPDATED_B,
  tags: [{ id: TAG_ID, name: "priority", color: "orange" }],
  archivedAt: null,
  createdAt: CREATED,
  updatedAt,
  rowVersion: 1,
});

const page = (): PipelineJobPageDto => ({
  items: [jobSummary(JOB_A, UPDATED_A), jobSummary(JOB_B, UPDATED_B)],
  hasMore: true,
  nextCursor: { updatedAt: UPDATED_B, jobId: JOB_B },
});

const workspace = (): JobWorkspaceDto => ({
  job: jobSummary(),
  descriptionText: "Build a thoughtful local-first product.",
  employmentType: "full_time",
  seniority: "senior",
  application: {
    id: APPLICATION_ID,
    jobId: JOB_A,
    appliedAt: null,
    channel: null,
    currentStatus: {
      id: STATUS_SAVED,
      name: "Saved",
      category: "saved",
      color: "blue",
      terminal: false,
    },
    selectedResumeVersionId: null,
    selectedCoverLetterVersionId: null,
    notes: "",
    createdAt: CREATED,
    updatedAt: UPDATED_A,
    rowVersion: 1,
  },
  company: {
    id: COMPANY_ID,
    canonicalName: "Acme Research",
    websiteUrl: webUrl("https://acme.example/"),
    domain: "acme.example",
    notes: "Local-first team.",
    contactCount: 2,
    otherActiveJobCount: 1,
  },
  primarySource: {
    id: SOURCE_ID,
    jobId: JOB_A,
    canonicalUrl: webUrl("https://acme.example/jobs/typescript"),
    applyUrl: null,
    firstSeenAt: CREATED,
    lastSeenAt: UPDATED_A,
  },
  attention: {
    nextAction: {
      id: NEXT_ACTION_ID,
      jobId: JOB_A,
      title: "Research the team",
      dueAt: FUTURE,
      timeZone: timeZone("America/New_York"),
    },
    lastInteractionAt: UPDATED_B,
    upcomingInterviewCount: 0,
    pendingReminderCount: 1,
  },
  timelineItemCount: 3,
});

const queryPort = (): PipelineQueryPort => ({
  getCounts: vi.fn(async () => counts()),
  listBoardGroups: vi.fn(async () => [savedGroup(), interviewGroup()]),
  listJobsPage: vi.fn(async () => page()),
  getJobWorkspace: vi.fn(async () => workspace()),
});

describe("pipeline application queries", () => {
  it("returns attention counts at the operation clock", async () => {
    const pipelineQueries = queryPort();
    const { getPipelineCountsQuery } = createPipelineQueryOperations({ pipelineQueries });

    expect(getPipelineCountsQuery).toMatchObject({
      kind: "query",
      name: "GetPipelineCountsQuery",
      readOnly: true,
    });
    const result = await getPipelineCountsQuery.execute({}, context);

    expect(result).toEqual({ ok: true, value: counts() });
    expect(pipelineQueries.getCounts).toHaveBeenCalledWith({
      asOf: NOW,
      includeArchived: false,
    });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
    expectTypeOf(getPipelineCountsQuery.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<PipelineCountsDto>>
    >();
  });

  it("passes an explicit archived scope to counts", async () => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.getCounts).mockResolvedValueOnce({
      ...counts(),
      includeArchived: true,
      all: 10,
    });

    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).getPipelineCountsQuery.execute({ includeArchived: true }, context);

    expect(result).toMatchObject({ ok: true, value: { includeArchived: true, all: 10 } });
    expect(pipelineQueries.getCounts).toHaveBeenCalledWith({ asOf: NOW, includeArchived: true });
  });

  it.each([
    [{ includeArchived: "yes" }, "invalid archived scope"],
    [null, "non-record input"],
  ] as const)("rejects an invalid count query %s", async (input, _label) => {
    const pipelineQueries = queryPort();
    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).getPipelineCountsQuery.execute(input as never, context);

    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(pipelineQueries.getCounts).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...counts(), asOf: UPDATED_A }, "wrong as-of instant"],
    [{ ...counts(), all: -1 }, "negative count"],
    [{ ...counts(), all: 1, needsAction: 2 }, "subset larger than all"],
    [{ ...counts(), needsAction: 0, overdue: 1 }, "overdue larger than needs-action"],
  ] as const)("fails closed for count output with %s", async (output, _label) => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.getCounts).mockResolvedValueOnce(output as PipelineCountsDto);

    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).getPipelineCountsQuery.execute({}, context);

    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("returns immutable board groups in configured stage order", async () => {
    const pipelineQueries = queryPort();
    const { getPipelineBoardGroupsQuery } = createPipelineQueryOperations({ pipelineQueries });

    expect(getPipelineBoardGroupsQuery).toMatchObject({
      kind: "query",
      name: "GetPipelineBoardGroupsQuery",
      readOnly: true,
    });
    const result = await getPipelineBoardGroupsQuery.execute({}, context);

    expect(result).toEqual({ ok: true, value: [savedGroup(), interviewGroup()] });
    expect(pipelineQueries.listBoardGroups).toHaveBeenCalledWith({ includeArchived: false });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(result.value.every(Object.isFrozen)).toBe(true);
    }
    expectTypeOf(getPipelineBoardGroupsQuery.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<readonly PipelineBoardGroupDto[]>>
    >();
  });

  it("supports one explicit unassigned board group", async () => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.listBoardGroups).mockResolvedValueOnce([
      {
        statusId: null,
        name: "No status",
        category: null,
        color: null,
        sortOrder: 0,
        terminal: false,
        jobCount: 1,
      },
      savedGroup(),
    ]);

    await expect(
      createPipelineQueryOperations({ pipelineQueries }).getPipelineBoardGroupsQuery.execute(
        {},
        context,
      ),
    ).resolves.toMatchObject({ ok: true, value: [{ statusId: null }, { statusId: STATUS_SAVED }] });
  });

  it.each([
    [[interviewGroup(), savedGroup()], "out-of-order groups"],
    [[savedGroup(), savedGroup()], "duplicate status group"],
    [[{ ...savedGroup(), category: "unknown" }], "invalid semantic category"],
    [[{ ...savedGroup(), jobCount: -1 }], "negative job count"],
    [
      [{ ...savedGroup(), statusId: null, category: "saved", terminal: false }],
      "semantic category on unassigned group",
    ],
  ] as const)("fails closed for %s", async (output, _label) => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.listBoardGroups).mockResolvedValueOnce(
      output as readonly PipelineBoardGroupDto[],
    );

    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).getPipelineBoardGroupsQuery.execute({}, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("returns a deeply immutable stable-keyset page for table or board use", async () => {
    const pipelineQueries = queryPort();
    const { listPipelineJobsQuery } = createPipelineQueryOperations({ pipelineQueries });

    expect(listPipelineJobsQuery).toMatchObject({
      kind: "query",
      name: "ListPipelineJobsQuery",
      readOnly: true,
    });
    const result = await listPipelineJobsQuery.execute({}, context);

    expect(result).toEqual({ ok: true, value: page() });
    expect(pipelineQueries.listJobsPage).toHaveBeenCalledWith({
      after: null,
      includeArchived: false,
      limit: 50,
      statusFilter: { kind: "all" },
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.items)).toBe(true);
      expect(Object.isFrozen(result.value.items[0])).toBe(true);
      expect(Object.isFrozen(result.value.items[0]?.tags)).toBe(true);
      expect(Object.isFrozen(result.value.nextCursor)).toBe(true);
    }
    expectTypeOf(listPipelineJobsQuery.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<PipelineJobPageDto>>
    >();
  });

  it("uses one pagination query for a configured board group", async () => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.listJobsPage).mockResolvedValueOnce({
      items: [jobSummary()],
      hasMore: false,
      nextCursor: null,
    });

    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).listPipelineJobsQuery.execute(
      {
        limit: 20,
        statusId: STATUS_SAVED,
        after: { updatedAt: NOW, jobId: JOB_B },
      },
      context,
    );

    expect(result).toMatchObject({ ok: true, value: { hasMore: false, nextCursor: null } });
    expect(pipelineQueries.listJobsPage).toHaveBeenCalledWith({
      after: { updatedAt: NOW, jobId: JOB_B },
      includeArchived: false,
      limit: 20,
      statusFilter: { kind: "status", statusId: STATUS_SAVED },
    });
  });

  it("uses a distinct unassigned filter when statusId is explicit null", async () => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.listJobsPage).mockResolvedValueOnce({
      items: [{ ...jobSummary(), status: null }],
      hasMore: false,
      nextCursor: null,
    });

    await createPipelineQueryOperations({ pipelineQueries }).listPipelineJobsQuery.execute(
      { statusId: null },
      context,
    );
    expect(pipelineQueries.listJobsPage).toHaveBeenCalledWith(
      expect.objectContaining({ statusFilter: { kind: "unassigned" } }),
    );
  });

  it.each([
    [{ limit: 0 }, "zero page size"],
    [{ limit: 101 }, "oversized page"],
    [{ limit: 1.5 }, "fractional page"],
    [{ statusId: "bad" }, "invalid status ID"],
    [{ includeArchived: "yes" }, "invalid archived scope"],
    [{ after: { updatedAt: "bad", jobId: JOB_A } }, "invalid cursor instant"],
    [{ after: { updatedAt: UPDATED_A, jobId: "bad" } }, "invalid cursor job ID"],
  ] as const)("rejects an invalid page query %s", async (input, _label) => {
    const pipelineQueries = queryPort();
    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).listPipelineJobsQuery.execute(input as never, context);

    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(pipelineQueries.listJobsPage).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...page(), items: [jobSummary(JOB_B, UPDATED_B), jobSummary(JOB_A, UPDATED_A)] }, "order"],
    [{ ...page(), items: [jobSummary(), jobSummary()] }, "duplicate job"],
    [
      {
        ...page(),
        items: [{ ...jobSummary(), archivedAt: UPDATED_A }, jobSummary(JOB_B, UPDATED_B)],
      },
      "archived job outside scope",
    ],
    [{ ...page(), nextCursor: { updatedAt: UPDATED_A, jobId: JOB_A } }, "wrong next cursor"],
    [{ ...page(), hasMore: false }, "cursor on final page"],
    [
      { items: [], hasMore: true, nextCursor: { updatedAt: UPDATED_A, jobId: JOB_A } },
      "empty next page",
    ],
  ] as const)("fails closed for a page with invalid %s", async (output, _label) => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.listJobsPage).mockResolvedValueOnce(output as PipelineJobPageDto);

    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).listPipelineJobsQuery.execute({}, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("returns a linked immutable job-workspace DTO", async () => {
    const pipelineQueries = queryPort();
    const { getJobWorkspaceQuery } = createPipelineQueryOperations({ pipelineQueries });

    expect(getJobWorkspaceQuery).toMatchObject({
      kind: "query",
      name: "GetJobWorkspaceQuery",
      readOnly: true,
    });
    const result = await getJobWorkspaceQuery.execute({ jobId: JOB_A }, context);

    expect(result).toEqual({ ok: true, value: workspace() });
    expect(pipelineQueries.getJobWorkspace).toHaveBeenCalledWith({ jobId: JOB_A, asOf: NOW });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.job)).toBe(true);
      expect(Object.isFrozen(result.value.application)).toBe(true);
      expect(Object.isFrozen(result.value.company)).toBe(true);
      expect(Object.isFrozen(result.value.primarySource)).toBe(true);
      expect(Object.isFrozen(result.value.attention)).toBe(true);
    }
    expectTypeOf(getJobWorkspaceQuery.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<JobWorkspaceDto>>
    >();
  });

  it("returns a stable not-found result for an absent workspace", async () => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.getJobWorkspace).mockResolvedValueOnce(undefined);

    await expect(
      createPipelineQueryOperations({ pipelineQueries }).getJobWorkspaceQuery.execute(
        { jobId: JOB_A },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "not_found",
        message: "The requested local job workspace was not found.",
        retryable: false,
      },
    });
  });

  it.each([
    [{ ...workspace(), application: { ...workspace().application!, jobId: JOB_B } }, "application"],
    [
      {
        ...workspace(),
        application: {
          ...workspace().application!,
          currentStatus: { ...workspace().application!.currentStatus, id: STATUS_INTERVIEW },
        },
      },
      "application status",
    ],
    [
      { ...workspace(), company: { ...workspace().company!, id: entityId("company", JOB_B) } },
      "company",
    ],
    [
      { ...workspace(), company: { ...workspace().company!, canonicalName: "Different company" } },
      "company name",
    ],
    [{ ...workspace(), primarySource: { ...workspace().primarySource!, jobId: JOB_B } }, "source"],
    [
      {
        ...workspace(),
        attention: {
          ...workspace().attention,
          nextAction: { ...workspace().attention.nextAction!, jobId: JOB_B },
        },
      },
      "next action",
    ],
    [
      {
        ...workspace(),
        attention: { ...workspace().attention, lastInteractionAt: CREATED },
      },
      "last interaction",
    ],
    [{ ...workspace(), job: { ...workspace().job, updatedAt: FUTURE } }, "future snapshot"],
    [{ ...workspace(), timelineItemCount: -1 }, "timeline count"],
  ] as const)("fails closed for a workspace with mismatched %s linkage", async (output, _label) => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.getJobWorkspace).mockResolvedValueOnce(output as JobWorkspaceDto);

    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).getJobWorkspaceQuery.execute({ jobId: JOB_A }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("rejects an invalid workspace job ID before the port", async () => {
    const pipelineQueries = queryPort();
    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).getJobWorkspaceQuery.execute({ jobId: "bad" }, context);

    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(pipelineQueries.getJobWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "not_found", "The requested local pipeline data was not found.", false],
    ["cursor_invalidated", "conflict", "The pipeline changed. Refresh this page.", true],
    ["busy", "conflict", "The local pipeline store is busy. Retry shortly.", true],
    ["unavailable", "unavailable", "Local pipeline storage is unavailable.", true],
    [
      "permission_denied",
      "permission_denied",
      "Coredrill cannot read local pipeline storage.",
      true,
    ],
    ["invalid_state", "internal", "The local pipeline query state is not usable.", false],
  ] as const)(
    "maps the %s query failure to a stable content-free error",
    async (portCode, applicationCode, message, retryable) => {
      const pipelineQueries = queryPort();
      vi.mocked(pipelineQueries.listBoardGroups).mockRejectedValueOnce(
        new PipelineQueryError(portCode),
      );

      await expect(
        createPipelineQueryOperations({ pipelineQueries }).getPipelineBoardGroupsQuery.execute(
          {},
          context,
        ),
      ).resolves.toEqual({
        ok: false,
        error: { code: applicationCode, message, retryable },
      });
    },
  );

  it("redacts unknown query failures", async () => {
    const pipelineQueries = queryPort();
    vi.mocked(pipelineQueries.getCounts).mockRejectedValueOnce(
      new Error("C:\\Users\\Candidate\\private.sqlite leaked a job description"),
    );

    const result = await createPipelineQueryOperations({
      pipelineQueries,
    }).getPipelineCountsQuery.execute({}, context);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local pipeline query failed safely.",
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Candidate");
    expect(JSON.stringify(result)).not.toContain("job description");
  });
});
