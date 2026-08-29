import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { DiagnosticEventV1, SupportBundleV1 } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";

import {
  DiagnosticLogError,
  createDiagnosticOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type DiagnosticLogPort,
  type SupportBundleCopyDto,
} from "../src/index.js";

const EVENT_ID = "0198e302-0000-7000-8000-000000000001";
const INITIATED_AT = instant("2026-08-29T16:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e302-0000-7000-8000-000000000002"),
  initiatedAt: INITIATED_AT,
};

const safeEvent = (overrides: Partial<DiagnosticEventV1> = {}): DiagnosticEventV1 => ({
  specVersion: 1,
  eventId: EVENT_ID,
  occurredAt: INITIATED_AT,
  appVersion: "0.1.0",
  delivery: "local",
  category: "application",
  name: "operation_complete",
  severity: "warning",
  outcome: "degraded",
  operationId: context.operationId,
  code: "partial_result",
  durationMs: 25,
  attributes: { adapter: "browser-worker", attempt: 2 },
  redactedAttributeCount: 4,
  ...overrides,
});

const diagnosticPort = (): DiagnosticLogPort => ({
  append: vi.fn(async () => undefined),
  listRecent: vi.fn(async () => [safeEvent()]),
});

describe("local diagnostic application operations", () => {
  it("redacts hostile attributes before persisting a local event", async () => {
    const diagnosticLog = diagnosticPort();
    const operations = createDiagnosticOperations({
      diagnosticLog,
      appVersion: "0.1.0",
      createDiagnosticEventId: () => EVENT_ID,
    });

    expect(operations.recordDiagnosticEventCommand).toMatchObject({
      kind: "command",
      name: "RecordDiagnosticEventCommand",
      transactional: true,
    });
    const result = await operations.recordDiagnosticEventCommand.execute(
      {
        category: "application",
        name: "operation_complete",
        severity: "warning",
        outcome: "degraded",
        operationId: context.operationId,
        code: "partial_result",
        durationMs: 25,
        attributes: {
          adapter: "browser-worker",
          attempt: 2,
          path: "C:\\Users\\Candidate\\private.sqlite",
          resume_text: "PRIVATE_RESUME_SENTINEL",
          provider_key: "PRIVATE_KEY_SENTINEL",
          url: "https://example.test/private-job",
        },
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: safeEvent() });
    expect(diagnosticLog.append).toHaveBeenCalledWith(safeEvent());
    const persisted = JSON.stringify(vi.mocked(diagnosticLog.append).mock.calls);
    expect(persisted).not.toContain("Candidate");
    expect(persisted).not.toContain("PRIVATE_");
    expect(persisted).not.toContain("example.test");
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.attributes)).toBe(true);
    }
  });

  it("copies a deterministic versioned bundle after revalidating stored events", async () => {
    const diagnosticLog = diagnosticPort();
    const newer = safeEvent({
      eventId: "0198e302-0001-7000-8000-000000000003",
      occurredAt: "2026-08-29T16:01:00.000Z",
    });
    vi.mocked(diagnosticLog.listRecent).mockResolvedValueOnce([safeEvent(), newer]);
    const { copySupportBundleQuery } = createDiagnosticOperations({
      diagnosticLog,
      appVersion: "0.1.0",
      createDiagnosticEventId: () => EVENT_ID,
    });

    expect(copySupportBundleQuery).toMatchObject({
      kind: "query",
      name: "CopySupportBundleQuery",
      readOnly: true,
    });
    const result = await copySupportBundleQuery.execute({ maximumEventCount: 2 }, context);

    expect(diagnosticLog.listRecent).toHaveBeenCalledWith(2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bundle).toEqual({
      specVersion: 1,
      generatedAt: INITIATED_AT,
      appVersion: "0.1.0",
      delivery: "local-copy",
      eventOrder: "newest-first",
      events: [newer, safeEvent()],
    } satisfies SupportBundleV1);
    expect(JSON.parse(result.value.copyText)).toEqual(result.value.bundle);
    expect(result.value.copyText.endsWith("\n")).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.bundle)).toBe(true);
    expect(Object.isFrozen(result.value.bundle.events)).toBe(true);
    expectTypeOf(copySupportBundleQuery.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<SupportBundleCopyDto>>
    >();
  });

  it("fails closed when stored diagnostics contain arbitrary private content", async () => {
    const diagnosticLog = diagnosticPort();
    vi.mocked(diagnosticLog.listRecent).mockResolvedValueOnce([
      {
        ...safeEvent(),
        message: "C:\\Users\\Candidate\\resume.pdf PRIVATE_SUPPORT_SENTINEL",
      } as unknown as DiagnosticEventV1,
    ]);
    const { copySupportBundleQuery } = createDiagnosticOperations({
      diagnosticLog,
      appVersion: "0.1.0",
      createDiagnosticEventId: () => EVENT_ID,
    });

    const result = await copySupportBundleQuery.execute(undefined, context);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local diagnostic log is not in a usable state.",
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Candidate");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SUPPORT_SENTINEL");
  });

  it("validates the copy limit before storage and maps port failures safely", async () => {
    const diagnosticLog = diagnosticPort();
    const { copySupportBundleQuery, recordDiagnosticEventCommand } = createDiagnosticOperations({
      diagnosticLog,
      appVersion: "0.1.0",
      createDiagnosticEventId: () => EVENT_ID,
    });

    await expect(
      copySupportBundleQuery.execute({ maximumEventCount: 201 }, context),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "validation",
        message: "Choose between 1 and 200 recent diagnostic events.",
        retryable: false,
      },
    });
    expect(diagnosticLog.listRecent).not.toHaveBeenCalled();

    vi.mocked(diagnosticLog.append).mockRejectedValueOnce(new DiagnosticLogError("unavailable"));
    await expect(
      recordDiagnosticEventCommand.execute(
        {
          category: "application",
          name: "operation_complete",
          severity: "error",
          outcome: "failure",
          attributes: {},
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "unavailable",
        message: "The local diagnostic log is unavailable.",
        retryable: true,
      },
    });

    vi.mocked(diagnosticLog.append).mockRejectedValueOnce(
      new Error(
        "C:\\Users\\Candidate\\private.sqlite contains PRIVATE_RESUME_SENTINEL and provider key",
      ),
    );
    const unknownFailure = await recordDiagnosticEventCommand.execute(
      {
        category: "application",
        name: "operation_complete",
        severity: "error",
        outcome: "failure",
        attributes: {},
      },
      context,
    );
    expect(unknownFailure).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local diagnostic operation failed safely.",
        retryable: false,
      },
    });
    expect(JSON.stringify(unknownFailure)).not.toContain("Candidate");
    expect(JSON.stringify(unknownFailure)).not.toContain("PRIVATE_RESUME_SENTINEL");
  });
});
