import { describe, expect, expectTypeOf, it } from "vitest";

import { entityId, instant } from "@coredrill/domain";

import {
  APPLICATION_ERROR_CODES,
  applicationError,
  applicationFailure,
  applicationSuccess,
  defineCommand,
  defineQuery,
  type ApplicationCommand,
  type ApplicationCommandName,
  type ApplicationOperationContext,
  type ApplicationQuery,
  type ApplicationQueryName,
} from "../src/index.js";

const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "019539af-8c01-7dd4-8b54-395d8f3fe501"),
  initiatedAt: instant("2026-08-24T17:00:00.000Z"),
};

describe("application operation conventions", () => {
  it("defines explicit transactional commands returning typed success/failure results", async () => {
    const command = defineCommand<
      { readonly current: string; readonly next: string },
      { readonly changed: true }
    >("ChangeStatusCommand", async (input) =>
      input.current === input.next
        ? applicationFailure({
            code: "conflict",
            message: "The status is already selected.",
            retryable: false,
          })
        : applicationSuccess({ changed: true }),
    );

    expect(command).toMatchObject({
      kind: "command",
      name: "ChangeStatusCommand",
      transactional: true,
    });
    await expect(command.execute({ current: "saved", next: "applied" }, context)).resolves.toEqual({
      ok: true,
      value: { changed: true },
    });
    await expect(command.execute({ current: "saved", next: "saved" }, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "conflict",
        message: "The status is already selected.",
        retryable: false,
      },
    });
    expectTypeOf(command).toMatchTypeOf<
      ApplicationCommand<
        { readonly current: string; readonly next: string },
        { readonly changed: true }
      >
    >();
  });

  it("defines read-only queries that map storage-shaped rows into view DTOs", async () => {
    const adapterRows = [{ job_id: "job-1", display_title: "Synthetic role" }];
    const query = defineQuery<{ readonly limit: number }, readonly { id: string; title: string }[]>(
      "ListJobsQuery",
      async (input) =>
        applicationSuccess(
          adapterRows.slice(0, input.limit).map((row) => ({
            id: row.job_id,
            title: row.display_title,
          })),
        ),
    );

    expect(query).toMatchObject({ kind: "query", name: "ListJobsQuery", readOnly: true });
    await expect(query.execute({ limit: 1 }, context)).resolves.toEqual({
      ok: true,
      value: [{ id: "job-1", title: "Synthetic role" }],
    });
    expectTypeOf(query).toMatchTypeOf<
      ApplicationQuery<{ readonly limit: number }, readonly { id: string; title: string }[]>
    >();
  });

  it("publishes stable error codes and immutable result envelopes", () => {
    expect(APPLICATION_ERROR_CODES).toEqual([
      "validation",
      "not_found",
      "conflict",
      "unavailable",
      "permission_denied",
      "cancelled",
      "rate_limited",
      "internal",
    ]);
    const error = applicationError({
      code: "unavailable",
      message: "The local adapter is unavailable.",
      retryable: true,
      adapterStack: "must-not-survive",
    } as Parameters<typeof applicationError>[0] & { adapterStack: string });
    const success = applicationSuccess({ value: 1 });
    const failure = applicationFailure(error);
    expect(Object.isFrozen(error)).toBe(true);
    expect(error).not.toHaveProperty("adapterStack");
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(failure)).toBe(true);
  });

  it("rejects ambiguous operation names and unsafe error messages", () => {
    expect(() =>
      defineCommand("changeStatus" as ApplicationCommandName, async () =>
        applicationSuccess(undefined),
      ),
    ).toThrow(TypeError);
    expect(() =>
      defineQuery("ChangeStatusCommand" as ApplicationQueryName, async () =>
        applicationSuccess(undefined),
      ),
    ).toThrow(TypeError);
    expect(() =>
      defineQuery(`${"A".repeat(129)}Query` as ApplicationQueryName, async () =>
        applicationSuccess(undefined),
      ),
    ).toThrow(TypeError);
    expect(() => applicationError({ code: "internal", message: " ", retryable: false })).toThrow(
      TypeError,
    );
    expect(() =>
      applicationError({ code: "internal", message: "unsafe\nmessage", retryable: false }),
    ).toThrow(TypeError);
    expect(() =>
      applicationError({
        code: "adapter_stack" as "internal",
        message: "Unsafe adapter code.",
        retryable: false,
      }),
    ).toThrow(TypeError);
  });
});
