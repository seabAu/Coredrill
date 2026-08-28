import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { dateOnly, entityId, instant } from "@coredrill/domain";

import {
  JobPipelineError,
  createJobPipelineOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type CreatedJobDto,
  type JobPipelinePort,
  type StatusEventDto,
} from "../src/index.js";

const JOB_ID = entityId("job", "0198e202-0000-7000-8000-000000000001");
const COMPANY_ID = entityId("company", "0198e202-0000-7000-8000-000000000002");
const LOCATION_ID = entityId("location", "0198e202-0000-7000-8000-000000000003");
const APPLICATION_ID = entityId("application", "0198e202-0000-7000-8000-000000000004");
const FROM_STATUS_ID = entityId("status_definition", "0198e202-0000-7000-8000-000000000005");
const TO_STATUS_ID = entityId("status_definition", "0198e202-0000-7000-8000-000000000006");
const EVENT_ID = entityId("status-event", "0198e202-0000-7000-8000-000000000007");
const CREATED_AT = instant("2026-08-28T18:00:00.000Z");
const CHANGED_AT = instant("2026-08-28T19:00:00.000Z");
const DATE_POSTED = dateOnly("2026-08-20");
const VALID_THROUGH = dateOnly("2026-09-20");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e202-0000-7000-8000-000000000008"),
  initiatedAt: CREATED_AT,
};

const createdJob = (): CreatedJobDto => ({
  id: JOB_ID,
  companyId: COMPANY_ID,
  title: "Staff Software Engineer",
  currentStatusId: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  rowVersion: 1,
});

const statusEvent = (): StatusEventDto => ({
  id: EVENT_ID,
  jobId: JOB_ID,
  applicationId: APPLICATION_ID,
  fromStatusId: FROM_STATUS_ID,
  toStatusId: TO_STATUS_ID,
  occurredAt: CHANGED_AT,
  note: "Submitted outside Coredrill.",
  createdAt: CHANGED_AT,
  rowVersion: 1,
});

const pipelinePort = (): JobPipelinePort => ({
  createManualJob: vi.fn(async () => createdJob()),
  changeStatus: vi.fn(async () => statusEvent()),
});

describe("manual job and pipeline application operations", () => {
  it("creates a manual local job without inventing source or provenance state", async () => {
    const pipeline = pipelinePort();
    const operations = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId: () => EVENT_ID,
    });

    expect(operations.createJobCommand).toMatchObject({
      kind: "command",
      name: "CreateJobCommand",
      transactional: true,
    });
    const result = await operations.createJobCommand.execute(
      {
        title: "Staff Software Engineer",
        companyId: COMPANY_ID,
        descriptionText: "Build a local-first product.\nNo automated application flow.",
        employmentType: "full-time",
        workplaceType: "remote",
        seniority: "staff",
        locationId: LOCATION_ID,
        datePosted: DATE_POSTED,
        validThrough: VALID_THROUGH,
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: createdJob() });
    expect(pipeline.createManualJob).toHaveBeenCalledWith({
      id: JOB_ID,
      companyId: COMPANY_ID,
      title: "Staff Software Engineer",
      normalizedTitle: null,
      descriptionText: "Build a local-first product.\nNo automated application flow.",
      employmentType: "full-time",
      workplaceType: "remote",
      seniority: "staff",
      locationId: LOCATION_ID,
      remoteRegion: null,
      datePosted: DATE_POSTED,
      validThrough: VALID_THROUGH,
      currentStatusId: null,
      nextActionAt: null,
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(result.value).not.toHaveProperty("descriptionText");
      expect(result.value).not.toHaveProperty("adapterName");
    }
    expectTypeOf(operations.createJobCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<CreatedJobDto>>
    >();
  });

  it("applies safe defaults for the smallest useful manual job", async () => {
    const pipeline = pipelinePort();
    vi.mocked(pipeline.createManualJob).mockResolvedValueOnce({
      ...createdJob(),
      companyId: null,
      title: "Product Engineer",
    });
    const { createJobCommand } = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId: () => EVENT_ID,
    });

    await expect(createJobCommand.execute({ title: "Product Engineer" }, context)).resolves.toEqual(
      {
        ok: true,
        value: { ...createdJob(), companyId: null, title: "Product Engineer" },
      },
    );
    expect(pipeline.createManualJob).toHaveBeenCalledWith({
      id: JOB_ID,
      companyId: null,
      title: "Product Engineer",
      normalizedTitle: null,
      descriptionText: "",
      employmentType: null,
      workplaceType: null,
      seniority: null,
      locationId: null,
      remoteRegion: null,
      datePosted: null,
      validThrough: null,
      currentStatusId: null,
      nextActionAt: null,
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["control characters", "Unsafe\u0000title"],
    ["overlong text", "j".repeat(1025)],
  ])("rejects %s job titles before local persistence", async (_label, title) => {
    const pipeline = pipelinePort();
    const createJobId = vi.fn(() => JOB_ID);
    const { createJobCommand } = createJobPipelineOperations({
      pipeline,
      createJobId,
      createStatusEventId: () => EVENT_ID,
    });

    await expect(createJobCommand.execute({ title }, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "validation",
        message: "Enter a job title between 1 and 1024 characters without control characters.",
        retryable: false,
      },
    });
    expect(createJobId).not.toHaveBeenCalled();
    expect(pipeline.createManualJob).not.toHaveBeenCalled();
  });

  it.each([
    [{ title: "Role", companyId: "not-an-id" }, "company ID"],
    [{ title: "Role", locationId: "not-an-id" }, "location ID"],
    [{ title: "Role", employmentType: "   " }, "optional text"],
    [{ title: "Role", descriptionText: "unsafe\u0000description" }, "description NUL"],
    [{ title: "Role", datePosted: "2026-02-31" }, "date"],
    [{ title: "Role", datePosted: "2026-09-20", validThrough: "2026-08-20" }, "inverted dates"],
  ] as const)("fails closed for invalid manual job %s", async (input, _label) => {
    const pipeline = pipelinePort();
    const { createJobCommand } = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId: () => EVENT_ID,
    });

    const result = await createJobCommand.execute(input, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation");
      expect(result.error.retryable).toBe(false);
    }
    expect(pipeline.createManualJob).not.toHaveBeenCalled();
  });

  it("requests one atomic projection-and-event status change", async () => {
    const pipeline = pipelinePort();
    const { changeStatusCommand } = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId: () => EVENT_ID,
    });
    const changedContext = { ...context, initiatedAt: CHANGED_AT };

    expect(changeStatusCommand).toMatchObject({
      kind: "command",
      name: "ChangeStatusCommand",
      transactional: true,
    });
    const result = await changeStatusCommand.execute(
      {
        jobId: JOB_ID,
        applicationId: APPLICATION_ID,
        toStatusId: TO_STATUS_ID,
        note: "Submitted outside Coredrill.",
        allowReopen: true,
      },
      changedContext,
    );

    expect(result).toEqual({ ok: true, value: statusEvent() });
    expect(pipeline.changeStatus).toHaveBeenCalledTimes(1);
    expect(pipeline.changeStatus).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      jobId: JOB_ID,
      applicationId: APPLICATION_ID,
      toStatusId: TO_STATUS_ID,
      occurredAt: CHANGED_AT,
      note: "Submitted outside Coredrill.",
      allowReopen: true,
    });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
    expectTypeOf(changeStatusCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<StatusEventDto>>
    >();
  });

  it("uses explicit null and false defaults for a job-only status change", async () => {
    const pipeline = pipelinePort();
    vi.mocked(pipeline.changeStatus).mockResolvedValueOnce({
      ...statusEvent(),
      applicationId: null,
      note: null,
    });
    const { changeStatusCommand } = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId: () => EVENT_ID,
    });

    await expect(
      changeStatusCommand.execute(
        { jobId: JOB_ID, toStatusId: TO_STATUS_ID },
        { ...context, initiatedAt: CHANGED_AT },
      ),
    ).resolves.toEqual({
      ok: true,
      value: { ...statusEvent(), applicationId: null, note: null },
    });
    expect(pipeline.changeStatus).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      jobId: JOB_ID,
      applicationId: null,
      toStatusId: TO_STATUS_ID,
      occurredAt: CHANGED_AT,
      note: null,
      allowReopen: false,
    });
  });

  it.each([
    [{ jobId: "bad", toStatusId: TO_STATUS_ID }, "job ID"],
    [{ jobId: JOB_ID, applicationId: "bad", toStatusId: TO_STATUS_ID }, "application ID"],
    [{ jobId: JOB_ID, toStatusId: "bad" }, "status ID"],
    [{ jobId: JOB_ID, toStatusId: TO_STATUS_ID, note: "   " }, "empty note"],
    [{ jobId: JOB_ID, toStatusId: TO_STATUS_ID, allowReopen: "yes" }, "reopen flag"],
  ] as const)("rejects invalid change-status %s", async (input, _label) => {
    const pipeline = pipelinePort();
    const createStatusEventId = vi.fn(() => EVENT_ID);
    const { changeStatusCommand } = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId,
    });

    const result = await changeStatusCommand.execute(input as never, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ code: "validation", retryable: false });
    }
    expect(createStatusEventId).not.toHaveBeenCalled();
    expect(pipeline.changeStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["already_exists", "conflict", "The local job already exists.", false],
    ["not_found", "not_found", "The requested local pipeline record was not found.", false],
    ["same_status", "conflict", "Choose a different pipeline stage.", false],
    [
      "reopen_confirmation_required",
      "conflict",
      "Confirm that you want to reopen this closed pipeline item.",
      false,
    ],
    ["projection_conflict", "conflict", "The pipeline changed. Review it, then retry.", true],
    ["busy", "conflict", "The local job store is busy. Retry shortly.", true],
    ["unavailable", "unavailable", "Local job storage is unavailable.", true],
    ["permission_denied", "permission_denied", "Coredrill cannot access local job storage.", true],
    ["read_only", "permission_denied", "The local job store is read-only.", false],
    ["invalid_state", "internal", "The local pipeline is not in a usable state.", false],
  ] as const)(
    "maps the %s pipeline failure to a stable content-free error",
    async (portCode, applicationCode, message, retryable) => {
      const pipeline = pipelinePort();
      vi.mocked(pipeline.changeStatus).mockRejectedValueOnce(new JobPipelineError(portCode));
      const { changeStatusCommand } = createJobPipelineOperations({
        pipeline,
        createJobId: () => JOB_ID,
        createStatusEventId: () => EVENT_ID,
      });

      await expect(
        changeStatusCommand.execute(
          { jobId: JOB_ID, toStatusId: TO_STATUS_ID },
          { ...context, initiatedAt: CHANGED_AT },
        ),
      ).resolves.toEqual({
        ok: false,
        error: { code: applicationCode, message, retryable },
      });
    },
  );

  it("redacts unknown persistence failures", async () => {
    const pipeline = pipelinePort();
    vi.mocked(pipeline.createManualJob).mockRejectedValueOnce(
      new Error("C:\\Users\\Candidate\\private.sqlite contains resume text and SQL"),
    );
    const { createJobCommand } = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId: () => EVENT_ID,
    });

    const result = await createJobCommand.execute({ title: "Role" }, context);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local pipeline operation failed safely.",
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Candidate");
    expect(JSON.stringify(result)).not.toContain("resume");
    expect(JSON.stringify(result)).not.toContain("SQL");
  });

  it("fails closed when a port returns a mismatched or malformed created job", async () => {
    const pipeline = pipelinePort();
    vi.mocked(pipeline.createManualJob).mockResolvedValueOnce({
      ...createdJob(),
      id: entityId("job", "0198e202-0000-7000-8000-000000000099"),
    });
    const { createJobCommand } = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId: () => EVENT_ID,
    });

    await expect(createJobCommand.execute({ title: createdJob().title }, context)).resolves.toEqual(
      {
        ok: false,
        error: {
          code: "internal",
          message: "The local pipeline operation failed safely.",
          retryable: false,
        },
      },
    );
  });

  it("fails closed when an atomic status result does not match the requested event", async () => {
    const pipeline = pipelinePort();
    vi.mocked(pipeline.changeStatus).mockResolvedValueOnce({
      ...statusEvent(),
      toStatusId: FROM_STATUS_ID,
    });
    const { changeStatusCommand } = createJobPipelineOperations({
      pipeline,
      createJobId: () => JOB_ID,
      createStatusEventId: () => EVENT_ID,
    });

    await expect(
      changeStatusCommand.execute(
        {
          jobId: JOB_ID,
          applicationId: APPLICATION_ID,
          toStatusId: TO_STATUS_ID,
          note: statusEvent().note,
          allowReopen: true,
        },
        { ...context, initiatedAt: CHANGED_AT },
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local pipeline operation failed safely.",
        retryable: false,
      },
    });
  });
});
